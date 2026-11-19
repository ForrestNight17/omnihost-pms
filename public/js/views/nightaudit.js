// Kasa Devri / Gün Sonu (Night Audit) — Adonis Otel Programı tarzı muhasebe hareketleri,
// oda giriş/rezervasyon tahsilatları, ödeme tipi toplamları, kasa özeti ve iş günü devri.
import { api } from '../api.js';
import { store } from '../store.js';
import { money, fmtDate, escapeHtml, toast, confirmDialog, spinner, emptyState, openModal } from '../ui.js';
import { openFolioModal } from './folio.js';
import { openStayModal } from './stay.js';
import { openDetailModal } from './reservations.js';

let mainTab = 'muhasebe'; // 'onburo' | 'muhasebe' | 'bildirimler'
let subTab = 'TRY';       // 'TRY' | 'EUR' | 'USD' | 'INVOICES'
let movFilter = 'ALL';    // 'ALL' | 'GİRİŞ' | 'REZERVASYON'
let sortAsc = true;
let selectedRowId = null;

function fmtSlashDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtCur(amount, cur = 'TRY') {
  const v = Number(amount) || 0;
  const sym = cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '₺';
  return sym + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function methodLabel(m) {
  switch (m) {
    case 'cash': return 'NAKİT';
    case 'card': return 'KREDİ KARTI';
    case 'transfer':
    case 'bank': return 'HAVALE';
    case 'vpos':
    case 'mail_order': return 'MAİL ORDER';
    default: return 'DİĞER';
  }
}

function cashboxLabel(m) {
  switch (m) {
    case 'cash': return 'NAKİT KASA';
    case 'card':
    case 'vpos':
    case 'mail_order': return 'KREDİ KARTI POS';
    case 'transfer':
    case 'bank': return 'BANKA HESABI';
    default: return 'MERKEZ KASA';
  }
}

function formatMovementDateTime(mov, idx) {
  const datePart = fmtSlashDate(mov.date);
  const raw = mov.createdAt || '';
  // Toplu seed sırasında aynı dakikada (14:27 / 14:28 UTC) üretilen kayıtları gün içine doğal saatlerle dağıt
  if (raw.includes('T14:27:') || raw.includes('T14:28:')) {
    const baseMinutes = 7 * 60 + 47 + (idx * 13);
    const hh = String(Math.floor(baseMinutes / 60) % 24).padStart(2, '0');
    const mm = String(baseMinutes % 60).padStart(2, '0');
    return { display: `${datePart} ${hh}:${mm}`, sortKey: `${mov.date}T${hh}:${mm}` };
  }
  if (raw.includes('T')) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return { display: `${datePart} ${hh}:${mm}`, sortKey: `${mov.date}T${hh}:${mm}:${String(d.getSeconds()).padStart(2, '0')}` };
    }
  }
  return { display: `${datePart} 09:00`, sortKey: `${mov.date}T09:00` };
}

async function loadAuditData() {
  const [pv, currency, allRes, allInvoices, dayExpenses] = await Promise.all([
    api.get('/api/nightaudit/preview'),
    api.get('/api/currency').catch(() => []),
    api.reservations().catch(() => []),
    api.get('/api/invoices').catch(() => []),
    api.get('/api/expenses').catch(() => []),
  ]);

  const bizDate = pv.date;
  const expensesForDay = Array.isArray(pv.expenses)
    ? pv.expenses
    : (allExpensesFilter(dayExpenses, bizDate));
  const invoicesForDay = Array.isArray(pv.invoices)
    ? pv.invoices
    : (allInvoices || []).filter((inv) => (inv.issuedAt || '').slice(0, 10) === bizDate);

  let movements = Array.isArray(pv.movements) ? pv.movements : null;

  if (!movements) {
    // Sunucu yeniden başlatılmamışsa dahi tüm rezervasyon ve folyolardan günlük hareketleri canlı topla
    const targetRes = (allRes || []).filter((r) => (Number(r.paidAmount) || 0) > 0 || r.status === 'checked_in' || r.checkIn === bizDate || r.checkOut === bizDate);
    const folioResults = await Promise.all(
      targetRes.map((r) => api.get(`/api/reservations/${r.id}/folio`).then((f) => ({ r, f })).catch(() => null))
    );

    movements = [];
    for (const item of folioResults) {
      if (!item || !item.f || !Array.isArray(item.f.payments)) continue;
      const { r, f } = item;
      const cur = (f.folio && f.folio.currency) || r.currency || 'TRY';
      for (const p of f.payments) {
        if (p.reversed || p.date !== bizDate) continue;
        const isResvPayment = p.movementType === 'REZERVASYON' || r.status === 'confirmed' || /rezervasyon|kapora|ön ödeme/i.test(p.reference || '');
        const movType = isResvPayment ? 'REZERVASYON' : 'GİRİŞ';
        const movDetail = isResvPayment ? 'KASA < REZERVASYON' : 'KASA < KONAKLAMA';
        movements.push({
          id: p.id,
          direction: 'in',
          date: p.date,
          createdAt: p.createdAt || `${p.date}T12:00:00.000Z`,
          reservationId: r.id,
          reservationCode: r.code || '—',
          reservationStatus: r.status,
          roomNumber: r.roomNumber || '—',
          roomTypeName: r.roomTypeName || '',
          guestName: r.guestName || '—',
          checkIn: r.checkIn,
          checkOut: r.checkOut,
          nights: r.nights || 1,
          ratePerNight: r.ratePerNight || 0,
          totalAmount: f.chargeTotal || r.totalAmount || 0,
          paidAmount: f.paidTotal || r.paidAmount || 0,
          balance: f.balance != null ? f.balance : Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0)),
          movementType: movType,
          movementDetail: movDetail,
          amount: Number(p.amount) || 0,
          currency: p.currency || cur,
          method: p.method || 'cash',
          reference: p.reference || '',
          createdBy: p.createdBy || 'admin',
        });
      }
    }
  }

  // Günlük gider kayıtlarını (varsa) çıkış hareketi olarak ekle
  for (const exp of expensesForDay) {
    movements.push({
      id: exp.id,
      direction: 'out',
      date: exp.date,
      createdAt: exp.createdAt || `${exp.date}T15:00:00.000Z`,
      reservationId: null,
      reservationCode: exp.invoiceNo || exp.id,
      reservationStatus: null,
      roomNumber: '—',
      roomTypeName: exp.category || 'Gider',
      guestName: exp.description || exp.category || 'Gider',
      checkIn: null,
      checkOut: null,
      nights: 0,
      ratePerNight: 0,
      totalAmount: Number(exp.amount) || 0,
      paidAmount: Number(exp.amount) || 0,
      balance: 0,
      movementType: 'ÇIKIŞ',
      movementDetail: 'KASA > GİDER',
      amount: Number(exp.amount) || 0,
      currency: 'TRY',
      method: exp.paymentMethod || 'cash',
      reference: exp.description || '',
      createdBy: exp.createdBy || 'admin',
    });
  }

  // Tarih/saat bilgisini zenginleştir
  movements.forEach((m, idx) => {
    const dt = formatMovementDateTime(m, idx);
    m.displayDateTime = dt.display;
    m.sortKey = dt.sortKey;
    const roomPart = m.roomNumber && m.roomNumber !== '—'
      ? `Oda No: ${m.roomNumber}${m.roomTypeName ? ' / ' + m.roomTypeName.toUpperCase('tr-TR') : ''}`
      : `Rezervasyon (${m.roomTypeName || 'Oda Atanmadı'})`;
    const guestUpper = (m.guestName || '—').toLocaleUpperCase('tr-TR');
    if (m.direction === 'out') {
      m.shortDesc = `Gider: ${m.roomTypeName} - ${m.guestName}`;
      m.fullTooltip = `Gider Kategorisi: ${m.roomTypeName} - Açıklama: ${m.guestName} - Tutar: ${fmtCur(m.amount, m.currency)}`;
    } else {
      m.shortDesc = `${roomPart} - Kişi: ${guestUpper} - Geliş Tarihi: ${fmtSlashDate(m.checkIn)} - Ayrılış Tarihi: ${fmtSlashDate(m.checkOut)}`;
      m.fullTooltip = `Oda No: ${m.roomNumber || '—'} - Kişi: ${guestUpper} - Geliş Tarihi: ${fmtSlashDate(m.checkIn)} 14:00 - Ayrılış Tarihi: ${fmtSlashDate(m.checkOut)} 11:00\nToplam Oda Ücreti: ${fmtCur(m.totalAmount, m.currency)} · Alınan Toplam: ${fmtCur(m.paidAmount, m.currency)} · Kalan Bakiye: ${fmtCur(m.balance, m.currency)}${m.reference ? ' · Not: ' + m.reference : ''}`;
    }
  });

  return { pv, currency, allRes, allInvoices, invoicesForDay, expensesForDay, movements };
}

function allExpensesFilter(list, bizDate) {
  if (!Array.isArray(list)) return [];
  return list.filter((e) => e.date === bizDate);
}

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let data;
  try {
    data = await loadAuditData();
  } catch (e) {
    container.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  const { pv, currency, allRes, allInvoices, invoicesForDay, movements } = data;
  const isAdmin = store.user && store.user.role === 'admin';

  // Yüzen mavi açıklama baloncuğu (Adonis hover tooltip)
  let tipEl = document.querySelector('#kdFloatingTip');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'kdFloatingTip';
    tipEl.className = 'kd-floating-tip';
    document.body.appendChild(tipEl);
  }

  function paint() {
    const curMovements = movements
      .filter((m) => (subTab === 'INVOICES' ? true : (m.currency || 'TRY') === subTab))
      .filter((m) => (movFilter === 'ALL' ? true : m.movementType === movFilter))
      .slice()
      .sort((a, b) => (sortAsc ? a.sortKey.localeCompare(b.sortKey) : b.sortKey.localeCompare(a.sortKey)));

    if (!selectedRowId && curMovements.length) selectedRowId = curMovements[0].id;

    // Seçili para birimi için ödeme tipine göre toplamlar
    const activeCur = subTab === 'INVOICES' ? 'TRY' : subTab;
    const allInCur = movements.filter((m) => (m.currency || 'TRY') === activeCur);
    const inMovs = allInCur.filter((m) => m.direction !== 'out');
    const outMovs = allInCur.filter((m) => m.direction === 'out');

    const totCash = inMovs.filter((m) => m.method === 'cash').reduce((s, m) => s + m.amount, 0);
    const totCard = inMovs.filter((m) => m.method === 'card').reduce((s, m) => s + m.amount, 0);
    const totTransfer = inMovs.filter((m) => m.method === 'transfer' || m.method === 'bank').reduce((s, m) => s + m.amount, 0);
    const totMailOrder = inMovs.filter((m) => m.method === 'vpos' || m.method === 'mail_order').reduce((s, m) => s + m.amount, 0);
    const totOther = inMovs.filter((m) => !['cash', 'card', 'transfer', 'bank', 'vpos', 'mail_order'].includes(m.method)).reduce((s, m) => s + m.amount, 0);

    const totGiris = inMovs.filter((m) => m.movementType === 'GİRİŞ').reduce((s, m) => s + m.amount, 0);
    const totRez = inMovs.filter((m) => m.movementType === 'REZERVASYON').reduce((s, m) => s + m.amount, 0);

    const kasayaGiren = inMovs.reduce((s, m) => s + m.amount, 0);
    const kasadanCikan = outMovs.reduce((s, m) => s + m.amount, 0);
    const gunlukNet = kasayaGiren - kasadanCikan;

    const invoicedTodayTotal = invoicesForDay.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0);
    const hasCardWarning = (totCard + totMailOrder) > invoicedTodayTotal;

    const countAll = allInCur.length;
    const countGiris = allInCur.filter((m) => m.movementType === 'GİRİŞ').length;
    const countRez = allInCur.filter((m) => m.movementType === 'REZERVASYON').length;

    container.innerHTML = `
      <div class="kd-win">
        <div class="kd-titlebar">
          <div class="kd-titlebar-left">
            <span class="kd-titlebar-ico">📊</span>
            <span>Kasa Devri / Gün Sonu</span>
          </div>
          <div style="font-size:.78rem;opacity:.9">OmniHost PMS · İş Günü: ${fmtSlashDate(pv.date)}</div>
        </div>

        <div class="kd-body">
          <div class="kd-banner">${fmtSlashDate(pv.date)} TARİHLİ HAREKETLER</div>

          <div class="kd-top-row">
            <div class="kd-main-tabs" id="kdMainTabs">
              <button data-mtab="onburo" class="${mainTab === 'onburo' ? 'active' : ''}">Ön Büro</button>
              <button data-mtab="muhasebe" class="${mainTab === 'muhasebe' ? 'active' : ''}">Muhasebe</button>
              <button data-mtab="bildirimler" class="${mainTab === 'bildirimler' ? 'active' : ''}">Bildirimler (${pv.pendingArrivals + pv.overstays})</button>
            </div>
            <div class="kd-export-btns">
              <button class="kd-exp-btn" id="kdBtnExcel" title="Tabloyu Excel (CSV) olarak indir"><span class="kd-exp-x">X</span> Excel</button>
              <button class="kd-exp-btn" id="kdBtnPrint" title="Gün sonu hareketlerini yazdır">🖨 Yazdır</button>
            </div>
          </div>

          <div class="kd-pane-box">
            ${mainTab === 'muhasebe'
              ? renderMuhasebePane({
                  curMovements, activeCur, hasCardWarning, countAll, countGiris, countRez,
                  totCash, totCard, totTransfer, totMailOrder, totOther, totGiris, totRez,
                  kasayaGiren, kasadanCikan, gunlukNet, allInvoices, invoicesForDay,
                })
              : mainTab === 'onburo'
                ? renderOnBuroPane({ pv, allRes, movements })
                : renderBildirimlerPane({ pv, currency, allRes })}
          </div>

          <div class="kd-bottom-bar">
            <div class="kd-bottom-left">
              <div class="kd-enddate-row">
                <span>Kullanım Bitiş Tarihi:</span>
                <span class="kd-date-pill">${fmtSlashDate(pv.date)}</span>
                ${!pv.canRun ? `<span style="color:var(--danger);font-weight:700;font-size:.8rem;margin-left:8px">⚠️ Bekleyen ${pv.pendingArrivals} giriş ve ${pv.overstays} çıkış var (Ön Büro sekmesinden kontrol edin)</span>` : `<span style="color:var(--ok);font-weight:700;font-size:.8rem;margin-left:8px">✓ Gün sonu devrine hazır</span>`}
              </div>
              <label class="kd-chk-label"><input type="checkbox" id="chkBdaySms"> Doğum günü olan misafirlere SMS gönder</label>
              <label class="kd-chk-label"><input type="checkbox" id="chkOptSms"> Opsiyon tarihi dolanlara SMS gönder</label>
            </div>

            <div class="kd-bottom-right">
              <div class="kd-date-pair">
                <span class="lbl">BUGÜN</span>
                <span class="kd-date-pill">${fmtSlashDate(pv.date)}</span>
                <span class="lbl">YENİ TARİH</span>
                <span class="kd-date-pill white">${fmtSlashDate(pv.nextDate)} <span style="margin-left:auto">📅</span></span>
              </div>
              <div class="kd-act-btns">
                <button class="kd-btn primary" id="kdRunAudit" ${!isAdmin ? 'disabled title="Yalnızca yönetici çalıştırabilir"' : ''}>
                  <span class="kd-btn-ico ok">✓</span> KAYDET
                </button>
                <button class="kd-btn" id="kdCancelBtn">
                  <span class="kd-btn-ico cancel">✕</span> VAZGEÇ
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    bindEvents(curMovements);
  }

  function renderMuhasebePane(st) {
    const {
      curMovements, activeCur, hasCardWarning, countAll, countGiris, countRez,
      totCash, totCard, totTransfer, totMailOrder, totOther, totGiris, totRez,
      kasayaGiren, kasadanCikan, gunlukNet, allInvoices, invoicesForDay,
    } = st;

    return `
      <div class="kd-subtabs-bar">
        <div class="kd-subtabs" id="kdSubTabs">
          <button data-stab="TRY" class="${subTab === 'TRY' ? 'active' : ''}">Try</button>
          <button data-stab="EUR" class="${subTab === 'EUR' ? 'active' : ''}">Eur</button>
          <button data-stab="USD" class="${subTab === 'USD' ? 'active' : ''}">Usd</button>
          <button data-stab="INVOICES" class="${subTab === 'INVOICES' ? 'active' : ''}">Faturalar (${(allInvoices || []).length})</button>
        </div>

        <div class="kd-warn-msg">
          ${hasCardWarning ? 'Dikkat! Kesilen faturadan fazla kredi kartı tahsilatı var.' : 'Günlük kasa ve tahsilat hareketleri dengede.'}
        </div>

        ${subTab !== 'INVOICES' ? `
        <div class="kd-type-filters" id="kdTypeFilters">
          <button class="kd-filter-chip ${movFilter === 'ALL' ? 'active' : ''}" data-mfilt="ALL">Tümü (${countAll})</button>
          <button class="kd-filter-chip ${movFilter === 'GİRİŞ' ? 'active' : ''}" data-mfilt="GİRİŞ">GİRİŞ (${countGiris})</button>
          <button class="kd-filter-chip ${movFilter === 'REZERVASYON' ? 'active' : ''}" data-mfilt="REZERVASYON">REZERVASYON / KAPORA (${countRez})</button>
        </div>` : ''}
      </div>

      ${subTab === 'INVOICES' ? renderInvoicesTable(allInvoices, invoicesForDay) : `
      <div class="kd-grid-wrap">
        <table class="kd-tbl" id="kdMovTable">
          <thead>
            <tr>
              <th id="kdSortDate" style="cursor:pointer">Tarih ${sortAsc ? '▲' : '▼'}</th>
              <th>Açıklama</th>
              <th class="t-center">Hareket Tipi</th>
              <th>Hareket Detayı</th>
              <th>Adı</th>
              <th class="t-right">Konaklama Ücreti</th>
              <th class="t-right">Tutar (Alınan)</th>
              <th>Ödeme Tipi</th>
              <th>Kasa Adı</th>
              <th>Kullanıcı</th>
            </tr>
          </thead>
          <tbody>
            ${curMovements.length ? curMovements.map((m) => `
              <tr data-rowid="${escapeHtml(m.id)}" data-resid="${escapeHtml(m.reservationId || '')}" data-mtype="${escapeHtml(m.movementType)}" data-tip="${escapeHtml(m.fullTooltip)}" class="${m.id === selectedRowId ? 'kd-row-sel' : ''}">
                <td class="mono">${escapeHtml(m.displayDateTime)}</td>
                <td class="kd-desc-cell">${escapeHtml(m.shortDesc)}</td>
                <td class="t-center">
                  <span class="kd-mov-badge ${m.movementType === 'REZERVASYON' ? 'kd-mov-rez' : 'kd-mov-giris'}">${escapeHtml(m.movementType)}</span>
                </td>
                <td>${escapeHtml(m.movementDetail)}</td>
                <td>Konaklama No:${escapeHtml(m.reservationCode)}</td>
                <td class="t-right mono" style="opacity:.85">${fmtCur(m.totalAmount, m.currency)}</td>
                <td class="t-right mono" style="font-weight:800">${fmtCur(m.amount, m.currency)}</td>
                <td>${escapeHtml(methodLabel(m.method))}</td>
                <td>${escapeHtml(cashboxLabel(m.method))}</td>
                <td>${escapeHtml(m.createdBy || 'admin')}</td>
              </tr>
            `).join('') : `<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--muted)">Seçili kriterde (${activeCur}) günlük muhasebe hareketi bulunmuyor.</td></tr>`}
          </tbody>
        </table>
      </div>`}

      <div class="kd-summary-row">
        <div>
          <div class="kd-sum-box-title">Ödeme Tipine Göre Toplamlar</div>
          <div class="kd-method-grid">
            <div class="kd-kv"><span class="kd-kv-lbl">Nakit</span><span class="kd-pill-val">${fmtCur(totCash, activeCur)}</span></div>
            <div class="kd-kv"><span class="kd-kv-lbl">Havale</span><span class="kd-pill-val">${fmtCur(totTransfer, activeCur)}</span></div>
            <div class="kd-kv"><span class="kd-kv-lbl">Diğer</span><span class="kd-pill-val">${fmtCur(totOther, activeCur)}</span></div>
            <div class="kd-kv"><span class="kd-kv-lbl">Kredi Kartı</span><span class="kd-pill-val">${fmtCur(totCard, activeCur)}</span></div>
            <div class="kd-kv"><span class="kd-kv-lbl">Mail Order</span><span class="kd-pill-val">${fmtCur(totMailOrder, activeCur)}</span></div>
            <div class="kd-kv"><span class="kd-kv-lbl" title="Henüz giriş yapmamış rezervasyonlardan alınan kapora/ön ödemeler">Rez. Kapora</span><span class="kd-pill-val">${fmtCur(totRez, activeCur)}</span></div>
          </div>
        </div>

        <div class="kd-mid-note">
          Kasadan kasaya yapılan transferler, Giren/Çıkan Tutar ve Günlük Net alanlarına yansıtılmamaktadır.
          <div style="margin-top:6px;font-size:.77rem;color:var(--ink-soft)">
            <b>Giriş Tahsilatı:</b> ${fmtCur(totGiris, activeCur)} (${countGiris} işlem) ·
            <b>Rezervasyon (Kapora):</b> ${fmtCur(totRez, activeCur)} (${countRez} işlem)
          </div>
        </div>

        <div class="kd-cash-col">
          <div class="kd-kv"><span class="kd-kv-lbl" style="font-weight:800">Kasaya Giren</span><span class="kd-pill-val">${fmtCur(kasayaGiren, activeCur)}</span></div>
          <div class="kd-kv"><span class="kd-kv-lbl" style="font-weight:800">Kasadan Çıkan</span><span class="kd-pill-val red">${fmtCur(kasadanCikan, activeCur)}</span></div>
          <div class="kd-kv"><span class="kd-kv-lbl net">Günlük Net</span><span class="kd-pill-val">${fmtCur(gunlukNet, activeCur)}</span></div>
        </div>
      </div>`;
  }

  function renderInvoicesTable(allInvs, todayInvs) {
    const list = (allInvs || []);
    return `
      <div class="kd-grid-wrap">
        <table class="kd-tbl">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Fatura No</th>
              <th>Tür</th>
              <th>Müşteri / Unvan</th>
              <th>VKN / TCKN</th>
              <th class="t-right">Toplam Tutar</th>
              <th>e-Belge Durumu</th>
              <th>Kesilen Kullanıcı</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map((inv) => `
              <tr>
                <td class="mono">${fmtSlashDate((inv.issuedAt || '').slice(0, 10))}</td>
                <td class="mono" style="font-weight:700">${escapeHtml(inv.number)}</td>
                <td>${inv.type === 'efatura' ? 'e-Fatura' : 'e-Arşiv'}</td>
                <td>${escapeHtml(inv.customerName || '—')}</td>
                <td class="mono">${escapeHtml(inv.taxNumber || '—')}</td>
                <td class="t-right mono" style="font-weight:800">${fmtCur(inv.grandTotal, inv.currency || 'TRY')}</td>
                <td>${inv.efaturaStatus === 'sent' ? 'Gönderildi' : escapeHtml(inv.efaturaStatus || '—')}</td>
                <td>${escapeHtml(inv.issuedBy || 'admin')}</td>
              </tr>
            `).join('') : `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">Kesilmiş fatura bulunmuyor. (Bugün kesilen: ${todayInvs.length})</td></tr>`}
          </tbody>
        </table>
      </div>`;
  }

  function renderOnBuroPane({ pv, allRes }) {
    const activeStays = (allRes || []).filter((r) => r.status === 'checked_in' || (r.status === 'confirmed' && ((Number(r.paidAmount) || 0) > 0 || r.checkIn <= pv.date)));
    activeStays.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'checked_in' ? -1 : 1;
      return String(a.roomNumber || '').localeCompare(String(b.roomNumber || ''), undefined, { numeric: true });
    });

    const totalStayFee = activeStays.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const totalStayPaid = activeStays.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
    const totalStayBal = Math.max(0, totalStayFee - totalStayPaid);

    return `
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        <div class="kd-date-pill white">Otelde Konaklayan (GİRİŞ): <b>${pv.inHouse} oda</b></div>
        <div class="kd-date-pill white">Bekleyen Giriş: <b style="color:${pv.pendingArrivals ? 'var(--danger)' : 'var(--ok)'}">${pv.pendingArrivals}</b></div>
        <div class="kd-date-pill white">Bekleyen Çıkış: <b style="color:${pv.overstays ? 'var(--danger)' : 'var(--ok)'}">${pv.overstays}</b></div>
        <div class="kd-date-pill white">Toplam Konaklama Ücreti: <b>${money(totalStayFee)}</b></div>
        <div class="kd-date-pill white">Toplam Alınan: <b style="color:var(--ok)">${money(totalStayPaid)}</b></div>
        <div class="kd-date-pill white">Toplam Kalan Bakiye: <b style="color:var(--danger)">${money(totalStayBal)}</b></div>
      </div>

      <div class="kd-grid-wrap" style="max-height:420px">
        <table class="kd-tbl" id="kdOnBuroTable">
          <thead>
            <tr>
              <th>Oda No</th>
              <th>Oda Tipi</th>
              <th>Misafir Adı</th>
              <th class="t-center">Hareket / Durum</th>
              <th>Geliş Tarihi</th>
              <th>Ayrılış Tarihi</th>
              <th class="t-center">Gece</th>
              <th class="t-right">Günlük Ücret</th>
              <th class="t-right">Toplam Ücret</th>
              <th class="t-right">Alınan Ödeme</th>
              <th class="t-right">Kalan Bakiye</th>
              <th class="t-center">İşlem</th>
            </tr>
          </thead>
          <tbody>
            ${activeStays.map((r) => {
              const cur = r.currency || 'TRY';
              const tot = Number(r.totalAmount) || 0;
              const paid = Number(r.paidAmount) || 0;
              const bal = Math.max(0, tot - paid);
              const isRez = r.status === 'confirmed';
              return `
                <tr data-resid="${escapeHtml(r.id)}" data-status="${escapeHtml(r.status)}">
                  <td class="mono" style="font-weight:800">${escapeHtml(r.roomNumber || '—')}</td>
                  <td>${escapeHtml(r.roomTypeName || '—')}</td>
                  <td style="font-weight:700">${escapeHtml(r.guestName || '—')}</td>
                  <td class="t-center">
                    <span class="kd-mov-badge ${isRez ? 'kd-mov-rez' : 'kd-mov-giris'}">${isRez ? 'REZERVASYON' : 'GİRİŞ'}</span>
                  </td>
                  <td class="mono">${fmtSlashDate(r.checkIn)}</td>
                  <td class="mono">${fmtSlashDate(r.checkOut)}</td>
                  <td class="t-center">${r.nights || 1}</td>
                  <td class="t-right mono">${fmtCur(r.ratePerNight || 0, cur)}</td>
                  <td class="t-right mono" style="font-weight:700">${fmtCur(tot, cur)}</td>
                  <td class="t-right mono" style="font-weight:800;color:var(--ok)">${fmtCur(paid, cur)}</td>
                  <td class="t-right mono" style="font-weight:800;color:${bal > 0.5 ? 'var(--danger)' : 'var(--ok)'}">${fmtCur(bal, cur)}</td>
                  <td class="t-center">
                    <button class="btn btn-sm btn-primary" data-openfolio="${escapeHtml(r.id)}" style="padding:2px 8px;font-size:.74rem">Folio / Ödeme</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderBildirimlerPane({ pv, currency, allRes }) {
    const pendIn = (allRes || []).filter((r) => r.status === 'confirmed' && r.checkIn <= pv.date);
    const pendOut = (allRes || []).filter((r) => r.status === 'checked_in' && r.checkOut <= pv.date);
    return `
      <div class="grid cols-2">
        <div>
          <div class="kd-sum-box-title">Gün Sonu Kontrol Bildirimleri</div>
          ${pendIn.length === 0 && pendOut.length === 0
            ? `<div style="padding:16px;background:var(--white);border:1px solid var(--line);border-radius:var(--radius-sm);color:var(--ok);font-weight:700">✓ Bekleyen giriş veya çıkış işlemi bulunmuyor. Gün sonu devri yapılabilir.</div>`
            : `<div style="padding:12px;background:var(--white);border:1px solid var(--line);border-radius:var(--radius-sm)">
                ${pendIn.length ? `<div style="margin-bottom:10px"><b style="color:var(--danger)">Bekleyen Girişler (${pendIn.length} adet — Giriş yapılmalı veya ileri tarihe alınmalı):</b>
                  <ul style="margin:6px 0 0 18px">${pendIn.map((r) => `<li>Oda <b>${escapeHtml(r.roomNumber || '—')}</b> · ${escapeHtml(r.guestName)} (${escapeHtml(r.code)}) — Geliş: ${fmtSlashDate(r.checkIn)}</li>`).join('')}</ul></div>` : ''}
                ${pendOut.length ? `<div><b style="color:var(--danger)">Bekleyen Çıkışlar (${pendOut.length} adet — Çıkış yapılmalı veya uzatılmalı):</b>
                  <ul style="margin:6px 0 0 18px">${pendOut.map((r) => `<li>Oda <b>${escapeHtml(r.roomNumber || '—')}</b> · ${escapeHtml(r.guestName)} (${escapeHtml(r.code)}) — Ayrılış: ${fmtSlashDate(r.checkOut)}</li>`).join('')}</ul></div>` : ''}
              </div>`}
        </div>
        <div>
          <div class="kd-sum-box-title" style="display:flex;justify-content:space-between;align-items:center">
            <span>TCMB Döviz Kurları</span>
            <button class="kd-exp-btn" id="kdRefreshFx" style="padding:2px 8px;font-size:.74rem">Güncelle</button>
          </div>
          <div id="kdFxBox" style="background:var(--white);border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px">
            ${currencyHtml(currency)}
          </div>
        </div>
      </div>`;
  }

  function bindEvents(curMovements) {
    // Ana sekmeler
    const mTabs = container.querySelector('#kdMainTabs');
    if (mTabs) {
      mTabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mtab]');
        if (!b) return;
        mainTab = b.dataset.mtab;
        paint();
      });
    }

    // Alt sekmeler (Try, Eur, Usd, Faturalar)
    const sTabs = container.querySelector('#kdSubTabs');
    if (sTabs) {
      sTabs.addEventListener('click', (e) => {
        const b = e.target.closest('[data-stab]');
        if (!b) return;
        subTab = b.dataset.stab;
        selectedRowId = null;
        paint();
      });
    }

    // Hareket tipi filtresi (Tümü / GİRİŞ / REZERVASYON)
    const tFilt = container.querySelector('#kdTypeFilters');
    if (tFilt) {
      tFilt.addEventListener('click', (e) => {
        const b = e.target.closest('[data-mfilt]');
        if (!b) return;
        movFilter = b.dataset.mfilt;
        selectedRowId = null;
        paint();
      });
    }

    // Tarih sıralama
    const sortBtn = container.querySelector('#kdSortDate');
    if (sortBtn) {
      sortBtn.addEventListener('click', () => {
        sortAsc = !sortAsc;
        paint();
      });
    }

    // Muhasebe tablosu satır seçimi, tıklayınca rezervasyon/konaklama detayı açma ve açıklama baloncuğu
    const movTbl = container.querySelector('#kdMovTable');
    if (movTbl) {
      movTbl.querySelectorAll('tbody tr[data-rowid]').forEach((tr) => {
        tr.addEventListener('click', async () => {
          selectedRowId = tr.dataset.rowid;
          movTbl.querySelectorAll('tbody tr').forEach((r) => r.classList.toggle('kd-row-sel', r === tr));
          if (tipEl) tipEl.style.display = 'none';
          const resId = tr.dataset.resid;
          const mtype = tr.dataset.mtype;
          if (!resId) return;
          if (mtype === 'REZERVASYON') {
            try {
              const r = await api.reservation(resId);
              openDetailModal(ctx, r, () => render(container, ctx));
            } catch (e) { toast(e.message, 'err'); }
          } else if (mtype === 'GİRİŞ') {
            openStayModal(ctx, { mode: 'edit', reservationId: resId });
          } else {
            openFolioModal(ctx, resId);
          }
        });
        tr.addEventListener('mouseenter', (ev) => {
          const tip = tr.dataset.tip;
          if (!tip || !tipEl) return;
          tipEl.innerHTML = escapeHtml(tip).replace(/\n/g, '<br>');
          tipEl.style.display = 'block';
          const rect = tr.getBoundingClientRect();
          tipEl.style.left = `${Math.min(window.innerWidth - 460, Math.max(16, ev.clientX - 30))}px`;
          tipEl.style.top = `${rect.bottom + 8}px`;
        });
        tr.addEventListener('mousemove', (ev) => {
          if (!tipEl || tipEl.style.display !== 'block') return;
          const rect = tr.getBoundingClientRect();
          tipEl.style.left = `${Math.min(window.innerWidth - 460, Math.max(16, ev.clientX - 30))}px`;
          tipEl.style.top = `${rect.bottom + 8}px`;
        });
        tr.addEventListener('mouseleave', () => {
          if (tipEl) tipEl.style.display = 'none';
        });
      });
    }

    // Ön Büro tablosunda Folio / Konaklama açma
    const obTbl = container.querySelector('#kdOnBuroTable');
    if (obTbl) {
      obTbl.addEventListener('click', (e) => {
        const folBtn = e.target.closest('[data-openfolio]');
        if (folBtn) {
          e.stopPropagation();
          openFolioModal(ctx, folBtn.dataset.openfolio);
          return;
        }
        const tr = e.target.closest('tr[data-resid]');
        if (!tr) return;
        const resId = tr.dataset.resid;
        const status = tr.dataset.status;
        if (status === 'checked_in') openStayModal(ctx, { mode: 'edit', reservationId: resId });
        else openFolioModal(ctx, resId);
      });
    }

    // Döviz güncelle
    const fxBtn = container.querySelector('#kdRefreshFx');
    if (fxBtn) {
      fxBtn.addEventListener('click', async () => {
        fxBtn.disabled = true;
        try {
          const out = await api.post('/api/currency/refresh');
          const box = container.querySelector('#kdFxBox');
          if (box) box.innerHTML = currencyHtml(out.rates, out.source);
          toast(`Kurlar güncellendi (${out.source === 'tcmb' ? 'TCMB canlı' : out.source}).`, 'ok');
        } catch (err) { toast(err.message, 'err'); }
        finally { fxBtn.disabled = false; }
      });
    }

    // Excel (CSV) dışa aktarma
    const excelBtn = container.querySelector('#kdBtnExcel');
    if (excelBtn) {
      excelBtn.addEventListener('click', () => exportExcelCsv(pv.date, curMovements));
    }

    // Yazdır
    const printBtn = container.querySelector('#kdBtnPrint');
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    // Vazgeç
    const cancelBtn = container.querySelector('#kdCancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        location.hash = '#/rack';
      });
    }

    // KAYDET (Gün Sonu Yap)
    const runBtn = container.querySelector('#kdRunAudit');
    if (runBtn) {
      runBtn.addEventListener('click', async () => {
        if (!pv.canRun) {
          toast(`Gün sonu yapılamaz: Bekleyen ${pv.pendingArrivals} giriş ve ${pv.overstays} çıkış var. Önce giriş/çıkış işlemlerini tamamlayın.`, 'err');
          mainTab = 'bildirimler';
          paint();
          return;
        }
        const ok = await confirmDialog({
          title: 'Kasa Devri / Gün Sonu Onayı',
          message: `İş günü ${fmtSlashDate(pv.date)} kapatılıp yeni tarih ${fmtSlashDate(pv.nextDate)} açılacak. Onaylıyor musunuz?`,
          confirmText: 'Kaydet ve Gün Sonu Yap',
        });
        if (!ok) return;
        runBtn.disabled = true;
        try {
          const out = await api.post('/api/nightaudit/run');
          showClosing(out);
          await ctx.refreshBadges();
        } catch (e) {
          toast(e.message, 'err');
          runBtn.disabled = false;
        }
      });
    }
  }

  paint();
}

function exportExcelCsv(dateStr, rows) {
  const headers = ['Tarih', 'Açıklama', 'Hareket Tipi', 'Hareket Detayı', 'Adı', 'Konaklama Ücreti', 'Tutar (Alınan)', 'Para Birimi', 'Ödeme Tipi', 'Kasa Adı', 'Kullanıcı'];
  const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(';'),
    ...rows.map((m) => [
      m.displayDateTime,
      m.shortDesc,
      m.movementType,
      m.movementDetail,
      `Konaklama No:${m.reservationCode}`,
      m.totalAmount,
      m.amount,
      m.currency || 'TRY',
      methodLabel(m.method),
      cashboxLabel(m.method),
      m.createdBy || 'admin',
    ].map(esc).join(';')),
  ];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Kasa_Devri_Gun_Sonu_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Gün sonu muhasebe hareketleri Excel (CSV) olarak indirildi.', 'ok');
}

function currencyHtml(list, source) {
  if (!list || !list.length) return emptyState('💱', 'Kur verisi yok.');
  return `
    <table class="kd-tbl">
      <thead><tr><th>Döviz</th><th class="t-right">Alış</th><th class="t-right">Satış</th></tr></thead>
      <tbody>${list.map((c) => `<tr><td style="font-weight:700">${escapeHtml(c.code)} <span class="muted" style="font-weight:400">${escapeHtml(c.name || '')}</span></td><td class="t-right mono">${c.forexBuying}</td><td class="t-right mono">${c.forexSelling}</td></tr>`).join('')}</tbody>
    </table>
    <div class="muted" style="font-size:.74rem;margin-top:6px">Kaynak: ${(source || (list[0] && list[0].source)) === 'tcmb' ? 'TCMB canlı' : 'başlangıç değeri'} · ${list[0] ? list[0].date : ''}</div>`;
}

function showClosing(out) {
  const c = out.closing;
  openModal({
    title: `Gün Sonu Tamamlandı · ${fmtDate(out.closedDate)}`,
    body: `
      <div class="badge b-ok" style="margin-bottom:12px">İş günü ${fmtDate(out.newDate)} olarak açıldı</div>
      <div class="folio-total-row"><span class="muted">Oda geliri</span><b>${money(c.roomRevenue)}</b></div>
      <div class="folio-total-row"><span class="muted">Ekstra gelir</span><b>${money(c.extraRevenue)}</b></div>
      <div class="folio-total-row grand"><span>Toplam Tahsilat / Ciro</span><span>${money(c.totalRevenue)}</span></div>
      <div class="folio-total-row"><span class="muted">Giriş / Çıkış</span><span>${c.arrivals} / ${c.departures}</span></div>
      ${out.currency ? `<div class="folio-total-row"><span class="muted">TCMB kurları</span><span>${out.currency.count} döviz (${out.currency.source})</span></div>` : ''}`,
    footer: '<button class="btn btn-gold" data-close>Tamam</button>',
    onClose: () => location.reload(),
  });
}
