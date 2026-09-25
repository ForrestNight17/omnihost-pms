// OmniHost PMS sunucusu — sıfır bağımlılık.
// Statik dosyaları ve /api REST arayüzünü sunar.
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';
import db from './lib/db.js';
import { createApiRouter } from './lib/api.js';
import { serveStatic, sendError } from './lib/router.js';
import * as auth from './lib/auth.js';
import { bootstrap } from './lib/bootstrap.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || '127.0.0.1';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Veritabanını yükle (ilk çalıştırmada seed üretir) ve üretim katmanını kur
db.load();
bootstrap();
auth.cleanupSessions();

// ---------- Brute-force koruması (bellek içi) ----------
const loginAttempts = new Map(); // ip -> { count, resetAt }
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 dakika

function checkBruteForce(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { blocked: false };
  }
  entry.count++;
  if (entry.count > MAX_ATTEMPTS) return { blocked: true };
  return { blocked: false };
}
function resetBruteForce(ip) { loginAttempts.delete(ip); }

// Temizlik: her 30 dakikada eski girişleri sil
setInterval(() => {
  const now = Date.now();
  for (const [ip, e] of loginAttempts) if (now > e.resetAt) loginAttempts.delete(ip);
}, 30 * 60 * 1000);

// Kimlik doğrulaması gerektirmeyen uç noktalar
const PUBLIC_ROUTES = new Set(['POST /api/auth/login']);

const api = createApiRouter();

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  // ---------- Güvenlik header'ları ----------
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Yalnızca localhost'tan erişime izin ver (üretim için reverse-proxy arkasında değiştir)
  res.setHeader('Access-Control-Allow-Origin', `http://${HOST}:${PORT}`);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Auth-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Sunucu kimliğini gizle
  res.removeHeader('X-Powered-By');
  res.setHeader('Server', 'OmniHost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname.startsWith('/api/')) {
      req.query = Object.fromEntries(parsed.searchParams.entries());

      // ---------- Brute-force: yalnızca login uç noktasında ----------
      if (req.method === 'POST' && pathname === '/api/auth/login') {
        const bf = checkBruteForce(clientIp);
        if (bf.blocked) {
          return sendError(res, 429, 'Çok fazla başarısız giriş denemesi. 15 dakika bekleyin.');
        }
      }

      // Kimlik doğrulama: Authorization: Bearer <token> veya x-auth-token
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (req.headers['x-auth-token'] || '');
      req.authToken = token;
      req.user = auth.getUserByToken(token);

      // Public olmayan tüm /api uçları oturum gerektirir
      if (!PUBLIC_ROUTES.has(`${req.method} ${pathname}`) && !req.user) {
        return sendError(res, 401, 'Oturum gerekli. Lütfen giriş yapın.');
      }

      const matched = api.match(req.method, pathname);
      if (matched) {
        req.params = matched.params;
        req._clientIp = clientIp;
        req._resetBruteForce = resetBruteForce;
        return await matched.handler(req, res);
      }
      return sendError(res, 404, 'Bilinmeyen uç nokta.');
    }

    // Statik dosya
    if (serveStatic(res, PUBLIC_DIR, pathname)) return;

    // SPA geri dönüşü (bilinmeyen yol -> index.html)
    if (serveStatic(res, PUBLIC_DIR, '/index.html')) return;

    sendError(res, 404, 'Bulunamadı.');
  } catch (err) {
    console.error('[server] Hata:', err);
    if (!res.headersSent) {
      // Üretimde iç hata detayını asla dışa sızdırma
      const msg = NODE_ENV === 'development' ? err.message : 'Sunucu hatası. Lütfen tekrar deneyin.';
      sendError(res, 500, msg);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ┌────────────────────────────────────────────────┐');
  console.log('  │   OmniHost PMS                                  │');
  console.log('  ├────────────────────────────────────────────────┤');
  console.log(`  │   ➜  http://${HOST}:${PORT}${' '.repeat(Math.max(0, 34 - String(HOST).length - String(PORT).length))}│`);
  console.log('  │   Resepsiyon · Housekeeping · Rezervasyon      │');
  console.log('  │   Takvim · Channel Manager                     │');
  console.log('  └────────────────────────────────────────────────┘');
  console.log('');
});
