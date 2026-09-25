// Gösterge Paneli: KPI'lar + Oda Durumu donut, kanal geliri (dönemli), giriş/çıkışlar.
import { api } from '../api.js';
import { store } from '../store.js';
import { money, fmtDate, escapeHtml, initials, resBadge, spinner, emptyState } from '../ui.js';
import { doCheckout } from './reservations.js';
import { openStayModal } from './stay.js';

const PERIOD_LABEL = { day: 'Günlük', week: 'Haftalık', month: 'Aylık' };

function polar(cx, cy, r, deg) { const rad = (deg * Math.PI) / 180; return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }; }
function donutSVG(slices) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const cx = 50, cy = 50, R = 46, labelR = 31;
  if (!total) return '<svg viewBox="0 0 100 100" class="donut-svg"><circle cx="50" cy="50" r="46" style="fill:var(--ivory-dim)"/><circle cx="50" cy="50" r="22" style="fill:var(--white)"/></svg>';
  let angle = -90;
  const arcs = []; const labels = [];
  slices.forEach((sl) => {
    if (sl.value <= 0) return;
    const frac = sl.value / total;
    const sweep = frac * 360;
    const a0 = angle, a1 = angle + sweep;
    if (frac >= 0.9999) {
      arcs.push(`<circle cx="${cx}" cy="${cy}" r="${R}" style="fill:${sl.color}"/>`);
    } else {
      const large = sweep > 180 ? 1 : 0;
      const p0 = polar(cx, cy, R, a0), p1 = polar(cx, cy, R, a1);
      arcs.push(`<path d="M${cx},${cy} L${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${R},${R} 0 ${large} 1 ${p1.x.toFixed(2)},${p1.y.toFixed(2)} Z" style="fill:${sl.color}"/>`);
    }
    if (frac > 0.04) {
      const mid = (a0 + a1) / 2;
      const lp = polar(cx, cy, labelR, mid);
      labels.push(`<text x="${lp.x.toFixed(2)}" y="${lp.y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" style="fill:#fff;font-size:8px;font-weight:700">${sl.value}</text>`);
    }
    angle = a1;
  });
  arcs.push(`<circle cx="${cx}" cy="${cy}" r="22" style="fill:var(--white)"/>`);
  return `<svg viewBox="0 0 100 100" class="donut-svg">${arcs.join('')}${labels.join('')}</svg>`;
}

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let d;
  try { d = await api.dashboard(); }
  catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }

  const r = d.rooms;
  const k = d.kpis;
  const rsx = d.roomStatus || { dolu: r.occupied, bos: r.available, rezerve: 0, arizali: r.outOfOrder };
  const slices = [
    { label: 'Dolu', value: rsx.dolu, color: 'var(--navy)' },
    { label: 'Boş', value: rsx.bos, color: 'var(--ok)' },
    { label: 'Rezerve', value: rsx.rezerve, color: 'var(--gold)' },
    { label: 'Arızalı', value: rsx.arizali, color: 'var(--danger)' },
  ];
  const periods = d.channelPeriods || { day: [], week: [], month: d.channelBreakdown || [] };
  let curPeriod = 'month';

  const channelColor = (src) => {
    if (!src || src === 'direct') return 'var(--gold)';
    const ch = store.channel(src);
    return ch ? ch.color : 'var(--navy)';
  };
  function channelBars(list) {
    if (!list.length) return emptyState('📊', 'Bu dönemde kanal geliri yok.');
    const maxRev = Math.max(1, ...list.map((x) => x.revenue));
    return list.map((x) => `
      <div class="bar-row">
        <div class="bl"><span class="sw" style="background:${channelColor(x.source)}"></span>${escapeHtml(x.name)}</div>
        <div class="bar-track"><i style="width:${Math.max(3, Math.round((x.revenue / maxRev) * 100))}%"></i></div>
        <div class="bv">${money(x.revenue)}</div>
      </div>`).join('')
      + `<div class="muted" style="font-size:.78rem;margin-top:12px">${PERIOD_LABEL[curPeriod]} · ${list.reduce((s, x) => s + x.count, 0)} rezervasyon · kaynağa göre gelir</div>`;
  }

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Gösterge Paneli</h2><div class="sub">${fmtDate(d.date)} · günlük operasyon özeti</div></div>
    </div>

    <div class="dash-top mb">
      <div class="kpi kpi-center"><div class="kpi-label">Doluluk Oranı</div><div class="kpi-value">${k.occupancyPct}<small>%</small></div><div class="kpi-foot">${r.occupied}/${r.sellable} oda dolu</div></div>
      <div class="kpi kpi-center accent-navy"><div class="kpi-label">Bu Geceki Oda Geliri</div><div class="kpi-value" style="font-size:1.5rem">${money(k.roomRevenueTonight)}</div><div class="kpi-foot">konaklayan misafirler</div></div>
      <div class="card">
        <div class="card-head"><h3>Oda Durumu</h3><span class="card-sub">${r.total} oda</span></div>
        <div class="card-pad">
          <div class="donut-wrap">
            <div class="donut">${donutSVG(slices)}</div>
            <div class="donut-legend">
              ${slices.map((s) => `<div class="dl-item"><span class="dl-dot" style="background:${s.color}"></span><span class="dl-lbl">${s.label}</span><b class="dl-val">${s.value}</b></div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card mb">
      <div class="card-head">
        <div class="flex gap-sm" style="align-items:center">
          <h3>Kanal Geliri</h3>
          <div class="segment" id="chanPeriod">
            <button data-p="day" class="${curPeriod === 'day' ? 'active' : ''}">Günlük</button>
            <button data-p="week" class="${curPeriod === 'week' ? 'active' : ''}">Haftalık</button>
            <button data-p="month" class="${curPeriod === 'month' ? 'active' : ''}">Aylık</button>
          </div>
        </div>
      </div>
      <div class="card-pad"><div id="channelBody">${channelBars(periods[curPeriod])}</div></div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h3>Bugünkü Girişler</h3><span class="card-sub">${d.arrivalsToday.length} rezervasyon</span></div>
        <div class="card-pad" id="arrivals">${listArrivals(d.arrivalsToday)}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Bugünkü Çıkışlar</h3><span class="card-sub">${d.departuresToday.length} rezervasyon</span></div>
        <div class="card-pad" id="departures">${listDepartures(d.departuresToday)}</div>
      </div>
    </div>`;

  container.querySelector('#chanPeriod').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    curPeriod = b.dataset.p;
    container.querySelectorAll('#chanPeriod button').forEach((x) => x.classList.toggle('active', x.dataset.p === curPeriod));
    container.querySelector('#channelBody').innerHTML = channelBars(periods[curPeriod]);
  });

  container.querySelector('#arrivals').addEventListener('click', (e) => {
    const b = e.target.closest('[data-checkin]'); if (!b) return;
    openStayModal(ctx, { mode: 'checkin', reservationId: b.dataset.checkin });
  });
  container.querySelector('#departures').addEventListener('click', (e) => {
    const b = e.target.closest('[data-checkout]'); if (!b) return;
    doCheckout(ctx, b.dataset.checkout, () => ctx.reload());
  });
}

function listArrivals(list) {
  if (!list.length) return emptyState('✓', 'Bugün giriş yok.');
  return `<div class="mini-list">${list.map((r) => `
    <div class="mini-row">
      <div class="mr-av">${initials(r.guestName)}</div>
      <div class="mr-main"><strong>${escapeHtml(r.guestName)}</strong><span>${escapeHtml(r.roomTypeName)} · ${r.nights} gece · ${escapeHtml(r.channelName)}</span></div>
      ${r.status === 'confirmed'
        ? `<button class="btn btn-sm btn-gold" data-checkin="${r.id}">Giriş</button>`
        : resBadge(r.status)}
    </div>`).join('')}</div>`;
}

function listDepartures(list) {
  if (!list.length) return emptyState('✓', 'Bugün çıkış yok.');
  return `<div class="mini-list">${list.map((r) => `
    <div class="mini-row">
      <div class="mr-av" style="background:var(--gold);color:#fff">${r.roomNumber || initials(r.guestName)}</div>
      <div class="mr-main"><strong>${escapeHtml(r.guestName)}</strong><span>Oda ${r.roomNumber || '—'} · ${escapeHtml(r.roomTypeName)}</span></div>
      ${r.status === 'checked_in'
        ? `<button class="btn btn-sm btn-primary" data-checkout="${r.id}">Çıkış</button>`
        : resBadge(r.status)}
    </div>`).join('')}</div>`;
}
