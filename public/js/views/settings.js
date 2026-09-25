// Ayarlar: otel/vergi bilgileri, döviz, işlem günlüğü (audit).
import { api } from '../api.js';
import { escapeHtml, relTime, toast, spinner, emptyState, badge } from '../ui.js';

let tab = 'hotel';

export async function render(container, ctx) {
  container.innerHTML = `
    <div class="page-head">
      <div><h2>Ayarlar</h2><div class="sub">otel, vergi ve sistem yapılandırması</div></div>
      <div class="segment" id="setTabs">
        <button data-tab="hotel" class="${tab === 'hotel' ? 'active' : ''}">Otel & Vergi</button>
        <button data-tab="audit" class="${tab === 'audit' ? 'active' : ''}">İşlem Günlüğü</button>
      </div>
    </div>
    <div id="setBody">${spinner()}</div>`;

  container.querySelector('#setTabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; ctx.reload();
  });

  const el = container.querySelector('#setBody');
  if (tab === 'audit') return renderAudit(el);
  return renderHotel(el);
}

async function renderHotel(el) {
  let s;
  try { s = await api.settings(); }
  catch (e) { el.innerHTML = emptyState('⚠️', e.message); return; }

  const theme = (window.__pmsTheme ? window.__pmsTheme.get() : 'light');
  el.innerHTML = `
    <div class="card mb"><div class="card-head"><h3>Görünüm</h3></div>
      <div class="card-pad">
        <div class="flex between wrap" style="gap:14px">
          <div><div class="t-strong">Tema</div><div class="muted" style="font-size:.84rem">Arayüz renk temasını seçin (tercihiniz kaydedilir)</div></div>
          <div class="segment" id="themeSeg">
            <button data-theme-opt="light" class="${theme === 'light' ? 'active' : ''}">☀ Açık</button>
            <button data-theme-opt="dark" class="${theme === 'dark' ? 'active' : ''}">☾ Koyu</button>
          </div>
        </div>
      </div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <div class="card-head"><h3>Otel Bilgileri</h3></div>
        <div class="card-pad">
          <div class="field"><label>Otel Adı</label><input class="input" id="hotelName" value="${escapeHtml(s.hotelName)}"></div>
          <div class="field"><label>Ticari Unvan</label><input class="input" id="legalName" value="${escapeHtml(s.legalName)}"></div>
          <div class="form-row">
            <div class="field"><label>Vergi No (VKN)</label><input class="input" id="taxNumber" value="${escapeHtml(s.taxNumber)}"></div>
            <div class="field"><label>Vergi Dairesi</label><input class="input" id="taxOffice" value="${escapeHtml(s.taxOffice)}"></div>
          </div>
          <div class="field"><label>Adres</label><input class="input" id="address" value="${escapeHtml(s.address)}"></div>
          <div class="form-row">
            <div class="field"><label>Telefon</label><input class="input" id="phone" value="${escapeHtml(s.phone)}"></div>
            <div class="field"><label>E-posta</label><input class="input" id="email" value="${escapeHtml(s.email)}"></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Vergi & Uyumluluk</h3></div>
        <div class="card-pad">
          <div class="form-row">
            <div class="field"><label>Konaklama KDV (%)</label><input class="input" type="number" id="kdvAccommodation" value="${s.kdvAccommodation}"></div>
            <div class="field"><label>Yiyecek-İçecek KDV (%)</label><input class="input" type="number" id="kdvFnb" value="${s.kdvFnb}"></div>
          </div>
          <div class="form-row">
            <div class="field"><label>Genel KDV (%)</label><input class="input" type="number" id="kdvGeneral" value="${s.kdvGeneral}"></div>
            <div class="field"><label>Konaklama Vergisi (%)</label><input class="input" type="number" id="accommodationTaxRate" value="${s.accommodationTaxRate}"></div>
          </div>
          <div class="section-sep"></div>
          <div class="form-row">
            <div class="field"><label>KBS Tesis Kodu</label><input class="input" id="kbsFacilityCode" value="${escapeHtml(s.kbsFacilityCode)}"></div>
            <div class="field"><label>e-Fatura Entegratörü</label>
              <select class="select" id="efaturaProvider">
                ${['izibiz', 'uyumsoft', 'efinans', 'turkcell', 'edm'].map((p) => `<option value="${p}" ${s.efaturaProvider === p ? 'selected' : ''}>${p}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field"><label>Baz Para Birimi</label><input class="input" id="baseCurrency" value="${escapeHtml(s.baseCurrency)}" maxlength="3" style="max-width:120px"></div>
          <button class="btn btn-gold mt" id="saveSet">Ayarları Kaydet</button>
        </div>
      </div>
    </div>`;

  el.querySelector('#saveSet').addEventListener('click', async (e) => {
    const val = (id) => el.querySelector('#' + id).value;
    const numv = (id) => Number(el.querySelector('#' + id).value);
    e.target.disabled = true;
    try {
      await api.put('/api/settings', {
        hotelName: val('hotelName'), legalName: val('legalName'), taxNumber: val('taxNumber'), taxOffice: val('taxOffice'),
        address: val('address'), phone: val('phone'), email: val('email'), baseCurrency: val('baseCurrency'),
        kdvAccommodation: numv('kdvAccommodation'), kdvFnb: numv('kdvFnb'), kdvGeneral: numv('kdvGeneral'),
        accommodationTaxRate: numv('accommodationTaxRate'), kbsFacilityCode: val('kbsFacilityCode'), efaturaProvider: val('efaturaProvider'),
      });
      toast('Ayarlar kaydedildi.', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    finally { e.target.disabled = false; }
  });

  // Tema seçimi
  const seg = el.querySelector('#themeSeg');
  if (seg) seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-opt]'); if (!b) return;
    if (window.__pmsTheme) window.__pmsTheme.set(b.dataset.themeOpt);
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
  });
}

async function renderAudit(el) {
  let logs;
  try { logs = await api.get('/api/audit?limit=100'); }
  catch (e) { el.innerHTML = emptyState('⚠️', e.message); return; }
  el.innerHTML = `<div class="card"><div class="card-head"><h3>İşlem Günlüğü</h3><span class="card-sub">son ${logs.length} kayıt</span></div>
    <div class="card-pad">${logs.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Kullanıcı</th><th>İşlem</th><th>Nesne</th><th>Detay</th><th>Zaman</th></tr></thead>
      <tbody>${logs.map((l) => `<tr>
        <td class="t-strong">${escapeHtml(l.userName || 'sistem')}</td>
        <td>${badge(escapeHtml(l.action), 'b-navy', false)}</td>
        <td class="muted">${escapeHtml(l.entity || '')}</td>
        <td>${escapeHtml(l.detail || '')}</td>
        <td class="muted">${relTime(l.timestamp)}</td>
      </tr>`).join('')}</tbody></table></div>` : emptyState('📋', 'Kayıt yok.')}</div></div>`;
}
