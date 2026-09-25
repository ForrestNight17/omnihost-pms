// Gün Sonu (Night Audit): tarih ilerletme, no-show işleme, TCMB kur çekme, kapanış.
import { api } from '../api.js';
import { store } from '../store.js';
import { money, fmtDate, escapeHtml, toast, confirmDialog, spinner, emptyState, openModal } from '../ui.js';

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let pv, currency;
  try { [pv, currency] = await Promise.all([api.get('/api/nightaudit/preview'), api.get('/api/currency')]); }
  catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }

  const isAdmin = store.user && store.user.role === 'admin';

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Gün Sonu · Night Audit</h2><div class="sub">günlük operasyonel kapanış ve tarih ilerletme</div></div>
    </div>

    <div class="grid cols-2 mb">
      <div class="card">
        <div class="card-head"><h3>İş Günü</h3></div>
        <div class="card-pad">
          <div style="text-align:center;padding:8px 0">
            <div class="muted" style="font-size:.8rem;text-transform:uppercase;letter-spacing:.1em">Mevcut iş günü</div>
            <div style="font-family:var(--serif);font-size:2rem;color:var(--ink);margin:6px 0">${fmtDate(pv.date)}</div>
            <div class="muted">gün sonu sonrası → <b>${fmtDate(pv.nextDate)}</b></div>
          </div>
          <div class="section-sep"></div>
          <div class="folio-total-row"><span class="muted">Otelde misafir</span><b>${pv.inHouse}</b></div>
          <div class="folio-total-row"><span class="muted">Bekleyen giriş (giriş yapılmalı)</span><b style="color:${pv.pendingArrivals ? 'var(--danger)' : 'inherit'}">${pv.pendingArrivals}</b></div>
          <div class="folio-total-row"><span class="muted">Bekleyen çıkış (çıkış yapılmalı)</span><b style="color:${pv.overstays ? 'var(--danger)' : 'inherit'}">${pv.overstays}</b></div>
          <div class="folio-total-row"><span class="muted">Bugünkü oda geliri</span><b>${money(pv.roomRevenue)}</b></div>
          <div class="folio-total-row"><span class="muted">Bugünkü tahsilat</span><b style="color:var(--ok)">${money(pv.payments)}</b></div>
          <div class="mt">
            ${!isAdmin
              ? '<p class="muted" style="text-align:center">Gün sonunu yalnızca yönetici çalıştırabilir.</p>'
              : (pv.canRun
                ? `<button class="btn btn-gold btn-block" id="runAudit">Gün Sonunu Çalıştır → ${fmtDate(pv.nextDate)}</button>
                   <p class="muted" style="font-size:.78rem;text-align:center;margin-top:8px">TCMB kurları çekilecek ve iş günü ilerletilecek.</p>`
                : `<button class="btn btn-gold btn-block" id="runAudit" disabled>Gün Sonu Yapılamaz</button>
                   <p style="font-size:.8rem;text-align:center;margin-top:8px;color:var(--danger)">Bekleyen <b>${pv.pendingArrivals}</b> giriş ve <b>${pv.overstays}</b> çıkış var. Gün sonundan önce tüm giriş/çıkış işlemlerini tamamlayın (ya da rezervasyonu iptal edin).</p>`)}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>TCMB Döviz Kurları</h3><button class="btn btn-ghost btn-sm" id="refreshFx">Güncelle</button></div>
        <div class="card-pad" id="fxBody">${currencyHtml(currency)}</div>
      </div>
    </div>`;

  const runBtn = container.querySelector('#runAudit');
  if (runBtn) runBtn.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Gün Sonu', message: `İş günü ${fmtDate(pv.date)} kapatılıp ${fmtDate(pv.nextDate)} açılacak. Onaylıyor musunuz?`, confirmText: 'Gün Sonunu Çalıştır' });
    if (!ok) return;
    runBtn.disabled = true; runBtn.textContent = 'Çalışıyor…';
    try {
      const out = await api.post('/api/nightaudit/run');
      showClosing(out);
      await ctx.refreshBadges();
    } catch (e) { toast(e.message, 'err'); runBtn.disabled = false; }
  });

  container.querySelector('#refreshFx').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      const out = await api.post('/api/currency/refresh');
      container.querySelector('#fxBody').innerHTML = currencyHtml(out.rates, out.source);
      toast(`Kurlar güncellendi (${out.source === 'tcmb' ? 'TCMB canlı' : out.source}).`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { e.target.disabled = false; }
  });
}

function currencyHtml(list, source) {
  if (!list || !list.length) return emptyState('💱', 'Kur verisi yok.');
  return `
    <table class="tbl">
      <thead><tr><th>Döviz</th><th class="t-right">Alış</th><th class="t-right">Satış</th></tr></thead>
      <tbody>${list.map((c) => `<tr><td class="t-strong">${c.code} <span class="muted" style="font-weight:400">${escapeHtml(c.name || '')}</span></td><td class="t-right mono">${c.forexBuying}</td><td class="t-right mono">${c.forexSelling}</td></tr>`).join('')}</tbody>
    </table>
    <div class="muted" style="font-size:.74rem;margin-top:8px">Kaynak: ${(source || (list[0] && list[0].source)) === 'tcmb' ? 'TCMB canlı' : 'başlangıç değeri'} · ${list[0] ? list[0].date : ''}</div>`;
}

function showClosing(out) {
  const c = out.closing;
  openModal({
    title: `Gün Sonu Tamamlandı · ${fmtDate(out.closedDate)}`,
    body: `
      <div class="badge b-ok" style="margin-bottom:12px">İş günü ${fmtDate(out.newDate)} olarak açıldı</div>
      <div class="folio-total-row"><span class="muted">Oda geliri</span><b>${money(c.roomRevenue)}</b></div>
      <div class="folio-total-row"><span class="muted">Ekstra gelir</span><b>${money(c.extraRevenue)}</b></div>
      <div class="folio-total-row"><span class="muted">Konaklama vergisi</span><b>${money(c.accommodationTax)}</b></div>
      <div class="folio-total-row"><span class="muted">Toplam KDV</span><b>${money(c.kdvTotal)}</b></div>
      <div class="folio-total-row grand"><span>Toplam Gelir</span><span>${money(c.totalRevenue)}</span></div>
      <div class="folio-total-row"><span class="muted">Tahsilat</span><span style="color:var(--ok)">${money(c.payments)}</span></div>
      <div class="folio-total-row"><span class="muted">Giriş / Çıkış</span><span>${c.arrivals} / ${c.departures}</span></div>
      ${out.currency ? `<div class="folio-total-row"><span class="muted">TCMB kurları</span><span>${out.currency.count} döviz (${out.currency.source})</span></div>` : ''}`,
    footer: '<button class="btn btn-gold" data-close>Tamam</button>',
    onClose: () => location.reload(),
  });
}
