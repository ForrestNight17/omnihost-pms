// Aylık Takvim: ay ızgarası + oda tipine göre şerit (Gantt) görünümü.
import { api } from '../api.js';
import { store } from '../store.js';
import {
  escapeHtml, money, fmtDate, fmtDateShort, occClass, nights, today, parseISO,
  MONTHS_LONG, DOW_SHORT, resBadge, sourceBadge, spinner, emptyState, openModal,
} from '../ui.js';
import { openDetailModal } from './reservations.js';

let currentMonth = today().slice(0, 7);
let mode = 'grid'; // grid | timeline

function shiftMonth(ym, delta) {
  let [y, m] = ym.split('-').map(Number);
  m += delta;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function sourceColor(r) {
  if (!r.source || r.source === 'direct') return '#c9a24b';
  const ch = store.channel(r.source);
  return ch ? ch.color : '#0f1e3d';
}

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let data;
  try { data = await api.calendar(currentMonth); }
  catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }

  const [yy, mm] = currentMonth.split('-').map(Number);
  const monthLabel = `${MONTHS_LONG[mm - 1]} ${yy}`;

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Aylık Rezervasyon Takvimi</h2><div class="sub">doluluk ve rezervasyon dağılımı</div></div>
      <div class="segment" id="modeSeg">
        <button data-mode="grid" class="${mode === 'grid' ? 'active' : ''}">Ay Izgarası</button>
        <button data-mode="timeline" class="${mode === 'timeline' ? 'active' : ''}">Oda Tipi Şeridi</button>
      </div>
    </div>

    <div class="card">
      <div class="card-pad">
        <div class="cal-head">
          <div class="cal-nav">
            <button class="btn btn-ghost btn-sm" id="prev">‹</button>
            <div class="cal-month">${monthLabel}</div>
            <button class="btn btn-ghost btn-sm" id="next">›</button>
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-ghost btn-sm" id="todayBtn">Bugün</button>
            <span class="badge b-muted" style="font-size:.78rem">Aylık doluluk ort. %${avgOcc(data.days)}</span>
          </div>
        </div>
        <div id="calBody">${mode === 'grid' ? gridView(data) : timelineView(data)}</div>
      </div>
    </div>`;

  container.querySelector('#prev').addEventListener('click', () => { currentMonth = shiftMonth(currentMonth, -1); ctx.reload(); });
  container.querySelector('#next').addEventListener('click', () => { currentMonth = shiftMonth(currentMonth, 1); ctx.reload(); });
  container.querySelector('#todayBtn').addEventListener('click', () => { currentMonth = today().slice(0, 7); ctx.reload(); });
  container.querySelector('#modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]'); if (!b) return;
    mode = b.dataset.mode; ctx.reload();
  });

  // Gün tıklama (ızgara)
  const body = container.querySelector('#calBody');
  body.addEventListener('click', async (e) => {
    const cell = e.target.closest('[data-date]');
    if (cell) { openDayModal(ctx, cell.dataset.date, data); return; }
    const bar = e.target.closest('[data-res]');
    if (bar) { const r = await api.reservation(bar.dataset.res); openDetailModal(ctx, r, () => ctx.reload()); }
  });
}

function avgOcc(days) {
  if (!days.length) return 0;
  return Math.round(days.reduce((s, d) => s + d.occupancyPct, 0) / days.length);
}

// ---------- Izgara görünümü ----------
function gridView(data) {
  const { meta, days } = data;
  const t = today();
  const cells = [];
  for (let i = 0; i < meta.startOffset; i++) cells.push('<div class="cal-cell empty"></div>');
  for (const d of days) {
    const isToday = d.date === t;
    cells.push(`
      <div class="cal-cell ${isToday ? 'today' : ''}" data-date="${d.date}">
        <div class="cc-day"><span>${d.day}</span><span class="cc-occ ${occClass(d.occupancyPct)}">%${d.occupancyPct}</span></div>
        <div class="cc-bar"><i style="width:${d.occupancyPct}%"></i></div>
        <div class="cc-flags">
          ${d.arrivals ? `<span class="in">▲ ${d.arrivals}</span>` : ''}
          ${d.departures ? `<span class="out">▼ ${d.departures}</span>` : ''}
          ${!d.arrivals && !d.departures ? `<span class="muted" style="font-size:.7rem">${d.occupied} dolu</span>` : ''}
        </div>
      </div>`);
  }
  return `
    <div class="cal-grid mb">${DOW_SHORT.map((w) => `<div class="cal-dow">${w}</div>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>
    <div class="legend mt"><span>▲ <span style="color:var(--ok)">giriş</span></span><span>▼ <span style="color:var(--danger)">çıkış</span></span><span class="muted">· Bir güne tıklayarak detayları görün</span></div>`;
}

// ---------- Şerit (timeline) görünümü ----------
function timelineView(data) {
  const { meta, reservations } = data;
  const days = meta.daysInMonth;
  const dayW = 40;
  const monthFirst = `${data.month}-01`;
  const t = today();
  const axisW = days * dayW;

  function idx(date) { return Math.max(0, Math.min(days, nights(monthFirst, date))); }
  function packLanes(list) {
    const sorted = [...list].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    const lanes = [];
    for (const r of sorted) {
      let placed = false;
      for (const lane of lanes) { if (lane.end <= r.checkIn) { lane.items.push(r); lane.end = r.checkOut; placed = true; break; } }
      if (!placed) lanes.push({ end: r.checkOut, items: [r] });
    }
    return lanes.map((l) => l.items);
  }

  // Gün ekseni başlığı
  const dayHeader = Array.from({ length: days }, (_, i) => {
    const date = `${data.month}-${String(i + 1).padStart(2, '0')}`;
    const dow = parseISO(date).getDay();
    const wknd = dow === 0 || dow === 6;
    return `<div class="tl-daycell ${wknd ? 'wknd' : ''} ${date === t ? 'today' : ''}" style="width:${dayW}px">${i + 1}</div>`;
  }).join('');

  const gridBg = `repeating-linear-gradient(90deg, transparent 0, transparent ${dayW - 1}px, var(--line) ${dayW - 1}px, var(--line) ${dayW}px)`;
  const todayIdx = data.month === t.slice(0, 7) ? parseISO(t).getDate() - 1 : -1;

  const rows = store.roomTypes.map((type) => {
    const list = reservations.filter((r) => r.roomTypeId === type.id);
    const lanes = list.length ? packLanes(list) : [[]];
    return lanes.map((lane, li) => `
      <div class="tl-row" style="grid-template-columns:160px ${axisW}px">
        <div class="tl-label">${li === 0 ? `${escapeHtml(type.name)} <span class="muted" style="font-weight:400">(${list.length})</span>` : ''}</div>
        <div class="tl-track" style="width:${axisW}px;background:${gridBg}">
          ${todayIdx >= 0 ? `<div style="position:absolute;left:${todayIdx * dayW}px;width:${dayW}px;top:0;bottom:0;background:rgba(201,162,75,.14)"></div>` : ''}
          ${lane.map((r) => {
            const s = idx(r.checkIn); const e = idx(r.checkOut);
            const w = Math.max(dayW - 4, (e - s) * dayW - 4);
            return `<div class="tl-bar" style="left:${s * dayW + 2}px;width:${w}px;background:${sourceColor(r)}" data-res="${r.id}" title="${escapeHtml(r.guestName)} · ${fmtDateShort(r.checkIn)}→${fmtDateShort(r.checkOut)}">${escapeHtml(r.guestName)}</div>`;
          }).join('')}
        </div>
      </div>`).join('');
  }).join('');

  return `
    <div class="timeline-wrap">
      <div class="tl-grid" style="min-width:${160 + axisW}px">
        <div class="tl-row tl-head" style="grid-template-columns:160px ${axisW}px">
          <div class="tl-label">Oda Tipi</div>
          <div style="display:flex">${dayHeader}</div>
        </div>
        ${rows}
      </div>
    </div>
    <div class="legend mt">
      <span><i style="background:#c9a24b"></i> Doğrudan</span>
      ${store.channels.map((c) => `<span><i style="background:${c.color}"></i> ${escapeHtml(c.name)}</span>`).join('')}
    </div>`;
}

// ---------- Gün detay modalı ----------
function openDayModal(ctx, date, data) {
  const active = data.reservations;
  const arrivals = active.filter((r) => r.checkIn === date);
  const departures = active.filter((r) => r.checkOut === date);
  const staying = active.filter((r) => r.checkIn <= date && date < r.checkOut);
  const dayInfo = data.days.find((d) => d.date === date) || {};

  const section = (title, list, emptyTxt) => `
    <h4 style="font-size:.95rem;margin:14px 0 8px">${title} <span class="muted" style="font-family:var(--sans);font-size:.8rem">(${list.length})</span></h4>
    ${list.length ? `<div class="mini-list">${list.map((r) => `
      <div class="mini-row">
        <div class="mr-main"><strong>${escapeHtml(r.guestName)}</strong><span>${escapeHtml(r.roomTypeName)}${r.roomNumber ? ` · Oda ${r.roomNumber}` : ''} · ${escapeHtml(r.channelName)}</span></div>
        ${resBadge(r.status)}
      </div>`).join('')}</div>` : `<p class="muted" style="font-size:.84rem;margin:0">${emptyTxt}</p>`}`;

  openModal({
    title: fmtDate(date),
    wide: true,
    body: `
      <div class="flex gap-sm wrap mb">
        <span class="badge ${occClass(dayInfo.occupancyPct || 0)}">Doluluk %${dayInfo.occupancyPct || 0}</span>
        <span class="badge b-navy">${dayInfo.occupied || 0} dolu oda</span>
        <span class="badge b-ok">${dayInfo.available || 0} müsait</span>
      </div>
      ${section('Girişler', arrivals, 'Giriş yok.')}
      ${section('Çıkışlar', departures, 'Çıkış yok.')}
      ${section('Konaklayanlar', staying, 'Konaklama yok.')}`,
    footer: '<button class="btn btn-ghost" data-close>Kapat</button>',
  });
}
