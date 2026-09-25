// Uygulama kabuğu: kimlik doğrulama, rol bazlı navigasyon, yönlendirme ve global aksiyonlar.
import { api, setToken, getToken } from './api.js';
import { store } from './store.js';
import { toast, spinner, MONTHS_LONG, DOW_SHORT, initials, escapeHtml } from './ui.js';

import * as dashboard from './views/dashboard.js';
import * as reception from './views/reception.js';
import * as reservations from './views/reservations.js';
import * as calendar from './views/calendar-view.js';
import * as rates from './views/rates.js';
import * as housekeeping from './views/housekeeping.js';
import * as folio from './views/folio.js';
import * as channel from './views/channel.js';
import * as reports from './views/reports.js';
import * as nightaudit from './views/nightaudit.js';
import * as kbs from './views/kbs.js';
import * as users from './views/users.js';
import * as settings from './views/settings.js';

// ---------- Tema (açık / koyu) ----------
function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
function setTheme(t) {
  const dark = t === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem('pms_theme', dark ? 'dark' : 'light'); } catch (e) { /* yoksay */ }
  const btn = document.getElementById('themeToggle');
  if (btn) { btn.textContent = dark ? '☀' : '☾'; btn.title = dark ? 'Açık temaya geç' : 'Koyu temaya geç'; }
  window.dispatchEvent(new CustomEvent('pms-theme', { detail: dark ? 'dark' : 'light' }));
}
// Ayarlar ekranı erişebilsin
window.__pmsTheme = { get: currentTheme, set: setTheme };

const I = {
  dashboard: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  reception: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-5h6v5"/></svg>',
  reservations: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M8 2.5v3M16 2.5v3M3.5 9h17M8 13h3M8 16.5h6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="4.5" width="17" height="15.5" rx="2"/><path d="M8 2.5v3M16 2.5v3M3.5 9.5h17"/></svg>',
  rates: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 12l-8.5 8.5a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L12 4h8z"/><circle cx="16.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
  housekeeping: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3v6M4 9h4M6 9c-1.2 3-2 6-2 9a2 2 0 0 0 4 0c0-3-.8-6-2-9"/><path d="M12 5h8v5h-8zM14 10v10M18 10v10"/></svg>',
  folio: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h9l4 4v16l-2.5-1.5L14 22l-2.5-1.5L9 22l-2.5-1.5L4 22V4a2 2 0 0 1 2-2z"/><path d="M8 8h7M8 12h7M8 16h4"/></svg>',
  channel: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M6 8.5v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-3M12 13.5v2"/></svg>',
  reports: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/></svg>',
  nightaudit: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 14a8 8 0 1 1-9.5-9.8A6.5 6.5 0 0 0 20 14z"/></svg>',
  kbs: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M5 16c.5-1.6 2-2.5 3.5-2.5S11.5 14.4 12 16M14 9h4M14 12h4M14 15h2.5"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.8M17 20a5.5 5.5 0 0 0-2-4.3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
};

// Modüller otel departmanları gibi gruplandırılır (bilgi mimarisi = imza öğe)
const GROUPS = [
  { id: 'op', label: 'Operasyon' },
  { id: 'rev', label: 'Gelir & Dağıtım' },
  { id: 'fin', label: 'Mali & Yasal' },
  { id: 'admin', label: 'Yönetim' },
];

const ROUTES = [
  { id: 'reception', group: 'op', hash: '#/reception', label: 'Resepsiyon', icon: I.reception, mod: reception, badge: 'arrivals' },
  { id: 'reservations', group: 'op', hash: '#/reservations', label: 'Rezervasyonlar', icon: I.reservations, mod: reservations },
  { id: 'calendar', group: 'op', hash: '#/calendar', label: 'Aylık Takvim', icon: I.calendar, mod: calendar },
  { id: 'housekeeping', group: 'op', hash: '#/housekeeping', label: 'Oda Temizliği', icon: I.housekeeping, mod: housekeeping, badge: 'clean' },
  { id: 'rates', group: 'rev', hash: '#/rates', label: 'Fiyat & Kontenjan', icon: I.rates, mod: rates },
  { id: 'channel', group: 'rev', hash: '#/channel', label: 'Channel Manager', icon: I.channel, mod: channel },
  { id: 'reports', group: 'rev', hash: '#/reports', label: 'Raporlar', icon: I.reports, mod: reports },
  { id: 'folio', group: 'fin', hash: '#/folio', label: 'Folio & Fatura', icon: I.folio, mod: folio },
  { id: 'nightaudit', group: 'fin', hash: '#/nightaudit', label: 'Gün Sonu', icon: I.nightaudit, mod: nightaudit },
  { id: 'kbs', group: 'fin', hash: '#/kbs', label: 'KBS Bildirim', icon: I.kbs, mod: kbs },
  { id: 'users', group: 'admin', hash: '#/users', label: 'Kullanıcılar', icon: I.users, mod: users },
  { id: 'settings', group: 'admin', hash: '#/settings', label: 'Ayarlar', icon: I.settings, mod: settings },
];

let currentRoute = null;
let badgeCounts = {};
let businessDate = null;

const ctx = {
  navigate(hash) { if (location.hash === hash) mount(); else location.hash = hash; },
  reload() { mount(); },
  async refreshBadges() { await loadMeta(); renderNav(); setDateChip(); },
  toast,
  get user() { return store.user; },
  get businessDate() { return businessDate; },
};

function allowedRoutes() {
  return ROUTES.filter((r) => store.can(r.id));
}

function navItemHtml(r) {
  const active = currentRoute && currentRoute.id === r.id;
  let badge = '';
  if (r.badge === 'arrivals' && badgeCounts.pendingArrivals) badge = `<span class="nav-badge">${badgeCounts.pendingArrivals}</span>`;
  if (r.badge === 'clean' && badgeCounts.pendingHousekeeping) badge = `<span class="nav-badge">${badgeCounts.pendingHousekeeping}</span>`;
  return `<a class="nav-item ${active ? 'active' : ''}" href="${r.hash}"><span class="ico">${r.icon}</span><span class="nav-label">${r.label}</span>${badge}</a>`;
}

function renderNav() {
  const nav = document.getElementById('nav');
  const allowed = allowedRoutes();
  nav.innerHTML = GROUPS.map((g) => {
    const items = allowed.filter((r) => r.group === g.id);
    if (!items.length) return '';
    return `<div class="nav-group"><span class="nav-group-label">${g.label}</span></div>${items.map(navItemHtml).join('')}`;
  }).join('');
}

async function loadMeta() {
  try {
    const d = await api.dashboard();
    badgeCounts = { pendingArrivals: d.counts.pendingArrivals, pendingHousekeeping: d.counts.pendingHousekeeping };
    businessDate = d.date;
  } catch { /* yoksay */ }
}

function setTitle(label) {
  document.getElementById('pageTitle').textContent = label;
  document.title = `${label} · The Royal Luxury Hotel PMS`;
}

function setDateChip() {
  const chip = document.getElementById('todayChip');
  if (!businessDate) { chip.textContent = ''; return; }
  const [y, m, dd] = businessDate.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  chip.innerHTML = `<span style="color:var(--gold-ink)">İş günü:</span> ${DOW_SHORT[(d.getDay() + 6) % 7]}, ${dd} ${MONTHS_LONG[m - 1]} ${y}`;
}

async function mount() {
  let hash = location.hash || '#/reception';
  let route = allowedRoutes().find((r) => r.hash === hash);
  if (!route) route = allowedRoutes()[0] || ROUTES[0];
  currentRoute = route;
  setTitle(route.label);
  renderNav();
  closeSidebar();

  const view = document.getElementById('view');
  view.innerHTML = spinner();
  try {
    await route.mod.render(view, ctx);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty"><div class="em-ico">⚠️</div><p>Sayfa yüklenemedi: ${escapeHtml(err.message)}</p></div>`;
  }
  view.focus();
}

// ---------- Kenar çubuğu (mobil) ----------
function openSidebar() { document.getElementById('sidebar').classList.add('open'); addScrim(); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); removeScrim(); }
function addScrim() { if (document.querySelector('.scrim')) return; const s = document.createElement('div'); s.className = 'scrim'; s.addEventListener('click', closeSidebar); document.body.appendChild(s); }
function removeScrim() { const s = document.querySelector('.scrim'); if (s) s.remove(); }

async function globalSyncAll(btn) {
  const original = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="i-sync"></span> Senkronize ediliyor…';
  try {
    const res = await api.post('/api/channels/sync-all');
    await store.refreshChannels();
    toast(`Senkron tamamlandı — ${res.created} yeni rezervasyon, ${res.channels} kanal.`, 'ok');
    await ctx.refreshBadges();
    mount();
  } catch (err) {
    toast('Senkron hatası: ' + err.message, 'err');
  } finally {
    btn.disabled = false; btn.innerHTML = original;
  }
}

// ---------- Login ----------
function showLogin(message) {
  document.querySelector('.app').style.display = 'none';
  let el = document.getElementById('loginScreen');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loginScreen';
    el.className = 'login-screen';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <form class="login-card" id="loginForm">
      <div class="login-brand">
        <div class="lb-mark"><svg viewBox="0 0 32 32" width="34" height="34"><path d="M5 23h22l-2.2-12-5.5 5.5L16 8l-3.3 8.5L7.2 11z" fill="var(--gold)"/><rect x="5" y="24.5" width="22" height="2.2" rx="1" fill="var(--gold)"/></svg></div>
        <h1>The Royal Luxury Hotel</h1>
        <p>PMS · Yönetim Paneli</p>
      </div>
      ${message ? `<div class="badge b-danger" style="width:100%;justify-content:center;margin-bottom:12px">${escapeHtml(message)}</div>` : ''}
      <div class="field"><label>Kullanıcı Adı</label><input class="input" id="lgUser" autocomplete="username" required></div>
      <div class="field"><label>Parola</label><input class="input" id="lgPass" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-gold btn-block" type="submit" id="lgBtn">Giriş Yap</button>
      <div class="login-demo">
        <b>Demo hesapları:</b><br>
        <button type="button" data-u="admin" data-p="admin123">Yönetici</button>
        <button type="button" data-u="resepsiyon" data-p="resepsiyon123">Resepsiyon</button>
        <button type="button" data-u="muhasebe" data-p="muhasebe123">Muhasebe</button>
        <button type="button" data-u="kat" data-p="kat123">Kat Hizmetleri</button>
      </div>
    </form>`;
  const form = el.querySelector('#loginForm');
  el.querySelectorAll('.login-demo button').forEach((b) => b.addEventListener('click', () => {
    el.querySelector('#lgUser').value = b.dataset.u;
    el.querySelector('#lgPass').value = b.dataset.p;
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = el.querySelector('#lgBtn');
    btn.disabled = true; btn.textContent = 'Giriş yapılıyor…';
    try {
      const res = await api.login(el.querySelector('#lgUser').value.trim(), el.querySelector('#lgPass').value);
      setToken(res.token);
      location.reload();
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Giriş Yap';
      showLogin(err.message);
    }
  });
  setTimeout(() => el.querySelector('#lgUser').focus(), 40);
}

function setUserUI() {
  const u = store.user;
  document.getElementById('userAvatar').textContent = initials(u.name);
  document.getElementById('userName').textContent = u.name;
  document.getElementById('userRole').textContent = u.roleLabel || u.role;
  const syncBtn = document.getElementById('syncAllBtn');
  if (syncBtn) syncBtn.style.display = store.can('channel') ? '' : 'none';
}

// ---------- Başlatma ----------
async function boot() {
  try {
    const me = await api.me();
    store.user = me;
  } catch {
    showLogin();
    return;
  }
  setUserUI();
  try { await store.load(); } catch (e) { /* referanslar */ }
  await loadMeta();
  setDateChip();

  document.getElementById('menuToggle').addEventListener('click', openSidebar);
  setTheme(currentTheme()); // düğme ikonunu senkronla
  document.getElementById('themeToggle').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await api.logout(); } catch { /* yoksay */ }
    setToken('');
    location.reload();
  });
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-global="sync-all"]');
    if (g) globalSyncAll(g);
  });
  window.addEventListener('hashchange', mount);
  window.addEventListener('pms-unauthorized', () => { showLogin('Oturumunuz sona erdi.'); });

  if (!location.hash) location.hash = '#/reception';
  await mount();
}

function init() {
  if (!getToken()) { showLogin(); return; }
  boot();
}

init();
