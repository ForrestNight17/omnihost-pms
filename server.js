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
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

// Veritabanını yükle (ilk çalıştırmada seed üretir) ve üretim katmanını kur
db.load();
bootstrap();
auth.cleanupSessions();

// ---------- Brute-force koruması (IP + Kullanıcı Adı) ----------
const loginAttempts = new Map(); // key -> { count, resetAt }
const MAX_ATTEMPTS = 5; // 5 başarısız denemede kilitle
const WINDOW_MS = 15 * 60 * 1000; // 15 dakika

function getClientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  return req.socket.remoteAddress || '127.0.0.1';
}

function checkBruteForce(key) {
  const now = Date.now();
  const entry = loginAttempts.get(key);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { blocked: false };
  }
  entry.count++;
  if (entry.count > MAX_ATTEMPTS) return { blocked: true };
  return { blocked: false };
}

function recordFailedLogin(ip, username) {
  checkBruteForce(`ip:${ip}`);
  if (username) checkBruteForce(`user:${username.toLowerCase()}`);
}

function isLoginBlocked(ip, username) {
  const ipEntry = loginAttempts.get(`ip:${ip}`);
  if (ipEntry && ipEntry.count >= MAX_ATTEMPTS && Date.now() <= ipEntry.resetAt) return true;
  if (username) {
    const userEntry = loginAttempts.get(`user:${username.toLowerCase()}`);
    if (userEntry && userEntry.count >= MAX_ATTEMPTS && Date.now() <= userEntry.resetAt) return true;
  }
  return false;
}

function resetBruteForce(ip, username) {
  loginAttempts.delete(`ip:${ip}`);
  if (username) loginAttempts.delete(`user:${username.toLowerCase()}`);
}

// Temizlik: her 30 dakikada süresi geçmiş girişleri sil
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of loginAttempts) if (now > e.resetAt) loginAttempts.delete(k);
}, 30 * 60 * 1000);

// Kimlik doğrulaması gerektirmeyen uç noktalar
const PUBLIC_ROUTES = new Set(['POST /api/auth/login']);

const api = createApiRouter();

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  const clientIp = getClientIp(req);

  // ---------- Güvenlik header'ları ----------
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Modern güvenli standart
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Content Security Policy (CSP)
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none';"
  );
  // Yalnızca aynı origin'e izin ver
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

      // ---------- Brute-force: login uç noktasında IP kontrolü ----------
      if (req.method === 'POST' && pathname === '/api/auth/login') {
        if (isLoginBlocked(clientIp)) {
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
        req._isLoginBlocked = isLoginBlocked;
        req._recordFailedLogin = recordFailedLogin;
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
    if (!res.headersSent) {
      const status = err.status || 500;
      const msg = status < 500 ? err.message : (NODE_ENV === 'development' ? err.message : 'Sunucu hatası. Lütfen tekrar deneyin.');
      sendError(res, status, msg);
    } else {
      console.error('[server] Hata (yanıt gönderildikten sonra):', err);
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
