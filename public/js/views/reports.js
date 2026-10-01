// OmniHost PMS — Gelişmiş Raporlar ve Finansal Yönetim Paketi
import { api } from '../api.js';
import { store } from '../store.js';
import {
  money, escapeHtml, today, addDays, spinner, emptyState,
  openModal, toast, fmtDate, fmtDateShort, badge, nights
} from '../ui.js';

// Kalıcı durum (sekme ve filtreler)
let activeTab = 'overview';
let fromDate = null;
let toDate = null;
let staysDate = null;
let staysFilter = 'all'; // all | inhouse | departed
let staysSearch = '';

let finFrom = null;
let finTo = null;

let balancesMonth = null;
let balancesFilter = 'all'; // all | debt | paid
let balancesSearch = '';

let facYear = null;
let facMode = 'monthly'; // monthly | yearly

let blacklistSearch = '';

let corpMonth = '';
let corpTypeFilter = 'all'; // all | agency | corporate

export async function render(container, ctx) {
  const bDate = ctx.businessDate || today();
  if (!fromDate) { fromDate = addDays(bDate, -30); toDate = addDays(bDate, 1); }
  if (!staysDate) { staysDate = bDate; }
  if (!finFrom) { finFrom = addDays(bDate, -30); finTo = bDate; }
  if (!balancesMonth) { balancesMonth = bDate.slice(0, 7); }
  if (!facYear) { facYear = Number(bDate.slice(0, 4)); }

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Raporlar & Finansal Yönetim</h2>
        <div class="sub">Operasyonel konaklama, gelir-gider muhasebesi, tesis performansı, cari hesaplar ve kara liste</div>
      </div>
    </div>

    <!-- Sekme Navigasyonu -->
    <div class="rep-nav" id="repNav">
      <button class="${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">📊 Genel Bakış & Kanallar</button>
      <button class="${activeTab === 'stays' ? 'active' : ''}" data-tab="stays">🏨 Konaklama Raporu</button>
      <button class="${activeTab === 'financial' ? 'active' : ''}" data-tab="financial">💰 Mali Rapor (Gelir & Gider)</button>
      <button class="${activeTab === 'roomBalances' ? 'active' : ''}" data-tab="roomBalances">🛏️ Aylık Oda Bakiyeleri</button>
      <button class="${activeTab === 'facility' ? 'active' : ''}" data-tab="facility">🏢 Tesis Raporu (Aylık & Yıllık)</button>
      <button class="${activeTab === 'blacklist' ? 'active' : ''}" data-tab="blacklist">🚫 Kara Liste Raporu</button>
      <button class="${activeTab === 'corporate' ? 'active' : ''}" data-tab="corporate">💼 Kurumsal Satış (Cari Hesaplar)</button>
    </div>

    <!-- Sekme İçerik Alanı -->
    <div id="repContent">${spinner()}</div>
  `;

  // Sekme tıklamaları
  container.querySelectorAll('#repNav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      container.querySelectorAll('#repNav button').forEach((b) => b.classList.toggle('active', b === btn));
      loadActiveTab(container, ctx);
    });
  });

  loadActiveTab(container, ctx);
}

function loadActiveTab(container, ctx) {
  const el = container.querySelector('#repContent');
  if (!el) return;
  el.innerHTML = spinner();

  switch (activeTab) {
    case 'overview':
      renderOverviewTab(el, ctx);
      break;
    case 'stays':
      renderStaysTab(el, ctx);
      break;
    case 'financial':
      renderFinancialTab(el, ctx);
      break;
    case 'roomBalances':
      renderRoomBalancesTab(el, ctx);
      break;
    case 'facility':
      renderFacilityTab(el, ctx);
      break;
    case 'blacklist':
      renderBlacklistTab(el, ctx);
      break;
    case 'corporate':
      renderCorporateTab(el, ctx);
      break;
    default:
      renderOverviewTab(el, ctx);
  }
}

// =========================================================================
// 1) GENEL BAKIŞ & KANALLAR
// =========================================================================
async function renderOverviewTab(el, ctx) {
  let summary, channel, tax;
  try {
    [summary, channel, tax] = await Promise.all([
      api.get(`/api/reports/summary?from=${fromDate}&to=${toDate}`),
      api.get(`/api/reports/channel?from=${fromDate}&to=${toDate}`),
      api.get(`/api/reports/tax?from=${fromDate}&to=${toDate}`),
    ]);
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  const maxOcc = Math.max(1, ...summary.days.map((d) => d.occupancyPct));
  const maxRev = Math.max(1, ...channel.channels.map((c) => c.revenue));
  const channelColor = (src) => {
    if (!src || src === 'direct') return '#4f46e5';
    const ch = store.channel(src);
    return ch ? ch.color : '#0f172a';
  };

  el.innerHTML = `
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div class="flex gap-sm wrap items-center">
          <span class="muted" style="font-size:.86rem;font-weight:600">Tarih Aralığı:</span>
          <input class="input" type="date" id="ovFrom" value="${fromDate}" style="max-width:150px">
          <span class="muted">→</span>
          <input class="input" type="date" id="ovTo" value="${toDate}" style="max-width:150px">
          <button class="btn btn-primary btn-sm" id="ovApply">Filtrele</button>
        </div>
        <div class="flex gap-xs wrap">
          <button class="btn btn-outline btn-sm" id="ovPreset30">Son 30 Gün</button>
          <button class="btn btn-outline btn-sm" id="ovPresetMonth">Bu Ay</button>
        </div>
      </div>
    </div>

    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Ort. Doluluk</div><div class="st-v">%${summary.avgOccupancy}</div></div>
      <div class="stat-tile"><div class="st-l">ADR (Ort. Oda Fiyatı)</div><div class="st-v">${money(summary.adr)}</div></div>
      <div class="stat-tile"><div class="st-l">RevPAR</div><div class="st-v">${money(summary.revpar)}</div></div>
      <div class="stat-tile"><div class="st-l">Oda Geliri</div><div class="st-v">${money(summary.roomRevenue)}</div></div>
      <div class="stat-tile"><div class="st-l">Toplam Gelir</div><div class="st-v" style="color:var(--gold-ink)">${money(summary.totalRevenue)}</div></div>
    </div>

    <div class="grid cols-2 mb">
      <div class="card">
        <div class="card-head"><h3>Günlük Doluluk Grafiği</h3><span class="card-sub">${summary.days.length} gün</span></div>
        <div class="card-pad">
          <div class="spark">${summary.days.map((d) => `<i style="height:${Math.max(4, Math.round((d.occupancyPct / maxOcc) * 100))}%" title="${d.date}: %${d.occupancyPct} (${d.occupied} oda)"></i>`).join('')}</div>
          <div class="flex between muted" style="font-size:.74rem;margin-top:8px"><span>${summary.days[0] ? summary.days[0].date : ''}</span><span>${summary.days.length ? summary.days[summary.days.length - 1].date : ''}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Kanal Üretimi & Dağılımı</h3><span class="card-sub">${channel.totalReservations} rezervasyon</span></div>
        <div class="card-pad">
          ${channel.channels.length ? channel.channels.map((c) => `
            <div class="bar-row">
              <div class="bl"><span class="sw" style="background:${channelColor(c.source)}"></span>${escapeHtml(c.name)}</div>
              <div class="bar-track"><i style="width:${Math.max(4, Math.round((c.revenue / maxRev) * 100))}%"></i></div>
              <div class="bv">${money(c.revenue)}</div>
            </div>`).join('') : emptyState('📊', 'Veri yok')}
          <div class="muted" style="font-size:.76rem;margin-top:10px">Toplam ciro üretimi: <b>${money(channel.totalRevenue)}</b></div>
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h3>Kanal Detay Tablosu</h3></div>
        <div class="card-pad table-wrap"><table class="tbl table-compact">
          <thead><tr><th>Kanal</th><th class="t-right">Rez.</th><th class="t-right">Oda-Gece</th><th class="t-right">Brüt Üretim</th><th class="t-right">Komisyon</th><th class="t-right">Net Ciro</th></tr></thead>
          <tbody>${channel.channels.map((c) => `<tr><td class="t-strong">${escapeHtml(c.name)}</td><td class="t-right">${c.count}</td><td class="t-right">${c.roomNights}</td><td class="t-right">${money(c.revenue)}</td><td class="t-right muted">${money(c.commission)}</td><td class="t-right t-strong" style="color:var(--ok)">${money(c.netRevenue)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>KDV & Konaklama Vergisi Beyanı</h3><span class="card-sub">mali özet</span></div>
        <div class="card-pad">
          <table class="tbl table-compact">
            <thead><tr><th>KDV Oranı</th><th class="t-right">Matrah (Net)</th><th class="t-right">Hesaplanan KDV</th></tr></thead>
            <tbody>${tax.kdvByRate.length ? tax.kdvByRate.map((k) => `<tr><td>%${k.rate}</td><td class="t-right">${money(k.net)}</td><td class="t-right t-strong">${money(k.kdv)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Veri yok</td></tr>'}</tbody>
          </table>
          <div class="folio-total-row grand" style="margin-top:14px"><span>Toplam KDV</span><span>${money(tax.kdvTotal)}</span></div>
          <div class="folio-total-row"><span class="muted">Konaklama Vergisi (%2)</span><span class="t-strong">${money(tax.accommodationTax)}</span></div>
          <div class="folio-total-row"><span class="muted">Kesilen Fatura Adedi</span><span>${tax.invoiceCount} adet</span></div>
        </div>
      </div>
    </div>
  `;

  el.querySelector('#ovApply').addEventListener('click', () => {
    fromDate = el.querySelector('#ovFrom').value;
    toDate = el.querySelector('#ovTo').value;
    renderOverviewTab(el, ctx);
  });
  el.querySelector('#ovPreset30').addEventListener('click', () => {
    fromDate = addDays(ctx.businessDate || today(), -30);
    toDate = addDays(ctx.businessDate || today(), 1);
    renderOverviewTab(el, ctx);
  });
  el.querySelector('#ovPresetMonth').addEventListener('click', () => {
    const cur = ctx.businessDate || today();
    fromDate = cur.slice(0, 7) + '-01';
    toDate = addDays(cur, 1);
    renderOverviewTab(el, ctx);
  });
}

// =========================================================================
// 2) KONAKLAMA RAPORU (HÂLİ HAZIRDA KONAKLAYAN & AYRILMIŞ)
// =========================================================================
async function renderStaysTab(el, ctx) {
  let data;
  try {
    data = await api.get(`/api/reports/stays?date=${staysDate}&filter=${staysFilter}`);
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  // İstemci tarafı arama filtresi
  let list = data.stays;
  if (staysSearch.trim()) {
    const q = staysSearch.toLowerCase().trim();
    list = list.filter((s) =>
      s.guestName.toLowerCase().includes(q) ||
      s.roomNumber.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.guestIdNumber && s.guestIdNumber.includes(q))
    );
  }

  el.innerHTML = `
    <!-- Filtre Çubuğu -->
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div class="flex gap-sm wrap items-center">
          <label style="font-weight:600;font-size:.88rem">Rapor Tarihi:</label>
          <input class="input" type="date" id="stDate" value="${staysDate}" style="max-width:160px">
          <button class="btn btn-primary btn-sm" id="stApplyDate">Listele</button>
        </div>

        <!-- Durum Filtre Segmenti -->
        <div class="segment">
          <button class="${staysFilter === 'all' ? 'active' : ''}" data-stfilter="all">Tümü (${data.totalCount})</button>
          <button class="${staysFilter === 'inhouse' ? 'active' : ''}" data-stfilter="inhouse">🟢 Hâli Hazırda Konaklayan (${data.inHouseCount})</button>
          <button class="${staysFilter === 'departed' ? 'active' : ''}" data-stfilter="departed">🔵 Ayrılmış (${data.departedCount})</button>
        </div>

        <div style="min-width:220px">
          <input class="input" type="search" id="stSearch" placeholder="Misafir adı, oda no, TC..." value="${escapeHtml(staysSearch)}">
        </div>
      </div>
    </div>

    <!-- İstatistik Kartları -->
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Toplam Kayıt</div><div class="st-v">${data.totalCount}</div></div>
      <div class="stat-tile"><div class="st-l">İçeride (Otelde)</div><div class="st-v" style="color:var(--ok)">${data.inHouseCount} oda</div></div>
      <div class="stat-tile"><div class="st-l">Bugün Ayrılan</div><div class="st-v" style="color:var(--info)">${data.departedCount} oda</div></div>
      <div class="stat-tile"><div class="st-l">Günlük Oda Üretimi</div><div class="st-v">${money(data.totalDailyRevenue)}</div></div>
      <div class="stat-tile"><div class="st-l">Kalan Açık Bakiye</div><div class="st-v" style="color:${data.totalBalance > 0 ? 'var(--danger)' : 'var(--ok)'}">${money(data.totalBalance)}</div></div>
    </div>

    <!-- Konaklama Tablosu -->
    <div class="card">
      <div class="card-head flex between items-center">
        <div>
          <h3>${fmtDate(staysDate)} Konaklama Çizelgesi</h3>
          <span class="card-sub">${list.length} misafir listelendi</span>
        </div>
        <button class="btn btn-outline btn-sm" id="stPrint"><span class="ico">🖨️</span> Yazdır / PDF</button>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl table-compact" id="stTable">
          <thead>
            <tr>
              <th>Oda</th>
              <th>Misafir Adı</th>
              <th>Kimlik / Pasaport</th>
              <th>Giriş</th>
              <th>Çıkış</th>
              <th>Gece</th>
              <th>Pansiyon</th>
              <th>Gecelik</th>
              <th>Toplam Borç</th>
              <th>Tahsilat</th>
              <th>Bakiye</th>
              <th>Kanal / Kaynak</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map((s) => {
              const statusBadge = s.isDeparted
                ? badge('Ayrıldı', 'b-info')
                : (s.status === 'checked_in' ? badge('Otelde', 'b-ok') : badge('Giriş Bekliyor', 'b-warn'));
              const vipBadge = s.vip ? '<span class="rep-pill yellow" title="VIP Misafir">★ VIP</span>' : '';
              const blBadge = s.blacklist ? '<span class="rep-pill red" title="KARA LİSTE">⛔ KARA LİSTE</span>' : '';
              const balColor = s.balance > 0.05 ? 'color:var(--danger);font-weight:700' : 'color:var(--ok)';

              return `
                <tr>
                  <td><b>${escapeHtml(s.roomNumber)}</b> <span class="muted" style="font-size:.72rem">(${escapeHtml(s.roomBlock || '')})</span></td>
                  <td>
                    <div style="font-weight:600">${escapeHtml(s.guestName)} ${vipBadge} ${blBadge}</div>
                    <div class="muted" style="font-size:.72rem">${escapeHtml(s.guestPhone || '')}</div>
                  </td>
                  <td class="mono" style="font-size:.78rem">${escapeHtml(s.guestIdNumber || '—')} <span class="muted">(${escapeHtml(s.nationality)})</span></td>
                  <td style="white-space:nowrap">${fmtDateShort(s.checkIn)}</td>
                  <td style="white-space:nowrap">${fmtDateShort(s.checkOut)}</td>
                  <td class="t-center">${s.nights}</td>
                  <td><span class="rep-pill blue">${escapeHtml(s.board)}</span></td>
                  <td class="t-right">${money(s.dailyRate)}</td>
                  <td class="t-right">${money(s.charges)}</td>
                  <td class="t-right" style="color:var(--ok)">${money(s.paid)}</td>
                  <td class="t-right" style="${balColor}">${money(s.balance)}</td>
                  <td><span class="muted" style="font-size:.8rem">${escapeHtml(s.channelName)}</span></td>
                  <td>${statusBadge}</td>
                </tr>
              `;
            }).join('') : `<tr><td colspan="13" class="t-center muted" style="padding:30px">Seçilen tarihte ve kriterde konaklama bulunamadı.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  el.querySelector('#stApplyDate').addEventListener('click', () => {
    staysDate = el.querySelector('#stDate').value;
    renderStaysTab(el, ctx);
  });
  el.querySelectorAll('[data-stfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      staysFilter = btn.dataset.stfilter;
      renderStaysTab(el, ctx);
    });
  });
  el.querySelector('#stSearch').addEventListener('input', (e) => {
    staysSearch = e.target.value;
    renderStaysTab(el, ctx);
  });
  el.querySelector('#stPrint').addEventListener('click', () => {
    window.print();
  });
}

// =========================================================================
// 3) MALİ RAPOR (GELİR & GİDER YÖNETİMİ — GÜN GÜN)
// =========================================================================
async function renderFinancialTab(el, ctx) {
  let finData, expensesList;
  try {
    [finData, expensesList] = await Promise.all([
      api.get(`/api/reports/financial?from=${finFrom}&to=${finTo}`),
      api.get(`/api/expenses?from=${finFrom}&to=${finTo}`),
    ]);
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  el.innerHTML = `
    <!-- Filtre & Aksiyon Barı -->
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div class="flex gap-sm wrap items-center">
          <span style="font-weight:600;font-size:.86rem">Mali Dönem:</span>
          <input class="input" type="date" id="fnFrom" value="${finFrom}" style="max-width:150px">
          <span class="muted">→</span>
          <input class="input" type="date" id="fnTo" value="${finTo}" style="max-width:150px">
          <button class="btn btn-primary btn-sm" id="fnApply">Listele</button>
        </div>
        <div class="flex gap-sm wrap">
          <button class="btn btn-gold btn-sm" id="fnAddExpense">
            <span class="ico">+</span> Yeni Gider Kalemi Ekle
          </button>
        </div>
      </div>
    </div>

    <!-- Finansal İstatistikler -->
    <div class="stat-tiles mb">
      <div class="stat-tile">
        <div class="st-l">Toplam Gelir (Ciro)</div>
        <div class="st-v" style="color:var(--ok)">${money(finData.totalRevenue)}</div>
      </div>
      <div class="stat-tile">
        <div class="st-l">Toplam İşletme Gideri</div>
        <div class="st-v" style="color:var(--danger)">${money(finData.totalExpense)}</div>
      </div>
      <div class="stat-tile">
        <div class="st-l">Net Faaliyet Kârı / Zarar</div>
        <div class="st-v" style="${finData.netProfit >= 0 ? 'color:var(--ok)' : 'color:var(--danger)'}">
          ${money(finData.netProfit)}
        </div>
      </div>
      <div class="stat-tile">
        <div class="st-l">Dönem Tahsilatı (Nakit/Banka)</div>
        <div class="st-v" style="color:var(--gold-ink)">${money(finData.totalPayments)}</div>
      </div>
    </div>

    <!-- Gün-Gün Finansal Çizelge -->
    <div class="card mb">
      <div class="card-head flex between items-center">
        <div>
          <h3>Gün-Gün Gelir & Gider Tablosu</h3>
          <span class="card-sub">Günlük oda satışı, ekstra adisyon gelirleri, gider kalemleri ve net kâr/zarar</span>
        </div>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl table-compact">
          <thead>
            <tr>
              <th>Tarih</th>
              <th class="t-right">Oda Geliri</th>
              <th class="t-right">Ekstra / F&B</th>
              <th class="t-right">Konaklama Vergisi</th>
              <th class="t-right">Toplam Gelir</th>
              <th class="t-right">İşletme Gideri</th>
              <th class="t-right">Net Kâr / Zarar</th>
              <th class="t-right">Kasa/Banka Tahsilatı</th>
              <th class="t-center">Gider Kalemi</th>
            </tr>
          </thead>
          <tbody>
            ${finData.days.length ? finData.days.map((d) => {
              const profitClass = d.netProfit >= 0 ? 'rep-profit' : 'rep-loss';
              return `
                <tr>
                  <td><b>${fmtDate(d.date)}</b></td>
                  <td class="t-right">${money(d.roomRevenue)}</td>
                  <td class="t-right muted">${money(d.extraRevenue)}</td>
                  <td class="t-right muted">${money(d.taxRevenue)}</td>
                  <td class="t-right t-strong">${money(d.totalRevenue)}</td>
                  <td class="t-right" style="color:var(--danger)">${money(d.totalExpense)}</td>
                  <td class="t-right ${profitClass}">${money(d.netProfit)}</td>
                  <td class="t-right" style="color:var(--gold-ink)">${money(d.paymentsCollected)}</td>
                  <td class="t-center">
                    ${d.expenseCount > 0
                      ? `<span class="rep-pill red" title="${d.expenses.map(e => e.category + ': ' + money(e.amount)).join(', ')}">${d.expenseCount} adet</span>`
                      : '<span class="muted">—</span>'}
                  </td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="9" class="muted t-center">Kayıt yok.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Gider Kalemleri Dökümü & Dağılım -->
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head flex between items-center">
          <h3>Gider Kalemleri Listesi</h3>
          <span class="card-sub">${expensesList.length} kayıt</span>
        </div>
        <div class="card-pad table-wrap" style="max-height:420px;overflow-y:auto">
          <table class="tbl table-compact">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kategori</th>
                <th>Açıklama</th>
                <th class="t-right">Tutar</th>
                <th>Ödeme</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${expensesList.length ? expensesList.map((e) => `
                <tr>
                  <td style="white-space:nowrap">${fmtDateShort(e.date)}</td>
                  <td><span class="rep-pill red">${escapeHtml(e.category)}</span></td>
                  <td>
                    <div>${escapeHtml(e.description || '—')}</div>
                    ${e.invoiceNo ? `<span class="muted" style="font-size:.72rem">Belge No: ${escapeHtml(e.invoiceNo)}</span>` : ''}
                  </td>
                  <td class="t-right t-strong" style="color:var(--danger)">${money(e.amount)}</td>
                  <td><span class="muted" style="font-size:.75rem">${escapeHtml(e.paymentMethod === 'bank' ? 'Banka/Havale' : (e.paymentMethod === 'card' ? 'Kredi Kartı' : 'Nakit/Kasa'))}</span></td>
                  <td class="t-right">
                    <button class="btn btn-outline btn-sm text-danger" data-delexp="${e.id}" title="Gideri Sil">✕</button>
                  </td>
                </tr>
              `).join('') : '<tr><td colspan="6" class="muted t-center">Bu dönemde kaydedilmiş gider yok.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Kategori Bazlı Gider Dağılımı</h3>
          <span class="card-sub">maliyet merkezleri</span>
        </div>
        <div class="card-pad">
          ${finData.categoryBreakdown.length ? finData.categoryBreakdown.map((c) => `
            <div class="bar-row">
              <div class="bl" style="min-width:140px"><b>${escapeHtml(c.category)}</b> (%${c.pct})</div>
              <div class="bar-track"><i style="width:${Math.max(4, c.pct)}%;background:var(--danger)"></i></div>
              <div class="bv" style="color:var(--danger)">${money(c.amount)}</div>
            </div>
          `).join('') : emptyState('📊', 'Henüz gider kalemi işlenmemiş.')}
          <div class="folio-total-row grand" style="margin-top:20px">
            <span>Toplam Dönem Gideri</span>
            <span style="color:var(--danger)">${money(finData.totalExpense)}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Olay Dinleyicileri
  el.querySelector('#fnApply').addEventListener('click', () => {
    finFrom = el.querySelector('#fnFrom').value;
    finTo = el.querySelector('#fnTo').value;
    renderFinancialTab(el, ctx);
  });

  el.querySelector('#fnAddExpense').addEventListener('click', () => {
    showAddExpenseModal(el, ctx);
  });

  el.querySelectorAll('[data-delexp]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delexp;
      if (!confirm('Bu gider kaydını silmek istediğinizden emin misiniz?')) return;
      try {
        await api.del(`/api/expenses/${id}`);
        toast('Gider kaydı başarıyla silindi.', 'ok');
        renderFinancialTab(el, ctx);
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  });
}

function showAddExpenseModal(el, ctx) {
  const modalBody = `
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Gider Tarihi *</label>
        <input class="input" type="date" id="meDate" value="${ctx.businessDate || today()}">
      </div>
      <div>
        <label class="label">Kategori *</label>
        <select class="input" id="meCat">
          <option value="Personel">Personel Maaş & Prim</option>
          <option value="Mutfak / F&B">Mutfak & F&B Tedariği</option>
          <option value="Enerji">Enerji (Elektrik, Su, Doğalgaz)</option>
          <option value="Temizlik">Temizlik & Buklet Malzemeleri</option>
          <option value="Bakım & Onarım">Bakım & Onarım (Teknik Servis)</option>
          <option value="Sabit Giderler">Sabit Giderler (Kira, Yazılım)</option>
          <option value="Pazarlama">Pazarlama & Komisyon</option>
          <option value="Vergi & Harç">Vergi & Yasal Harçlar</option>
          <option value="Diğer">Diğer İşletme Gideri</option>
        </select>
      </div>
    </div>
    <div class="mb">
      <label class="label">Gider Açıklaması / Detay *</label>
      <input class="input" type="text" id="meDesc" placeholder="Örn: Metro Grossmarket haftalık peynir ve şarküteri alımı">
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Tutar (₺) *</label>
        <input class="input" type="number" id="meAmount" min="0" step="0.01" placeholder="0.00">
      </div>
      <div>
        <label class="label">Ödeme Yöntemi</label>
        <select class="input" id="meMethod">
          <option value="bank">Banka Transferi / Havale</option>
          <option value="card">Şirket Kredi Kartı</option>
          <option value="cash">Nakit (Kasa Çıkışı)</option>
        </select>
      </div>
    </div>
    <div class="mb">
      <label class="label">Fatura / Fiş No</label>
      <input class="input" type="text" id="meInvoice" placeholder="Örn: FTR-2026-0912">
    </div>
  `;

  openModal({
    title: 'Yeni İşletme Gideri İşle',
    body: modalBody,
    footer: `
      <button class="btn btn-outline" data-close>İptal</button>
      <button class="btn btn-gold" id="meSubmit">Gideri Kaydet</button>
    `,
  });

  document.getElementById('meSubmit').addEventListener('click', async () => {
    const date = document.getElementById('meDate').value;
    const category = document.getElementById('meCat').value;
    const description = document.getElementById('meDesc').value.trim();
    const amount = Number(document.getElementById('meAmount').value);
    const paymentMethod = document.getElementById('meMethod').value;
    const invoiceNo = document.getElementById('meInvoice').value.trim();

    if (!date || !amount || amount <= 0) {
      toast('Lütfen geçerli bir tarih ve tutar girin.', 'warn');
      return;
    }
    if (!description) {
      toast('Lütfen gider açıklamasını girin.', 'warn');
      return;
    }

    try {
      await api.post('/api/expenses', { date, category, description, amount, paymentMethod, invoiceNo });
      toast('Gider kalemi başarıyla kaydedildi.', 'ok');
      document.querySelector('[data-close]').click();
      renderFinancialTab(el, ctx);
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

// =========================================================================
// 4) AYLIK ODA BAKİYELERİ
// =========================================================================
async function renderRoomBalancesTab(el, ctx) {
  let data;
  try {
    data = await api.get(`/api/reports/monthly-balances?month=${balancesMonth}`);
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  let list = data.rooms;
  if (balancesFilter === 'debt') {
    list = list.filter((r) => r.hasBalance);
  } else if (balancesFilter === 'paid') {
    list = list.filter((r) => !r.hasBalance);
  }

  if (balancesSearch.trim()) {
    const q = balancesSearch.toLowerCase().trim();
    list = list.filter((r) =>
      r.guestName.toLowerCase().includes(q) ||
      r.roomNumber.toLowerCase().includes(q) ||
      r.code.toLowerCase().includes(q)
    );
  }

  el.innerHTML = `
    <!-- Filtre Barı -->
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div class="flex gap-sm wrap items-center">
          <label style="font-weight:600;font-size:.88rem">İncelenen Ay:</label>
          <input class="input" type="month" id="rbMonth" value="${balancesMonth}" style="max-width:180px">
          <button class="btn btn-primary btn-sm" id="rbApply">Getir</button>
        </div>

        <div class="segment">
          <button class="${balancesFilter === 'all' ? 'active' : ''}" data-rbfilter="all">Tüm Odalar (${data.totalCount})</button>
          <button class="${balancesFilter === 'debt' ? 'active' : ''}" data-rbfilter="debt">🔴 Borcu Kalanlar (${data.roomsWithBalanceCount})</button>
          <button class="${balancesFilter === 'paid' ? 'active' : ''}" data-rbfilter="paid">🟢 Kapanmış (0 Bakiye)</button>
        </div>

        <div style="min-width:200px">
          <input class="input" type="search" id="rbSearch" placeholder="Oda no, misafir ara..." value="${escapeHtml(balancesSearch)}">
        </div>
      </div>
    </div>

    <!-- İstatistik Kartları -->
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Toplam Tahakkuk (Harcamalar)</div><div class="st-v">${money(data.totalCharges)}</div></div>
      <div class="stat-tile"><div class="st-l">Toplam Tahsil Edilen</div><div class="st-v" style="color:var(--ok)">${money(data.totalPaid)}</div></div>
      <div class="stat-tile"><div class="st-l">Kalan Açık Bakiye (Alacak)</div><div class="st-v" style="color:var(--danger)">${money(data.totalBalance)}</div></div>
      <div class="stat-tile"><div class="st-l">Bakiyesi Açık Oda Sayısı</div><div class="st-v" style="color:var(--danger)">${data.roomsWithBalanceCount} oda</div></div>
    </div>

    <!-- Oda Bakiyeleri Tablosu -->
    <div class="card">
      <div class="card-head flex between items-center">
        <div>
          <h3>${balancesMonth} Dönemi Oda Bazlı Bakiye Tablosu</h3>
          <span class="card-sub">${list.length} oda/rezervasyon listeleniyor</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.print()">🖨️ Yazdır</button>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl table-compact">
          <thead>
            <tr>
              <th>Oda No</th>
              <th>Oda Tipi</th>
              <th>Misafir Adı</th>
              <th>Rez. Kodu</th>
              <th>Konaklama Tarihleri</th>
              <th class="t-right">Toplam Harcama (Borç)</th>
              <th class="t-right">Tahsilat (Ödenen)</th>
              <th class="t-right">Kalan Bakiye</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map((r) => {
              const hasDebt = r.hasBalance;
              return `
                <tr>
                  <td><b>${escapeHtml(r.roomNumber)}</b> <span class="muted" style="font-size:.72rem">(${escapeHtml(r.roomBlock || '')})</span></td>
                  <td>${escapeHtml(r.roomTypeName)}</td>
                  <td>
                    <b>${escapeHtml(r.guestName)}</b>
                    ${r.guestPhone ? `<div class="muted" style="font-size:.72rem">${escapeHtml(r.guestPhone)}</div>` : ''}
                  </td>
                  <td class="mono">${escapeHtml(r.code)}</td>
                  <td style="white-space:nowrap">${fmtDateShort(r.checkIn)} → ${fmtDateShort(r.checkOut)}</td>
                  <td class="t-right t-strong">${money(r.charges)}</td>
                  <td class="t-right" style="color:var(--ok)">${money(r.paid)}</td>
                  <td class="t-right" style="font-weight:700;color:${hasDebt ? 'var(--danger)' : 'var(--ok)'}">${money(r.balance)}</td>
                  <td>
                    ${hasDebt
                      ? badge(`Açık Bakiye: ${money(r.balance)}`, 'b-danger')
                      : badge('Bakiye Sıfır', 'b-ok')}
                  </td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="9" class="muted t-center" style="padding:24px">Kayıt bulunamadı.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  el.querySelector('#rbApply').addEventListener('click', () => {
    balancesMonth = el.querySelector('#rbMonth').value;
    renderRoomBalancesTab(el, ctx);
  });
  el.querySelectorAll('[data-rbfilter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      balancesFilter = btn.dataset.rbfilter;
      renderRoomBalancesTab(el, ctx);
    });
  });
  el.querySelector('#rbSearch').addEventListener('input', (e) => {
    balancesSearch = e.target.value;
    renderRoomBalancesTab(el, ctx);
  });
}

// =========================================================================
// 5) AYLIK VE YILLIK TESİS RAPORU
// =========================================================================
async function renderFacilityTab(el, ctx) {
  let data;
  try {
    data = await api.get(`/api/reports/facility?year=${facYear}&mode=${facMode}`);
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  el.innerHTML = `
    <!-- Seçim Barı -->
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div class="segment">
          <button class="${facMode === 'monthly' ? 'active' : ''}" data-facmode="monthly">📅 Aylık Tesis Raporu (12 Ay)</button>
          <button class="${facMode === 'yearly' ? 'active' : ''}" data-facmode="yearly">📈 Yıllık Karşılaştırma</button>
        </div>

        <div class="flex gap-sm items-center">
          <label style="font-weight:600;font-size:.88rem">Yıl:</label>
          <select class="input" id="fcYearSelect" style="max-width:130px">
            ${[2024, 2025, 2026, 2027].map((y) => `<option value="${y}" ${y === facYear ? 'selected' : ''}>${y} Yılı</option>`).join('')}
          </select>
          <button class="btn btn-outline btn-sm" onclick="window.print()">🖨️ Yazdır</button>
        </div>
      </div>
    </div>

    ${facMode === 'monthly' ? renderFacilityMonthlyView(data) : renderFacilityYearlyView(data)}
  `;

  el.querySelectorAll('[data-facmode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      facMode = btn.dataset.facmode;
      renderFacilityTab(el, ctx);
    });
  });
  el.querySelector('#fcYearSelect').addEventListener('change', (e) => {
    facYear = Number(e.target.value);
    renderFacilityTab(el, ctx);
  });
}

function renderFacilityMonthlyView(data) {
  const sum = data.summary;
  return `
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Yıllık Ort. Doluluk</div><div class="st-v">%${sum.avgOccupancy}</div></div>
      <div class="stat-tile"><div class="st-l">Yıllık ADR</div><div class="st-v">${money(sum.adr)}</div></div>
      <div class="stat-tile"><div class="st-l">Yıllık RevPAR</div><div class="st-v">${money(sum.revpar)}</div></div>
      <div class="stat-tile"><div class="st-l">Toplam Oda Geliri</div><div class="st-v">${money(sum.totalRoomRevenue)}</div></div>
      <div class="stat-tile"><div class="st-l">Grand Total Ciro</div><div class="st-v" style="color:var(--gold-ink)">${money(sum.grandTotalRevenue)}</div></div>
    </div>

    <div class="card">
      <div class="card-head flex between items-center">
        <h3>${data.year} Yılı Aylık Tesis Performans Çizelgesi</h3>
        <span class="card-sub">62 Oda Tam Kapasite</span>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl table-compact">
          <thead>
            <tr>
              <th>Ay</th>
              <th class="t-right">Kapasite (Oda-Gece)</th>
              <th class="t-right">Satılan Oda-Gece</th>
              <th class="t-right">Doluluk (%)</th>
              <th class="t-right">ADR</th>
              <th class="t-right">RevPAR</th>
              <th class="t-right">Oda Geliri</th>
              <th class="t-right">Ekstra Gelir</th>
              <th class="t-right">Konaklama Vergisi (%2)</th>
              <th class="t-right">Toplam KDV</th>
              <th class="t-right">Toplam Tesis Cirosu</th>
            </tr>
          </thead>
          <tbody>
            ${data.months.map((m) => `
              <tr>
                <td><b>${m.monthName}</b> <span class="muted" style="font-size:.74rem">(${m.daysInMonth} gün)</span></td>
                <td class="t-right muted">${m.capacity}</td>
                <td class="t-right t-strong">${m.soldNights}</td>
                <td class="t-right">
                  <b>%${m.occupancyPct}</b>
                  <div style="width:60px;height:4px;background:var(--line);border-radius:2px;display:inline-block;margin-left:6px;vertical-align:middle">
                    <div style="width:${Math.min(100, m.occupancyPct)}%;height:100%;background:var(--gold);border-radius:2px"></div>
                  </div>
                </td>
                <td class="t-right">${money(m.adr)}</td>
                <td class="t-right">${money(m.revpar)}</td>
                <td class="t-right">${money(m.roomRevenue)}</td>
                <td class="t-right muted">${money(m.extraRevenue)}</td>
                <td class="t-right muted">${money(m.taxAccommodation)}</td>
                <td class="t-right muted">${money(m.taxKdv)}</td>
                <td class="t-right t-strong" style="color:var(--ok)">${money(m.totalRevenue)}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot style="background:var(--ivory-dim);font-weight:700">
            <tr>
              <td>YILLIK TOPLAM / ORTALAMA</td>
              <td class="t-right">${sum.capacity}</td>
              <td class="t-right">${sum.soldNights}</td>
              <td class="t-right">%${sum.avgOccupancy}</td>
              <td class="t-right">${money(sum.adr)}</td>
              <td class="t-right">${money(sum.revpar)}</td>
              <td class="t-right">${money(sum.totalRoomRevenue)}</td>
              <td class="t-right">${money(sum.totalExtraRevenue)}</td>
              <td class="t-right">${money(sum.totalTaxAccommodation)}</td>
              <td class="t-right">${money(sum.totalTaxKdv)}</td>
              <td class="t-right" style="color:var(--ok)">${money(sum.grandTotalRevenue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function renderFacilityYearlyView(data) {
  return `
    <div class="card">
      <div class="card-head">
        <h3>Yıllara Göre Tesis Performans Karşılaştırması</h3>
        <span class="card-sub">Yıllık büyüme ve operasyonel verimlilik trendleri</span>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Yıl</th>
              <th class="t-right">Yıllık Kapasite</th>
              <th class="t-right">Satılan Oda-Gece</th>
              <th class="t-right">Ort. Doluluk (%)</th>
              <th class="t-right">Ortalama ADR</th>
              <th class="t-right">RevPAR</th>
              <th class="t-right">Oda Geliri</th>
              <th class="t-right">Ekstra Gelir</th>
              <th class="t-right">Konaklama Vergisi</th>
              <th class="t-right">Toplam Ciro</th>
            </tr>
          </thead>
          <tbody>
            ${data.years.map((y) => `
              <tr style="${y.year === data.currentYear ? 'background:rgba(79,70,229,.05);font-weight:600' : ''}">
                <td><b style="font-size:1.05rem">${y.year}</b> ${y.year === data.currentYear ? '<span class="rep-pill blue">Aktif Yıl</span>' : ''}</td>
                <td class="t-right muted">${y.capacity}</td>
                <td class="t-right t-strong">${y.soldNights}</td>
                <td class="t-right"><b>%${y.occupancyPct}</b></td>
                <td class="t-right">${money(y.adr)}</td>
                <td class="t-right">${money(y.revpar)}</td>
                <td class="t-right">${money(y.roomRevenue)}</td>
                <td class="t-right muted">${money(y.extraRevenue)}</td>
                <td class="t-right muted">${money(y.taxAccommodation)}</td>
                <td class="t-right t-strong" style="color:var(--ok);font-size:1rem">${money(y.totalRevenue)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// =========================================================================
// 6) KARA LİSTE RAPORU & İŞLEMLERİ
// =========================================================================
async function renderBlacklistTab(el, ctx) {
  let list;
  try {
    list = await api.get('/api/reports/blacklist');
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  if (blacklistSearch.trim()) {
    const q = blacklistSearch.toLowerCase().trim();
    list = list.filter((g) =>
      g.name.toLowerCase().includes(q) ||
      (g.idNumber && g.idNumber.includes(q)) ||
      (g.phone && g.phone.includes(q)) ||
      (g.blacklistReason && g.blacklistReason.toLowerCase().includes(q))
    );
  }

  el.innerHTML = `
    <!-- Üst Kontrol Barı -->
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div style="flex:1;min-width:240px;max-width:400px">
          <input class="input" type="search" id="blSearch" placeholder="İsim, kimlik no, sebep ara..." value="${escapeHtml(blacklistSearch)}">
        </div>
        <div>
          <button class="btn btn-danger btn-sm" id="blAddNew">
            <span class="ico">+</span> Kara Listeye Yeni Kişi Ekle
          </button>
        </div>
      </div>
    </div>

    <!-- İstatistik Kartları -->
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Toplam Kara Liste Kaydı</div><div class="st-v" style="color:var(--danger)">${list.length} kişi</div></div>
      <div class="stat-tile"><div class="st-l">Rezervasyon Engeli</div><div class="st-v">Aktif Korumalı</div></div>
      <div class="stat-tile"><div class="st-l">Resepsiyon Uyarısı</div><div class="st-v" style="color:var(--ok)">Açık</div></div>
    </div>

    <!-- Kara Liste Tablosu -->
    <div class="card">
      <div class="card-head flex between items-center">
        <div>
          <h3>Kara Liste Misafir Kayıtları</h3>
          <span class="card-sub">Otel kurallarını ihlal eden, hasar bırakan veya güvenlik riski taşıyan misafirler</span>
        </div>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Adı Soyadı</th>
              <th>Kimlik / Pasaport No</th>
              <th>Uyruk</th>
              <th>İletişim</th>
              <th>Kara Listeye Alınma Tarihi</th>
              <th>Gerekçe / Açıklama</th>
              <th>İşlemi Yapan</th>
              <th>Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            ${list.length ? list.map((g) => `
              <tr>
                <td>
                  <b style="color:var(--danger)">${escapeHtml(g.name)}</b>
                  <div style="font-size:.72rem" class="muted">ID: ${g.id}</div>
                </td>
                <td class="mono">${escapeHtml(g.idNumber || '—')}</td>
                <td><span class="rep-pill blue">${escapeHtml(g.nationality || 'TR')}</span></td>
                <td>
                  <div>${escapeHtml(g.phone || '—')}</div>
                  <div class="muted" style="font-size:.74rem">${escapeHtml(g.email || '')}</div>
                </td>
                <td><span class="mono" style="font-size:.82rem">${fmtDate(g.blacklistDate)}</span></td>
                <td style="max-width:280px">
                  <span class="text-danger" style="font-size:.85rem;line-height:1.4;display:inline-block">${escapeHtml(g.blacklistReason || 'Gerekçe belirtilmemiş')}</span>
                </td>
                <td><span class="muted" style="font-size:.8rem">${escapeHtml(g.blacklistedBy || 'Yetkili')}</span></td>
                <td>
                  <button class="btn btn-outline btn-sm text-ok" data-removebl="${g.id}">
                    Kara Listeden Çıkar
                  </button>
                </td>
              </tr>
            `).join('') : '<tr><td colspan="8" class="muted t-center" style="padding:28px">Kara listede kayıtlı misafir bulunmuyor.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  el.querySelector('#blSearch').addEventListener('input', (e) => {
    blacklistSearch = e.target.value;
    renderBlacklistTab(el, ctx);
  });

  el.querySelector('#blAddNew').addEventListener('click', () => {
    showAddBlacklistModal(el, ctx);
  });

  el.querySelectorAll('[data-removebl]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.removebl;
      if (!confirm('Bu misafiri kara listeden çıkarmak istediğinizden emin misiniz?')) return;
      try {
        await api.post(`/api/guests/${id}/blacklist`, { blacklist: false });
        toast('Misafir başarıyla kara listeden çıkarıldı.', 'ok');
        renderBlacklistTab(el, ctx);
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  });
}

function showAddBlacklistModal(el, ctx) {
  const modalBody = `
    <div class="mb">
      <label class="label">Misafir Adı ve Soyadı *</label>
      <input class="input" type="text" id="blName" placeholder="Örn: Mehmet Yıldırım">
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">TC Kimlik / Pasaport No</label>
        <input class="input" type="text" id="blIdNum" placeholder="11 haneli TC veya Pasaport">
      </div>
      <div>
        <label class="label">Uyruk</label>
        <input class="input" type="text" id="blNation" value="TR">
      </div>
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Telefon Numarası</label>
        <input class="input" type="text" id="blPhone" placeholder="+90 5xx xxx xx xx">
      </div>
      <div>
        <label class="label">E-posta</label>
        <input class="input" type="email" id="blEmail" placeholder="ornek@eposta.com">
      </div>
    </div>
    <div class="mb">
      <label class="label">Kara Listeye Alınma Tarihi</label>
      <input class="input" type="date" id="blDate" value="${ctx.businessDate || today()}">
    </div>
    <div class="mb">
      <label class="label">Kara Listeye Alınma Gerekçesi *</label>
      <textarea class="input" id="blReason" rows="3" placeholder="Otel kurallarına aykırı davranış, hasar, ödeme problemi veya güvenlik sebebi..."></textarea>
    </div>
  `;

  openModal({
    title: 'Kara Listeye Misafir Ekle',
    body: modalBody,
    footer: `
      <button class="btn btn-outline" data-close>İptal</button>
      <button class="btn btn-danger" id="blSubmit">Kara Listeye Kaydet</button>
    `,
  });

  document.getElementById('blSubmit').addEventListener('click', async () => {
    const name = document.getElementById('blName').value.trim();
    const idNumber = document.getElementById('blIdNum').value.trim();
    const nationality = document.getElementById('blNation').value.trim() || 'TR';
    const phone = document.getElementById('blPhone').value.trim();
    const email = document.getElementById('blEmail').value.trim();
    const date = document.getElementById('blDate').value;
    const reason = document.getElementById('blReason').value.trim();

    if (!name) {
      toast('Lütfen misafir adını girin.', 'warn');
      return;
    }
    if (!reason) {
      toast('Lütfen kara listeye alınma gerekçesini yazın.', 'warn');
      return;
    }

    try {
      await api.post('/api/guests/blacklist/new', { name, idNumber, nationality, phone, email, date, reason });
      toast('Misafir başarıyla kara listeye kaydedildi.', 'ok');
      document.querySelector('[data-close]').click();
      renderBlacklistTab(el, ctx);
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

// =========================================================================
// 7) KURUMSAL SATIŞ (CARİ HESAPLAR & ACENTELER)
// =========================================================================
async function renderCorporateTab(el, ctx) {
  let data;
  try {
    data = await api.get(`/api/reports/corporate-sales?year=${facYear}&month=${corpMonth}`);
  } catch (e) {
    el.innerHTML = emptyState('⚠️', e.message);
    return;
  }

  let records = data.records;
  if (corpTypeFilter === 'agency') {
    records = records.filter((r) => r.accountType === 'agency');
  } else if (corpTypeFilter === 'corporate') {
    records = records.filter((r) => r.accountType === 'corporate');
  }

  el.innerHTML = `
    <!-- Kontrol Barı -->
    <div class="card mb">
      <div class="card-pad flex between wrap gap-md items-center">
        <div class="flex gap-sm wrap items-center">
          <label style="font-weight:600;font-size:.88rem">Dönem / Ay:</label>
          <input class="input" type="month" id="cpMonth" value="${corpMonth}" style="max-width:170px" placeholder="Tüm Aylar">
          <button class="btn btn-primary btn-sm" id="cpApply">Filtrele</button>
          ${corpMonth ? '<button class="btn btn-outline btn-sm" id="cpClearMonth">Tüm Ayları Göster</button>' : ''}
        </div>

        <div class="segment">
          <button class="${corpTypeFilter === 'all' ? 'active' : ''}" data-cptype="all">Tüm Cari Hesaplar</button>
          <button class="${corpTypeFilter === 'agency' ? 'active' : ''}" data-cptype="agency">Acenteler (OTA)</button>
          <button class="${corpTypeFilter === 'corporate' ? 'active' : ''}" data-cptype="corporate">Kurumsal Şirketler</button>
        </div>

        <div>
          <button class="btn btn-gold btn-sm" id="cpAddNew">
            <span class="ico">+</span> Yeni Cari Hesap Tanımla
          </button>
        </div>
      </div>
    </div>

    <!-- İstatistik Kartları -->
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Toplam Üretim / Fatura</div><div class="st-v">${money(data.totalProduction)}</div></div>
      <div class="stat-tile"><div class="st-l">Alınan Tahsilat</div><div class="st-v" style="color:var(--ok)">${money(data.totalPaid)}</div></div>
      <div class="stat-tile"><div class="st-l">Kalan Cari Bakiye (Alacak)</div><div class="st-v" style="color:var(--danger)">${money(data.totalBalance)}</div></div>
      <div class="stat-tile"><div class="st-l">Ödeme Bekleyen Kurum</div><div class="st-v" style="color:var(--warn)">${data.pendingAccountsCount} kurum</div></div>
    </div>

    <!-- Kurumsal Satış & Cari Hesap Tablosu -->
    <div class="card">
      <div class="card-head flex between items-center">
        <div>
          <h3>Acente & Kurumsal Cari Hesap Bakiyeleri (Ay-Ay)</h3>
          <span class="card-sub">${records.length} hareket listeleniyor</span>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.print()">🖨️ Yazdır</button>
      </div>
      <div class="card-pad table-wrap">
        <table class="tbl table-compact">
          <thead>
            <tr>
              <th>Cari Hesap / Firma Adı</th>
              <th>Tür</th>
              <th>Dönem (Ay)</th>
              <th class="t-center">Rez. / Oda-Gece</th>
              <th class="t-right">Üretim / Fatura</th>
              <th class="t-right">Alınan Ödeme</th>
              <th class="t-right">Kalan Cari Bakiye</th>
              <th>Ödeme Durumu</th>
              <th>Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            ${records.length ? records.map((r) => {
              let statusBadge = '';
              if (r.paymentStatus === 'paid') {
                statusBadge = badge('🟢 Ödeme Alındı', 'b-ok');
              } else if (r.paymentStatus === 'partial') {
                statusBadge = badge('🟡 Kısmi Ödeme', 'b-warn');
              } else if (r.paymentStatus === 'pending') {
                statusBadge = badge('🔴 Ödeme Bekliyor', 'b-danger');
              } else {
                statusBadge = badge('— İşlem Yok', 'b-muted');
              }

              const typeBadge = r.accountType === 'agency'
                ? '<span class="rep-pill blue">Acente (OTA)</span>'
                : '<span class="rep-pill green">Kurumsal Şirket</span>';

              return `
                <tr>
                  <td>
                    <b>${escapeHtml(r.accountName)}</b>
                    <div class="muted" style="font-size:.72rem">Vergi No: ${escapeHtml(r.taxNumber)}</div>
                  </td>
                  <td>${typeBadge}</td>
                  <td><span class="mono" style="font-weight:700">${escapeHtml(r.month)}</span></td>
                  <td class="t-center">
                    <b>${r.reservationCount}</b> rez <span class="muted">(${r.roomNights} gece)</span>
                  </td>
                  <td class="t-right t-strong">${money(r.production)}</td>
                  <td class="t-right" style="color:var(--ok)">${money(r.paid)}</td>
                  <td class="t-right" style="font-weight:700;color:${r.balance > 0.05 ? 'var(--danger)' : 'var(--ok)'}">
                    ${money(r.balance)}
                  </td>
                  <td>${statusBadge}</td>
                  <td>
                    ${r.balance > 0.05 ? `
                      <button class="btn btn-outline btn-sm" data-paycorp="${r.accountId}" data-corpname="${escapeHtml(r.accountName)}" data-corpmonth="${r.month}" data-bal="${r.balance}">
                        💵 Tahsilat Gir
                      </button>
                    ` : '<span class="muted" style="font-size:.75rem">Kapandı</span>'}
                  </td>
                </tr>
              `;
            }).join('') : '<tr><td colspan="9" class="muted t-center" style="padding:28px">Kayıtlı cari işlem bulunamadı.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  el.querySelector('#cpApply').addEventListener('click', () => {
    corpMonth = el.querySelector('#cpMonth').value;
    renderCorporateTab(el, ctx);
  });
  if (el.querySelector('#cpClearMonth')) {
    el.querySelector('#cpClearMonth').addEventListener('click', () => {
      corpMonth = '';
      renderCorporateTab(el, ctx);
    });
  }
  el.querySelectorAll('[data-cptype]').forEach((btn) => {
    btn.addEventListener('click', () => {
      corpTypeFilter = btn.dataset.cptype;
      renderCorporateTab(el, ctx);
    });
  });

  el.querySelector('#cpAddNew').addEventListener('click', () => {
    showAddCorporateModal(el, ctx);
  });

  el.querySelectorAll('[data-paycorp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const accountId = btn.dataset.paycorp;
      const accountName = btn.dataset.corpname;
      const month = btn.dataset.corpmonth;
      const balance = Number(btn.dataset.bal);
      showCorporatePaymentModal(el, ctx, { accountId, accountName, month, balance });
    });
  });
}

function showAddCorporateModal(el, ctx) {
  const modalBody = `
    <div class="mb">
      <label class="label">Firma / Acente Adı *</label>
      <input class="input" type="text" id="caName" placeholder="Örn: Türk Telekom A.Ş. veya Jolly Tur">
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Hesap Türü</label>
        <select class="input" id="caType">
          <option value="corporate">Kurumsal Şirket</option>
          <option value="agency">Acente / Tur Operatörü</option>
        </select>
      </div>
      <div>
        <label class="label">Cari Kod</label>
        <input class="input" type="text" id="caCode" placeholder="Örn: CORP-TT">
      </div>
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Vergi Dairesi</label>
        <input class="input" type="text" id="caTaxOffice" placeholder="Örn: Büyük Mükellefler">
      </div>
      <div>
        <label class="label">Vergi Numarası</label>
        <input class="input" type="text" id="caTaxNo" placeholder="10 haneli VKN">
      </div>
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">İletişim Yetkilisi</label>
        <input class="input" type="text" id="caPerson" placeholder="Ad Soyad">
      </div>
      <div>
        <label class="label">Telefon</label>
        <input class="input" type="text" id="caPhone" placeholder="+90 212 ...">
      </div>
    </div>
  `;

  openModal({
    title: 'Yeni Cari Hesap (Acente / Kurumsal) Ekle',
    body: modalBody,
    footer: `
      <button class="btn btn-outline" data-close>İptal</button>
      <button class="btn btn-gold" id="caSubmit">Hesabı Oluştur</button>
    `,
  });

  document.getElementById('caSubmit').addEventListener('click', async () => {
    const name = document.getElementById('caName').value.trim();
    const type = document.getElementById('caType').value;
    const code = document.getElementById('caCode').value.trim();
    const taxOffice = document.getElementById('caTaxOffice').value.trim();
    const taxNumber = document.getElementById('caTaxNo').value.trim();
    const contactPerson = document.getElementById('caPerson').value.trim();
    const phone = document.getElementById('caPhone').value.trim();

    if (!name) {
      toast('Lütfen firma / acente adını girin.', 'warn');
      return;
    }

    try {
      await api.post('/api/corporate-accounts', { name, type, code, taxOffice, taxNumber, contactPerson, phone });
      toast('Cari hesap başarıyla oluşturuldu.', 'ok');
      document.querySelector('[data-close]').click();
      renderCorporateTab(el, ctx);
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}

function showCorporatePaymentModal(el, ctx, { accountId, accountName, month, balance }) {
  const modalBody = `
    <div class="mb">
      <div style="font-size:1.02rem;font-weight:700">${escapeHtml(accountName)}</div>
      <div class="muted" style="font-size:.84rem">Dönem: <b>${escapeHtml(month)}</b> &bull; Kalan Açık Bakiye: <b style="color:var(--danger)">${money(balance)}</b></div>
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Tahsilat Tarihi *</label>
        <input class="input" type="date" id="cpDate" value="${ctx.businessDate || today()}">
      </div>
      <div>
        <label class="label">Tahsil Edilen Tutar (₺) *</label>
        <input class="input" type="number" id="cpAmount" min="0" step="0.01" value="${balance}">
      </div>
    </div>
    <div class="grid cols-2 gap-sm mb">
      <div>
        <label class="label">Ödeme Yöntemi</label>
        <select class="input" id="cpMethod">
          <option value="bank">Banka Transferi / Havale</option>
          <option value="card">Sanal POS / Kredi Kartı</option>
          <option value="cash">Nakit Tahsilat</option>
        </select>
      </div>
      <div>
        <label class="label">Dekont / İşlem Referans No</label>
        <input class="input" type="text" id="cpRef" placeholder="Örn: DKT-881239">
      </div>
    </div>
  `;

  openModal({
    title: 'Cari Hesap Tahsilatı İşle',
    body: modalBody,
    footer: `
      <button class="btn btn-outline" data-close>İptal</button>
      <button class="btn btn-gold" id="cpSubmit">Tahsilatı Onayla</button>
    `,
  });

  document.getElementById('cpSubmit').addEventListener('click', async () => {
    const date = document.getElementById('cpDate').value;
    const amount = Number(document.getElementById('cpAmount').value);
    const method = document.getElementById('cpMethod').value;
    const reference = document.getElementById('cpRef').value.trim();

    if (!amount || amount <= 0) {
      toast('Lütfen geçerli bir tutar girin.', 'warn');
      return;
    }

    try {
      await api.post('/api/reports/corporate-sales/payment', {
        accountId,
        accountName,
        month,
        amount,
        date,
        method,
        reference,
      });
      toast('Cari tahsilat başarıyla kaydedildi.', 'ok');
      document.querySelector('[data-close]').click();
      renderCorporateTab(el, ctx);
    } catch (err) {
      toast(err.message, 'danger');
    }
  });
}
