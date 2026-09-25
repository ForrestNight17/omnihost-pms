// Ortak UI yardımcıları: formatlama, rozetler, modal, toast.

// ---------- Sabitler ----------
export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export const MONTHS_LONG = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const DOW_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export const RES_STATUS = {
  confirmed: { label: 'Onaylı', cls: 'b-info' },
  checked_in: { label: 'Otelde', cls: 'b-ok' },
  checked_out: { label: 'Çıkış yaptı', cls: 'b-muted' },
  cancelled: { label: 'İptal', cls: 'b-danger' },
  no_show: { label: 'Gelmedi', cls: 'b-warn' },
};
export const HK_STATUS = {
  pending: { label: 'Bekliyor', cls: 'b-warn' },
  in_progress: { label: 'Devam ediyor', cls: 'b-info' },
  done: { label: 'Temizlendi', cls: 'b-ok' },
  inspected: { label: 'Kontrol edildi', cls: 'b-teal' },
};
export const HK_TYPE = { checkout: 'Çıkış Temizliği', stayover: 'Konaklama Temizliği', deep: 'Detaylı Temizlik', inspection: 'Kontrol' };
export const ROOM_STATUS = {
  available: { label: 'Boş', cls: 'b-ok' },
  occupied: { label: 'Dolu', cls: 'b-navy' },
  out_of_order: { label: 'Arızalı', cls: 'b-danger' },
};
export const HK_ROOM = {
  clean: { label: 'Temiz', cls: 'b-ok' },
  dirty: { label: 'Kirli', cls: 'b-warn' },
};

// ---------- Formatlama ----------
export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function money(n) {
  return (Number(n) || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 }) + ' ₺';
}
export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export function fmtDate(iso) {
  if (!iso) return '—';
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = parseISO(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
export function fmtDow(iso) {
  const d = parseISO(iso);
  return DOW_SHORT[(d.getDay() + 6) % 7];
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addDays(iso, n) {
  const d = parseISO(iso); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function nights(a, b) {
  return Math.max(0, Math.round((parseISO(b) - parseISO(a)) / 86400000));
}
export function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((s) => s[0] || '').join('').toUpperCase();
}
export function relTime(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} saat önce`;
  return `${Math.floor(diff / 86400)} gün önce`;
}
export function occClass(pct) {
  if (pct >= 80) return 'occ-hi';
  if (pct >= 45) return 'occ-mid';
  return 'occ-lo';
}

// ---------- Rozetler ----------
export function badge(label, cls, dot = true) {
  return `<span class="badge ${cls}">${dot ? '<span class="dot"></span>' : ''}${escapeHtml(label)}</span>`;
}
export function resBadge(status) {
  const s = RES_STATUS[status] || { label: status, cls: 'b-muted' };
  return badge(s.label, s.cls);
}
export function hkBadge(status) {
  const s = HK_STATUS[status] || { label: status, cls: 'b-muted' };
  return badge(s.label, s.cls);
}
export function roomStatusBadge(status) {
  const s = ROOM_STATUS[status] || { label: status, cls: 'b-muted' };
  return badge(s.label, s.cls);
}
export function sourceBadge(reservation) {
  if (!reservation.source || reservation.source === 'direct') return badge('Doğrudan', 'b-gold', false);
  return badge(reservation.channelName || 'OTA', 'b-navy', false);
}

// ---------- Toast ----------
export function toast(message, type = '') {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span class="td"></span>${escapeHtml(message)}`;
  root.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .3s, transform .3s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(8px)';
    setTimeout(() => t.remove(), 300);
  }, 2900);
}

// ---------- Modal ----------
export function openModal({ title, body, footer, wide, onClose }) {
  const root = document.getElementById('modalRoot');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || '')}">
      <div class="modal-head">
        <h3>${escapeHtml(title || '')}</h3>
        <button class="close" data-close aria-label="Kapat">&times;</button>
      </div>
      <div class="modal-body"></div>
      ${footer ? '<div class="modal-foot"></div>' : ''}
    </div>`;
  const bodyEl = overlay.querySelector('.modal-body');
  if (body instanceof Node) bodyEl.appendChild(body);
  else bodyEl.innerHTML = body || '';
  if (footer) {
    const footEl = overlay.querySelector('.modal-foot');
    if (footer instanceof Node) footEl.appendChild(footer);
    else footEl.innerHTML = footer;
  }
  root.appendChild(overlay);

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);

  const first = overlay.querySelector('input, select, textarea, button:not(.close)');
  if (first) setTimeout(() => first.focus(), 30);

  return { overlay, close, el: overlay.querySelector('.modal'), body: bodyEl };
}

export function confirmDialog({ title = 'Onay', message, confirmText = 'Onayla', danger = false }) {
  return new Promise((resolve) => {
    let decided = false;
    const finish = (val) => { if (decided) return; decided = true; resolve(val); };
    const foot = document.createElement('div');
    foot.innerHTML = `
      <button class="btn btn-ghost" data-close>Vazgeç</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmText)}</button>`;
    // onClose (overlay/ESC/Vazgeç) yalnızca karar verilmediyse "false" döndürür.
    const m = openModal({ title, body: `<p style="margin:0;color:var(--ink-soft)">${escapeHtml(message)}</p>`, footer: foot, onClose: () => finish(false) });
    foot.querySelector('[data-confirm]').addEventListener('click', () => { finish(true); m.close(); });
  });
}

// ---------- Yükleniyor ----------
export function spinner() { return '<div class="spinner"></div>'; }
export function emptyState(icon, text) {
  return `<div class="empty"><div class="em-ico">${icon}</div><p>${escapeHtml(text)}</p></div>`;
}
