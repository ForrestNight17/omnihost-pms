// Konaklama / Giriş modalı — Adonis / BookLogic ilhamı.
// 3 sekme: Giriş & Misafir Bilgileri · Harcamalar/Adisyonlar · Ödemeler & Çıkış (+ Hesap Özeti).
import { api } from '../api.js';
import { store } from '../store.js';
import {
  escapeHtml, money, fmtDate, fmtDateShort, relTime, today, addDays, nights,
  toast, openModal, confirmDialog, spinner,
} from '../ui.js';

const PAY_METHODS = { cash: 'Nakit', card: 'Kredi Kartı', transfer: 'Havale/EFT', vpos: 'Sanal POS' };
const GENDER = { E: 'Erkek', K: 'Kadın' };

function curFmt(n, cur) {
  const v = Number(n) || 0;
  if (cur === 'TRY' || !cur) return money(v);
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : (cur + ' ');
  return sym + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function openStayModal(ctx, opts = {}) {
  const st = {
    mode: opts.mode || (opts.reservationId ? 'edit' : 'new'),
    room: opts.room || null,
    reservationId: opts.reservationId || null,
    tab: 'guest',
    checkIn: null, checkOut: null, currency: 'TRY', ratePerNight: 0, notes: '',
    guests: [], reservation: null, folio: null, checkout: false,
  };

  // Referans veriler
  let currencies = [];
  try { currencies = await api.get('/api/currency'); } catch { /* yoksay */ }
  const eur = currencies.find((c) => c.code === 'EUR');
  const usd = currencies.find((c) => c.code === 'USD');

  const foot = document.createElement('div');
  foot.className = 'stay-foot';
  const m = openModal({ title: 'Konaklama', body: spinner(), footer: foot, wide: true });
  m.el.classList.add('modal-xl');

  await loadState();
  render();

  async function loadState() {
    if (st.mode === 'edit') {
      st.reservation = await api.reservation(st.reservationId);
      st.room = st.room || { id: st.reservation.roomId, number: st.reservation.roomNumber, typeId: st.reservation.roomTypeId, typeName: st.reservation.roomTypeName, block: st.reservation.roomBlock };
      st.checkIn = st.reservation.checkIn; st.checkOut = st.reservation.checkOut;
      st.currency = st.reservation.currency || 'TRY';
      st.ratePerNight = st.reservation.ratePerNight || 0;
      st.notes = st.reservation.notes || '';
      st.guests = (st.reservation.guests || []).map((g) => ({ ...g }));
      st.folio = await api.get(`/api/reservations/${st.reservationId}/folio`);
    } else if (st.mode === 'checkin') {
      // Bekleyen bir rezervasyonun check-in'i: oda seç + misafirleri resepsiyon ekler (boş başlar)
      st.reservation = await api.reservation(st.reservationId);
      st.checkIn = st.reservation.checkIn; st.checkOut = st.reservation.checkOut;
      st.currency = st.reservation.currency || 'TRY';
      st.ratePerNight = st.reservation.ratePerNight || 0;
      st.notes = st.reservation.notes || '';
      st.roomTypeId = st.reservation.roomTypeId;
      st.guests = []; // misafir listesi BOŞ; resepsiyon ekleyecek
      const rooms = await api.rooms();
      st.availableRooms = rooms.filter((r) => r.status === 'available' && !r.outOfOrder)
        .sort((a, b) => (a.typeId === st.roomTypeId ? -1 : 1) - (b.typeId === st.roomTypeId ? -1 : 1) || a.number.localeCompare(b.number, undefined, { numeric: true }));
      const sameType = st.availableRooms.filter((r) => r.typeId === st.roomTypeId);
      st.room = (st.reservation.roomId && st.availableRooms.find((r) => r.id === st.reservation.roomId)) || sameType[0] || st.availableRooms[0] || null;
    } else {
      // Walk-in (kapı): fiyat resepsiyon tarafından MANUEL girilir; otomatik fiyat gelmez.
      st.checkIn = ctx.businessDate || today();
      st.checkOut = addDays(st.checkIn, 1);
      st.ratePerNight = 0;
    }
  }

  // ---------- Render ----------
  function render() {
    const roomNo = st.room ? st.room.number : '—';
    const typeName = st.room ? (st.room.typeName || store.roomTypeName(st.room.typeId)) : '';
    const h3 = m.el.querySelector('.modal-head h3');
    if (h3) h3.textContent = `Konaklama · Oda ${roomNo} · ${typeName}${st.reservation ? ' · ' + st.reservation.code : ''}`;
    m.body.innerHTML = `
      <div class="stay-tabs" id="stayTabs">
        <button data-tab="guest" class="${st.tab === 'guest' ? 'active' : ''}">Giriş / Misafir Bilgileri</button>
        <button data-tab="extra" class="${st.tab === 'extra' ? 'active' : ''}">Harcamalar / Adisyonlar</button>
        <button data-tab="pay" class="${st.tab === 'pay' ? 'active' : ''}">Ödemeler / Çıkış</button>
      </div>
      <div class="stay-pane">${st.tab === 'guest' ? guestPane() : st.tab === 'extra' ? extraPane() : payPane()}</div>`;
    renderFooter();
    bind();
  }

  function guestPane() {
    const n = nights(st.checkIn, st.checkOut);
    return `
      <div class="stay-form">
        <div class="sf-row">
          <label>Giriş Tarihi</label><input class="input" type="date" id="fCheckIn" value="${st.checkIn}" ${st.mode !== 'new' ? 'disabled' : ''}>
          <label>Oda Tipi</label><input class="input" value="${escapeHtml(st.room ? (st.room.typeName || store.roomTypeName(st.room.typeId)) : store.roomTypeName(st.roomTypeId))}" disabled>
        </div>
        <div class="sf-row">
          <label>Çıkış Tarihi</label><input class="input" type="date" id="fCheckOut" value="${st.checkOut}" ${st.mode !== 'new' ? 'disabled' : ''}>
          <label>Oda No</label>
          ${st.mode === 'checkin'
            ? `<select class="select" id="fRoomSel">${(st.availableRooms || []).length ? (st.availableRooms || []).map((r) => `<option value="${r.id}" ${st.room && st.room.id === r.id ? 'selected' : ''}>${r.number} · ${escapeHtml(r.typeName)}${r.typeId === st.roomTypeId ? '' : ' (farklı tip)'}</option>`).join('') : '<option value="">Boş oda yok</option>'}</select>`
            : `<input class="input" value="${st.room ? st.room.number : ''}" disabled>`}
        </div>
        <div class="sf-row">
          <label>Gece Sayısı</label><input class="input" value="${n}" disabled>
          <label>Gecelik Fiyat</label><input class="input" type="number" id="fRate" min="0" value="${st.ratePerNight ? Math.round(st.ratePerNight) : ''}" placeholder="${st.mode === 'new' ? 'Manuel giriniz' : ''}" ${st.mode !== 'new' ? 'disabled' : ''}>
        </div>
        <div class="sf-row">
          <label>Para Birimi</label>
          <select class="select" id="fCur" ${st.mode !== 'new' ? 'disabled' : ''}>${['TRY', 'EUR', 'USD'].map((c) => `<option ${st.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
          <label></label><span></span>
        </div>
        <div class="sf-row full">
          <label>Notlar</label><input class="input" id="fNotes" value="${escapeHtml(st.notes)}" ${st.mode === 'edit' ? 'disabled' : ''} placeholder="İsteğe bağlı">
        </div>
      </div>
      ${st.mode === 'checkin' ? '<p class="hint" style="margin-top:-8px;margin-bottom:14px">Bekleyen rezervasyonun girişi. Oda seçin ve <b>+ Ekle</b> ile konaklayan misafirleri girin.</p>' : ''}

      <div class="stay-section-title">
        <span>Misafir Listesi (${st.guests.length})</span>
        <span class="flex gap-sm">
          <button class="btn btn-sm btn-gold" id="gAdd">+ Ekle</button>
          <button class="btn btn-sm btn-ghost" id="gEdit">Değiştir</button>
          <button class="btn btn-sm btn-danger" id="gDel">Sil</button>
        </span>
      </div>
      <div class="table-wrap">
        <table class="tbl stay-guest-tbl">
          <thead><tr><th>Adı</th><th>Soyadı</th><th>Kimlik/Pasaport</th><th>Cinsiyet</th><th>Doğum T.</th><th>Doğum Yeri</th><th>Uyruk</th><th>Tür</th></tr></thead>
          <tbody>${st.guests.length ? st.guests.map((g, i) => `
            <tr data-gi="${i}" class="${i === (st._sel || 0) ? 'sel' : ''}">
              <td class="t-strong">${escapeHtml(g.firstName || g.name || '')}</td>
              <td>${escapeHtml(g.lastName || '')}</td>
              <td class="mono">${escapeHtml(g.idNumber || '—')}</td>
              <td>${GENDER[g.gender] || '—'}</td>
              <td>${g.birthDate ? fmtDateShort(g.birthDate) : '—'}</td>
              <td>${escapeHtml(g.birthPlace || '—')}</td>
              <td>${escapeHtml(g.nationality || '—')}</td>
              <td>${g.guestType === 'child' ? 'Çocuk' : 'Yetişkin'}${g.vip ? ' · <span class="badge b-gold">VIP</span>' : ''}</td>
            </tr>`).join('') : '<tr><td colspan="8" class="muted" style="text-align:center;padding:16px">Henüz misafir eklenmedi. <b>+ Ekle</b> ile başlayın.</td></tr>'}</tbody>
        </table>
      </div>
      ${st.mode === 'new' ? '<p class="hint" style="margin-top:10px">Kaydetmeden çıkarsanız işlemler iptal olur. Girişi tamamlamak için <b>Giriş Yap</b>.</p>' : ''}`;
  }

  function extraPane() {
    if (st.mode === 'new' || !st.folio) return '<div class="empty"><div class="em-ico">🧾</div><p>Harcama eklemek için önce girişi tamamlayın (Giriş Yap).</p></div>';
    const extras = st.folio.items.filter((i) => i.type === 'extra');
    return `
      <div class="stay-section-title"><span>Ekstra Harcamalar / Adisyonlar</span>
        <span class="flex gap-sm"><button class="btn btn-sm btn-ghost" id="bfAdd">☕ Kahvaltı Ekle</button>
        <button class="btn btn-sm btn-gold" id="exAdd">+ Harcama Ekle</button></span></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Tarih</th><th>Açıklama</th><th>Kategori</th><th class="t-right">KDV</th><th class="t-right">Tutar</th><th></th></tr></thead>
        <tbody>${extras.length ? extras.map((i) => `<tr ${i.gross < 0 ? 'style="color:var(--danger)"' : ''}>
          <td class="muted">${fmtDateShort(i.date)}</td><td>${escapeHtml(i.description)}</td><td class="muted">${escapeHtml(i.category || '')}</td>
          <td class="t-right muted">%${i.kdvRate}</td><td class="t-right t-strong">${money(i.gross)}</td>
          <td class="t-right">${i.gross > 0 ? `<button class="btn btn-sm btn-danger" data-exdel="${i.id}">İptal</button>` : ''}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:16px">Ekstra harcama yok.</td></tr>'}</tbody>
      </table></div>`;
  }

  function payPane() {
    if (st.mode === 'new' || !st.folio) return '<div class="empty"><div class="em-ico">💳</div><p>Ödeme almak için önce girişi tamamlayın (Giriş Yap).</p></div>';
    const f = st.folio;
    const roomItems = f.items.filter((i) => i.type === 'room' || i.type === 'accommodation_tax');
    const eurRate = eur ? eur.forexSelling : null;
    const usdRate = usd ? usd.forexSelling : null;
    return `
      <div class="stay-pay">
        <div class="stay-pay-main">
          <div class="stay-section-title"><span>Konaklama Fiyatları</span></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Tarih</th><th>Oda</th><th>Ürün / Hizmet</th><th class="t-right">Tutar</th></tr></thead>
            <tbody>${roomItems.map((i) => `<tr><td class="muted">${fmtDateShort(i.date)}</td><td>${st.room ? st.room.number : ''}</td><td>${escapeHtml(i.description)}</td><td class="t-right t-strong">${money(i.gross)}</td></tr>`).join('')}</tbody>
          </table></div>

          <div class="stay-section-title" style="margin-top:14px"><span>Ödemeler</span>
            <button class="btn btn-sm btn-gold" id="payAdd">+ Tahsilat Ekle</button></div>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Tarih</th><th>Ödeme Tipi</th><th class="t-right">Tutar</th><th>Açıklama</th><th></th></tr></thead>
            <tbody>${f.payments.length ? f.payments.map((p) => `<tr><td class="muted">${fmtDateShort(p.date)}</td><td>${PAY_METHODS[p.method] || p.method}</td><td class="t-right t-strong">${money(p.amount)}</td><td class="muted">${escapeHtml(p.reference || '')}</td><td class="t-right"><button class="btn btn-sm btn-danger" data-paydel="${p.id}">Sil</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted" style="text-align:center;padding:14px">Tahsilat yok.</td></tr>'}</tbody>
          </table></div>
        </div>

        <div class="hesap-ozeti">
          <div class="ho-title">Hesap Özeti</div>
          <div class="ho-row"><span>Kalınan Gece</span><b>${st.reservation ? st.reservation.nights : nights(st.checkIn, st.checkOut)}</b></div>
          <div class="ho-row"><span>Toplam Oda Fiyatı</span><b>${money(f.items.filter((i) => i.type === 'room').reduce((s, i) => s + i.gross, 0))}</b></div>
          <div class="ho-row"><span>Konaklama Vergisi</span><b>${money(f.accommodationTax)}</b></div>
          <div class="ho-row"><span>Ekstra Harcamalar</span><b>${money(f.items.filter((i) => i.type === 'extra').reduce((s, i) => s + i.gross, 0))}</b></div>
          <div class="ho-row total"><span>Toplam</span><b>${money(f.chargeTotal)}</b></div>
          <div class="ho-sub">Konaklama Kurları</div>
          <div class="ho-row"><span>EUR</span><b>${eurRate ? money(eurRate) : '—'}${eurRate ? ` · ${curFmt(f.chargeTotal / eurRate, 'EUR')}` : ''}</b></div>
          <div class="ho-row"><span>USD</span><b>${usdRate ? money(usdRate) : '—'}${usdRate ? ` · ${curFmt(f.chargeTotal / usdRate, 'USD')}` : ''}</b></div>
          <div class="ho-row"><span>Toplam Ödemeler</span><b style="color:var(--ok)">${money(f.paidTotal)}</b></div>
          <div class="ho-row balance"><span>Bakiye</span><b style="color:${f.balance > 1 ? 'var(--danger)' : 'var(--ok)'}">${money(f.balance)}</b></div>
          <label class="ho-checkout"><input type="checkbox" id="fCheckout" ${st.checkout ? 'checked' : ''}> <span>Çıkış yap (Check-out)</span></label>
        </div>
      </div>`;
  }

  function renderFooter() {
    const saveLabel = (st.mode === 'new' || st.mode === 'checkin') ? 'Giriş Yap' : (st.checkout ? 'Çıkış & Kaydet' : 'Kaydet');
    foot.innerHTML = `
      <button class="btn btn-ghost btn-sm" id="btnLogs" ${st.mode !== 'edit' ? 'disabled' : ''}>⧉ Loglar</button>
      <button class="btn btn-ghost btn-sm" id="btnInvoice" ${st.mode !== 'edit' ? 'disabled' : ''}>🧾 Fatura</button>
      <button class="btn btn-ghost btn-sm" id="btnPrint" ${st.mode !== 'edit' ? 'disabled' : ''}>🖨 Folyo</button>
      <span style="flex:1"></span>
      <button class="btn btn-ghost" data-close>Vazgeç</button>
      <button class="btn btn-gold" id="btnSave">${saveLabel}</button>`;
    foot.querySelector('#btnSave').addEventListener('click', onSave);
    const lg = foot.querySelector('#btnLogs'); if (lg && st.mode === 'edit') lg.addEventListener('click', showLogs);
    const iv = foot.querySelector('#btnInvoice'); if (iv && st.mode === 'edit') iv.addEventListener('click', doInvoice);
    const pr = foot.querySelector('#btnPrint'); if (pr && st.mode === 'edit') pr.addEventListener('click', printFolio);
  }

  // ---------- Bind ----------
  function bind() {
    m.body.querySelector('#stayTabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      st.tab = b.dataset.tab; render();
    });

    if (st.tab === 'guest') {
      const upd = async (partial) => { Object.assign(st, partial); };
      const ci = m.body.querySelector('#fCheckIn'); const co = m.body.querySelector('#fCheckOut');
      const rt = m.body.querySelector('#fRate');
      const cu = m.body.querySelector('#fCur'); const nt = m.body.querySelector('#fNotes');
      if (st.mode === 'new') {
        // Fiyat manuel; tarih değişince yalnız gece sayısı güncellenir (otomatik fiyat yok).
        ci && ci.addEventListener('change', () => { st.checkIn = ci.value; if (st.checkOut <= st.checkIn) st.checkOut = addDays(st.checkIn, 1); render(); });
        co && co.addEventListener('change', () => { st.checkOut = co.value; render(); });
        rt && rt.addEventListener('input', () => { st.ratePerNight = Number(rt.value) || 0; });
        cu && cu.addEventListener('change', () => { st.currency = cu.value; });
      }
      nt && nt.addEventListener('input', () => { st.notes = nt.value; });
      const rs = m.body.querySelector('#fRoomSel');
      if (rs) rs.addEventListener('change', () => { st.room = (st.availableRooms || []).find((r) => r.id === rs.value) || null; });

      m.body.querySelectorAll('[data-gi]').forEach((row) => row.addEventListener('click', () => { st._sel = Number(row.dataset.gi); m.body.querySelectorAll('[data-gi]').forEach((x) => x.classList.toggle('sel', x === row)); }));
      m.body.querySelector('#gAdd').addEventListener('click', () => openGuestForm(null, addGuest));
      m.body.querySelector('#gEdit').addEventListener('click', () => { const g = st.guests[st._sel || 0]; if (g) openGuestForm(g, (gg) => editGuest(st._sel || 0, gg)); else toast('Önce misafir seçin.', 'warn'); });
      m.body.querySelector('#gDel').addEventListener('click', () => removeGuest(st._sel || 0));
    }

    if (st.tab === 'extra' && st.folio) {
      const ea = m.body.querySelector('#exAdd'); if (ea) ea.addEventListener('click', addExtra);
      const ba = m.body.querySelector('#bfAdd'); if (ba) ba.addEventListener('click', addBreakfast);
      m.body.querySelectorAll('[data-exdel]').forEach((b) => b.addEventListener('click', () => reverseItem(b.dataset.exdel)));
    }
    if (st.tab === 'pay' && st.folio) {
      const pa = m.body.querySelector('#payAdd'); if (pa) pa.addEventListener('click', addPayment);
      m.body.querySelectorAll('[data-paydel]').forEach((b) => b.addEventListener('click', () => reversePayment(b.dataset.paydel)));
      const chk = m.body.querySelector('#fCheckout'); if (chk) chk.addEventListener('change', () => { st.checkout = chk.checked; renderFooter(); });
    }
  }

  // ---------- Misafir işlemleri ----------
  // 'new' ve 'checkin' modunda misafirler YERELDİR (Giriş Yap ile toplu gönderilir);
  // yalnızca 'edit' modunda API üzerinden anlık eklenir/çıkarılır.
  async function addGuest(g) {
    if (st.mode !== 'edit') { st.guests.push(g); st._sel = st.guests.length - 1; render(); }
    else { try { const up = await api.post(`/api/reservations/${st.reservationId}/guests`, g); st.guests = up.guests.map((x) => ({ ...x })); render(); toast('Misafir eklendi.', 'ok'); } catch (e) { toast(e.message, 'err'); } }
  }
  async function editGuest(i, g) {
    if (st.mode !== 'edit') { st.guests[i] = { ...st.guests[i], ...g }; render(); }
    else { const cur = st.guests[i]; try { await api.put(`/api/guests/${cur.id}`, g); st.reservation = await api.reservation(st.reservationId); st.guests = st.reservation.guests.map((x) => ({ ...x })); render(); toast('Misafir güncellendi.', 'ok'); } catch (e) { toast(e.message, 'err'); } }
  }
  async function removeGuest(i) {
    const g = st.guests[i]; if (!g) return;
    if (st.mode !== 'edit') { st.guests.splice(i, 1); st._sel = 0; render(); }
    else { if (st.guests.length <= 1) { toast('En az bir misafir kalmalı.', 'warn'); return; } try { const up = await api.del(`/api/reservations/${st.reservationId}/guests/${g.id}`); st.guests = up.guests.map((x) => ({ ...x })); st._sel = 0; render(); toast('Misafir çıkarıldı.', 'ok'); } catch (e) { toast(e.message, 'err'); } }
  }

  // ---------- Folio işlemleri ----------
  async function reload() { st.folio = await api.get(`/api/reservations/${st.reservationId}/folio`); render(); }
  function addExtra() {
    guestlessForm({
      title: 'Ekstra Harcama',
      fields: `<div class="field"><label>Açıklama</label><input class="input" id="xD" placeholder="Restoran, Minibar, Spa…"></div>
        <div class="form-row-3"><div class="field"><label>Kategori</label><select class="select" id="xC"><option>Restoran</option><option>Minibar</option><option>Spa</option><option>Çamaşırhane</option><option>Telefon</option><option>Diğer</option></select></div>
        <div class="field"><label>Adet</label><input class="input" type="number" id="xQ" value="1" min="1"></div>
        <div class="field"><label>Birim Fiyat (₺)</label><input class="input" type="number" id="xP" min="0"></div></div>
        <div class="field"><label>KDV (%)</label><select class="select" id="xK"><option value="10">%10</option><option value="20">%20</option><option value="1">%1</option><option value="0">%0</option></select></div>`,
      onOk: async (root) => {
        const desc = root.querySelector('#xD').value.trim(); const price = Number(root.querySelector('#xP').value);
        if (!desc || !price) { toast('Açıklama ve tutar girin.', 'err'); return false; }
        await api.post(`/api/folios/${st.folio.folio.id}/charge`, { description: desc, category: root.querySelector('#xC').value, qty: Number(root.querySelector('#xQ').value) || 1, unitPrice: price, kdvRate: Number(root.querySelector('#xK').value) });
        await reload(); toast('Harcama eklendi.', 'ok'); return true;
      },
    });
  }
  async function addBreakfast() {
    let s = {};
    try { s = await api.settings(); } catch { /* varsayılan */ }
    const price = Number(s.breakfastPrice) || 350;
    const kdv = Number(s.kdvFnb) || 10;
    const persons = st.reservation ? Math.max(1, (st.reservation.adults || 0) + (st.reservation.children || 0)) : Math.max(1, st.guests.length);
    guestlessForm({
      title: 'Kahvaltı Ekle',
      fields: `<div class="form-row-3">
          <div class="field"><label>Adet (kişi)</label><input class="input" type="number" id="bQ" value="${persons}" min="1"></div>
          <div class="field"><label>Birim Fiyat (₺)</label><input class="input" type="number" id="bP" value="${price}" min="0"></div>
          <div class="field"><label>KDV (%)</label><input class="input" type="number" id="bK" value="${kdv}" min="0"></div></div>
        <p class="hint">Kahvaltı folioya adisyon olarak eklenir. Adet/tutar düzenlenebilir.</p>`,
      onOk: async (root) => {
        const qty = Number(root.querySelector('#bQ').value) || 1;
        const unit = Number(root.querySelector('#bP').value);
        if (!unit) { toast('Fiyat girin.', 'err'); return false; }
        await api.post(`/api/folios/${st.folio.folio.id}/charge`, { description: 'Kahvaltı', category: 'Kahvaltı', qty, unitPrice: unit, kdvRate: Number(root.querySelector('#bK').value) });
        await reload(); toast('Kahvaltı eklendi.', 'ok'); return true;
      },
    });
  }
  function addPayment() {
    guestlessForm({
      title: 'Tahsilat',
      fields: `<div class="field"><label>Ödeme Tipi</label><select class="select" id="pM">${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label>Tutar (₺)</label><input class="input" type="number" step="0.01" id="pA" min="0" value="${st.folio.balance > 0 ? st.folio.balance : ''}"></div>
        <div class="field"><label>Açıklama / Referans</label><input class="input" id="pR"></div>`,
      onOk: async (root) => {
        const amt = Number(root.querySelector('#pA').value); if (!amt) { toast('Tutar girin.', 'err'); return false; }
        await api.post(`/api/folios/${st.folio.folio.id}/payment`, { method: root.querySelector('#pM').value, amount: amt, reference: root.querySelector('#pR').value });
        await reload(); toast('Tahsilat kaydedildi.', 'ok'); return true;
      },
    });
  }
  async function reverseItem(itemId) {
    if (!(await confirmDialog({ title: 'İptal', message: 'Bu harcama ters kayıtla iptal edilecek.', confirmText: 'İptal Et', danger: true }))) return;
    try { await api.post(`/api/folios/${st.folio.folio.id}/reverse/${itemId}`); await reload(); toast('İptal edildi.', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }
  async function reversePayment(payId) {
    if (!(await confirmDialog({ title: 'Tahsilat Sil', message: 'Bu tahsilat ters kayıtla iptal edilecek.', confirmText: 'Sil', danger: true }))) return;
    try { await api.post(`/api/folios/${st.folio.folio.id}/payment/${payId}/reverse`); await reload(); toast('Tahsilat iptal edildi.', 'ok'); } catch (e) { toast(e.message, 'err'); }
  }

  // ---------- Alt bar aksiyonları ----------
  async function showLogs() {
    let logs = [];
    try { logs = await api.get(`/api/rooms/${st.room.id}/logs`); } catch { /* */ }
    openModal({
      title: `Oda ${st.room.number} · İşlem Geçmişi`,
      body: logs.length ? `<div class="room-log">${logs.map((l) => `<div class="rlog-item"><span class="rlog-ico rlog-neutral">•</span><div class="rlog-body"><div class="rlog-top"><b>${escapeHtml(l.detail || l.action)}</b><span class="rlog-time">${relTime(l.timestamp)}</span></div><div class="rlog-user">${escapeHtml(l.userName || 'sistem')}</div></div></div>`).join('')}</div>` : '<p class="muted">Kayıt yok.</p>',
      footer: '<button class="btn btn-ghost" data-close>Kapat</button>',
    });
  }
  function doInvoice() {
    guestlessForm({
      title: 'Fatura Oluştur',
      fields: `<div class="field"><label>Müşteri Adı / Unvanı</label><input class="input" id="iN" value="${escapeHtml((st.guests[0] && st.guests[0].name) || '')}"></div>
        <div class="form-row"><div class="field"><label>VKN / TCKN</label><input class="input" id="iT" value="${escapeHtml((st.guests[0] && st.guests[0].idNumber) || '')}"></div>
        <div class="field"><label>Vergi Dairesi</label><input class="input" id="iO"></div></div>`,
      onOk: async (root) => {
        const name = root.querySelector('#iN').value.trim(); if (!name) { toast('Müşteri adı girin.', 'err'); return false; }
        const out = await api.post(`/api/folios/${st.folio.folio.id}/invoice`, { customerName: name, taxNumber: root.querySelector('#iT').value.trim(), taxOffice: root.querySelector('#iO').value.trim() });
        toast(`${out.invoice.type === 'efatura' ? 'e-Fatura' : 'e-Arşiv'} kesildi: ${out.invoice.number}`, 'ok'); return true;
      },
    });
  }
  function printFolio() {
    const f = st.folio; const g = st.guests[0] || {};
    const s = store; const set = {};
    const rows = f.items.map((i) => `<tr><td>${fmtDateShort(i.date)}</td><td>${escapeHtml(i.description)}</td><td style="text-align:right">${money(i.gross)}</td></tr>`).join('');
    const html = `<html><head><title>Folyo ${st.reservation.code}</title><style>body{font-family:Arial;padding:24px;color:#111}h2{margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border-bottom:1px solid #ddd;padding:6px;font-size:13px;text-align:left}.tot{font-weight:bold}</style></head><body>
      <h2>The Royal Luxury Hotel — Folyo</h2><div>${st.reservation.code} · Oda ${st.room.number} · ${escapeHtml(g.name || '')}</div>
      <div>${fmtDate(st.checkIn)} → ${fmtDate(st.checkOut)} · ${st.reservation.nights} gece</div>
      <table><thead><tr><th>Tarih</th><th>Açıklama</th><th style="text-align:right">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
      <table><tr class="tot"><td>Toplam</td><td style="text-align:right">${money(f.chargeTotal)}</td></tr><tr><td>Ödenen</td><td style="text-align:right">${money(f.paidTotal)}</td></tr><tr class="tot"><td>Bakiye</td><td style="text-align:right">${money(f.balance)}</td></tr></table>
      </body></html>`;
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); }
  }

  // ---------- Kaydet ----------
  async function onSave() {
    if (st.mode === 'checkin') {
      if (!st.room) { toast('Lütfen boş bir oda seçin.', 'err'); st.tab = 'guest'; render(); return; }
      const withName = st.guests.filter((g) => (g.firstName || g.name || '').trim());
      if (!withName.length) { toast('En az bir misafir ekleyin.', 'err'); st.tab = 'guest'; render(); return; }
      try {
        const out = await api.post(`/api/reservations/${st.reservationId}/checkin`, { roomId: st.room.id, guests: st.guests });
        toast('Giriş tamamlandı.', 'ok');
        ctx.reload(); ctx.refreshBadges();
        st.mode = 'edit'; st.reservationId = out.reservation.id; st.tab = 'pay';
        await loadState(); render();
      } catch (e) { toast(e.message, 'err'); }
      return;
    }
    if (st.mode === 'new') {
      const withName = st.guests.filter((g) => (g.firstName || g.name || '').trim());
      if (!withName.length) { toast('En az bir misafir ekleyin.', 'err'); st.tab = 'guest'; render(); return; }
      try {
        const out = await api.post(`/api/rooms/${st.room.id}/checkin`, {
          checkIn: st.checkIn, checkOut: st.checkOut, currency: st.currency,
          ratePerNight: st.ratePerNight, notes: st.notes, guests: st.guests,
        });
        toast('Giriş tamamlandı.', 'ok');
        ctx.reload();
        // Düzenleme moduna geç (folio/ödeme için)
        st.mode = 'edit'; st.reservationId = out.reservation.id; st.tab = 'pay';
        await loadState(); render();
      } catch (e) { toast(e.message, 'err'); }
      return;
    }
    // edit: çıkış istenmişse checkout — bakiye varsa ENGELLE
    if (st.checkout) {
      try {
        const res = await api.post(`/api/reservations/${st.reservationId}/checkout`, {});
        if (res && res.needsSettlement) {
          toast(`${money(res.balance)} ödenmemiş bakiye var — çıkış yapılamaz. Önce tahsil edin.`, 'err');
          st.checkout = false; st.tab = 'pay';
          st.folio = await api.get(`/api/reservations/${st.reservationId}/folio`);
          render();
          return;
        }
        toast('Çıkış yapıldı.', 'ok'); ctx.reload(); ctx.refreshBadges(); m.close();
      } catch (e) { toast(e.message, 'err'); }
    } else { toast('Kaydedildi.', 'ok'); ctx.reload(); m.close(); }
  }
}

// ---------- Misafir formu ----------
function openGuestForm(existing, onSave) {
  const g = existing || {};
  const body = `
    <div class="form-row"><div class="field"><label>Adı</label><input class="input" id="gF" value="${escapeHtml(g.firstName || '')}"></div>
      <div class="field"><label>Soyadı</label><input class="input" id="gL" value="${escapeHtml(g.lastName || '')}"></div></div>
    <div class="form-row"><div class="field"><label>Kimlik Türü</label><select class="select" id="gIT"><option value="tc" ${g.idType !== 'passport' ? 'selected' : ''}>T.C. Kimlik</option><option value="passport" ${g.idType === 'passport' ? 'selected' : ''}>Pasaport</option></select></div>
      <div class="field"><label>Kimlik / Pasaport No</label><input class="input" id="gN" value="${escapeHtml(g.idNumber || '')}" autocomplete="off"></div></div>
    <div id="gSuggest" class="guest-suggest"></div>
    <div class="form-row"><div class="field"><label>Doğum Tarihi</label><input class="input" type="date" id="gB" value="${escapeHtml(g.birthDate || '')}"></div>
      <div class="field"><label>Doğum Yeri</label><input class="input" id="gBP" value="${escapeHtml(g.birthPlace || '')}"></div></div>
    <div class="form-row"><div class="field"><label>Telefon</label><input class="input" id="gPh" value="${escapeHtml(g.phone || '')}"></div>
      <div class="field"><label>Uyruk</label><input class="input" id="gNat" value="${escapeHtml(g.nationality || 'TR')}" maxlength="3"></div></div>
    <div class="form-row"><div class="field"><label>Cinsiyet</label><select class="select" id="gG"><option value="E" ${g.gender === 'E' ? 'selected' : ''}>Erkek</option><option value="K" ${g.gender === 'K' ? 'selected' : ''}>Kadın</option></select></div>
      <div class="field"><label>Tür</label><select class="select" id="gT"><option value="adult" ${g.guestType !== 'child' ? 'selected' : ''}>Yetişkin</option><option value="child" ${g.guestType === 'child' ? 'selected' : ''}>Çocuk</option></select></div></div>
    <label class="flex gap-sm" style="font-size:.85rem"><input type="checkbox" id="gV" ${g.vip ? 'checked' : ''}> VIP misafir</label>`;
  const foot = document.createElement('div');
  foot.innerHTML = '<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="gSave">Kaydet</button>';
  const m = openModal({ title: existing ? 'Misafir Düzenle' : 'Misafir Ekle', body, footer: foot });

  // TCKN ile kayıtlı misafir arama + otomatik doldurma (Adonis tarzı)
  let pickedId = existing && existing.id ? existing.id : null;
  let lastMatches = [];
  const gN = m.el.querySelector('#gN'), gF = m.el.querySelector('#gF'), gL = m.el.querySelector('#gL'), sug = m.el.querySelector('#gSuggest');
  let deb;
  async function doSearch(q) {
    if (q.trim().length < 3) { sug.innerHTML = ''; return; }
    try {
      lastMatches = await api.guests(q.trim()); // isim/TCKN/telefon arar, TÜMÜ döner
      sug.innerHTML = lastMatches.length
        ? `<div class="gs-head">Kayıtlı misafir (${lastMatches.length}) — tıklayınca doldurulur:</div>` + lastMatches.map((x) => `<button type="button" class="gs-item" data-gid="${x.id}"><b>${escapeHtml(x.name || '')}</b><span>TC ${escapeHtml(x.idNumber || '—')} · ${escapeHtml(x.phone || '')} · ${escapeHtml(x.nationality || '')}</span></button>`).join('')
        : '<div class="gs-head">Kayıt bulunamadı — yeni misafir olarak eklenecek.</div>';
    } catch { sug.innerHTML = ''; }
  }
  const onType = (e) => { pickedId = null; const v = e.target.value; clearTimeout(deb); deb = setTimeout(() => doSearch(v), 220); };
  gN.addEventListener('input', onType);
  gF.addEventListener('input', onType);
  gL.addEventListener('input', onType);
  sug.addEventListener('click', (e) => {
    const b = e.target.closest('[data-gid]'); if (!b) return;
    const x = lastMatches.find((g2) => g2.id === b.dataset.gid); if (!x) return;
    const [fn, ...rest] = (x.name || '').split(' ');
    m.el.querySelector('#gF').value = x.firstName || fn || '';
    m.el.querySelector('#gL').value = x.lastName || rest.join(' ') || '';
    m.el.querySelector('#gN').value = x.idNumber || '';
    m.el.querySelector('#gIT').value = x.idType === 'passport' ? 'passport' : 'tc';
    m.el.querySelector('#gB').value = x.birthDate || '';
    m.el.querySelector('#gBP').value = x.birthPlace || '';
    m.el.querySelector('#gPh').value = x.phone || '';
    m.el.querySelector('#gNat').value = x.nationality || 'TR';
    m.el.querySelector('#gG').value = x.gender === 'K' ? 'K' : 'E';
    m.el.querySelector('#gV').checked = !!x.vip;
    pickedId = x.id;
    sug.innerHTML = '<div class="gs-picked">✓ Kayıtlı misafir dolduruldu</div>';
  });

  foot.querySelector('#gSave').addEventListener('click', () => {
    const fn = m.el.querySelector('#gF').value.trim(); const ln = m.el.querySelector('#gL').value.trim();
    if (!fn) { toast('Ad zorunlu.', 'err'); return; }
    onSave({
      id: pickedId || undefined,
      firstName: fn, lastName: ln, name: `${fn} ${ln}`.trim(),
      idType: m.el.querySelector('#gIT').value, idNumber: m.el.querySelector('#gN').value.trim(),
      birthDate: m.el.querySelector('#gB').value, birthPlace: m.el.querySelector('#gBP').value.trim(),
      phone: m.el.querySelector('#gPh').value.trim(), nationality: m.el.querySelector('#gNat').value.trim().toUpperCase() || 'TR',
      gender: m.el.querySelector('#gG').value, guestType: m.el.querySelector('#gT').value, vip: m.el.querySelector('#gV').checked,
    });
    m.close();
  });
}

// Basit ok/iptal formu
function guestlessForm({ title, fields, onOk }) {
  const foot = document.createElement('div');
  foot.innerHTML = '<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="okBtn">Kaydet</button>';
  const m = openModal({ title, body: fields, footer: foot });
  foot.querySelector('#okBtn').addEventListener('click', async () => { const ok = await onOk(m.el); if (ok) m.close(); });
}
