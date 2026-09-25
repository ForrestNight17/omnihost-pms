// REST API istemcisi + kimlik doğrulama (token) yönetimi.
let authToken = localStorage.getItem('pms_token') || '';

export function setToken(t) {
  authToken = t || '';
  if (t) localStorage.setItem('pms_token', t);
  else localStorage.removeItem('pms_token');
}
export function getToken() { return authToken; }

async function req(method, path, body) {
  const opts = { method, headers: {} };
  if (authToken) opts.headers['Authorization'] = 'Bearer ' + authToken;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error('Sunucuya ulaşılamadı.');
  }
  if (res.status === 401 && path !== '/api/auth/login') {
    setToken('');
    window.dispatchEvent(new CustomEvent('pms-unauthorized'));
    throw new Error('Oturum sonlandı. Lütfen tekrar giriş yapın.');
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const msg = data && data.error ? data.error : `İstek başarısız (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function qs(params = {}) {
  const p = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!p.length) return '';
  return '?' + p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  patch: (p, b) => req('PATCH', p, b),
  del: (p) => req('DELETE', p),

  // Auth
  login: (username, password) => req('POST', '/api/auth/login', { username, password }),
  me: () => req('GET', '/api/auth/me'),
  logout: () => req('POST', '/api/auth/logout'),

  // Kısayollar
  dashboard: () => req('GET', '/api/dashboard'),
  roomTypes: () => req('GET', '/api/roomtypes'),
  rooms: () => req('GET', '/api/rooms'),
  availableRooms: (roomTypeId, checkIn, checkOut, excludeReservationId) => req('GET', '/api/available-rooms' + qs({ roomTypeId, checkIn, checkOut, excludeReservationId })),
  staff: () => req('GET', '/api/staff'),
  guests: (q) => req('GET', '/api/guests' + qs({ q })),
  reservations: (filters) => req('GET', '/api/reservations' + qs(filters)),
  reservation: (id) => req('GET', `/api/reservations/${id}`),
  housekeeping: (date) => req('GET', '/api/housekeeping' + qs({ date })),
  channels: () => req('GET', '/api/channels'),
  syncLogs: (filters) => req('GET', '/api/synclogs' + qs(filters)),
  calendar: (month) => req('GET', '/api/calendar' + qs({ month })),
  settings: () => req('GET', '/api/settings'),
};

export { qs };
