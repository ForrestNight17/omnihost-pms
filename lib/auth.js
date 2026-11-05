// Kimlik doğrulama, oturum yönetimi, rol bazlı yetki (RBAC) ve audit log.
import crypto from 'crypto';
import db from './db.js';
import { uid } from './util.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat

// Timing attack / user enumeration önlemek için sabit sahte hash
const DUMMY_SALT = '0123456789abcdef0123456789abcdef';
const DUMMY_HASH = crypto.scryptSync('dummy_password_timing_protection', DUMMY_SALT, 64).toString('hex');

// ---------- Parola ----------
export function hashPassword(password) {
  const p = String(password || '');
  if (p.length < 8) {
    throw new Error('Parola en az 8 karakter olmalıdır.');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(p, salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  try {
    const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
    const a = Buffer.from(test, 'hex');
    const b = Buffer.from(hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// ---------- Roller & yetkiler ----------
// Her rolün erişebileceği modüller (frontend menüsü + backend guard için).
export const ROLES = {
  admin: { label: 'Yönetici', modules: ['reception', 'reservations', 'calendar', 'housekeeping', 'rates', 'folio', 'channel', 'reports', 'nightaudit', 'kbs', 'users', 'settings'] },
  reception: { label: 'Resepsiyon', modules: ['reception', 'reservations', 'calendar', 'folio', 'rates', 'kbs'] },
  housekeeping: { label: 'Kat Hizmetleri', modules: ['reception', 'housekeeping'] },
  accounting: { label: 'Muhasebe', modules: ['reception', 'folio', 'reports', 'reservations', 'nightaudit'] },
};

export function roleModules(role) {
  return (ROLES[role] || ROLES.reception).modules;
}
export function can(role, moduleId) {
  return roleModules(role).includes(moduleId);
}

// ---------- Oturumlar ----------
export function login(username, password) {
  const user = db.findOne('users', (u) => u.username.toLowerCase() === String(username || '').toLowerCase() && u.active);
  
  if (!user) {
    // Timing attack önleme: sahte hash doğrulaması yaparak gecikmeyi eşitle
    verifyPassword(password, DUMMY_SALT, DUMMY_HASH);
    return { ok: false, message: 'Kullanıcı adı veya parola hatalı.' };
  }

  if (!verifyPassword(password, user.salt, user.hash)) {
    return { ok: false, message: 'Kullanıcı adı veya parola hatalı.' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHashed = hashToken(token);
  const now = Date.now();
  db.insert('sessions', {
    id: tokenHashed,
    tokenHash: tokenHashed,
    userId: user.id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  });
  db.update('users', user.id, { lastLoginAt: new Date(now).toISOString() });
  return { ok: true, token, user: publicUser(user) };
}

export function getUserByToken(token) {
  if (!token) return null;
  const tokenHashed = hashToken(token);
  // Hem tokenHash ile hem de eski düz token ile kontrol (geriye dönük uyumluluk)
  const sess = db.findOne('sessions', (s) => s.tokenHash === tokenHashed || s.token === token || s.id === token);
  if (!sess) return null;
  if (new Date(sess.expiresAt).getTime() < Date.now()) {
    db.remove('sessions', sess.id);
    return null;
  }
  const user = db.get('users', sess.userId);
  if (!user || !user.active) return null;
  return user;
}

export function logout(token) {
  if (!token) return { ok: true };
  const tokenHashed = hashToken(token);
  const sess = db.findOne('sessions', (s) => s.tokenHash === tokenHashed || s.token === token || s.id === token);
  if (sess) db.remove('sessions', sess.id);
  return { ok: true };
}

export function revokeUserSessions(userId) {
  if (!userId) return;
  db.all('sessions')
    .filter((s) => s.userId === userId)
    .forEach((s) => db.remove('sessions', s.id));
}

export function cleanupSessions() {
  const now = Date.now();
  db.all('sessions')
    .filter((s) => new Date(s.expiresAt).getTime() < now)
    .forEach((s) => db.remove('sessions', s.id));
}

export function publicUser(user) {
  return { id: user.id, username: user.username, name: user.name, role: user.role, roleLabel: (ROLES[user.role] || {}).label || user.role, modules: roleModules(user.role) };
}

// ---------- Audit log ----------
export function audit(req, action, entity, entityId, detail = '', roomId = null) {
  const u = req && req.user ? req.user : null;
  db.insert('auditLogs', {
    id: uid('aud'),
    userId: u ? u.id : null,
    userName: u ? u.name : 'sistem',
    role: u ? u.role : null,
    action, entity, entityId: entityId || null, detail,
    roomId: roomId || null,
    timestamp: new Date().toISOString(),
  });
  // Son 1000 kaydı tut
  const logs = db.all('auditLogs');
  if (logs.length > 1000) {
    const live = db.load().auditLogs;
    live.splice(0, live.length - 1000);
    db.persist();
  }
}
