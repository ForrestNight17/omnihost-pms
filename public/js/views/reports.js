// Raporlar: gelir & doluluk, kanal üretimi, KDV/vergi.
import { api } from '../api.js';
import { store } from '../store.js';
import { money, escapeHtml, today, addDays, spinner, emptyState } from '../ui.js';

let from = null;
let to = null;

export async function render(container, ctx) {
  if (!from) { from = addDays(ctx.businessDate || today(), -30); to = addDays(ctx.businessDate || today(), 1); }

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Raporlar</h2><div class="sub">gelir, doluluk, kanal üretimi ve vergi</div></div>
      <div class="flex gap-sm wrap">
        <input class="input" type="date" id="rFrom" value="${from}" style="max-width:160px">
        <span class="muted">→</span>
        <input class="input" type="date" id="rTo" value="${to}" style="max-width:160px">
        <button class="btn btn-gold btn-sm" id="apply">Uygula</button>
      </div>
    </div>
    <div id="rBody">${spinner()}</div>`;

  container.querySelector('#apply').addEventListener('click', () => {
    from = container.querySelector('#rFrom').value; to = container.querySelector('#rTo').value; ctx.reload();
  });

  const el = container.querySelector('#rBody');
  let summary, channel, tax;
  try {
    [summary, channel, tax] = await Promise.all([
      api.get(`/api/reports/summary?from=${from}&to=${to}`),
      api.get(`/api/reports/channel?from=${from}&to=${to}`),
      api.get(`/api/reports/tax?from=${from}&to=${to}`),
    ]);
  } catch (e) { el.innerHTML = emptyState('⚠️', e.message); return; }

  const maxOcc = Math.max(1, ...summary.days.map((d) => d.occupancyPct));
  const maxRev = Math.max(1, ...channel.channels.map((c) => c.revenue));
  const channelColor = (src) => { if (!src || src === 'direct') return '#c9a24b'; const ch = store.channel(src); return ch ? ch.color : '#0f1e3d'; };

  el.innerHTML = `
    <div class="stat-tiles mb">
      <div class="stat-tile"><div class="st-l">Ort. Doluluk</div><div class="st-v">%${summary.avgOccupancy}</div></div>
      <div class="stat-tile"><div class="st-l">ADR</div><div class="st-v">${money(summary.adr)}</div></div>
      <div class="stat-tile"><div class="st-l">RevPAR</div><div class="st-v">${money(summary.revpar)}</div></div>
      <div class="stat-tile"><div class="st-l">Oda Geliri</div><div class="st-v" style="font-size:1.2rem">${money(summary.roomRevenue)}</div></div>
      <div class="stat-tile"><div class="st-l">Toplam Gelir</div><div class="st-v" style="font-size:1.2rem">${money(summary.totalRevenue)}</div></div>
    </div>

    <div class="grid cols-2 mb">
      <div class="card">
        <div class="card-head"><h3>Günlük Doluluk</h3><span class="card-sub">${summary.days.length} gün</span></div>
        <div class="card-pad">
          <div class="spark">${summary.days.map((d) => `<i style="height:${Math.max(3, Math.round((d.occupancyPct / maxOcc) * 100))}%" title="${d.date}: %${d.occupancyPct}"></i>`).join('')}</div>
          <div class="flex between muted" style="font-size:.74rem;margin-top:6px"><span>${summary.days[0] ? summary.days[0].date : ''}</span><span>${summary.days.length ? summary.days[summary.days.length - 1].date : ''}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Kanal Üretimi</h3><span class="card-sub">${channel.totalReservations} rezervasyon</span></div>
        <div class="card-pad">
          ${channel.channels.length ? channel.channels.map((c) => `
            <div class="bar-row">
              <div class="bl"><span class="sw" style="background:${channelColor(c.source)}"></span>${escapeHtml(c.name)}</div>
              <div class="bar-track"><i style="width:${Math.max(3, Math.round((c.revenue / maxRev) * 100))}%"></i></div>
              <div class="bv">${money(c.revenue)}</div>
            </div>`).join('') : emptyState('📊', 'Veri yok')}
          <div class="muted" style="font-size:.76rem;margin-top:10px">Komisyon sonrası net gelir sütun ipuçlarında; toplam üretim ${money(channel.totalRevenue)}</div>
        </div>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h3>Kanal Detayı</h3></div>
        <div class="card-pad table-wrap"><table class="tbl">
          <thead><tr><th>Kanal</th><th class="t-right">Rez.</th><th class="t-right">Oda-Gece</th><th class="t-right">Üretim</th><th class="t-right">Komisyon</th><th class="t-right">Net</th></tr></thead>
          <tbody>${channel.channels.map((c) => `<tr><td class="t-strong">${escapeHtml(c.name)}</td><td class="t-right">${c.count}</td><td class="t-right">${c.roomNights}</td><td class="t-right">${money(c.revenue)}</td><td class="t-right muted">${money(c.commission)}</td><td class="t-right t-strong">${money(c.netRevenue)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>KDV & Vergi Özeti</h3><span class="card-sub">beyan için</span></div>
        <div class="card-pad">
          <table class="tbl">
            <thead><tr><th>KDV Oranı</th><th class="t-right">Matrah</th><th class="t-right">KDV</th></tr></thead>
            <tbody>${tax.kdvByRate.length ? tax.kdvByRate.map((k) => `<tr><td>%${k.rate}</td><td class="t-right">${money(k.net)}</td><td class="t-right t-strong">${money(k.kdv)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">Veri yok</td></tr>'}</tbody>
          </table>
          <div class="folio-total-row grand" style="margin-top:12px"><span>Toplam KDV</span><span>${money(tax.kdvTotal)}</span></div>
          <div class="folio-total-row"><span class="muted">Konaklama Vergisi (%2)</span><span>${money(tax.accommodationTax)}</span></div>
          <div class="folio-total-row"><span class="muted">Kesilen fatura</span><span>${tax.invoiceCount} adet</span></div>
        </div>
      </div>
    </div>`;
}
