// Resepsiyon (birleşik): doluluk / gecelik gelir / oda durumu özeti + Adonis tarzı oda rafı tablosu.
import { api } from '../api.js';
import {
  escapeHtml, money, fmtDate, fmtDateShort, relTime, addDays,
  badge, toast, openModal, spinner, emptyState,
} from '../ui.js';
import { openReservationModal, doCheckout } from './reservations.js';
import { openStayModal } from './stay.js';

// Oda rafı filtreleri (çoklu seçim — Adonis tarzı onay kutuları)
const FILTER_KEYS = ['bos', 'dolu', 'kirli', 'arizali', 'rezerve', 'cikis'];
const FILTER_LABELS = { bos: 'Boş', dolu: 'Dolu', kirli: 'Kirli', arizali: 'Arızalı', rezerve: 'Rezerve', cikis: 'Bugün Çıkış Yapacaklar' };
const active = new Set(FILTER_KEYS); // varsayılan: hepsi seçili

// Oda sıralaması: 1000ler · 100ler · 2000ler · 200ler · 3000ler · 300ler · 400ler · 500ler · 600ler
function roomSortKey(number) {
  const n = parseInt(number, 10) || 0;
  const RANK = [[1000, 2000, 0], [100, 200, 1], [2000, 3000, 2], [200, 300, 3], [3000, 4000, 4], [300, 400, 5], [400, 500, 6], [500, 600, 7], [600, 700, 8]];
  for (const [lo, hi, rank] of RANK) if (n >= lo && n < hi) return rank * 100000 + n;
  return 99 * 100000 + n;
}

// Sütun başlığına tıklayarak sıralama (varsayılan: oda numarası özel düzeni)
const rrSort = { key: 'room', dir: 'asc' };
const RR_SORT = {
  type: (r) => (r.typeName || '').toLowerCase(),
  guest: (r) => (r.guestName || '').toLowerCase(),
  checkIn: (r) => r.checkIn || '',
  checkOut: (r) => r.checkOut || '',
  nights: (r) => (r.resNights == null ? null : r.resNights),
  persons: (r) => (r.resPersons == null ? null : r.resPersons),
  balance: (r) => ((r.occupied || r.reserved) ? (r.balance || 0) : null),
};
function rrCompare(a, b) {
  if (rrSort.key === 'room' || !RR_SORT[rrSort.key]) {
    const c = roomSortKey(a.number) - roomSortKey(b.number);
    return rrSort.dir === 'desc' ? -c : c;
  }
  const f = RR_SORT[rrSort.key];
  const va = f(a), vb = f(b);
  const ea = va === null || va === undefined || va === '';
  const eb = vb === null || vb === undefined || vb === '';
  if (ea && eb) return roomSortKey(a.number) - roomSortKey(b.number); // ikisi de boş → oda no
  if (ea) return 1; // boş değerler her zaman sona
  if (eb) return -1;
  const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'tr', { numeric: true });
  return rrSort.dir === 'desc' ? -c : c;
}
function rrInd(key) { return rrSort.key === key ? (rrSort.dir === 'asc' ? ' ▲' : ' ▼') : ''; }

// ---------- Donut (oda durumu) ----------
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

// ---------- Filtre / satır rengi ----------
function catsOf(room, bDate) {
  const cats = [];
  if (room.occupied) { cats.push('dolu'); if (room.checkOut === bDate) cats.push('cikis'); }
  else if (room.reserved) cats.push('rezerve');
  else cats.push('bos');
  if (room.housekeeping === 'dirty' && !room.occupied) cats.push('kirli');
  if (room.outOfOrder) cats.push('arizali');
  return cats;
}
function roomMatches(room, bDate) { return catsOf(room, bDate).some((c) => active.has(c)); }
function rowClass(room, bDate) {
  const c = [];
  if (room.outOfOrder) c.push('rr-ooo');
  else if (!room.occupied && room.housekeeping === 'dirty') c.push('rr-dirty');
  if (room.occupied) c.push(room.checkOut === bDate ? 'rr-checkout' : 'rr-occupied');
  else if (room.reserved) c.push('rr-reserved');
  else c.push('rr-empty');
  return c.join(' ');
}

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let dash, rooms;
  try { [dash, rooms] = await Promise.all([api.dashboard(), api.rooms()]); }
  catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }

  const bDate = dash.date;
  const r = dash.rooms, k = dash.kpis;
  const rsx = dash.roomStatus || { dolu: r.occupied, bos: r.available, rezerve: 0, arizali: r.outOfOrder };
  const slices = [
    { label: 'Dolu', value: rsx.dolu, color: 'var(--navy)' },
    { label: 'Boş', value: rsx.bos, color: 'var(--ok)' },
    { label: 'Rezerve', value: rsx.rezerve, color: 'var(--gold)' },
    { label: 'Arızalı', value: rsx.arizali, color: 'var(--danger)' },
  ];

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Resepsiyon</h2><div class="sub">${fmtDate(bDate)} · ön büro</div></div>
      <button class="btn btn-gold" id="walkin">+ Walk-in / Yeni Rezervasyon</button>
    </div>

    <div class="dash-top mb">
      <div class="kpi kpi-center"><div class="kpi-label">Doluluk Oranı</div><div class="kpi-value">${k.occupancyPct}<small>%</small></div><div class="kpi-foot">${r.occupied}/${r.sellable} oda dolu</div></div>
      <div class="kpi kpi-center accent-navy"><div class="kpi-label">Bu Geceki Oda Geliri</div><div class="kpi-value" style="font-size:1.5rem">${money(k.roomRevenueTonight)}</div><div class="kpi-foot">konaklayan misafirler</div></div>
      <div class="card"><div class="card-head"><h3>Oda Durumu</h3><span class="card-sub">${r.total} oda</span></div>
        <div class="card-pad"><div class="donut-wrap"><div class="donut">${donutSVG(slices)}</div>
          <div class="donut-legend">${slices.map((s) => `<div class="dl-item"><span class="dl-dot" style="background:${s.color}"></span><span class="dl-lbl">${s.label}</span><b class="dl-val">${s.value}</b></div>`).join('')}</div>
        </div></div>
      </div>
    </div>

    <div class="card">
      <div class="rr-filterbar" id="rrFilters">
        ${FILTER_KEYS.map((key) => `<label class="rr-chk"><input type="checkbox" data-f="${key}" ${active.has(key) ? 'checked' : ''}> ${FILTER_LABELS[key]}</label>`).join('')}
        <label class="rr-chk rr-all"><input type="checkbox" data-f="hepsi" ${active.size === FILTER_KEYS.length ? 'checked' : ''}> Hepsi</label>
      </div>
      <div class="rr-groupbar">Gruplamak istediğiniz kolonu buraya sürükleyin.</div>
      <div id="rackWrap">${rackHtml(rooms, bDate)}</div>
    </div>`;

  container.querySelector('#walkin').addEventListener('click', () => {
    openReservationModal(ctx, { defaults: { checkIn: bDate, checkOut: addDays(bDate, 1) }, onSaved: () => ctx.reload() });
  });

  const repaint = () => { container.querySelector('#rackWrap').innerHTML = rackHtml(rooms, bDate); };
  container.querySelector('#rrFilters').addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-f]'); if (!cb) return;
    const f = cb.dataset.f;
    if (f === 'hepsi') { active.clear(); if (cb.checked) FILTER_KEYS.forEach((k2) => active.add(k2)); }
    else { if (cb.checked) active.add(f); else active.delete(f); }
    container.querySelectorAll('#rrFilters input[data-f]').forEach((x) => { if (x.dataset.f !== 'hepsi') x.checked = active.has(x.dataset.f); });
    const hepsi = container.querySelector('#rrFilters input[data-f="hepsi"]'); if (hepsi) hepsi.checked = active.size === FILTER_KEYS.length;
    repaint();
  });

  // Sütun başlığına tıklayarak sıralama
  container.querySelector('#rackWrap').addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    const key = th.dataset.sort;
    if (rrSort.key === key) rrSort.dir = rrSort.dir === 'asc' ? 'desc' : 'asc';
    else { rrSort.key = key; rrSort.dir = 'asc'; }
    repaint();
  });

  container.querySelector('#rackWrap').addEventListener('click', (e) => {
    const tr = e.target.closest('[data-room]'); if (!tr) return;
    const room = rooms.find((x) => x.id === tr.dataset.room); if (!room) return;
    if (room.occupied) openStayModal(ctx, { reservationId: room.reservationId, room });
    else if (room.reserved) openStayModal(ctx, { mode: 'checkin', reservationId: room.reservationId });
    else if (!room.outOfOrder && room.housekeeping === 'clean') openStayModal(ctx, { room });
    else openRoomModal(ctx, room);
  });
}

function rackHtml(rooms, bDate) {
  const list = rooms.filter((rm) => roomMatches(rm, bDate)).sort(rrCompare);
  if (!list.length) return emptyState('🚪', 'Seçili filtrede oda yok.');
  return `<div class="table-wrap"><table class="tbl room-tbl rr-tbl">
    <thead><tr>
      <th class="sortable" data-sort="room">Oda${rrInd('room')}</th>
      <th class="sortable" data-sort="type">Oda Tipi${rrInd('type')}</th>
      <th class="sortable" data-sort="guest">Adı${rrInd('guest')}</th>
      <th class="sortable" data-sort="checkIn">Geliş Tarihi${rrInd('checkIn')}</th>
      <th class="sortable" data-sort="checkOut">Ayrılış Tarihi${rrInd('checkOut')}</th>
      <th class="sortable t-right" data-sort="nights">Gece S.${rrInd('nights')}</th>
      <th class="sortable t-right" data-sort="persons">Kişi S.${rrInd('persons')}</th>
      <th class="sortable t-right" data-sort="balance">Bakiye${rrInd('balance')}</th>
      <th>Notlar</th><th>Kat</th>
    </tr></thead>
    <tbody>${list.map((rm) => rrRow(rm, bDate)).join('')}</tbody></table></div>`;
}

function rrRow(room, bDate) {
  const has = room.occupied || room.reserved;
  const tag = room.outOfOrder ? ' <span class="rr-tag rr-tag-ooo">Arızalı</span>'
    : (!room.occupied && room.housekeeping === 'dirty' ? ' <span class="rr-tag rr-tag-dirty">Kirli</span>' : '');
  return `<tr class="room-row ${rowClass(room, bDate)}" data-room="${room.id}">
    <td class="t-strong">${room.number}${tag}</td>
    <td>${escapeHtml(room.typeName)}</td>
    <td>${has ? escapeHtml(room.guestName || '—') : ''}</td>
    <td>${has && room.checkIn ? fmtDateShort(room.checkIn) : ''}</td>
    <td>${has && room.checkOut ? fmtDateShort(room.checkOut) : ''}</td>
    <td class="t-right">${has && room.resNights != null ? room.resNights : ''}</td>
    <td class="t-right">${has && room.resPersons != null ? room.resPersons : ''}</td>
    <td class="t-right">${has ? money(room.balance || 0) : ''}</td>
    <td class="rr-notes" title="${escapeHtml(room.resNotes || '')}">${escapeHtml(room.resNotes || '')}</td>
    <td>${room.floor}</td>
  </tr>`;
}

// ---------- Oda detay / durum modalı ----------
async function openRoomModal(ctx, room) {
  const occupied = room.status === 'occupied';
  let resHtml = '';
  let reservation = null;
  if (occupied && room.reservationId) {
    try {
      reservation = await api.reservation(room.reservationId);
      resHtml = `
        <div class="section-sep"></div>
        <dl class="dl">
          <dt>Misafir</dt><dd class="t-strong">${escapeHtml(reservation.guestName)} ${reservation.guestVip ? '<span class="badge b-gold">VIP</span>' : ''}</dd>
          <dt>Rezervasyon</dt><dd class="t-code">${reservation.code}</dd>
          <dt>Konaklama</dt><dd>${fmtDate(reservation.checkIn)} → ${fmtDate(reservation.checkOut)} (${reservation.nights} gece)</dd>
          <dt>Bakiye</dt><dd>${money(reservation.totalAmount - reservation.paidAmount)} kalan</dd>
        </dl>`;
    } catch { /* yoksay */ }
  }

  let logs = [];
  try { logs = await api.get(`/api/rooms/${room.id}/logs`); } catch { /* yoksay */ }

  const body = `
    <div class="flex between wrap">
      <div><div style="font-family:var(--serif);font-size:1.8rem;color:var(--ink)">Oda ${room.number}</div>
        <div class="muted">${escapeHtml(room.typeName)} · ${room.floor}. kat · ${room.capacity} kişilik</div></div>
      <div class="flex gap-sm wrap" style="justify-content:flex-end;max-width:220px">
        ${occupied ? badge('Rezerve', 'b-navy') : badge('Boş', 'b-ok')}
        ${room.housekeeping === 'dirty' ? badge('Kirli', 'b-warn') : badge('Temiz', 'b-ok')}
        ${room.outOfOrder ? badge('Arızalı', 'b-danger') : ''}
      </div>
    </div>
    ${room.features && room.features.length ? `<div class="flex wrap gap-sm mt">${room.features.map((f) => `<span class="badge b-muted" >${escapeHtml(f)}</span>`).join('')}</div>` : ''}
    ${resHtml}
    <div class="section-sep"></div>
    <div class="flex between" style="align-items:center"><h4 style="font-size:.95rem;margin:0">İşlem Geçmişi</h4><span class="muted" style="font-size:.78rem">${logs.length} kayıt</span></div>
    <div class="room-log">${logs.length ? logs.map(logRow).join('') : '<p class="muted" style="font-size:.84rem;margin:10px 0 0">Bu oda için henüz işlem kaydı yok.</p>'}</div>`;

  const foot = document.createElement('div');
  const actions = [];
  if (occupied && reservation) actions.push('<button class="btn btn-primary" data-do="checkout">Check-out</button>');
  if (room.housekeeping === 'dirty') actions.push('<button class="btn btn-ghost" data-do="clean">Temiz İşaretle</button>');
  else actions.push('<button class="btn btn-ghost" data-do="dirty">Kirli İşaretle</button>');
  if (room.outOfOrder) actions.push('<button class="btn btn-gold" data-do="repair">Arızayı Kaldır</button>');
  else actions.push('<button class="btn btn-danger" data-do="oo">Arızalı İşaretle</button>');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Kapat</button>${actions.join('')}`;

  const m = openModal({ title: `Oda ${room.number}`, body, footer: foot });
  foot.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const act = b.dataset.do;
    try {
      if (act === 'checkout') { m.close(); doCheckout(ctx, reservation.id, () => ctx.reload()); return; }
      if (act === 'oo') { await api.patch(`/api/rooms/${room.id}/status`, { outOfOrder: true }); toast('Oda arızalı olarak işaretlendi.', 'warn'); }
      if (act === 'repair') { await api.patch(`/api/rooms/${room.id}/status`, { outOfOrder: false }); toast('Oda arızası kaldırıldı.', 'ok'); }
      if (act === 'clean') { await api.patch(`/api/rooms/${room.id}/status`, { housekeeping: 'clean' }); toast('Oda temiz işaretlendi.', 'ok'); }
      if (act === 'dirty') { await api.patch(`/api/rooms/${room.id}/status`, { housekeeping: 'dirty' }); toast('Oda kirli işaretlendi.', 'warn'); }
      m.close(); ctx.reload();
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ---------- Oda log satırı ----------
const ROLE_TR = { admin: 'Yönetici', reception: 'Resepsiyon', housekeeping: 'Kat Hizmetleri', accounting: 'Muhasebe' };
function logMeta(l) {
  const key = `${l.action}:${l.entity}`;
  const M = {
    'checkin:reservation': ['Giriş yapıldı', 'in', '↓'],
    'checkout:reservation': ['Çıkış yapıldı', 'out', '↑'],
    'create:reservation': ['Rezervasyon oluşturuldu', 'new', '＋'],
    'cancel:reservation': ['Rezervasyon iptal edildi', 'del', '✕'],
    'assign:reservation': ['Oda atandı', 'neutral', '⇄'],
    'update:room': ['Oda durumu değişti', 'neutral', '✎'],
    'post:payment': ['Tahsilat girildi', 'money', '₺'],
    'post:folio_charge': ['Ekstra harcama', 'money', '＋'],
    'reverse:folio_item': ['Kalem iptal edildi', 'del', '↺'],
    'create:invoice': ['Fatura kesildi', 'money', '🧾'],
  };
  if (M[key]) return { label: M[key][0], cls: M[key][1], sym: M[key][2] };
  if (l.entity && l.entity.startsWith('kbs_')) return { label: 'KBS bildirimi', cls: 'kbs', sym: '🪪' };
  return { label: l.action, cls: 'neutral', sym: '•' };
}
function logRow(l) {
  const m = logMeta(l);
  return `<div class="rlog-item">
    <span class="rlog-ico rlog-${m.cls}">${m.sym}</span>
    <div class="rlog-body">
      <div class="rlog-top"><b>${escapeHtml(m.label)}</b><span class="rlog-time">${relTime(l.timestamp)}</span></div>
      ${l.detail ? `<div class="rlog-detail">${escapeHtml(l.detail)}</div>` : ''}
      <div class="rlog-user">${escapeHtml(l.userName || 'sistem')}${l.role ? ` · ${ROLE_TR[l.role] || l.role}` : ''}</div>
    </div>
  </div>`;
}
