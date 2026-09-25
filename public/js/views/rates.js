// Fiyat & Kontenjan (Rate & Inventory) takvim editörü.
import { api } from '../api.js';
import {
  escapeHtml, money, today, addDays, parseISO, DOW_SHORT, MONTHS_SHORT,
  toast, openModal, spinner, emptyState,
} from '../ui.js';

let fromDate = null;
let dayCount = 7;

// Haftanın Pazartesi'sine hizala
function weekStart(d) { return addDays(d, -((parseISO(d).getDay() + 6) % 7)); }
function weekRangeLabel(a, b) {
  const da = parseISO(a), db = parseISO(b);
  const mA = MONTHS_SHORT[da.getMonth()], mB = MONTHS_SHORT[db.getMonth()];
  return da.getMonth() === db.getMonth()
    ? `${da.getDate()} – ${db.getDate()} ${mB} ${db.getFullYear()}`
    : `${da.getDate()} ${mA} – ${db.getDate()} ${mB} ${db.getFullYear()}`;
}

export async function render(container, ctx) {
  if (!fromDate) fromDate = weekStart(ctx.businessDate || today());
  const toDate = addDays(fromDate, dayCount);
  const weekLabel = weekRangeLabel(fromDate, addDays(fromDate, dayCount - 1));

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Fiyat & Kontenjan</h2><div class="sub">OTA / online kanal fiyat ve kontenjan regülasyonu (kapı fiyatı değildir)</div></div>
      <div class="flex gap-sm wrap">
        <button class="btn btn-ghost btn-sm" id="prev">‹ Önceki</button>
        <span class="today-chip" id="weekLabel">${weekLabel}</span>
        <button class="btn btn-ghost btn-sm" id="next">Sonraki ›</button>
        <button class="btn btn-ghost btn-sm" id="jumpToday">Bu Hafta</button>
      </div>
    </div>
    <div class="card mb"><div class="card-pad" style="padding:12px 16px">
      <div class="legend"><span>Hücreye tıklayıp fiyat/kontenjan/kısıtlama düzenleyin.</span>
        <span style="margin-left:auto"><i style="background:var(--danger-bg)"></i> Stop-sell</span>
        <span><i style="background:#f0eadb"></i> Dolu</span>
        <span><b class="ri-badges"><i>min</i></b> Min. konaklama</span>
      </div>
    </div></div>
    <div id="grid">${spinner()}</div>`;

  container.querySelector('#prev').addEventListener('click', () => { fromDate = addDays(fromDate, -dayCount); ctx.reload(); });
  container.querySelector('#next').addEventListener('click', () => { fromDate = addDays(fromDate, dayCount); ctx.reload(); });
  container.querySelector('#jumpToday').addEventListener('click', () => { fromDate = weekStart(ctx.businessDate || today()); ctx.reload(); });

  const gridEl = container.querySelector('#grid');
  let grid;
  try { grid = await api.get(`/api/rateinv/grid?from=${fromDate}&to=${toDate}`); }
  catch (e) { gridEl.innerHTML = emptyState('⚠️', e.message); return; }

  const t = ctx.businessDate || today();
  const dates = [];
  for (let d = fromDate; d < toDate; d = addDays(d, 1)) dates.push(d);

  const headCells = dates.map((d) => {
    const dt = parseISO(d);
    const wknd = dt.getDay() === 0 || dt.getDay() === 6;
    return `<th class="ri-daycol ${wknd ? 'wknd' : ''} ${d === t ? 'today' : ''}">
      <div>${DOW_SHORT[(dt.getDay() + 6) % 7]}</div><div style="font-size:.9rem">${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}</div></th>`;
  }).join('');

  const rows = grid.map((row) => `
    <tr>
      <td class="ri-typecell">${escapeHtml(row.roomType.name)}<div class="muted" style="font-weight:400;font-size:.72rem">${row.roomType.code}</div></td>
      ${row.days.map((d) => {
        const cls = (d.stopSell ? 'stop' : (d.available <= 0 ? 'full' : '')) + (d.date === t ? ' today' : '');
        const availCls = d.available <= 0 ? 'no' : (d.available <= 2 ? 'lo' : 'ok');
        const badges = [];
        if (d.minStay > 1) badges.push(`<i>min${d.minStay}</i>`);
        if (d.cta) badges.push('<i>CTA</i>');
        if (d.stopSell) badges.push('<i style="background:var(--danger)">STOP</i>');
        return `<td class="ri-cell ${cls}" data-rt="${row.roomType.id}" data-date="${d.date}" data-name="${escapeHtml(row.roomType.name)}">
          <div class="rc-rate">${d.rate.toLocaleString('tr-TR')}</div>
          <div class="rc-inv"><span class="${availCls}">${d.available}</span><span class="muted">/${d.allotment}</span></div>
          ${badges.length ? `<div class="ri-badges">${badges.join('')}</div>` : ''}
        </td>`;
      }).join('')}
    </tr>`).join('');

  gridEl.innerHTML = `<div class="ri-wrap"><table class="ri-table">
    <thead><tr><th class="ri-typecell">Oda Tipi</th>${headCells}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  gridEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.ri-cell'); if (!cell) return;
    openCellModal(ctx, cell.dataset.rt, cell.dataset.name, cell.dataset.date);
  });
}

function openCellModal(ctx, roomTypeId, name, date) {
  const body = `
    <p class="muted" style="margin-top:0"><b>${escapeHtml(name)}</b> — seçilen tarih aralığına uygula</p>
    <div class="form-row">
      <div class="field"><label>Başlangıç</label><input class="input" type="date" id="cFrom" value="${date}"></div>
      <div class="field"><label>Bitiş (dahil)</label><input class="input" type="date" id="cTo" value="${date}"></div>
    </div>
    <div class="section-sep"></div>
    <div class="form-row">
      <div class="field"><label>Gecelik Fiyat (₺) <span class="hint">(boş=değişmez)</span></label><input class="input" type="number" min="0" id="cPrice" placeholder="örn. 4500"></div>
      <div class="field"><label>Kontenjan <span class="hint">(boş=değişmez)</span></label><input class="input" type="number" min="0" id="cAllot" placeholder="fiziksel oda sayısı"></div>
    </div>
    <div class="form-row">
      <div class="field"><label>Min. Konaklama (gece)</label><input class="input" type="number" min="1" id="cMin" placeholder="1"></div>
      <div class="field"><label>Satış Durumu</label>
        <select class="select" id="cStop"><option value="">Değişmez</option><option value="false">Satışa Açık</option><option value="true">Stop-sell (Kapat)</option></select>
      </div>
    </div>`;
  const foot = document.createElement('div');
  foot.innerHTML = `<button class="btn btn-ghost" data-close>Vazgeç</button><button class="btn btn-gold" id="applyRi">Uygula</button>`;
  const m = openModal({ title: 'Fiyat & Kontenjan Düzenle', body, footer: foot, wide: true });

  foot.querySelector('#applyRi').addEventListener('click', async () => {
    const from = m.el.querySelector('#cFrom').value;
    const toIncl = m.el.querySelector('#cTo').value;
    if (!from || !toIncl || toIncl < from) { toast('Geçerli tarih aralığı girin.', 'err'); return; }
    const to = addDays(toIncl, 1); // API'de to hariç
    const price = m.el.querySelector('#cPrice').value;
    const allot = m.el.querySelector('#cAllot').value;
    const min = m.el.querySelector('#cMin').value;
    const stop = m.el.querySelector('#cStop').value;
    try {
      const tasks = [];
      if (price !== '') tasks.push(api.post('/api/rates', { roomTypeId, from, to, price: Number(price) }));
      const invPatch = {};
      if (allot !== '') invPatch.allotment = Number(allot);
      if (min !== '') invPatch.minStay = Number(min);
      if (stop !== '') invPatch.stopSell = stop === 'true';
      if (Object.keys(invPatch).length) tasks.push(api.post('/api/inventory', { roomTypeId, from, to, ...invPatch }));
      if (!tasks.length) { toast('Değişiklik girilmedi.', 'warn'); return; }
      await Promise.all(tasks);
      toast('Fiyat/kontenjan güncellendi.', 'ok');
      m.close(); ctx.reload();
    } catch (e) { toast(e.message, 'err'); }
  });
}
