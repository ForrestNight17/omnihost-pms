// Üretim katmanı API rotaları: auth, kullanıcılar, ayarlar, rate/inventory,
// müsaitlik, folio/fatura, KBS, döviz, gün sonu ve raporlama.
import { readBody, sendJSON, sendError } from './router.js';
import db from './db.js';
import * as auth from './auth.js';
import * as pricing from './pricing.js';
import * as billing from './billing.js';
import * as kbs from './integrations/kbs.js';
import * as tcmb from './integrations/tcmb.js';
import * as efatura from './integrations/efatura.js';
import { uid, addDays, nights, nightWithinStay, num } from './util.js';

// Rol guard'ı
function guard(req, res, roles) {
  if (!req.user) { sendError(res, 401, 'Oturum gerekli.'); return false; }
  if (roles && !roles.includes(req.user.role)) { sendError(res, 403, 'Bu işlem için yetkiniz yok.'); return false; }
  return true;
}

// Folio → rezervasyon → oda çözümleyici (oda bazlı log için)
function roomOfFolio(folioId) {
  const f = db.get('folios', folioId);
  if (!f) return null;
  const r = db.get('reservations', f.reservationId);
  return r ? r.roomId : null;
}

export function registerExtraRoutes(r) {
  // ================= AUTH =================
  r.post('/api/auth/login', async (req, res) => {
    const b = await readBody(req);
    const result = auth.login(b.username, b.password);
    if (!result.ok) return sendError(res, 401, result.message);
    auth.audit({ user: result.user }, 'login', 'session', result.user.id, `${result.user.name} giriş yaptı`);
    sendJSON(res, 200, result);
  });
  r.post('/api/auth/logout', (req, res) => {
    if (req.authToken) auth.logout(req.authToken);
    sendJSON(res, 200, { ok: true });
  });
  r.get('/api/auth/me', (req, res) => {
    if (!req.user) return sendError(res, 401, 'Oturum yok.');
    sendJSON(res, 200, auth.publicUser(req.user));
  });

  // ================= KULLANICILAR (admin) =================
  r.get('/api/users', (req, res) => {
    if (!guard(req, res, ['admin'])) return;
    sendJSON(res, 200, db.all('users').map((u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, roleLabel: (auth.ROLES[u.role] || {}).label, active: u.active, lastLoginAt: u.lastLoginAt || null })));
  });
  r.post('/api/users', async (req, res) => {
    if (!guard(req, res, ['admin'])) return;
    const b = await readBody(req);
    if (!b.username || !b.password || !b.name) return sendError(res, 400, 'Kullanıcı adı, ad ve parola zorunlu.');
    if (db.findOne('users', (u) => u.username.toLowerCase() === b.username.toLowerCase())) return sendError(res, 400, 'Bu kullanıcı adı kullanımda.');
    const { salt, hash } = auth.hashPassword(b.password);
    const user = db.insert('users', { id: uid('usr'), username: b.username, name: b.name, role: auth.ROLES[b.role] ? b.role : 'reception', salt, hash, active: true, createdAt: new Date().toISOString() });
    auth.audit(req, 'create', 'user', user.id, `Kullanıcı oluşturuldu: ${user.username} (${user.role})`);
    sendJSON(res, 201, { id: user.id, username: user.username, name: user.name, role: user.role, active: user.active });
  });
  r.put('/api/users/:id', async (req, res) => {
    if (!guard(req, res, ['admin'])) return;
    const b = await readBody(req);
    const patch = {};
    ['name', 'role', 'active'].forEach((k) => { if (b[k] != null) patch[k] = b[k]; });
    if (b.password) { const h = auth.hashPassword(b.password); patch.salt = h.salt; patch.hash = h.hash; }
    const up = db.update('users', req.params.id, patch);
    if (!up) return sendError(res, 404, 'Kullanıcı bulunamadı.');
    auth.audit(req, 'update', 'user', up.id, `Kullanıcı güncellendi: ${up.username}`);
    sendJSON(res, 200, { id: up.id, username: up.username, name: up.name, role: up.role, active: up.active });
  });

  // ================= AYARLAR (admin) =================
  r.get('/api/settings', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    sendJSON(res, 200, db.getSettings());
  });
  r.put('/api/settings', async (req, res) => {
    if (!guard(req, res, ['admin'])) return;
    const b = await readBody(req);
    const allowed = ['hotelName', 'legalName', 'taxOffice', 'taxNumber', 'address', 'phone', 'email', 'baseCurrency', 'kdvAccommodation', 'kdvFnb', 'kdvGeneral', 'accommodationTaxRate', 'kbsFacilityCode', 'efaturaProvider'];
    const patch = {};
    allowed.forEach((k) => { if (b[k] != null) patch[k] = b[k]; });
    const s = db.updateSettings(patch);
    auth.audit(req, 'update', 'settings', null, 'Otel/vergi ayarları güncellendi');
    sendJSON(res, 200, s);
  });

  // ================= AUDIT LOG (admin) =================
  r.get('/api/audit', (req, res) => {
    if (!guard(req, res, ['admin'])) return;
    const list = db.all('auditLogs').sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, num(req.query.limit, 100));
    sendJSON(res, 200, list);
  });

  // ================= PANSİYON PLANLARI (kaldırıldı — geriye dönük boş liste) =================
  r.get('/api/boardplans', (req, res) => sendJSON(res, 200, []));

  // ================= RATE & INVENTORY =================
  // Tek oda tipi için tarih aralığı (kontenjan + fiyat)
  r.get('/api/rateinv', (req, res) => {
    const { roomTypeId, from, to, board } = req.query;
    if (!roomTypeId || !from || !to) return sendError(res, 400, 'roomTypeId, from, to zorunlu.');
    sendJSON(res, 200, pricing.inventoryRange(roomTypeId, from, to, board || 'BB'));
  });
  // Tüm oda tipleri için grid (takvim editörü)
  r.get('/api/rateinv/grid', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) return sendError(res, 400, 'from, to zorunlu.');
    const types = db.all('roomTypes');
    sendJSON(res, 200, types.map((t) => ({
      roomType: { id: t.id, name: t.name, code: t.code, baseRate: t.baseRate },
      days: pricing.inventoryRange(t.id, from, to),
    })));
  });
  r.post('/api/rates', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception'])) return;
    const b = await readBody(req);
    if (!b.roomTypeId || !b.from || !b.to || b.price == null) return sendError(res, 400, 'roomTypeId, from, to, price zorunlu.');
    const n = pricing.setRate(b.roomTypeId, b.from, b.to, num(b.price));
    auth.audit(req, 'update', 'rate', b.roomTypeId, `${b.from}–${b.to} fiyat ${b.price}₺ (${n} gün)`);
    sendJSON(res, 200, { ok: true, updated: n });
  });
  r.post('/api/inventory', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception'])) return;
    const b = await readBody(req);
    if (!b.roomTypeId || !b.from || !b.to) return sendError(res, 400, 'roomTypeId, from, to zorunlu.');
    const patch = {};
    ['allotment', 'stopSell', 'minStay', 'maxStay', 'cta', 'ctd'].forEach((k) => { if (b[k] !== undefined) patch[k] = b[k]; });
    const n = pricing.setInventory(b.roomTypeId, b.from, b.to, patch);
    auth.audit(req, 'update', 'inventory', b.roomTypeId, `${b.from}–${b.to} kontenjan/kısıt güncellendi (${n} gün)`);
    sendJSON(res, 200, { ok: true, updated: n });
  });

  // ================= MÜSAİTLİK =================
  r.get('/api/availability', (req, res) => {
    const { roomTypeId, checkIn, checkOut } = req.query;
    if (!roomTypeId || !checkIn || !checkOut) return sendError(res, 400, 'roomTypeId, checkIn, checkOut zorunlu.');
    const avail = pricing.checkAvailability(roomTypeId, checkIn, checkOut);
    const q = pricing.quote(roomTypeId, checkIn, checkOut);
    sendJSON(res, 200, { ...avail, quote: q });
  });
  r.get('/api/availability/all', (req, res) => {
    const { checkIn, checkOut } = req.query;
    if (!checkIn || !checkOut) return sendError(res, 400, 'checkIn, checkOut zorunlu.');
    const types = db.all('roomTypes');
    sendJSON(res, 200, types.map((t) => {
      const avail = pricing.checkAvailability(t.id, checkIn, checkOut);
      const q = pricing.quote(t.id, checkIn, checkOut);
      // minimum gecelik müsait kontenjan
      let minAvail = Infinity;
      for (let d = checkIn; d < checkOut; d = addDays(d, 1)) minAvail = Math.min(minAvail, pricing.inventoryFor(t.id, d).available);
      return { roomType: { id: t.id, name: t.name, code: t.code, capacity: t.capacity }, available: avail.ok, reason: avail.reason || null, minAvailable: minAvail === Infinity ? 0 : minAvail, quote: q };
    }));
  });

  // ================= FOLIO / FATURA =================
  r.get('/api/reservations/:id/folio', (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    const folio = billing.ensureFolio(resv, req);
    sendJSON(res, 200, billing.folioSummary(folio.id));
  });
  r.post('/api/folios/:folioId/charge', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    const b = await readBody(req);
    if (!b.description || b.unitPrice == null) return sendError(res, 400, 'Açıklama ve tutar zorunlu.');
    billing.postExtra(req.params.folioId, { description: b.description, category: b.category, qty: num(b.qty, 1), unitPrice: num(b.unitPrice), kdvRate: b.kdvRate != null ? num(b.kdvRate) : null }, req);
    auth.audit(req, 'post', 'folio_charge', req.params.folioId, `Ekstra: ${b.description} (${b.unitPrice}₺)`, roomOfFolio(req.params.folioId));
    sendJSON(res, 200, billing.folioSummary(req.params.folioId));
  });
  r.post('/api/folios/:folioId/payment', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    const b = await readBody(req);
    if (b.amount == null) return sendError(res, 400, 'Tutar zorunlu.');
    billing.postPayment(req.params.folioId, { method: b.method, amount: num(b.amount), reference: b.reference }, req);
    auth.audit(req, 'post', 'payment', req.params.folioId, `Tahsilat: ${b.amount}₺ (${b.method})`, roomOfFolio(req.params.folioId));
    sendJSON(res, 200, billing.folioSummary(req.params.folioId));
  });
  r.post('/api/folios/:folioId/reverse/:itemId', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const out = billing.reverseItem(req.params.itemId, req);
    if (!out) return sendError(res, 400, 'Kalem bulunamadı veya zaten iptal edilmiş.');
    auth.audit(req, 'reverse', 'folio_item', req.params.itemId, 'Folio kalemi ters kayıtla iptal edildi', roomOfFolio(req.params.folioId));
    sendJSON(res, 200, billing.folioSummary(req.params.folioId));
  });
  r.post('/api/folios/:folioId/payment/:payId/reverse', (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    const pay = db.get('payments', req.params.payId);
    if (!pay || pay.reversed) return sendError(res, 400, 'Tahsilat bulunamadı veya zaten iptal edilmiş.');
    db.update('payments', req.params.payId, { reversed: true });
    auth.audit(req, 'reverse', 'payment', req.params.payId, `Tahsilat iptal edildi: ${pay.amount}₺`, roomOfFolio(req.params.folioId));
    sendJSON(res, 200, billing.folioSummary(req.params.folioId));
  });
  r.post('/api/folios/:folioId/invoice', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    const b = await readBody(req);
    const out = billing.createInvoice(req.params.folioId, { customerName: b.customerName, taxNumber: b.taxNumber, taxOffice: b.taxOffice, address: b.address }, req);
    if (!out.ok) return sendError(res, 400, out.message);
    auth.audit(req, 'create', 'invoice', out.invoice.id, `Fatura kesildi: ${out.invoice.number} (${out.invoice.type})`, roomOfFolio(req.params.folioId));
    sendJSON(res, 200, out);
  });
  r.get('/api/invoices', (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    sendJSON(res, 200, db.all('invoices').sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)));
  });
  r.get('/api/invoices/:id/xml', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const inv = db.get('invoices', req.params.id);
    if (!inv) return sendError(res, 404, 'Fatura bulunamadı.');
    const xml = efatura.buildUBLTR(inv, db.getSettings());
    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
  });

  // ================= KBS (kimlik bildirim) =================
  r.get('/api/kbs', (req, res) => {
    if (!guard(req, res, ['admin', 'reception'])) return;
    const list = db.all('kbsRecords').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    sendJSON(res, 200, list);
  });
  r.post('/api/kbs/:type/:reservationId', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception'])) return;
    const type = req.params.type === 'checkout' ? 'checkout' : 'checkin';
    const b = await readBody(req);
    const resv = db.get('reservations', req.params.reservationId);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    const guest = db.get('guests', resv.guestId);
    if (!guest) return sendError(res, 404, 'Misafir bulunamadı.');
    // Kimlik bilgilerini güncelle
    const gpatch = {};
    ['idType', 'idNumber', 'birthDate'].forEach((k) => { if (b[k]) gpatch[k] = b[k]; });
    if (Object.keys(gpatch).length) db.update('guests', guest.id, gpatch);
    const g = db.get('guests', guest.id);
    const [firstName, ...rest] = (g.name || '').split(' ');
    const room = resv.roomId ? db.get('rooms', resv.roomId) : null;
    const record = {
      id: uid('kbs'), reservationId: resv.id, guestId: g.id, type,
      idType: g.idType || (g.nationality && g.nationality !== 'TR' ? 'passport' : 'tc'),
      idNumber: g.idNumber || b.idNumber || '', firstName: firstName || g.name, lastName: rest.join(' ') || '-',
      birthDate: g.birthDate || b.birthDate || '', nationality: g.nationality || 'TR',
      roomNumber: room ? room.number : '', at: db.businessToday(),
      status: 'pending', reference: null, createdAt: new Date().toISOString(),
    };
    const result = kbs.submit(record, db.getSettings());
    record.status = result.status; record.reference = result.reference; record.message = result.message; record.xml = result.xml;
    db.insert('kbsRecords', record);
    auth.audit(req, 'kbs', 'kbs_' + type, resv.id, `KBS ${type === 'checkin' ? 'giriş' : 'çıkış'} bildirimi: ${record.firstName} ${record.lastName}`, resv.roomId);
    sendJSON(res, result.status === 'sent' ? 200 : 400, { ok: result.status === 'sent', record });
  });

  // ================= DÖVİZ (TCMB) =================
  r.get('/api/currency', (req, res) => {
    sendJSON(res, 200, db.all('currencies'));
  });
  r.post('/api/currency/refresh', async (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception'])) return;
    const data = await tcmb.fetchRates();
    // currencies koleksiyonunu güncelle
    const live = db.load().currencies;
    live.length = 0;
    Object.values(data.rates).forEach((c) => live.push({ id: c.code, ...c, source: data.source, date: data.date }));
    db.persist();
    auth.audit(req, 'update', 'currency', null, `TCMB kurları güncellendi (${data.source})`);
    sendJSON(res, 200, { ok: true, source: data.source, date: data.date, rates: db.all('currencies') });
  });

  // ================= GÜN SONU (NIGHT AUDIT) =================
  r.get('/api/nightaudit/preview', (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    sendJSON(res, 200, nightAuditPreview());
  });
  r.post('/api/nightaudit/run', async (req, res) => {
    if (!guard(req, res, ['admin'])) return;
    const out = await runNightAudit(req);
    if (out.ok === false) return sendError(res, 400, out.reason);
    auth.audit(req, 'nightaudit', 'nightaudit', null, `Gün sonu: ${out.closedDate} → ${out.newDate}`);
    sendJSON(res, 200, out);
  });

  // ================= RAPORLAR =================
  r.get('/api/reports/summary', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception'])) return;
    const from = req.query.from || db.businessToday();
    const to = req.query.to || addDays(from, 30);
    sendJSON(res, 200, reportSummary(from, to));
  });
  r.get('/api/reports/channel', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception'])) return;
    const from = req.query.from || addDays(db.businessToday(), -30);
    const to = req.query.to || addDays(db.businessToday(), 60);
    sendJSON(res, 200, reportChannel(from, to));
  });
  r.get('/api/reports/tax', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const from = req.query.from || addDays(db.businessToday(), -30);
    const to = req.query.to || addDays(db.businessToday(), 1);
    sendJSON(res, 200, reportTax(from, to));
  });
}

// ---------- Gün sonu iş mantığı ----------
function nightAuditPreview() {
  const t = db.businessToday();
  const reservations = db.all('reservations');
  const pendingArrivals = reservations.filter((r) => r.status === 'confirmed' && r.checkIn <= t);
  const overstays = reservations.filter((r) => r.status === 'checked_in' && r.checkOut <= t);
  const inHouse = reservations.filter((r) => r.status === 'checked_in');
  const roomRevenue = db.all('folioItems').filter((i) => i.date === t && i.type === 'room').reduce((s, i) => s + i.gross, 0);
  const payments = db.all('payments').filter((p) => p.date === t && !p.reversed).reduce((s, p) => s + p.amount, 0);
  return { date: t, nextDate: addDays(t, 1), pendingArrivals: pendingArrivals.length, overstays: overstays.length, inHouse: inHouse.length, roomRevenue: round(roomRevenue), payments: round(payments), canRun: pendingArrivals.length === 0 && overstays.length === 0 };
}

async function runNightAudit(req) {
  const t = db.businessToday();
  const reservations = db.all('reservations');

  // KURAL: O gün giriş bekleyen (confirmed, checkIn<=t) ya da çıkış bekleyen
  // (checked_in, checkOut<=t) oda varsa GÜN SONU YAPILAMAZ.
  const pendingArrivals = reservations.filter((r) => r.status === 'confirmed' && r.checkIn <= t);
  const overstays = reservations.filter((r) => r.status === 'checked_in' && r.checkOut <= t);
  if (pendingArrivals.length || overstays.length) {
    return {
      ok: false, blocked: true,
      pendingArrivals: pendingArrivals.length, overstays: overstays.length,
      reason: `Gün sonu yapılamaz: ${pendingArrivals.length} giriş bekleyen, ${overstays.length} çıkış bekleyen oda var. Önce giriş/çıkış işlemlerini tamamlayın (veya rezervasyonu iptal edin).`,
    };
  }

  // Günlük kapanış anlık görüntüsü (folio hareketlerinden)
  const closing = dailyClosing(t);

  // TCMB kurlarını çek
  let currency = null;
  try {
    const data = await tcmb.fetchRates();
    const live = db.load().currencies;
    live.length = 0;
    Object.values(data.rates).forEach((c) => live.push({ id: c.code, ...c, source: data.source, date: data.date }));
    db.persist();
    currency = { source: data.source, count: Object.keys(data.rates).length };
  } catch { /* yoksay */ }

  // İş tarihini ilerlet
  const newDate = addDays(t, 1);
  db.updateSettings({ currentDate: newDate });

  return { ok: true, closedDate: t, newDate, closing, currency };
}

function dailyClosing(date) {
  const items = db.all('folioItems').filter((i) => i.date === date);
  const payments = db.all('payments').filter((p) => p.date === date && !p.reversed);
  const roomRevenue = items.filter((i) => i.type === 'room').reduce((s, i) => s + i.gross, 0);
  const extraRevenue = items.filter((i) => i.type === 'extra').reduce((s, i) => s + i.gross, 0);
  const accTax = items.filter((i) => i.type === 'accommodation_tax').reduce((s, i) => s + i.gross, 0);
  const kdv = items.reduce((s, i) => s + i.kdvAmount, 0);
  const payByMethod = {};
  payments.forEach((p) => { payByMethod[p.method] = (payByMethod[p.method] || 0) + p.amount; });
  const reservations = db.all('reservations');
  const arrivals = reservations.filter((r) => r.checkIn === date && r.status !== 'cancelled').length;
  const departures = reservations.filter((r) => r.checkOut === date && (r.status === 'checked_out' || r.status === 'checked_in')).length;
  return {
    date, roomRevenue: round(roomRevenue), extraRevenue: round(extraRevenue), accommodationTax: round(accTax),
    kdvTotal: round(kdv), totalRevenue: round(roomRevenue + extraRevenue + accTax),
    payments: round(payments.reduce((s, p) => s + p.amount, 0)), payByMethod, arrivals, departures,
  };
}

// ---------- Raporlar ----------
function reportSummary(from, to) {
  const rooms = db.all('rooms');
  const sellable = rooms.filter((r) => !r.outOfOrder).length;
  const reservations = db.all('reservations').filter((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status));
  const days = [];
  let roomNights = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    const occ = reservations.filter((r) => nightWithinStay(d, r.checkIn, r.checkOut)).length;
    roomNights += occ;
    days.push({ date: d, occupied: occ, occupancyPct: sellable ? Math.round((occ / sellable) * 100) : 0 });
  }
  const nDays = days.length || 1;
  const items = db.all('folioItems').filter((i) => i.date >= from && i.date < to);
  const roomRevenue = items.filter((i) => i.type === 'room').reduce((s, i) => s + i.gross, 0);
  const extraRevenue = items.filter((i) => i.type === 'extra').reduce((s, i) => s + i.gross, 0);
  const accTax = items.filter((i) => i.type === 'accommodation_tax').reduce((s, i) => s + i.gross, 0);
  const avgOcc = Math.round(days.reduce((s, x) => s + x.occupancyPct, 0) / nDays);
  const adr = roomNights ? Math.round(roomRevenue / roomNights) : 0;
  const revpar = sellable ? Math.round(roomRevenue / (sellable * nDays)) : 0;
  return {
    from, to, days, sellable, roomNights,
    avgOccupancy: avgOcc, adr, revpar,
    roomRevenue: round(roomRevenue), extraRevenue: round(extraRevenue), accommodationTax: round(accTax),
    totalRevenue: round(roomRevenue + extraRevenue + accTax),
  };
}

function reportChannel(from, to) {
  const reservations = db.all('reservations').filter((r) => r.status !== 'cancelled' && r.status !== 'no_show' && r.checkIn >= from && r.checkIn < to);
  const by = {};
  reservations.forEach((r) => {
    const key = r.channelName || 'Doğrudan';
    if (!by[key]) by[key] = { name: key, source: r.source, count: 0, roomNights: 0, revenue: 0, commission: 0 };
    by[key].count++;
    by[key].roomNights += r.nights || 0;
    by[key].revenue += r.totalAmount || 0;
    const ch = r.channelId ? db.get('channels', r.channelId) : null;
    if (ch) by[key].commission += Math.round((r.totalAmount || 0) * (ch.commission || 0) / 100);
  });
  const list = Object.values(by).sort((a, b) => b.revenue - a.revenue).map((x) => ({ ...x, revenue: round(x.revenue), netRevenue: round(x.revenue - x.commission) }));
  return { from, to, channels: list, totalRevenue: round(list.reduce((s, x) => s + x.revenue, 0)), totalReservations: list.reduce((s, x) => s + x.count, 0) };
}

function reportTax(from, to) {
  const items = db.all('folioItems').filter((i) => i.date >= from && i.date < to);
  const byRate = {};
  items.filter((i) => i.kdvRate > 0).forEach((i) => {
    byRate[i.kdvRate] = byRate[i.kdvRate] || { rate: i.kdvRate, net: 0, kdv: 0, gross: 0 };
    byRate[i.kdvRate].net += i.netAmount; byRate[i.kdvRate].kdv += i.kdvAmount; byRate[i.kdvRate].gross += i.gross;
  });
  const accTax = items.filter((i) => i.type === 'accommodation_tax').reduce((s, i) => s + i.gross, 0);
  const invoices = db.all('invoices').filter((i) => i.issuedAt >= from);
  return {
    from, to,
    kdvByRate: Object.values(byRate).map((x) => ({ rate: x.rate, net: round(x.net), kdv: round(x.kdv), gross: round(x.gross) })),
    kdvTotal: round(items.reduce((s, i) => s + i.kdvAmount, 0)),
    accommodationTax: round(accTax),
    invoiceCount: invoices.length,
  };
}

function round(n) { return Math.round(n * 100) / 100; }
