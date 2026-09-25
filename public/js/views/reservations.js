// Rezervasyonlar modülü + paylaşılan rezervasyon formu ve check-in modalı.
import { api } from '../api.js';
import { store } from '../store.js';
import {
  escapeHtml, money, fmtDate, fmtDateShort, nights, today, addDays, MONTHS_LONG,
  resBadge, sourceBadge, RES_STATUS, toast, openModal, confirmDialog, spinner, emptyState, initials,
} from '../ui.js';
import { openFolioModal } from './folio.js';
import { openStayModal } from './stay.js';

const filters = { q: '', status: '', source: '' };

// Sıralama (başlığa tıklayarak) — varsayılan giriş tarihine göre artan
const sortState = { key: 'checkIn', dir: 'asc' };
const R_SORT = {
  guest: (r) => (r.guestName || '').toLowerCase(),
  type: (r) => (r.roomTypeName || '').toLowerCase(),
  checkIn: (r) => r.checkIn || '',
  checkOut: (r) => r.checkOut || '',
  nights: (r) => r.nights || 0,
  source: (r) => (r.channelName || '').toLowerCase(),
  amount: (r) => r.totalAmount || 0,
};
function rCompare(a, b) {
  const f = R_SORT[sortState.key] || R_SORT.checkIn;
  const va = f(a), vb = f(b);
  const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'tr', { numeric: true });
  return sortState.dir === 'desc' ? -c : c;
}
function sortInd(key) { return sortState.key === key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : ''; }

// Ay navigasyonu (Adonis tarzı) — geliş tarihine göre
let selectedMonth = null; // 'YYYY-MM'
let bizDate = null; // iş günü (check-in gelecek tarihte engellensin diye)
function shiftMonth(ym, delta) {
  let [y, m] = ym.split('-').map(Number);
  m += delta;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; }

export async function render(container, ctx) {
  bizDate = ctx.businessDate || today();
  if (!selectedMonth) selectedMonth = bizDate.slice(0, 7);

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Rezervasyonlar</h2>
        <div class="sub">Geliş tarihine göre aylık liste</div>
      </div>
      <button class="btn btn-gold" id="newRes">+ Yeni Rezervasyon</button>
    </div>
    <div class="month-nav">
      <button class="btn btn-ghost btn-sm" id="mPrev">‹ Önceki</button>
      <span class="month-label" id="mLabel">${monthLabel(selectedMonth)}</span>
      <button class="btn btn-ghost btn-sm" id="mNext">Sonraki ›</button>
    </div>
    <div class="toolbar">
      <div class="search grow"><input class="input" id="fq" placeholder="Misafir adı veya rezervasyon kodu ara…" value="${escapeHtml(filters.q)}"></div>
      <select class="select" id="fstatus" style="max-width:180px">
        <option value="" ${filters.status === '' ? 'selected' : ''}>Rezervasyonlar</option>
        <option value="cancelled" ${filters.status === 'cancelled' ? 'selected' : ''}>İptal Edilenler</option>
      </select>
      <select class="select" id="fsource" style="max-width:200px">
        <option value="">Tüm kaynaklar</option>
        <option value="direct" ${filters.source === 'direct' ? 'selected' : ''}>Doğrudan</option>
        <option value="ota" ${filters.source === 'ota' ? 'selected' : ''}>Tüm OTA'lar</option>
        ${store.channels.map((c) => `<option value="${c.id}" ${filters.source === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="card"><div id="resList">${spinner()}</div></div>`;

  const listEl = container.querySelector('#resList');

  async function refresh() {
    listEl.innerHTML = spinner();
    let list;
    try { list = await api.reservations(filters); }
    catch (e) { listEl.innerHTML = emptyState('⚠️', e.message); return; }
    const bDate = ctx.businessDate || today();
    const curMonth = bDate.slice(0, 7);
    // Sadece onaylı (aktif) rezervasyonlar görünür; "İptal Edilenler" filtresi iptalleri gösterir.
    // checked_in/checked_out/no_show burada listelenmez (giriş yapıldıysa artık Resepsiyon'da).
    const wantCancelled = filters.status === 'cancelled';
    list = list.filter((r) => {
      if (wantCancelled ? r.status !== 'cancelled' : r.status !== 'confirmed') return false;
      const ci = r.checkIn || '';
      if (ci.slice(0, 7) !== selectedMonth) return false;
      // Aktif rezervasyonlarda güncel ayda geçmiş günler gizli (eski tarihli olmaz)
      if (!wantCancelled && selectedMonth === curMonth && ci < bDate) return false;
      return true;
    }).sort(rCompare);
    if (!list.length) { listEl.innerHTML = emptyState('🗓️', `${monthLabel(selectedMonth)} için rezervasyon yok.`); return; }
    const tToplam = list.reduce((s, r) => s + (r.totalAmount || 0), 0);
    const tOdenen = list.reduce((s, r) => s + (r.paidAmount || 0), 0);
    listEl.innerHTML = `
      <div class="table-wrap"><table class="tbl">
        <thead><tr>
          <th>Kod</th>
          <th class="sortable" data-sort="guest">Misafir${sortInd('guest')}</th>
          <th class="sortable" data-sort="type">Oda Tipi${sortInd('type')}</th>
          <th class="sortable" data-sort="checkIn">Giriş${sortInd('checkIn')}</th>
          <th class="sortable" data-sort="checkOut">Çıkış${sortInd('checkOut')}</th>
          <th class="sortable" data-sort="nights">Gece${sortInd('nights')}</th>
          <th class="sortable" data-sort="source">Kaynak${sortInd('source')}</th>
          <th>Durum</th>
          <th class="sortable t-right" data-sort="amount">Tutar${sortInd('amount')}</th><th></th>
        </tr></thead>
        <tbody>
        ${list.map((r) => `
          <tr data-id="${r.id}" style="cursor:pointer">
            <td class="t-code">${r.code}</td>
            <td><div class="t-strong">${escapeHtml(r.guestName)} ${r.guestVip ? '<span class="badge b-gold" style="margin-left:4px">VIP</span>' : ''}</div><div class="muted" style="font-size:.76rem">${escapeHtml(r.nationality || '')}</div></td>
            <td>${escapeHtml(r.roomTypeName)}${r.roomNumber ? ` · <b>${r.roomNumber}</b>` : ''}</td>
            <td>${fmtDateShort(r.checkIn)}</td>
            <td>${fmtDateShort(r.checkOut)}</td>
            <td>${r.nights}</td>
            <td>${sourceBadge(r)}</td>
            <td>${resBadge(r.status)}</td>
            <td class="t-right t-strong">${money(r.totalAmount)}</td>
            <td class="t-right"><div class="t-actions">${rowActions(r)}</div></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
      <div class="res-totals">
        <span>Toplam: <b>${money(tToplam)}</b></span>
        <span>Ödenen: <b style="color:var(--ok)">${money(tOdenen)}</b></span>
        <span>Kalan: <b style="color:var(--danger)">${money(tToplam - tOdenen)}</b></span>
        <span class="muted" style="margin-left:auto">${list.length} rezervasyon</span>
      </div>`;
  }

  // Olaylar
  const setMonth = (ym) => { selectedMonth = ym; container.querySelector('#mLabel').textContent = monthLabel(ym); refresh(); };
  container.querySelector('#mPrev').addEventListener('click', () => setMonth(shiftMonth(selectedMonth, -1)));
  container.querySelector('#mNext').addEventListener('click', () => setMonth(shiftMonth(selectedMonth, 1)));
  container.querySelector('#newRes').addEventListener('click', () => openReservationModal(ctx, { onSaved: refresh }));
  let searchTimer;
  container.querySelector('#fq').addEventListener('input', (e) => {
    clearTimeout(searchTimer); filters.q = e.target.value;
    searchTimer = setTimeout(refresh, 250);
  });
  container.querySelector('#fstatus').addEventListener('change', (e) => { filters.status = e.target.value; refresh(); });
  container.querySelector('#fsource').addEventListener('change', (e) => { filters.source = e.target.value; refresh(); });

  // Sütun başlığına tıklayarak sıralama
  listEl.addEventListener('click', (e) => {
    const th = e.target.closest('[data-sort]'); if (!th) return;
    const key = th.dataset.sort;
    if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
    else { sortState.key = key; sortState.dir = 'asc'; }
    refresh();
  });

  listEl.addEventListener('click', async (e) => {
    const actBtn = e.target.closest('[data-action]');
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (actBtn) {
      e.stopPropagation();
      const action = actBtn.dataset.action;
      if (action === 'edit') { const r = await api.reservation(id); openReservationModal(ctx, { reservation: r, onSaved: refresh }); }
      else if (action === 'checkin') { openStayModal(ctx, { mode: 'checkin', reservationId: id }); }
      else if (action === 'checkout') { doCheckout(ctx, id, refresh); }
      else if (action === 'cancel') { doCancel(ctx, id, refresh); }
      return;
    }
    const r = await api.reservation(id);
    openDetailModal(ctx, r, refresh);
  });

  await refresh();
}

function rowActions(r) {
  const btns = [];
  // Giriş yalnızca giriş tarihi gelmiş (iş günü ve öncesi) rezervasyonlarda
  if (r.status === 'confirmed' && r.checkIn <= bizDate) btns.push(`<button class="btn btn-sm btn-gold" data-action="checkin">Giriş</button>`);
  if (r.status === 'checked_in') btns.push(`<button class="btn btn-sm btn-primary" data-action="checkout">Çıkış</button>`);
  if (r.status === 'confirmed') btns.push(`<button class="btn btn-sm btn-ghost" data-action="edit">Düzenle</button>`);
  return btns.join('');
}

// ---------- Detay modalı ----------
export function openDetailModal(ctx, r, onChange) {
  const foot = document.createElement('div');
  const actions = [];
  if (r.status === 'confirmed' && r.checkIn <= bizDate) actions.push('<button class="btn btn-gold" data-do="checkin">Check-in</button>');
  if (r.status === 'checked_in') actions.push('<button class="btn btn-primary" data-do="checkout">Check-out</button>');
  if (r.status === 'checked_in' || r.status === 'checked_out') actions.push('<button class="btn btn-ghost" data-do="folio">Folio</button>');
  if (r.status === 'confirmed' || r.status === 'checked_in') actions.push('<button class="btn btn-ghost" data-do="edit">Düzenle</button>');
  if (r.status === 'confirmed') actions.push('<button class="btn btn-danger" data-do="cancel">İptal Et</button>');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Kapat</button>${actions.join('')}`;

  const body = `
    <div class="flex between wrap mb">
      <div class="flex"><div class="mr-av" style="width:44px;height:44px">${initials(r.guestName)}</div>
        <div><div class="t-strong" style="font-size:1.05rem">${escapeHtml(r.guestName)} ${r.guestVip ? '<span class="badge b-gold">VIP</span>' : ''}</div>
        <div class="muted" style="font-size:.82rem">${r.guestEmail ? escapeHtml(r.guestEmail) + ' · ' : ''}${escapeHtml(r.guestPhone || '')}</div></div></div>
      ${resBadge(r.status)}
    </div>
    <dl class="dl">
      <dt>Rezervasyon</dt><dd class="t-code">${r.code}</dd>
      <dt>Oda Tipi</dt><dd>${escapeHtml(r.roomTypeName)} ${r.roomNumber ? `· Oda <b>${r.roomNumber}</b>` : ''}</dd>
      <dt>Giriş → Çıkış</dt><dd>${fmtDate(r.checkIn)} → ${fmtDate(r.checkOut)} <span class="muted">(${r.nights} gece)</span></dd>
      <dt>Kişi</dt><dd>${r.adults} yetişkin${r.children ? `, ${r.children} çocuk` : ''}</dd>
      <dt>Kaynak</dt><dd>${sourceBadge(r)} ${r.channelName && r.source !== 'direct' ? '' : ''}</dd>
      <dt>Gecelik</dt><dd>${money(r.ratePerNight)}</dd>
      <dt>Toplam</dt><dd class="t-strong">${money(r.totalAmount)} <span class="muted">· ${money(r.paidAmount)} ödendi</span></dd>
      ${r.notes ? `<dt>Not</dt><dd>${escapeHtml(r.notes)}</dd>` : ''}
    </dl>`;

  const m = openModal({ title: 'Rezervasyon Detayı', body, footer: foot });
  foot.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const act = b.dataset.do;
    if (act === 'edit') { m.close(); const fresh = await api.reservation(r.id); openReservationModal(ctx, { reservation: fresh, onSaved: onChange }); }
    else if (act === 'checkin') { m.close(); openStayModal(ctx, { mode: 'checkin', reservationId: r.id }); }
    else if (act === 'checkout') { m.close(); doCheckout(ctx, r.id, onChange); }
    else if (act === 'folio') { m.close(); openFolioModal(ctx, r.id); }
    else if (act === 'cancel') { m.close(); doCancel(ctx, r.id, onChange); }
  });
}

// ---------- Oluştur / Düzenle formu ----------
export function openReservationModal(ctx, { reservation = null, onSaved, defaults = {} } = {}) {
  const isEdit = !!reservation;
  const rt = store.roomTypes;
  const bizDate = ctx.businessDate || today();
  const ci = reservation ? reservation.checkIn : (defaults.checkIn || bizDate);
  const co = reservation ? reservation.checkOut : (defaults.checkOut || addDays(ci, 1));
  const curType = reservation ? reservation.roomTypeId : (defaults.roomTypeId || (rt[0] && rt[0].id));
  const curRate = reservation ? reservation.ratePerNight : ''; // fiyat manuel; sabit fiyat önerilmez

  const form = document.createElement('form');
  form.innerHTML = `
    ${isEdit ? '' : `
    <div class="form-row">
      <div class="field"><label>Ad Soyad</label><input class="input" name="guestName" id="guestName" placeholder="Misafir adı soyadı" autocomplete="off"></div>
      <div class="field"><label>Telefon <span class="hint">(opsiyonel)</span></label><input class="input" name="guestPhone" placeholder="+90…"></div>
    </div>`}
    <div class="form-row">
      <div class="field"><label>Oda Tipi</label>
        <select class="select" name="roomTypeId" id="roomTypeId">
          ${rt.map((t) => `<option value="${t.id}" ${t.id === curType ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Oda No</label>
        <select class="select" name="roomId" id="roomSel"><option value="">Yükleniyor…</option></select>
      </div>
    </div>
    <div class="form-row">
      <div class="field"><label>Giriş Tarihi</label><input class="input" type="date" name="checkIn" id="checkIn" value="${ci}" min="${bizDate}"></div>
      <div class="field"><label>Çıkış Tarihi</label><input class="input" type="date" name="checkOut" id="checkOut" value="${co}" min="${bizDate}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Yetişkin</label><input class="input" type="number" min="1" name="adults" value="${reservation ? reservation.adults : 2}"></div>
      <div class="field"><label>Çocuk</label><input class="input" type="number" min="0" name="children" value="${reservation ? reservation.children : 0}"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Gecelik Fiyat (₺) <span class="hint">(manuel)</span></label><input class="input" type="number" min="0" name="ratePerNight" id="ratePerNight" value="${curRate}" placeholder="Manuel fiyat giriniz"></div>
      <div class="field"><label>Toplam</label><input class="input" id="totalPreview" readonly style="background:var(--ivory);font-weight:700"></div>
    </div>
    <div id="availInfo" style="font-size:.84rem;margin-bottom:10px"></div>
    <label id="overrideWrap" class="flex gap-sm" style="display:none;font-size:.82rem;margin-bottom:10px"><input type="checkbox" id="overrideAvail"> Müsaitlik uyarısına rağmen oluştur</label>
    <div class="field"><label>Not</label><textarea class="input" name="notes" rows="2" placeholder="Özel istekler…">${reservation ? escapeHtml(reservation.notes || '') : ''}</textarea></div>`;

  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="saveRes">${isEdit ? 'Güncelle' : 'Rezervasyon Oluştur'}</button>`;
  const m = openModal({ title: isEdit ? `Rezervasyon Düzenle · ${reservation.code}` : 'Yeni Rezervasyon', body: form, footer: foot, wide: true });

  // Fiyat + müsaitlik (tarih bazlı rate/inventory motorundan)
  let manualRate = isEdit;
  let availOk = true;
  function recalcTotal() {
    const rate = Number(form.ratePerNight.value) || 0;
    const nn = nights(form.checkIn.value, form.checkOut.value);
    form.querySelector('#totalPreview').value = `${money(rate * nn)} · ${nn} gece`;
  }
  async function updateQuote() {
    recalcTotal();
    if (isEdit) return; // düzenlemede müsaitlik kontrolü gösterilmez
    const rtId = form.roomTypeId.value, ci = form.checkIn.value, co = form.checkOut.value;
    const info = form.querySelector('#availInfo');
    const ovWrap = form.querySelector('#overrideWrap');
    if (!rtId || !ci || !co || co <= ci) { info.innerHTML = ''; return; }
    info.innerHTML = '<span class="muted">Müsaitlik kontrol ediliyor…</span>';
    try {
      // Yalnızca müsaitlik/overbooking kontrolü. Fiyat MANUEL girilir (motor OTA içindir).
      const av = await api.get(`/api/availability?roomTypeId=${rtId}&checkIn=${ci}&checkOut=${co}`);
      availOk = av.ok;
      if (av.ok) {
        info.innerHTML = `<span class="badge b-ok">Müsait</span> <span class="muted">${nights(ci, co)} gece</span>`;
        ovWrap.style.display = 'none';
      } else {
        info.innerHTML = `<span class="badge b-danger">${escapeHtml(av.reason || 'Müsait değil')}</span>`;
        ovWrap.style.display = 'flex';
      }
    } catch (e) { info.innerHTML = `<span class="muted">${escapeHtml(e.message)}</span>`; }
  }
  // Seçilen tip + tarihlerde ATANABİLİR (boş, arızasız) odaları yükler. Fiyat MANUEL; önerilmez.
  async function loadRooms() {
    const sel = form.querySelector('#roomSel');
    const prev = sel.value;
    const rtId = form.roomTypeId.value, ci2 = form.checkIn.value, co2 = form.checkOut.value;
    if (!rtId || !ci2 || !co2 || co2 <= ci2) { sel.innerHTML = '<option value="">—</option>'; return; }
    sel.innerHTML = '<option value="">Yükleniyor…</option>';
    try {
      const rooms = await api.availableRooms(rtId, ci2, co2, isEdit ? reservation.id : undefined);
      if (!rooms.length) { sel.innerHTML = '<option value="">Boş oda yok</option>'; return; }
      const want = (prev && rooms.some((r) => r.id === prev)) ? prev
        : ((isEdit && reservation.roomId && rooms.some((r) => r.id === reservation.roomId)) ? reservation.roomId : rooms[0].id);
      sel.innerHTML = rooms.map((r) => `<option value="${r.id}" ${r.id === want ? 'selected' : ''}>${r.number}</option>`).join('');
    } catch { sel.innerHTML = '<option value="">Hata</option>'; }
  }
  form.ratePerNight.addEventListener('input', () => { manualRate = true; recalcTotal(); });
  form.roomTypeId.addEventListener('change', () => { loadRooms(); updateQuote(); });
  form.checkIn.addEventListener('change', () => { if (form.checkOut.value <= form.checkIn.value) form.checkOut.value = addDays(form.checkIn.value, 1); loadRooms(); updateQuote(); });
  form.checkOut.addEventListener('change', () => { loadRooms(); updateQuote(); });
  loadRooms();
  updateQuote();

  foot.querySelector('#saveRes').addEventListener('click', async () => {
    const btn = foot.querySelector('#saveRes');
    const f = form;
    if (f.checkOut.value <= f.checkIn.value) { toast('Çıkış tarihi girişten sonra olmalı.', 'err'); return; }
    if (!isEdit && f.checkIn.value < bizDate) { toast(`Giriş tarihi iş gününden (${bizDate}) eski olamaz.`, 'err'); return; }
    if (!f.roomId.value) { toast('Oda no seçin (boş oda yok olabilir; tarih/tipi değiştirin).', 'err'); return; }
    const payload = {
      roomTypeId: f.roomTypeId.value,
      roomId: f.roomId.value,
      source: 'direct', // manuel/walk-in rezervasyon her zaman doğrudan kapı müşterisi
      checkIn: f.checkIn.value,
      checkOut: f.checkOut.value,
      adults: Number(f.adults.value) || 1,
      children: Number(f.children.value) || 0,
      ratePerNight: Number(f.ratePerNight.value) || 0,
      notes: f.notes.value,
    };
    if (isEdit) {
      btn.disabled = true;
      try { await api.put(`/api/reservations/${reservation.id}`, payload); toast('Rezervasyon güncellendi.', 'ok'); m.close(); onSaved && onSaved(); }
      catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    } else {
      // Rezervasyonda yalnızca ad soyad (+ opsiyonel telefon). Kimlik bilgisi check-in'de alınır.
      if (!f.guestName.value.trim()) { toast('Misafir adı girin.', 'err'); return; }
      payload.guestName = f.guestName.value.trim();
      payload.guestPhone = f.guestPhone ? f.guestPhone.value.trim() : '';
      if (!availOk) {
        const ov = f.querySelector('#overrideAvail');
        if (!ov || !ov.checked) { toast('Seçilen tarihlerde müsaitlik yok. Devam için "yine de oluştur" kutusunu işaretleyin.', 'err'); return; }
        payload.overrideAvailability = true;
      }
      btn.disabled = true;
      try { await api.post('/api/reservations', payload); toast('Rezervasyon oluşturuldu.', 'ok'); m.close(); onSaved && onSaved(); ctx.refreshBadges(); }
      catch (e) { toast(e.message, 'err'); btn.disabled = false; }
    }
  });
}

// ---------- Check-in modalı (oda ataması) ----------
export async function openCheckinModal(ctx, reservation, onDone) {
  const rooms = await api.rooms();
  const available = rooms.filter((r) => r.status === 'available');
  const sameType = available.filter((r) => r.typeId === reservation.roomTypeId);
  const others = available.filter((r) => r.typeId !== reservation.roomTypeId);
  if (!available.length) { toast('Uygun boş oda yok.', 'err'); return; }

  const optsHtml = (arr) => arr.map((r) => `<option value="${r.id}">${r.number} · ${escapeHtml(r.typeName)}${r.housekeeping !== 'clean' ? ' (temizlik bekliyor)' : ''}</option>`).join('');
  const body = `
    <p class="muted" style="margin-top:0">${escapeHtml(reservation.guestName)} · ${escapeHtml(reservation.roomTypeName)} · ${fmtDate(reservation.checkIn)} → ${fmtDate(reservation.checkOut)}</p>
    <div class="field"><label>Oda Seçimi</label>
      <select class="select" id="roomPick">
        ${sameType.length ? `<optgroup label="${escapeHtml(reservation.roomTypeName)}">${optsHtml(sameType)}</optgroup>` : ''}
        ${others.length ? `<optgroup label="Diğer Odalar">${optsHtml(others)}</optgroup>` : ''}
      </select>
      <span class="hint">Aynı oda tipindeki boş odalar önce listelenir.</span>
    </div>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="doCheckin">Check-in Yap</button>`;
  const m = openModal({ title: `Check-in · ${reservation.code}`, body, footer: foot });
  foot.querySelector('#doCheckin').addEventListener('click', async () => {
    const roomId = m.el.querySelector('#roomPick').value;
    foot.querySelector('#doCheckin').disabled = true;
    try {
      await api.post(`/api/reservations/${reservation.id}/checkin`, { roomId });
      toast('Check-in tamamlandı.', 'ok'); m.close(); onDone && onDone(); ctx.refreshBadges();
    } catch (e) { toast(e.message, 'err'); foot.querySelector('#doCheckin').disabled = false; }
  });
}

export async function doCheckout(ctx, id, onDone) {
  try {
    const res = await api.post(`/api/reservations/${id}/checkout`);
    if (res && res.needsSettlement) { openSettlement(ctx, id, res, onDone); return; }
    toast('Check-out tamamlandı, oda temizliğe gönderildi.', 'ok');
    onDone && onDone(); ctx.refreshBadges();
  } catch (e) { toast(e.message, 'err'); }
}

function openSettlement(ctx, id, info) {
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Kapat</button>
    <button class="btn btn-primary" id="goFolio">Tahsilat Al / Folio</button>`;
  const m = openModal({
    title: 'Ödenmemiş Bakiye — Çıkış Yapılamaz',
    body: `<p style="margin-top:0">Bu odada <b style="color:var(--danger)">${money(info.balance)}</b> ödenmemiş bakiye var.<br><b>Tüm bakiye ödenmeden çıkış yapılamaz.</b> Tahsilatı tamamlayıp tekrar çıkış yapın.</p>`,
    footer: foot,
  });
  foot.querySelector('#goFolio').addEventListener('click', () => { m.close(); openFolioModal(ctx, id); });
}

export async function doCancel(ctx, id, onDone) {
  const ok = await confirmDialog({ title: 'Rezervasyonu İptal Et', message: 'Bu rezervasyonu iptal etmek istediğinize emin misiniz?', confirmText: 'İptal Et', danger: true });
  if (!ok) return;
  try { await api.post(`/api/reservations/${id}/cancel`); toast('Rezervasyon iptal edildi.', 'warn'); onDone && onDone(); ctx.refreshBadges(); }
  catch (e) { toast(e.message, 'err'); }
}
