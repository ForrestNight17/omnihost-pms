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

  // 1) Konaklama Raporu (Hâli hazırda konaklayan ve ayrılmış misafirler)
  r.get('/api/reports/stays', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception', 'housekeeping'])) return;
    const date = req.query.date || db.businessToday();
    const filter = req.query.filter || 'all'; // all | inhouse | departed
    sendJSON(res, 200, reportStays(date, filter));
  });

  // 2) Gider Yönetimi & Mali Rapor (Muhasebe)
  r.get('/api/expenses', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const { from, to, category } = req.query;
    let list = db.all('expenses');
    if (from) list = list.filter((e) => e.date >= from);
    if (to) list = list.filter((e) => e.date <= to);
    if (category) list = list.filter((e) => e.category === category);
    list.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
    sendJSON(res, 200, list);
  });
  r.post('/api/expenses', async (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const b = await readBody(req);
    if (!b.amount || !b.category || !b.date) return sendError(res, 400, 'Tarih, kategori ve tutar zorunludur.');
    const exp = {
      id: uid('exp'),
      date: b.date,
      category: b.category,
      description: b.description || '',
      amount: Math.round(Number(b.amount) * 100) / 100,
      paymentMethod: b.paymentMethod || 'bank',
      invoiceNo: b.invoiceNo || '',
      createdBy: req.user ? req.user.name : 'sistem',
      createdAt: new Date().toISOString(),
    };
    db.insert('expenses', exp);
    auth.audit(req, 'create', 'expense', exp.id, `Gider kaydedildi: ${exp.category} - ${exp.amount} ₺ (${exp.description})`);
    sendJSON(res, 201, exp);
  });
  r.delete('/api/expenses/:id', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const exp = db.get('expenses', req.params.id);
    if (!exp) return sendError(res, 404, 'Gider kaydı bulunamadı.');
    db.remove('expenses', req.params.id);
    auth.audit(req, 'delete', 'expense', exp.id, `Gider silindi: ${exp.category} - ${exp.amount} ₺`);
    sendJSON(res, 200, { ok: true });
  });
  r.get('/api/reports/financial', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const from = req.query.from || addDays(db.businessToday(), -30);
    const to = req.query.to || db.businessToday();
    sendJSON(res, 200, reportFinancial(from, to));
  });

  // 3) Aylık Oda Bakiyeleri Raporu
  r.get('/api/reports/monthly-balances', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception'])) return;
    const month = req.query.month || db.businessToday().slice(0, 7);
    sendJSON(res, 200, reportMonthlyBalances(month));
  });

  // 4) Tesis Performans Raporu (Aylık & Yıllık)
  r.get('/api/reports/facility', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception'])) return;
    const year = Number(req.query.year) || Number(db.businessToday().slice(0, 4));
    const mode = req.query.mode || 'monthly'; // 'monthly' | 'yearly'
    sendJSON(res, 200, reportFacility(year, mode));
  });

  // 5) Kara Liste Raporu & İşlemleri
  r.get('/api/reports/blacklist', (req, res) => {
    if (!guard(req, res, ['admin', 'reception', 'accounting'])) return;
    const list = db.all('guests').filter((g) => g.blacklist);
    list.sort((a, b) => (b.blacklistDate || '').localeCompare(a.blacklistDate || ''));
    sendJSON(res, 200, list);
  });
  r.post('/api/guests/:id/blacklist', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception'])) return;
    const b = await readBody(req);
    const guest = db.get('guests', req.params.id);
    if (!guest) return sendError(res, 404, 'Misafir bulunamadı.');
    const active = b.blacklist !== false;
    const patch = {
      blacklist: active,
      blacklistReason: active ? (b.reason || b.blacklistReason || 'Kural ihlali / Güvenlik gerekçesi') : '',
      blacklistDate: active ? (b.date || db.businessToday()) : null,
      blacklistedBy: active ? (req.user ? req.user.name : 'sistem') : null,
    };
    const up = db.update('guests', guest.id, patch);
    auth.audit(req, active ? 'blacklist_add' : 'blacklist_remove', 'guest', guest.id, `${guest.name} ${active ? 'kara listeye alındı' : 'kara listeden çıkarıldı'}: ${patch.blacklistReason || ''}`);
    sendJSON(res, 200, up);
  });
  r.post('/api/guests/blacklist/new', async (req, res) => {
    if (!guard(req, res, ['admin', 'reception'])) return;
    const b = await readBody(req);
    if (!b.name) return sendError(res, 400, 'Misafir adı ve soyadı zorunludur.');
    const guest = {
      id: uid('gst'),
      name: b.name,
      idNumber: b.idNumber || '',
      idType: b.idType || 'tc',
      phone: b.phone || '',
      email: b.email || '',
      nationality: b.nationality || 'TR',
      blacklist: true,
      blacklistReason: b.reason || 'Kural ihlali / Güvenlik gerekçesi',
      blacklistDate: b.date || db.businessToday(),
      blacklistedBy: req.user ? req.user.name : 'sistem',
      createdAt: new Date().toISOString(),
    };
    db.insert('guests', guest);
    auth.audit(req, 'blacklist_add', 'guest', guest.id, `Yeni misafir kara listeye eklendi: ${guest.name} (${guest.blacklistReason})`);
    sendJSON(res, 201, guest);
  });

  // 6) Kurumsal Satış & Cari Hesap Raporu
  r.get('/api/corporate-accounts', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting', 'reception'])) return;
    sendJSON(res, 200, db.all('corporateAccounts'));
  });
  r.post('/api/corporate-accounts', async (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const b = await readBody(req);
    if (!b.name) return sendError(res, 400, 'Hesap / Firma adı zorunludur.');
    const acc = {
      id: uid('corp'),
      name: b.name,
      type: b.type || 'corporate',
      code: b.code || 'CORP',
      taxNumber: b.taxNumber || '',
      taxOffice: b.taxOffice || '',
      contactPerson: b.contactPerson || '',
      phone: b.phone || '',
      email: b.email || '',
      discountPct: Number(b.discountPct) || 0,
      paymentTermsDays: Number(b.paymentTermsDays) || 30,
      createdAt: new Date().toISOString(),
    };
    db.insert('corporateAccounts', acc);
    auth.audit(req, 'create', 'corporate_account', acc.id, `Cari hesap oluşturuldu: ${acc.name} (${acc.type})`);
    sendJSON(res, 201, acc);
  });
  r.get('/api/reports/corporate-sales', (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const month = req.query.month || '';
    const year = Number(req.query.year) || Number(db.businessToday().slice(0, 4));
    sendJSON(res, 200, reportCorporateSales(year, month));
  });
  r.post('/api/reports/corporate-sales/payment', async (req, res) => {
    if (!guard(req, res, ['admin', 'accounting'])) return;
    const b = await readBody(req);
    if (!b.accountId || !b.amount) return sendError(res, 400, 'Cari hesap ve ödeme tutarı zorunludur.');
    const pay = {
      id: uid('pay'),
      folioId: 'corp_' + b.accountId,
      date: b.date || db.businessToday(),
      method: b.method || 'bank',
      amount: Math.round(Number(b.amount) * 100) / 100,
      reference: `Cari Tahsilat: ${b.accountName || b.accountId} (${b.month || ''}) ${b.reference ? '- ' + b.reference : ''}`.trim(),
      corporateAccountId: b.accountId,
      corporateMonth: b.month || db.businessToday().slice(0, 7),
      reversed: false,
      createdBy: req.user ? req.user.name : 'sistem',
      createdAt: new Date().toISOString(),
    };
    db.insert('payments', pay);
    auth.audit(req, 'payment', 'corporate_account', b.accountId, `Cari tahsilat alındı: ${pay.amount} ₺ (${b.accountName || b.accountId} - ${pay.corporateMonth})`);
    sendJSON(res, 201, { ok: true, payment: pay });
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

// 1) Konaklama Raporu (Hâli hazırda konaklayan ve ayrılmış misafirler)
function reportStays(date, filter = 'all') {
  const t = date || db.businessToday();
  const rooms = db.all('rooms');
  const reservations = db.all('reservations').filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
  const guests = db.all('guests');
  const roomTypes = db.all('roomTypes');

  const stays = [];
  reservations.forEach((r) => {
    const isDeparted = (r.checkOut === t && (r.status === 'checked_out' || r.status === 'checked_in')) || (r.status === 'checked_out' && r.checkOut === t);
    const isInHouse = (r.status === 'checked_in' && r.checkIn <= t && t <= r.checkOut) ||
                      (r.checkIn <= t && t < r.checkOut && ['confirmed', 'checked_in'].includes(r.status));

    if (!isInHouse && !isDeparted) return;
    if (filter === 'inhouse' && !isInHouse) return;
    if (filter === 'departed' && !isDeparted) return;

    const guest = guests.find((g) => g.id === r.guestId);
    const room = r.roomId ? rooms.find((rm) => rm.id === r.roomId) : null;
    const rt = roomTypes.find((x) => x.id === r.roomTypeId);
    const fSum = r.folioId ? billing.folioSummary(r.folioId) : null;

    stays.push({
      id: r.id,
      code: r.code,
      roomId: r.roomId,
      roomNumber: room ? room.number : '—',
      roomBlock: room ? room.block : '—',
      roomFloor: room ? room.floor : null,
      roomTypeName: rt ? rt.name : '—',
      guestName: guest ? guest.name : '—',
      guestPhone: guest ? guest.phone : '',
      guestEmail: guest ? guest.email : '',
      guestIdNumber: guest ? guest.idNumber : '',
      nationality: guest ? guest.nationality : '',
      vip: guest ? !!guest.vip : false,
      blacklist: guest ? !!guest.blacklist : false,
      blacklistReason: guest ? guest.blacklistReason || '' : '',
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: r.nights || nights(r.checkIn, r.checkOut),
      board: r.board || 'BB',
      dailyRate: r.ratePerNight || (rt ? rt.baseRate : 0),
      totalAmount: r.totalAmount || 0,
      paidAmount: r.paidAmount || 0,
      balance: fSum ? fSum.balance : Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0)),
      charges: fSum ? fSum.chargeTotal : (r.totalAmount || 0),
      paid: fSum ? fSum.paidTotal : (r.paidAmount || 0),
      source: r.source || 'direct',
      channelName: r.channelName || 'Doğrudan',
      status: r.status,
      isInHouse,
      isDeparted,
    });
  });

  stays.sort((a, b) => (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true }));

  const inHouseCount = stays.filter((s) => s.isInHouse).length;
  const departedCount = stays.filter((s) => s.isDeparted).length;
  const totalDailyRevenue = stays.reduce((s, x) => s + (Number(x.dailyRate) || 0), 0);
  const totalBalance = stays.reduce((s, x) => s + (Number(x.balance) || 0), 0);

  return {
    date: t,
    filter,
    stays,
    totalCount: stays.length,
    inHouseCount,
    departedCount,
    totalDailyRevenue: round(totalDailyRevenue),
    totalBalance: round(totalBalance),
  };
}

// 2) Mali Rapor (Gün-gün gelir ve gider tablosu)
function reportFinancial(from, to) {
  const days = [];
  let totalRev = 0;
  let totalExp = 0;
  let totalPay = 0;

  const expenses = db.all('expenses');
  const folioItems = db.all('folioItems').filter((i) => !i.reversed);
  const payments = db.all('payments').filter((p) => !p.reversed);

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dayItems = folioItems.filter((i) => i.date === d);
    const dayPayments = payments.filter((p) => p.date === d);
    const dayExpenses = expenses.filter((e) => e.date === d);

    const roomRev = dayItems.filter((i) => i.type === 'room').reduce((s, i) => s + i.gross, 0);
    const extraRev = dayItems.filter((i) => i.type === 'extra').reduce((s, i) => s + i.gross, 0);
    const taxRev = dayItems.filter((i) => i.type === 'accommodation_tax').reduce((s, i) => s + i.gross, 0);
    const dayRevenue = roomRev + extraRev + taxRev;

    const dayExpenseTotal = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);
    const dayPaymentsTotal = dayPayments.reduce((s, p) => s + Number(p.amount), 0);
    const netProfit = dayRevenue - dayExpenseTotal;

    totalRev += dayRevenue;
    totalExp += dayExpenseTotal;
    totalPay += dayPaymentsTotal;

    days.push({
      date: d,
      roomRevenue: round(roomRev),
      extraRevenue: round(extraRev),
      taxRevenue: round(taxRev),
      totalRevenue: round(dayRevenue),
      expenses: dayExpenses,
      expenseCount: dayExpenses.length,
      totalExpense: round(dayExpenseTotal),
      netProfit: round(netProfit),
      paymentsCollected: round(dayPaymentsTotal),
    });
  }

  // Kategori bazlı gider dağılımı
  const periodExpenses = expenses.filter((e) => e.date >= from && e.date <= to);
  const byCat = {};
  periodExpenses.forEach((e) => {
    byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount);
  });
  const categoryBreakdown = Object.entries(byCat).map(([category, amount]) => ({
    category,
    amount: round(amount),
    pct: totalExp > 0 ? Math.round((amount / totalExp) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount);

  return {
    from,
    to,
    days: days.reverse(), // En güncel tarih en üstte
    totalRevenue: round(totalRev),
    totalExpense: round(totalExp),
    netProfit: round(totalRev - totalExp),
    totalPayments: round(totalPay),
    categoryBreakdown,
  };
}

// 3) Aylık Oda Bakiyeleri Raporu
function reportMonthlyBalances(month) {
  const targetMonth = month || db.businessToday().slice(0, 7);
  const reservations = db.all('reservations').filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
  const rooms = db.all('rooms');
  const guests = db.all('guests');
  const roomTypes = db.all('roomTypes');

  const list = [];
  reservations.forEach((r) => {
    const inMonth = (r.checkIn && r.checkIn.slice(0, 7) === targetMonth) ||
                    (r.checkOut && r.checkOut.slice(0, 7) === targetMonth) ||
                    (r.checkIn < targetMonth && r.checkOut > targetMonth);
    if (!inMonth) return;

    const room = r.roomId ? rooms.find((rm) => rm.id === r.roomId) : null;
    const guest = guests.find((g) => g.id === r.guestId);
    const rt = roomTypes.find((x) => x.id === r.roomTypeId);
    const fSum = r.folioId ? billing.folioSummary(r.folioId) : null;

    const charges = fSum ? fSum.chargeTotal : (r.totalAmount || 0);
    const paid = fSum ? fSum.paidTotal : (r.paidAmount || 0);
    const balance = round(charges - paid);

    list.push({
      reservationId: r.id,
      code: r.code,
      roomId: r.roomId,
      roomNumber: room ? room.number : '—',
      roomBlock: room ? room.block : '—',
      roomTypeName: rt ? rt.name : '—',
      guestName: guest ? guest.name : '—',
      guestPhone: guest ? guest.phone : '',
      guestVip: guest ? !!guest.vip : false,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      status: r.status,
      channelName: r.channelName || 'Doğrudan',
      charges: round(charges),
      paid: round(paid),
      balance: balance,
      hasBalance: balance > 0.05,
    });
  });

  list.sort((a, b) => b.balance - a.balance || (a.roomNumber || '').localeCompare(b.roomNumber || '', undefined, { numeric: true }));

  const totalCharges = list.reduce((s, x) => s + x.charges, 0);
  const totalPaid = list.reduce((s, x) => s + x.paid, 0);
  const totalBalance = list.reduce((s, x) => s + x.balance, 0);
  const roomsWithBalanceCount = list.filter((x) => x.hasBalance).length;

  return {
    month: targetMonth,
    rooms: list,
    totalCount: list.length,
    roomsWithBalanceCount,
    totalCharges: round(totalCharges),
    totalPaid: round(totalPaid),
    totalBalance: round(totalBalance),
  };
}

// 4) Tesis Performans Raporu (Aylık & Yıllık)
function reportFacility(targetYear, mode = 'monthly') {
  const rooms = db.all('rooms');
  const sellableRooms = rooms.filter((r) => !r.outOfOrder).length || 62;
  const reservations = db.all('reservations').filter((r) => ['confirmed', 'checked_in', 'checked_out'].includes(r.status));
  const folioItems = db.all('folioItems').filter((i) => !i.reversed);

  if (mode === 'yearly') {
    const years = [targetYear - 2, targetYear - 1, targetYear, targetYear + 1];
    const data = years.map((y) => {
      const isLeap = (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
      const daysInYear = isLeap ? 366 : 365;
      const capacity = sellableRooms * daysInYear;

      let soldNights = 0;
      const yStr = String(y);
      for (let m = 1; m <= 12; m++) {
        const mm = String(m).padStart(2, '0');
        const dCount = new Date(y, m, 0).getDate();
        for (let d = 1; d <= dCount; d++) {
          const dt = `${yStr}-${mm}-${String(d).padStart(2, '0')}`;
          soldNights += reservations.filter((r) => nightWithinStay(dt, r.checkIn, r.checkOut)).length;
        }
      }

      const yItems = folioItems.filter((i) => i.date && i.date.startsWith(yStr));
      let roomRev = yItems.filter((i) => i.type === 'room').reduce((s, i) => s + i.gross, 0);
      let extraRev = yItems.filter((i) => i.type === 'extra').reduce((s, i) => s + i.gross, 0);

      if (roomRev === 0 && soldNights > 0) {
        const yearRes = reservations.filter((r) => r.checkIn && r.checkIn.startsWith(yStr));
        roomRev = yearRes.reduce((s, r) => s + (r.totalAmount || 0), 0);
        extraRev = Math.round(roomRev * 0.12);
      }

      const occPct = capacity > 0 ? Math.round((soldNights / capacity) * 100) : 0;
      const adr = soldNights > 0 ? Math.round(roomRev / soldNights) : 0;
      const revpar = capacity > 0 ? Math.round(roomRev / capacity) : 0;
      const totalRev = roomRev + extraRev;

      return {
        year: y,
        capacity,
        soldNights,
        occupancyPct: occPct,
        roomRevenue: round(roomRev),
        extraRevenue: round(extraRev),
        totalRevenue: round(totalRev),
        adr,
        revpar,
        taxAccommodation: round(roomRev * 0.02),
        taxKdv: round(roomRev * 0.10 + extraRev * 0.10),
      };
    });

    return { mode: 'yearly', currentYear: targetYear, years: data };
  }

  // Monthly mode (12 months)
  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const months = [];
  let ySoldNights = 0;
  let yCapacity = 0;
  let yRoomRev = 0;
  let yExtraRev = 0;

  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0');
    const monthKey = `${targetYear}-${mm}`;
    const daysInMonth = new Date(targetYear, m, 0).getDate();
    const capacity = sellableRooms * daysInMonth;

    let soldNights = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = `${targetYear}-${mm}-${String(d).padStart(2, '0')}`;
      soldNights += reservations.filter((r) => nightWithinStay(dt, r.checkIn, r.checkOut)).length;
    }

    const mItems = folioItems.filter((i) => i.date && i.date.startsWith(monthKey));
    let roomRev = mItems.filter((i) => i.type === 'room').reduce((s, i) => s + i.gross, 0);
    let extraRev = mItems.filter((i) => i.type === 'extra').reduce((s, i) => s + i.gross, 0);

    if (roomRev === 0 && soldNights > 0) {
      const mRes = reservations.filter((r) => r.checkIn && r.checkIn.startsWith(monthKey));
      roomRev = mRes.reduce((s, r) => s + (r.totalAmount || 0), 0);
      extraRev = Math.round(roomRev * 0.12);
    }

    const occPct = capacity > 0 ? Math.round((soldNights / capacity) * 100) : 0;
    const adr = soldNights > 0 ? Math.round(roomRev / soldNights) : 0;
    const revpar = capacity > 0 ? Math.round(roomRev / capacity) : 0;
    const totalRev = roomRev + extraRev;

    ySoldNights += soldNights;
    yCapacity += capacity;
    yRoomRev += roomRev;
    yExtraRev += extraRev;

    months.push({
      monthKey,
      monthName: monthNames[m - 1],
      daysInMonth,
      capacity,
      soldNights,
      occupancyPct: occPct,
      roomRevenue: round(roomRev),
      extraRevenue: round(extraRev),
      totalRevenue: round(totalRev),
      adr,
      revpar,
      taxAccommodation: round(roomRev * 0.02),
      taxKdv: round(roomRev * 0.10 + extraRev * 0.10),
    });
  }

  const yOcc = yCapacity > 0 ? Math.round((ySoldNights / yCapacity) * 100) : 0;
  const yAdr = ySoldNights > 0 ? Math.round(yRoomRev / ySoldNights) : 0;
  const yRevpar = yCapacity > 0 ? Math.round(yRoomRev / yCapacity) : 0;

  return {
    mode: 'monthly',
    year: targetYear,
    months,
    summary: {
      capacity: yCapacity,
      soldNights: ySoldNights,
      avgOccupancy: yOcc,
      adr: yAdr,
      revpar: yRevpar,
      totalRoomRevenue: round(yRoomRev),
      totalExtraRevenue: round(yExtraRev),
      grandTotalRevenue: round(yRoomRev + yExtraRev),
      totalTaxAccommodation: round(yRoomRev * 0.02),
      totalTaxKdv: round((yRoomRev + yExtraRev) * 0.10),
    },
  };
}

// 5) Kurumsal Satış & Cari Hesap Raporu
function reportCorporateSales(targetYear, monthFilter = '') {
  const accounts = db.all('corporateAccounts');
  const reservations = db.all('reservations').filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
  const channels = db.all('channels');
  const payments = db.all('payments').filter((p) => !p.reversed);

  const accountMap = new Map();
  accounts.forEach((a) => {
    accountMap.set(a.id, {
      id: a.id,
      name: a.name,
      type: a.type,
      code: a.code || 'CORP',
      taxNumber: a.taxNumber || '—',
      contactPerson: a.contactPerson || '—',
      phone: a.phone || '',
      email: a.email || '',
    });
  });

  channels.forEach((c) => {
    if (!accountMap.has(c.id)) {
      accountMap.set(c.id, {
        id: c.id,
        name: c.name,
        type: 'agency',
        code: 'OTA-' + (c.slug || '').toUpperCase().slice(0, 3),
        taxNumber: '—',
        contactPerson: 'OTA Partner Destek',
        phone: '',
        email: '',
      });
    }
  });

  const months = [];
  if (monthFilter) {
    months.push(monthFilter);
  } else {
    for (let m = 1; m <= 12; m++) {
      months.push(`${targetYear}-${String(m).padStart(2, '0')}`);
    }
  }

  const results = [];
  let grandTotalProduction = 0;
  let grandTotalPaid = 0;
  let grandTotalBalance = 0;

  accountMap.forEach((acc) => {
    months.forEach((mStr) => {
      const matchedRes = reservations.filter((r) => {
        const matchAcc = r.source === acc.id || r.channelId === acc.id || (r.channelName && r.channelName.toLowerCase().includes(acc.name.toLowerCase())) || r.corporateAccountId === acc.id;
        const matchMonth = (r.checkIn && r.checkIn.startsWith(mStr)) || (r.checkOut && r.checkOut.startsWith(mStr));
        return matchAcc && matchMonth;
      });

      const corpPayments = payments.filter((p) => p.corporateAccountId === acc.id && (p.corporateMonth === mStr || (p.date && p.date.startsWith(mStr))));
      const resPayments = matchedRes.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);
      const paid = Math.max(corpPayments.reduce((s, p) => s + Number(p.amount), 0), resPayments);

      const production = matchedRes.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
      const roomNights = matchedRes.reduce((s, r) => s + (Number(r.nights) || 0), 0);
      const balance = Math.max(0, round(production - paid));

      let paymentStatus = 'none';
      if (production > 0) {
        if (balance <= 0.05) paymentStatus = 'paid';
        else if (paid > 0) paymentStatus = 'partial';
        else paymentStatus = 'pending';
      }

      if (production > 0 || paid > 0 || monthFilter) {
        grandTotalProduction += production;
        grandTotalPaid += paid;
        grandTotalBalance += balance;

        results.push({
          accountId: acc.id,
          accountName: acc.name,
          accountType: acc.type,
          code: acc.code,
          contactPerson: acc.contactPerson,
          taxNumber: acc.taxNumber,
          month: mStr,
          reservationCount: matchedRes.length,
          roomNights,
          production: round(production),
          paid: round(paid),
          balance: round(balance),
          paymentStatus,
        });
      }
    });
  });

  results.sort((a, b) => b.month.localeCompare(a.month) || b.balance - a.balance);

  const pendingAccountsCount = new Set(results.filter((r) => r.paymentStatus === 'pending' || r.paymentStatus === 'partial').map((r) => r.accountId)).size;

  return {
    year: targetYear,
    monthFilter,
    records: results,
    totalProduction: round(grandTotalProduction),
    totalPaid: round(grandTotalPaid),
    totalBalance: round(grandTotalBalance),
    pendingAccountsCount,
  };
}

function round(n) { return Math.round(n * 100) / 100; }

