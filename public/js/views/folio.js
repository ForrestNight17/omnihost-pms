// Folio & Fatura: açık folyolar, tahsilat, ekstra harcama, fatura kesme.
import { api } from '../api.js';
import {
  escapeHtml, money, fmtDate, fmtDateShort, toast, openModal, confirmDialog, spinner, emptyState, initials,
} from '../ui.js';

const PAY_METHODS = { cash: 'Nakit', card: 'Kredi Kartı', transfer: 'Havale/EFT', vpos: 'Sanal POS' };

let tab = 'folios';

export async function render(container, ctx) {
  container.innerHTML = `
    <div class="page-head">
      <div><h2>Folio & Fatura</h2><div class="sub">Konaklama hesapları, tahsilat ve faturalandırma</div></div>
      <div class="segment" id="folioTabs">
        <button data-tab="folios" class="${tab === 'folios' ? 'active' : ''}">Açık Folyolar</button>
        <button data-tab="invoices" class="${tab === 'invoices' ? 'active' : ''}">Faturalar</button>
      </div>
    </div>
    <div class="card"><div id="folioBody">${spinner()}</div></div>`;

  container.querySelector('#folioTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab; ctx.reload();
  });

  const body = container.querySelector('#folioBody');
  if (tab === 'invoices') return renderInvoices(body);
  return renderFolios(ctx, body);
}

async function renderFolios(ctx, el) {
  let list;
  try { list = await api.reservations({ status: 'checked_in' }); }
  catch (e) { el.innerHTML = emptyState('⚠️', e.message); return; }
  if (!list.length) { el.innerHTML = emptyState('🧾', 'Otelde misafir yok.'); return; }
  const folios = await Promise.all(list.map((r) => api.get(`/api/reservations/${r.id}/folio`).catch(() => null)));

  el.innerHTML = `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Misafir</th><th>Oda</th><th>Rezervasyon</th><th class="t-right">Tutar</th><th class="t-right">Ödenen</th><th class="t-right">Bakiye</th><th></th></tr></thead>
    <tbody>${list.map((r, i) => {
      const f = folios[i];
      const bal = f ? f.balance : 0;
      return `<tr data-res="${r.id}" style="cursor:pointer">
        <td class="t-strong">${escapeHtml(r.guestName)}</td>
        <td>${r.roomNumber ? '<b>' + r.roomNumber + '</b>' : '—'}</td>
        <td class="t-code">${r.code}</td>
        <td class="t-right">${f ? money(f.chargeTotal) : '—'}</td>
        <td class="t-right">${f ? money(f.paidTotal) : '—'}</td>
        <td class="t-right"><b style="color:${bal > 1 ? 'var(--danger)' : 'var(--ok)'}">${f ? money(bal) : '—'}</b></td>
        <td class="t-right"><button class="btn btn-sm btn-gold" data-open="${r.id}">Folio</button></td>
      </tr>`;
    }).join('')}</tbody></table></div>`;

  el.addEventListener('click', (e) => {
    const row = e.target.closest('[data-res],[data-open]'); if (!row) return;
    const id = row.dataset.open || row.dataset.res;
    openFolioModal(ctx, id);
  });
}

async function renderInvoices(el) {
  let list;
  try { list = await api.get('/api/invoices'); }
  catch (e) { el.innerHTML = emptyState('⚠️', e.message); return; }
  if (!list.length) { el.innerHTML = emptyState('📄', 'Henüz fatura kesilmemiş.'); return; }
  el.innerHTML = `<div class="table-wrap"><table class="tbl">
    <thead><tr><th>Fatura No</th><th>Tür</th><th>Müşteri</th><th>VKN/TCKN</th><th class="t-right">Matrah</th><th class="t-right">KDV</th><th class="t-right">Genel Toplam</th><th>e-Belge</th><th>Tarih</th></tr></thead>
    <tbody>${list.map((v) => `<tr>
      <td class="t-code">${v.number}</td>
      <td>${v.type === 'efatura' ? '<span class="badge b-info">e-Fatura</span>' : '<span class="badge b-navy">e-Arşiv</span>'}</td>
      <td>${escapeHtml(v.customerName || '—')}</td>
      <td class="mono">${escapeHtml(v.taxNumber || '—')}</td>
      <td class="t-right">${money(v.net)}</td>
      <td class="t-right">${money(v.kdv)}</td>
      <td class="t-right t-strong">${money(v.grandTotal)}</td>
      <td>${v.efaturaStatus === 'sent' ? '<span class="badge b-ok">Gönderildi</span>' : '<span class="badge b-warn">' + escapeHtml(v.efaturaStatus) + '</span>'}</td>
      <td class="muted">${fmtDate((v.issuedAt || '').slice(0, 10))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

// ---------- Folio modalı (dışarıdan da kullanılır) ----------
export async function openFolioModal(ctx, reservationId) {
  let sum, resv;
  try {
    resv = await api.reservation(reservationId);
    sum = await api.get(`/api/reservations/${reservationId}/folio`);
  } catch (e) { toast(e.message, 'err'); return; }

  const m = openModal({ title: `Folio · ${resv.code}`, body: spinner(), footer: '<button class="btn btn-ghost" data-close>Kapat</button>', wide: true });
  renderBody();

  function renderBody() {
    m.body.innerHTML = folioHtml(resv, sum);
    m.body.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', () => onAction(btn.dataset.act, btn.dataset.item)));
  }

  async function refresh() {
    sum = await api.get(`/api/reservations/${reservationId}/folio`);
    renderBody();
    if (ctx && ctx.refreshBadges) { /* opsiyonel */ }
  }

  function onAction(act, itemId) {
    if (act === 'extra') addExtra(sum.folio.id, refresh);
    else if (act === 'payment') addPayment(sum.folio.id, sum.balance, refresh);
    else if (act === 'invoice') createInvoice(sum.folio.id, resv, refresh);
    else if (act === 'reverse') doReverse(sum.folio.id, itemId, refresh);
  }
}

function folioHtml(resv, sum) {
  const items = sum.items.filter((i) => !i.reversed || i.gross < 0);
  return `
    <div class="flex between wrap mb">
      <div class="flex"><div class="mr-av">${initials(resv.guestName)}</div>
        <div><div class="t-strong">${escapeHtml(resv.guestName)}</div>
        <div class="muted" style="font-size:.8rem">${escapeHtml(resv.roomTypeName)}${resv.roomNumber ? ' · Oda ' + resv.roomNumber : ''} · ${fmtDateShort(resv.checkIn)}→${fmtDateShort(resv.checkOut)}</div></div></div>
      <div class="flex gap-sm">
        <button class="btn btn-sm btn-ghost" data-act="extra">+ Ekstra</button>
        <button class="btn btn-sm btn-primary" data-act="payment">+ Tahsilat</button>
        <button class="btn btn-sm btn-gold" data-act="invoice">Fatura Kes</button>
      </div>
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Tarih</th><th>Açıklama</th><th class="t-right">KDV</th><th class="t-right">Tutar</th><th></th></tr></thead>
      <tbody>${items.map((i) => `<tr ${i.gross < 0 ? 'style="color:var(--danger)"' : ''}>
        <td class="muted">${fmtDateShort(i.date)}</td>
        <td>${escapeHtml(i.description)}${i.category ? ` <span class="muted" style="font-size:.74rem">· ${escapeHtml(i.category)}</span>` : ''}</td>
        <td class="t-right muted">${i.kdvRate ? '%' + i.kdvRate : '—'}</td>
        <td class="t-right t-strong">${money(i.gross)}</td>
        <td class="t-right">${(i.type === 'extra' && i.gross > 0) ? `<button class="btn btn-sm btn-danger" data-act="reverse" data-item="${i.id}">İptal</button>` : ''}</td>
      </tr>`).join('')}</tbody>
    </table></div>

    <div class="grid cols-2 mt">
      <div>
        <h4 style="font-size:.9rem;margin-bottom:8px">Tahsilatlar</h4>
        ${sum.payments.length ? `<div class="mini-list">${sum.payments.map((p) => `<div class="mini-row" style="padding:7px 0"><div class="mr-main"><strong>${money(p.amount)}</strong><span>${PAY_METHODS[p.method] || p.method} · ${fmtDateShort(p.date)}</span></div></div>`).join('')}</div>` : '<p class="muted" style="font-size:.84rem">Tahsilat yok.</p>'}
      </div>
      <div>
        <div class="folio-total-row"><span class="muted">Matrah (KDV hariç)</span><b>${money(sum.netTotal)}</b></div>
        ${sum.kdvBreakdown.map((k) => `<div class="folio-total-row"><span class="muted">KDV %${k.rate}</span><span>${money(k.kdv)}</span></div>`).join('')}
        <div class="folio-total-row"><span class="muted">Konaklama Vergisi</span><span>${money(sum.accommodationTax)}</span></div>
        <div class="folio-total-row grand"><span>Toplam</span><span>${money(sum.chargeTotal)}</span></div>
        <div class="folio-total-row"><span class="muted">Tahsil edilen</span><span style="color:var(--ok)">${money(sum.paidTotal)}</span></div>
        <div class="folio-total-row"><span>Kalan Bakiye</span><span class="folio-bal ${sum.balance > 1 ? 'pos' : 'zero'}">${money(sum.balance)}</span></div>
      </div>
    </div>`;
}

function addExtra(folioId, onDone) {
  const body = `
    <div class="field"><label>Açıklama</label><input class="input" id="exDesc" placeholder="Minibar, Restoran, Spa…"></div>
    <div class="form-row-3">
      <div class="field"><label>Kategori</label><select class="select" id="exCat"><option>Restoran</option><option>Minibar</option><option>Spa</option><option>Çamaşırhane</option><option>Telefon</option><option>Diğer</option></select></div>
      <div class="field"><label>Adet</label><input class="input" type="number" id="exQty" value="1" min="1"></div>
      <div class="field"><label>Birim Fiyat (₺)</label><input class="input" type="number" id="exPrice" min="0" placeholder="0"></div>
    </div>
    <div class="field"><label>KDV Oranı (%)</label><select class="select" id="exKdv"><option value="10">%10</option><option value="20">%20</option><option value="1">%1</option><option value="0">%0</option></select></div>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="saveEx">Ekle</button>`;
  const m = openModal({ title: 'Ekstra Harcama', body, footer: foot });
  foot.querySelector('#saveEx').addEventListener('click', async () => {
    const desc = m.el.querySelector('#exDesc').value.trim();
    const price = Number(m.el.querySelector('#exPrice').value);
    if (!desc || !price) { toast('Açıklama ve tutar girin.', 'err'); return; }
    try {
      await api.post(`/api/folios/${folioId}/charge`, { description: desc, category: m.el.querySelector('#exCat').value, qty: Number(m.el.querySelector('#exQty').value) || 1, unitPrice: price, kdvRate: Number(m.el.querySelector('#exKdv').value) });
      toast('Ekstra eklendi.', 'ok'); m.close(); onDone();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function addPayment(folioId, balance, onDone) {
  const body = `
    <div class="field"><label>Ödeme Yöntemi</label>
      <div class="pay-method">
        ${Object.entries(PAY_METHODS).map(([k, v], i) => `<label><input type="radio" name="pm" value="${k}" ${i === 0 ? 'checked' : ''}><span>${v}</span></label>`).join('')}
      </div>
    </div>
    <div class="field"><label>Tutar (₺)</label><input class="input" type="number" id="payAmt" min="0" value="${balance > 0 ? Math.round(balance) : ''}" placeholder="0"></div>
    <div class="field"><label>Referans / Not</label><input class="input" id="payRef" placeholder="İşlem no, açıklama…"></div>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-primary" id="savePay">Tahsilat Al</button>`;
  const m = openModal({ title: 'Tahsilat', body, footer: foot });
  foot.querySelector('#savePay').addEventListener('click', async () => {
    const amt = Number(m.el.querySelector('#payAmt').value);
    if (!amt) { toast('Tutar girin.', 'err'); return; }
    const method = m.el.querySelector('input[name="pm"]:checked').value;
    try {
      await api.post(`/api/folios/${folioId}/payment`, { method, amount: amt, reference: m.el.querySelector('#payRef').value });
      toast('Tahsilat kaydedildi.', 'ok'); m.close(); onDone();
    } catch (e) { toast(e.message, 'err'); }
  });
}

function createInvoice(folioId, resv, onDone) {
  const body = `
    <p class="muted" style="margin-top:0">Vergi/TC no 10 hane ve üzeriyse <b>e-Fatura</b>, aksi halde <b>e-Arşiv</b> kesilir.</p>
    <div class="field"><label>Müşteri Adı / Unvanı</label><input class="input" id="invName" value="${escapeHtml(resv.guestName || '')}"></div>
    <div class="form-row">
      <div class="field"><label>VKN / TCKN</label><input class="input" id="invTax" placeholder="Kurumsal için VKN"></div>
      <div class="field"><label>Vergi Dairesi</label><input class="input" id="invOffice" placeholder="—"></div>
    </div>
    <div class="field"><label>Adres</label><input class="input" id="invAddr" placeholder="—"></div>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="issueInv">Fatura Kes</button>`;
  const m = openModal({ title: 'Fatura Oluştur', body, footer: foot });
  foot.querySelector('#issueInv').addEventListener('click', async () => {
    const name = m.el.querySelector('#invName').value.trim();
    if (!name) { toast('Müşteri adı girin.', 'err'); return; }
    try {
      const out = await api.post(`/api/folios/${folioId}/invoice`, { customerName: name, taxNumber: m.el.querySelector('#invTax').value.trim(), taxOffice: m.el.querySelector('#invOffice').value.trim(), address: m.el.querySelector('#invAddr').value.trim() });
      toast(`${out.invoice.type === 'efatura' ? 'e-Fatura' : 'e-Arşiv'} kesildi: ${out.invoice.number}`, 'ok');
      m.close(); onDone();
    } catch (e) { toast(e.message, 'err'); }
  });
}

async function doReverse(folioId, itemId, onDone) {
  const ok = await confirmDialog({ title: 'Kalemi İptal Et', message: 'Bu kalem ters kayıtla iptal edilecek. Onaylıyor musunuz?', confirmText: 'İptal Et', danger: true });
  if (!ok) return;
  try { await api.post(`/api/folios/${folioId}/reverse/${itemId}`); toast('Kalem iptal edildi.', 'ok'); onDone(); }
  catch (e) { toast(e.message, 'err'); }
}
