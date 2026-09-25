// The Royal Luxury Hotel — PMS sunucusu (bağımlılıksız).
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

// Veritabanını yükle (ilk çalıştırmada seed üretir) ve üretim katmanını kur
db.load();
bootstrap();
auth.cleanupSessions();

// Kimlik doğrulaması gerektirmeyen uç noktalar
const PUBLIC_ROUTES = new Set(['POST /api/auth/login']);

const api = createApiRouter();

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  // CORS (yerel geliştirme için serbest)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (pathname.startsWith('/api/')) {
      // query nesnesini rota işleyicilere aktar
      req.query = Object.fromEntries(parsed.searchParams.entries());

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
        return await matched.handler(req, res);
      }
      return sendError(res, 404, `Bilinmeyen uç nokta: ${req.method} ${pathname}`);
    }

    // Statik dosya
    if (serveStatic(res, PUBLIC_DIR, pathname)) return;

    // SPA geri dönüşü (bilinmeyen yol -> index.html)
    if (serveStatic(res, PUBLIC_DIR, '/index.html')) return;

    sendError(res, 404, 'Bulunamadı.');
  } catch (err) {
    console.error('[server] Hata:', err);
    if (!res.headersSent) sendError(res, 500, 'Sunucu hatası: ' + err.message);
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
