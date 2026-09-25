// Kimlik doğrulama, oturum yönetimi, rol bazlı yetki (RBAC) ve audit log.
import crypto from 'crypto';
import db from './db.js';
import { uid } from './util.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 saat

// ---------- Parola ----------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
  const user = db.findOne('users', (u) => u.username.toLowerCase() === String(username).toLowerCase() && u.active);
  if (!user) return { ok: false, message: 'Kullanıcı bulunamadı veya pasif.' };
  if (!verifyPassword(password, user.salt, user.hash)) return { ok: false, message: 'Kullanıcı adı veya parola hatalı.' };
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  db.insert('sessions', { id: token, token, userId: user.id, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_MS).toISOString() });
  db.update('users', user.id, { lastLoginAt: new Date(now).toISOString() });
  return { ok: true, token, user: publicUser(user) };
}

export function getUserByToken(token) {
  if (!token) return null;
  const sess = db.get('sessions', token);
  if (!sess) return null;
  if (new Date(sess.expiresAt).getTime() < Date.now()) {
    db.remove('sessions', token);
    return null;
  }
  const user = db.get('users', sess.userId);
  if (!user || !user.active) return null;
  return user;
}

export function logout(token) {
  db.remove('sessions', token);
  return { ok: true };
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
