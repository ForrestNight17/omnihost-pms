// Channel Manager: OTA bağlantıları, API key yönetimi, senkron ve günlük.
import { api } from '../api.js';
import { store } from '../store.js';
import {
  escapeHtml, money, relTime, badge, initials, toast, openModal, confirmDialog, spinner, emptyState,
} from '../ui.js';

const KIND_LABEL = { availability: 'Müsaitlik', rates: 'Fiyat', reservations: 'Rezervasyon', test: 'Bağlantı' };

function statusBadge(c) {
  if (c.status === 'connected' || (c.connected && c.status !== 'error')) return badge('Bağlı', 'b-ok');
  if (c.status === 'error') return badge('Hata', 'b-danger');
  return badge('Bağlı değil', 'b-muted');
}

export async function render(container, ctx) {
  container.innerHTML = spinner();
  let channels, reservations, logs, dash;
  try {
    [channels, reservations, logs, dash] = await Promise.all([api.channels(), api.reservations(), api.syncLogs({ limit: 40 }), api.dashboard()]);
  } catch (e) { container.innerHTML = emptyState('⚠️', e.message); return; }
  const periods = (dash && dash.channelPeriods) || { day: [], week: [], month: dash && dash.channelBreakdown || [] };
  let curPeriod = 'month';
  const channelColor = (src) => { if (!src || src === 'direct') return 'var(--gold)'; const ch = store.channel(src); return ch ? ch.color : 'var(--navy)'; };
  const PERIOD_LABEL = { day: 'Günlük', week: 'Haftalık', month: 'Aylık' };
  const channelBars = (list) => {
    if (!list.length) return emptyState('📊', 'Bu dönemde kanal geliri yok.');
    const maxRev = Math.max(1, ...list.map((x) => x.revenue));
    return list.map((x) => `<div class="bar-row"><div class="bl"><span class="sw" style="background:${channelColor(x.source)}"></span>${escapeHtml(x.name)}</div><div class="bar-track"><i style="width:${Math.max(3, Math.round((x.revenue / maxRev) * 100))}%"></i></div><div class="bv">${money(x.revenue)}</div></div>`).join('')
      + `<div class="muted" style="font-size:.78rem;margin-top:12px">${PERIOD_LABEL[curPeriod]} · ${list.reduce((s, x) => s + x.count, 0)} rezervasyon · kaynağa göre gelir</div>`;
  };

  const resByChannel = {};
  reservations.forEach((r) => { if (r.channelId) resByChannel[r.channelId] = (resByChannel[r.channelId] || 0) + 1; });
  const connectedCount = channels.filter((c) => c.connected).length;
  const otaResTotal = reservations.filter((r) => r.source !== 'direct' && r.status !== 'cancelled' && r.status !== 'no_show').length;

  container.innerHTML = `
    <div class="page-head">
      <div><h2>Channel Manager</h2><div class="sub">OTA kanallarını API anahtarıyla bağlayın ve senkronize edin</div></div>
      <div class="flex gap-sm">
        <button class="btn btn-ghost" data-global="sync-all">Tümünü Senkronize Et</button>
        <button class="btn btn-gold" id="addCh">+ Yeni OTA Ekle</button>
      </div>
    </div>

    <div class="grid grid-kpi mb">
      <div class="kpi accent-ok"><div class="kpi-label">Bağlı Kanal</div><div class="kpi-value">${connectedCount}<small> / ${channels.length}</small></div></div>
      <div class="kpi accent-navy"><div class="kpi-label">OTA Rezervasyonu</div><div class="kpi-value">${otaResTotal}</div><div class="kpi-foot">aktif</div></div>
      <div class="kpi accent-info"><div class="kpi-label">Bugünkü Senkron</div><div class="kpi-value">${logs.length}</div><div class="kpi-foot">kayıt</div></div>
      <div class="kpi accent-warn"><div class="kpi-label">Oto-Senkron</div><div class="kpi-value">${channels.filter((c) => c.autoSync).length}</div><div class="kpi-foot">kanal</div></div>
    </div>

    <div class="card mb">
      <div class="card-head">
        <div class="flex gap-sm" style="align-items:center">
          <h3>Kanal Geliri</h3>
          <div class="segment" id="chanPeriod">
            <button data-p="day" class="${curPeriod === 'day' ? 'active' : ''}">Günlük</button>
            <button data-p="week" class="${curPeriod === 'week' ? 'active' : ''}">Haftalık</button>
            <button data-p="month" class="${curPeriod === 'month' ? 'active' : ''}">Aylık</button>
          </div>
        </div>
      </div>
      <div class="card-pad"><div id="channelBody">${channelBars(periods[curPeriod])}</div></div>
    </div>

    <div class="card mb">
      <div class="card-head"><h3>OTA Kanalları</h3><span class="card-sub">${channels.length} kanal</span></div>
      <div class="card-pad">
        <div class="channels" id="channels">
          ${channels.map((c) => channelCard(c, resByChannel[c.id] || 0)).join('')}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><h3>Senkronizasyon Günlüğü</h3><span class="card-sub">son ${logs.length} işlem</span></div>
      <div class="card-pad">
        ${logs.length ? `<div class="log-list">${logs.map(logItem).join('')}</div>` : emptyState('📡', 'Henüz senkron kaydı yok.')}
      </div>
    </div>`;

  container.querySelector('#addCh').addEventListener('click', () => openChannelForm(ctx));

  container.querySelector('#chanPeriod').addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    curPeriod = b.dataset.p;
    container.querySelectorAll('#chanPeriod button').forEach((x) => x.classList.toggle('active', x.dataset.p === curPeriod));
    container.querySelector('#channelBody').innerHTML = channelBars(periods[curPeriod]);
  });

  container.querySelector('#channels').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = e.target.closest('[data-ch]');
    const id = card.dataset.ch;
    const channel = channels.find((c) => c.id === id);
    const act = btn.dataset.act;

    if (act === 'test') return runTest(id, btn);
    if (act === 'connect') return runConnect(ctx, id, btn);
    if (act === 'disconnect') return runDisconnect(ctx, id, btn);
    if (act === 'sync') return openSyncModal(ctx, channel);
    if (act === 'settings') return openChannelForm(ctx, channel);
  });
}

function channelCard(c, resCount) {
  return `<div class="channel-card" data-ch="${c.id}">
    <div class="ch-top">
      <div class="ch-logo" style="background:${c.color}">${escapeHtml(initials(c.name))}</div>
      <div style="flex:1;min-width:0">
        <div class="ch-name">${escapeHtml(c.name)}</div>
        <div class="ch-meta">Komisyon %${c.commission} · ${c.hasKey ? `🔑 ${escapeHtml(c.apiKeyMasked)}` : 'API anahtarı yok'}</div>
      </div>
      ${statusBadge(c)}
    </div>
    <div class="ch-stats">
      <div class="s"><div class="v">${resCount}</div><div class="l">Rezervasyon</div></div>
      <div class="s"><div class="v">${c.autoSync ? 'Açık' : 'Kapalı'}</div><div class="l">Oto-Senkron</div></div>
      <div class="s"><div class="v">${c.lastSyncAt ? relTime(c.lastSyncAt) : '—'}</div><div class="l">Son Senkron</div></div>
    </div>
    <div class="ch-actions">
      <button class="btn btn-sm btn-ghost" data-act="test">Test</button>
      ${c.connected
        ? `<button class="btn btn-sm btn-gold" data-act="sync">Senkronize Et</button>
           <button class="btn btn-sm btn-ghost" data-act="disconnect">Bağlantıyı Kes</button>`
        : `<button class="btn btn-sm btn-primary" data-act="connect">Bağlan</button>`}
      <button class="btn btn-sm btn-ghost btn-icon" data-act="settings" title="Ayarlar">⚙</button>
    </div>
  </div>`;
}

function logItem(l) {
  const cls = l.status === 'error' ? 'err' : l.direction;
  const sym = l.status === 'error' ? '!' : (l.direction === 'push' ? '↑' : '↓');
  return `<div class="log-item">
    <div class="log-icon ${cls}">${sym}</div>
    <div class="log-body">
      <div class="lb-top"><strong>${escapeHtml(l.channelName)} · ${KIND_LABEL[l.kind] || l.kind}</strong><span class="lb-time">${relTime(l.timestamp)}</span></div>
      <div class="lb-msg">${escapeHtml(l.message)}</div>
    </div>
  </div>`;
}

// ---------- Aksiyonlar ----------
async function runTest(id, btn) {
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Test…';
  try {
    const res = await api.post(`/api/channels/${id}/test`);
    toast(res.ok ? `✓ ${res.message}` : `✗ ${res.message}`, res.ok ? 'ok' : 'err');
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = orig; }
}

async function runConnect(ctx, id, btn) {
  btn.disabled = true;
  try {
    const res = await api.post(`/api/channels/${id}/connect`);
    if (res.ok) { toast('Kanal bağlandı.', 'ok'); await store.refreshChannels(); ctx.reload(); }
    else toast(res.message, 'err');
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; }
}

async function runDisconnect(ctx, id, btn) {
  const ok = await confirmDialog({ title: 'Bağlantıyı Kes', message: 'Bu OTA kanalının bağlantısını kesmek istiyor musunuz?', confirmText: 'Bağlantıyı Kes', danger: true });
  if (!ok) return;
  try { await api.post(`/api/channels/${id}/disconnect`); toast('Bağlantı kesildi.', 'warn'); await store.refreshChannels(); ctx.reload(); }
  catch (e) { toast(e.message, 'err'); }
}

function openSyncModal(ctx, channel) {
  const body = `
    <p class="muted" style="margin-top:0">${escapeHtml(channel.name)} kanalı ile hangi senkronizasyon yapılsın?</p>
    <div class="stack">
      <button class="btn btn-gold btn-block" data-kind="all">Tümü (müsaitlik + fiyat + rezervasyon)</button>
      <button class="btn btn-ghost btn-block" data-kind="reservations">⬇ Rezervasyonları Çek</button>
      <button class="btn btn-ghost btn-block" data-kind="availability">⬆ Müsaitlik Gönder</button>
      <button class="btn btn-ghost btn-block" data-kind="rates">⬆ Fiyatları Gönder</button>
    </div>`;
  const m = openModal({ title: `Senkronizasyon · ${channel.name}`, body, footer: '<button class="btn btn-ghost" data-close>Kapat</button>' });
  m.body.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-kind]'); if (!b) return;
    b.disabled = true; b.textContent = 'Senkronize ediliyor…';
    try {
      const res = await api.post(`/api/channels/${channel.id}/sync`, { kind: b.dataset.kind });
      const created = res.created != null ? res.created : (res.reservations ? res.reservations.created : 0);
      toast(`Senkron tamam${created ? ` · ${created} yeni rezervasyon` : ''}.`, 'ok');
      m.close(); await store.refreshChannels(); ctx.reload(); ctx.refreshBadges();
    } catch (err) { toast(err.message, 'err'); b.disabled = false; }
  });
}

// ---------- OTA ekle / ayarlar formu ----------
function openChannelForm(ctx, channel = null) {
  const isEdit = !!channel;
  const rt = store.roomTypes;
  const mapVal = (id) => {
    if (!channel || !Array.isArray(channel.roomMappings)) return '';
    const m = channel.roomMappings.find((x) => x.roomTypeId === id);
    return m ? m.otaCode : '';
  };

  const body = `
    <div class="form-row">
      <div class="field"><label>Kanal Adı</label><input class="input" id="cName" value="${channel ? escapeHtml(channel.name) : ''}" placeholder="Örn. Trip.com"></div>
      <div class="field"><label>Renk</label><input class="input" id="cColor" type="color" value="${channel ? channel.color : '#0f1e3d'}" style="height:42px;padding:4px"></div>
    </div>
    <div class="field"><label>API Anahtarı</label>
      <input class="input" id="cKey" placeholder="${channel && channel.hasKey ? 'Değiştirmek için yeni anahtar girin' : 'API anahtarınızı yapıştırın'}" value="">
      <span class="hint">${channel && channel.hasKey ? 'Mevcut: ' + escapeHtml(channel.apiKeyMasked) + ' — boş bırakılırsa değişmez.' : 'OTA panelinden aldığınız anahtar.'}</span>
    </div>
    <div class="field"><label>API Uç Noktası (Endpoint)</label><input class="input" id="cEndpoint" value="${channel ? escapeHtml(channel.apiEndpoint || '') : ''}" placeholder="https://api.ota.com/v1"></div>
    <div class="form-row">
      <div class="field"><label>Komisyon (%)</label><input class="input" id="cComm" type="number" min="0" max="50" value="${channel ? channel.commission : 15}"></div>
      <div class="field"><label>Otomatik Senkron</label>
        <select class="select" id="cAuto"><option value="false" ${channel && !channel.autoSync ? 'selected' : ''}>Kapalı</option><option value="true" ${channel && channel.autoSync ? 'selected' : ''}>Açık</option></select>
      </div>
    </div>
    <div class="section-sep"></div>
    <label style="font-size:.82rem;font-weight:700;color:var(--ink-soft)">Oda Tipi Eşleme <span class="muted" style="font-weight:400">(PMS oda tipi → OTA kodu)</span></label>
    <div class="stack" style="gap:8px;margin-top:8px">
      ${rt.map((t) => `<div class="flex gap-sm"><span style="flex:1;font-size:.86rem">${escapeHtml(t.name)}</span>
        <input class="input" data-map="${t.id}" style="max-width:160px;padding:6px 10px" placeholder="OTA kodu" value="${escapeHtml(mapVal(t.id))}"></div>`).join('')}
    </div>`;

  const foot = document.createElement('div');
  foot.innerHTML = `
    ${isEdit ? '<button class="btn btn-danger" id="delCh" style="margin-right:auto">Kanalı Kaldır</button>' : ''}
    <button class="btn btn-ghost" data-close>Vazgeç</button>
    <button class="btn btn-gold" id="saveCh">${isEdit ? 'Kaydet' : 'OTA Ekle'}</button>`;
  const m = openModal({ title: isEdit ? `${channel.name} · Ayarlar` : 'Yeni OTA Kanalı', body, footer: foot, wide: true });

  foot.querySelector('#saveCh').addEventListener('click', async () => {
    const name = m.el.querySelector('#cName').value.trim();
    if (!name) { toast('Kanal adı zorunludur.', 'err'); return; }
    const roomMappings = rt.map((t) => ({ roomTypeId: t.id, otaCode: m.el.querySelector(`[data-map="${t.id}"]`).value.trim() })).filter((x) => x.otaCode);
    const payload = {
      name,
      color: m.el.querySelector('#cColor').value,
      apiEndpoint: m.el.querySelector('#cEndpoint').value.trim(),
      commission: Number(m.el.querySelector('#cComm').value) || 0,
      autoSync: m.el.querySelector('#cAuto').value === 'true',
      roomMappings,
    };
    const key = m.el.querySelector('#cKey').value.trim();
    if (key) payload.apiKey = key;
    try {
      if (isEdit) { await api.put(`/api/channels/${channel.id}`, payload); toast('Kanal güncellendi.', 'ok'); }
      else { if (key) payload.apiKey = key; await api.post('/api/channels', payload); toast('OTA kanalı eklendi.', 'ok'); }
      m.close(); await store.refreshChannels(); ctx.reload();
    } catch (e) { toast(e.message, 'err'); }
  });

  if (isEdit) {
    foot.querySelector('#delCh').addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Kanalı Kaldır', message: `${channel.name} kanalını kaldırmak istiyor musunuz?`, confirmText: 'Kaldır', danger: true });
      if (!ok) return;
      try { await api.del(`/api/channels/${channel.id}`); toast('Kanal kaldırıldı.', 'warn'); m.close(); await store.refreshChannels(); ctx.reload(); }
      catch (e) { toast(e.message, 'err'); }
    });
  }
}
