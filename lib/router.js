// Küçük, bağımlılıksız router + HTTP yardımcıları.
import fs from 'fs';
import path from 'path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    // pattern: '/api/rooms/:id/status' -> regex + param adları
    const names = [];
    const regexStr = pattern
      .replace(/\/:([A-Za-z0-9_]+)/g, (_, n) => {
        names.push(n);
        return '/([^/]+)';
      })
      .replace(/\//g, '\\/');
    this.routes.push({
      method,
      regex: new RegExp(`^${regexStr}$`),
      names,
      handler,
    });
    return this;
  }

  get(p, h) { return this.add('GET', p, h); }
  post(p, h) { return this.add('POST', p, h); }
  put(p, h) { return this.add('PUT', p, h); }
  patch(p, h) { return this.add('PATCH', p, h); }
  delete(p, h) { return this.add('DELETE', p, h); }

  /** İstek yolu ile eşleşen ilk rotayı bulur. */
  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.regex.exec(pathname);
      if (!m) continue;
      const params = {};
      r.names.forEach((n, i) => {
        try {
          params[n] = decodeURIComponent(m[i + 1]);
        } catch {
          params[n] = m[i + 1];
        }
      });
      return { handler: r.handler, params };
    }
    return null;
  }
}

/** İstek gövdesini JSON olarak okur (maks 1 MB). */
export function readBody(req, maxSize = 1_000_000) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let length = 0;
    let destroyed = false;

    req.on('data', (chunk) => {
      if (destroyed) return;
      length += chunk.length;
      if (length > maxSize) {
        destroyed = true;
        const err = new Error('İstek gövdesi izin verilen boyutu aşıyor (maks 1MB).');
        err.status = 413;
        req.destroy();
        return reject(err);
      }
      raw += chunk;
    });

    req.on('end', () => {
      if (destroyed) return;
      if (!raw || !raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        const err = new Error('Geçersiz JSON verisi.');
        err.status = 400;
        reject(err);
      }
    });

    req.on('error', (e) => {
      if (!destroyed) reject(e);
    });
  });
}

/** JSON yanıt gönderir. */
export function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Hata yanıtı. */
export function sendError(res, status, message) {
  sendJSON(res, status, { error: message });
}

/** Statik dosya sunar; başarısızsa false döner. */
export function serveStatic(res, publicDir, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  if (rel === '/' || rel === '') rel = '/index.html';
  // path traversal koruması
  const safe = path
    .normalize(rel)
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^[/\\]+/, '');
  const filePath = path.join(publicDir, safe);
  if (!filePath.startsWith(publicDir)) return false;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}
