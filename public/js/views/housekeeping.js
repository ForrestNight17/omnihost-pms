// Oda Temizliği — kondisyon tablosu.
// Temizlik durumu her odada Temiz VEYA Kirli'dir. "Rezerve" (atanmış, giriş yok),
// "Dolu" (içeride misafir) ve "Arızalı" bağımsız durumlardır.
import { api } from '../api.js';
import { escapeHtml, fmtDate, fmtDateShort, today, toast, spinner, emptyState } from '../ui.js';

let filter = 'all';

const FILTERS = [
  { key: 'all', label: 'Tümü', cnt: (c) => c.total },
  { key: 'empty', label: 'Boş', cnt: (c) => c.empty },
  { key: 'reserved', label: 'Rezerve', cnt: (c) => c.reserved },
  { key: 'occupied', label: 'Dolu', cnt: (c) => c.occupied },
  { key: 'dirty', label: 'Kirli', cnt: (c) => c.dirty },
  { key: 'clean', label: 'Temiz', cnt: (c) => c.clean },
  { key: 'ooo', label: 'Arızalı', cnt: (c) => c.outOfOrder },
];

function matches(room) {
  switch (filter) {
    case 'empty': return !room.occupied && !room.reserved;
    case 'reserved': return room.reserved;
    case 'occupied': return room.occupied;
    case 'dirty': return room.housekeeping === 'dirty';
    case 'clean': return room.housekeeping === 'clean';
    case 'ooo': return room.outOfOrder;
    default: return true;
  }
}

function durumBadge(room) {
  if (room.occupied) return '<span class="badge b-navy">Dolu</span>';
  if (room.reserved) return '<span class="badge b-info">Rezerve</span>';
  return '<span class="badge b-ok">Boş</span>';
}
function temizBadge(room) {
  return room.housekeeping === 'dirty' ? '<span class="badge b-warn">Kirli</span>' : '<span class="badge b-ok">Temiz</span>';
}

function recount(rooms, counts) {
  counts.dirty = rooms.filter((r) => r.housekeeping === 'dirty').length;
  counts.clean = rooms.filter((r) => r.housekeeping === 'clean').length;
  counts.outOfOrder = rooms.filter((r) => r.outOfOrder).length;
  counts.reserved = rooms.filter((r) => r.reserved).length;
  counts.occupied = rooms.filter((r) => r.occupied).length;
  counts.empty = rooms.filter((r) => !r.occupied && !r.reserved).length;
}

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let data;
  try { data = await api.housekeeping(); }
  catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }
  const { rooms, counts } = data;

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Oda Temizliği</h2><div class="sub">${fmtDate(today())} · oda kondisyon tablosu</div></div>
    </div>

    <div class="hk-filters" id="hkFilters">
      ${FILTERS.map((f) => `<button class="hk-chip chip-${f.key} ${filter === f.key ? 'active' : ''}" data-filter="${f.key}">
        <span class="hkc-dot"></span>${f.label}<span class="hkc-cnt">${f.cnt(counts)}</span></button>`).join('')}
    </div>

    <div class="hk-note">Her oda <b>Temiz</b> veya <b>Kirli</b>'dir. <b>Rezerve</b> (atanmış, giriş yok), <b>Dolu</b> (içeride misafir) ve <b>Arızalı</b> bağımsız durumlardır.</div>

    <div class="card"><div id="hkGrid"></div></div>`;

  const grid = container.querySelector('#hkGrid');
  function paint() {
    const list = rooms.filter(matches);
    grid.innerHTML = list.length ? tableHtml(list) : emptyState('🧹', 'Bu kategoride oda yok.');
  }
  paint();

  container.querySelector('#hkFilters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    filter = b.dataset.filter;
    container.querySelectorAll('#hkFilters .hk-chip').forEach((x) => x.classList.toggle('active', x.dataset.filter === filter));
    paint();
  });

  grid.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-set]'); if (!btn) return;
    const row = btn.closest('[data-room]');
    const id = row.dataset.room;
    const set = btn.dataset.set;
    const patch = set === 'clean' ? { housekeeping: 'clean' }
      : set === 'dirty' ? { housekeeping: 'dirty' }
      : set === 'oo' ? { outOfOrder: true }
      : { outOfOrder: false };
    btn.disabled = true;
    try {
      const updated = await api.patch(`/api/rooms/${id}/status`, patch);
      const idx = rooms.findIndex((r) => r.id === id);
      if (idx > -1) rooms[idx] = updated;
      recount(rooms, counts);
      FILTERS.forEach((f) => { const el = container.querySelector(`.chip-${f.key} .hkc-cnt`); if (el) el.textContent = f.cnt(counts); });
      paint();
      ctx.refreshBadges();
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
  });
}

function tableHtml(list) {
  return `<div class="table-wrap"><table class="tbl room-tbl">
    <thead><tr><th>Oda</th><th>Blok / Kat</th><th>Oda Tipi</th><th>Durum</th><th>Temizlik</th><th>Misafir</th><th class="t-right">İşlemler</th></tr></thead>
    <tbody>${list.map(rowHtml).join('')}</tbody></table></div>`;
}

function rowHtml(room) {
  const active = room.occupied || room.reserved;
  return `<tr data-room="${room.id}">
    <td class="t-strong">${room.number}</td>
    <td class="muted">${room.block || '—'} · ${room.floor}. kat</td>
    <td>${escapeHtml(room.typeName)}</td>
    <td>${durumBadge(room)}${room.outOfOrder ? ' <span class="badge b-danger">Arızalı</span>' : ''}</td>
    <td>${temizBadge(room)}</td>
    <td>${active ? escapeHtml(room.guestName || '—') + (room.checkOut ? ` <span class="muted">· çıkış ${fmtDateShort(room.checkOut)}</span>` : '') : '<span class="muted">Boş oda</span>'}</td>
    <td class="t-right">${room.occupied
      ? '<span class="muted" style="font-size:.78rem">Dolu — temiz (kilitli)</span>'
      : `<div class="t-actions">
      ${room.housekeeping !== 'clean' ? '<button class="btn btn-sm btn-ghost" data-set="clean">Temiz</button>' : ''}
      ${room.housekeeping !== 'dirty' ? '<button class="btn btn-sm btn-ghost" data-set="dirty">Kirli</button>' : ''}
      ${room.outOfOrder ? '<button class="btn btn-sm btn-gold" data-set="repair">Onar</button>' : '<button class="btn btn-sm btn-danger" data-set="oo">Arıza</button>'}
    </div>`}</td>
  </tr>`;
}
