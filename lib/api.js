// Tüm /api rotaları ve iş mantığı.
import { Router, readBody, sendJSON, sendError } from './router.js';
import db from './db.js';
import cm from './channel/manager.js';
import * as pricing from './pricing.js';
import * as billing from './billing.js';
import * as auth from './auth.js';
import { registerExtraRoutes } from './apiExtra.js';
import { bootstrap } from './bootstrap.js';
import {
  uid, reservationCode, nights, addDays,
  monthMeta, nightWithinStay, num,
} from './util.js';

// Operasyonel (iş) tarihi — gün sonu ile ilerletilebilir
const today = () => db.businessToday();

// Misafir alanlarını (kısmi) normalize eder; ad = ad + soyad
function guestFields(b) {
  const f = {};
  const fn = b.firstName != null ? String(b.firstName).trim() : null;
  const ln = b.lastName != null ? String(b.lastName).trim() : null;
  if (fn != null) f.firstName = fn;
  if (ln != null) f.lastName = ln;
  if (b.name && String(b.name).trim()) f.name = String(b.name).trim();
  else if (fn != null || ln != null) f.name = `${fn || ''} ${ln || ''}`.trim();
  ['gender', 'idType', 'idNumber', 'birthDate', 'birthPlace', 'guestType', 'email', 'phone', 'nationality', 'notes', 'blacklist', 'blacklistReason', 'blacklistDate', 'blacklistedBy'].forEach((k) => {
    if (b[k] != null) f[k] = b[k];
  });
  if (b.vip != null) f.vip = !!b.vip;
  if (b.blacklist != null) f.blacklist = !!b.blacklist;
  return f;
}

// ---------- Zenginleştirme yardımcıları ----------

function enrichReservation(r) {
  const guest = db.get('guests', r.guestId);
  const rt = db.get('roomTypes', r.roomTypeId);
  const room = r.roomId ? db.get('rooms', r.roomId) : null;
  const ids = Array.isArray(r.guestIds) && r.guestIds.length ? r.guestIds : (r.guestId ? [r.guestId] : []);
  const guests = ids.map((id) => db.get('guests', id)).filter(Boolean);
  return {
    ...r,
    guestName: guest ? guest.name : '—',
    guestEmail: guest ? guest.email : '',
    guestPhone: guest ? guest.phone : '',
    guestVip: guest ? !!guest.vip : false,
    nationality: guest ? guest.nationality : '',
    guests,
    roomTypeName: rt ? rt.name : '—',
    roomTypeCode: rt ? rt.code : '',
    roomNumber: room ? room.number : null,
    roomBlock: room ? room.block : null,
  };
}

function enrichRoom(room) {
  const rt = db.get('roomTypes', room.typeId);
  const occupied = room.status === 'occupied';
  // Dolu: içeride giriş yapmış misafir var (checked_in)
  const res = occupied ? db.findOne('reservations', (r) => r.roomId === room.id && r.status === 'checked_in') : null;
  // Rezerve: odaya atanmış, henüz giriş yapmamış VE giriş tarihi İŞ GÜNÜ olan rezervasyon
  const bToday = db.businessToday();
  const upcoming = !occupied ? db.findOne('reservations', (r) => r.roomId === room.id && r.status === 'confirmed' && r.checkIn === bToday) : null;
  const activeRes = res || upcoming;
  const guest = activeRes ? db.get('guests', activeRes.guestId) : null;
  const balance = (activeRes && activeRes.folioId) ? ((billing.folioSummary(activeRes.folioId) || {}).balance || 0) : 0;
  return {
    ...room,
    outOfOrder: !!room.outOfOrder,
    occupied,                 // Dolu (içeride misafir)
    reserved: !!upcoming,     // Rezerve (atanmış, henüz giriş yok)
    condition: room.outOfOrder ? 'out_of_order' : (room.housekeeping === 'dirty' ? 'dirty' : 'clean'),
    typeName: rt ? rt.name : '—',
    typeCode: rt ? rt.code : '',
    baseRate: rt ? rt.baseRate : 0,
    capacity: rt ? rt.capacity : 0,
    guestName: guest ? guest.name : null,
    reservationId: activeRes ? activeRes.id : null,
    checkOut: activeRes ? activeRes.checkOut : null,
    checkIn: activeRes ? activeRes.checkIn : null,
    resNights: activeRes ? activeRes.nights : null,
    resPersons: activeRes ? ((activeRes.adults || 0) + (activeRes.children || 0)) : null,
    resNotes: activeRes ? (activeRes.notes || '') : '',
    balance,
  };
}

function enrichTask(task) {
  const room = db.get('rooms', task.roomId);
  const rt = room ? db.get('roomTypes', room.typeId) : null;
  const staff = task.assignedTo ? db.get('staff', task.assignedTo) : null;
  return {
    ...task,
    roomNumber: room ? room.number : '—',
    floor: room ? room.floor : null,
    roomHousekeeping: room ? room.housekeeping : null,
    roomStatus: room ? room.status : null,
    typeName: rt ? rt.name : '—',
    assigneeName: staff ? staff.name : null,
  };
}

// ---------- Rotalar ----------

export function createApiRouter() {
  const r = new Router();

  // --- Oda tipleri ---
  r.get('/api/roomtypes', (req, res) => {
    sendJSON(res, 200, db.all('roomTypes'));
  });
  r.post('/api/roomtypes', async (req, res) => {
    const b = await readBody(req);
    if (!b.name) return sendError(res, 400, 'Ad zorunludur.');
    const rt = {
      id: uid('rt'),
      code: (b.code || b.name.slice(0, 3)).toUpperCase(),
      name: b.name,
      baseRate: num(b.baseRate, 0),
      capacity: num(b.capacity, 2),
      description: b.description || '',
    };
    sendJSON(res, 201, db.insert('roomTypes', rt));
  });
  r.put('/api/roomtypes/:id', async (req, res) => {
    const b = await readBody(req);
    const up = db.update('roomTypes', req.params.id, {
      name: b.name, code: b.code, baseRate: num(b.baseRate), capacity: num(b.capacity), description: b.description,
    });
    up ? sendJSON(res, 200, up) : sendError(res, 404, 'Oda tipi bulunamadı.');
  });

  // --- Odalar ---
  r.get('/api/rooms', (req, res) => {
    const rooms = db.all('rooms').sort((a, b) => a.number.localeCompare(b.number));
    sendJSON(res, 200, rooms.map(enrichRoom));
  });
  // Seçilen oda tipi + tarih aralığında ATANMAYA UYGUN (boş, arızasız) odalar
  r.get('/api/available-rooms', (req, res) => {
    const { roomTypeId, checkIn, checkOut, excludeReservationId } = req.query;
    if (!roomTypeId || !checkIn || !checkOut) return sendError(res, 400, 'roomTypeId, checkIn, checkOut zorunlu.');
    const busy = new Set(
      db.all('reservations')
        .filter((r) => (r.status === 'confirmed' || r.status === 'checked_in') && r.roomId && r.id !== excludeReservationId
          && checkIn < r.checkOut && r.checkIn < checkOut)
        .map((r) => r.roomId),
    );
    const rooms = db.all('rooms')
      .filter((rm) => rm.typeId === roomTypeId && !rm.outOfOrder && !busy.has(rm.id))
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
      .map((rm) => ({ id: rm.id, number: rm.number, typeId: rm.typeId }));
    sendJSON(res, 200, rooms);
  });
  r.post('/api/rooms', async (req, res) => {
    const b = await readBody(req);
    if (!b.number || !b.typeId) return sendError(res, 400, 'Oda numarası ve tipi zorunludur.');
    const room = {
      id: uid('room'),
      number: String(b.number),
      typeId: b.typeId,
      floor: num(b.floor, 1),
      status: 'available',
      housekeeping: 'clean',
      outOfOrder: false,
      features: Array.isArray(b.features) ? b.features : [],
    };
    sendJSON(res, 201, enrichRoom(db.insert('rooms', room)));
  });
  r.patch('/api/rooms/:id/status', async (req, res) => {
    const b = await readBody(req);
    const room0 = db.get('rooms', req.params.id);
    if (!room0) return sendError(res, 404, 'Oda bulunamadı.');
    // KURAL: Dolu oda asla kirli veya arızalı olamaz.
    if (room0.status === 'occupied' && (b.housekeeping === 'dirty' || b.outOfOrder === true)) {
      return sendError(res, 400, 'Dolu oda kirli veya arızalı yapılamaz. Önce check-out yapın.');
    }
    const patch = {};
    if (b.status) patch.status = b.status;
    if (b.housekeeping) patch.housekeeping = b.housekeeping; // clean | dirty
    if (typeof b.outOfOrder === 'boolean') patch.outOfOrder = b.outOfOrder; // Arızalı (bağımsız)
    const up = db.update('rooms', req.params.id, patch);
    if (!up) return sendError(res, 404, 'Oda bulunamadı.');
    auth.audit(req, 'update', 'room', up.id, `Oda ${up.number} durumu güncellendi (${up.outOfOrder ? 'Arızalı' : (up.housekeeping === 'dirty' ? 'Kirli' : 'Temiz')})`, up.id);
    sendJSON(res, 200, enrichRoom(up));
  });
  // Bir odanın işlem geçmişi (audit trail) — giriş/çıkış/tahsilat/güncelleme/silme
  r.get('/api/rooms/:id/logs', (req, res) => {
    const room = db.get('rooms', req.params.id);
    if (!room) return sendError(res, 404, 'Oda bulunamadı.');
    const logs = db.all('auditLogs')
      .filter((l) => l.roomId === room.id || (l.entity === 'room' && l.entityId === room.id))
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, num(req.query.limit, 60));
    sendJSON(res, 200, logs);
  });
  // Walk-in / hızlı giriş: boş bir odaya doğrudan check-in (misafir listesiyle)
  r.post('/api/rooms/:id/checkin', async (req, res) => {
    const b = await readBody(req);
    const room = db.get('rooms', req.params.id);
    if (!room) return sendError(res, 404, 'Oda bulunamadı.');
    if (room.outOfOrder) return sendError(res, 400, 'Oda arızalı; kullanılamaz.');
    if (room.status === 'occupied') return sendError(res, 400, 'Oda dolu; önce mevcut misafir çıkış yapmalı.');
    const checkIn = b.checkIn || today();
    const checkOut = b.checkOut || addDays(checkIn, 1);
    if (checkOut <= checkIn) return sendError(res, 400, 'Çıkış tarihi girişten sonra olmalıdır.');
    if (checkIn > today()) return sendError(res, 400, `Giriş tarihi (${checkIn}) iş gününden (${today()}) ileride; check-in yapılamaz.`);
    const guestsIn = Array.isArray(b.guests) && b.guests.length ? b.guests : [{ name: b.guestName || 'Misafir' }];
    const guestIds = guestsIn.map((gg) => {
      const g = { id: uid('gst'), guestType: 'adult', nationality: 'TR', vip: false, ...guestFields(gg) };
      if (!g.name) g.name = 'Misafir';
      db.insert('guests', g);
      return g.id;
    });
    // Kapı/walk-in fiyatı MANUEL girilir; fiyat motoru kullanılmaz (otomatik fiyat eklenmez).
    const nn = nights(checkIn, checkOut);
    const rate = num(b.ratePerNight, 0);
    const total = rate * nn;
    const reservation = db.insert('reservations', {
      id: uid('res'), code: reservationCode(), guestId: guestIds[0], guestIds,
      roomTypeId: room.typeId, roomId: room.id, checkIn, checkOut, nights: nn,
      adults: Math.max(1, guestsIn.filter((g) => g.guestType !== 'child').length), children: guestsIn.filter((g) => g.guestType === 'child').length,
      status: 'checked_in', source: 'direct', channelName: 'Doğrudan', channelId: null,
      ratePerNight: rate, totalAmount: total, paidAmount: 0, currency: b.currency || db.getSettings().baseCurrency,
      notes: b.notes || '', externalRef: null, folioId: null, createdAt: new Date().toISOString(),
    });
    db.update('rooms', room.id, { status: 'occupied' });
    const folio = billing.ensureFolio(reservation, req);
    const primary = db.get('guests', guestIds[0]);
    auth.audit(req, 'checkin', 'reservation', reservation.id, `${reservation.code} — ${primary ? primary.name : 'misafir'} giriş yaptı (oda ${room.number})`, room.id);
    sendJSON(res, 201, { reservation: enrichReservation(db.get('reservations', reservation.id)), folio: billing.folioSummary(folio.id) });
  });

  // --- Misafirler ---
  r.get('/api/guests', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    let list = db.all('guests');
    if (q) list = list.filter((g) => (g.name || '').toLowerCase().includes(q) || (g.email || '').toLowerCase().includes(q) || (g.idNumber || '').includes(q) || (g.phone || '').includes(q));
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    sendJSON(res, 200, list);
  });
  r.post('/api/guests', async (req, res) => {
    const b = await readBody(req);
    const g = { id: uid('gst'), guestType: 'adult', nationality: 'TR', vip: false, ...guestFields(b) };
    if (!g.name) return sendError(res, 400, 'Misafir adı ve soyadı zorunludur.');
    sendJSON(res, 201, db.insert('guests', g));
  });
  r.put('/api/guests/:id', async (req, res) => {
    const b = await readBody(req);
    const up = db.update('guests', req.params.id, guestFields(b));
    up ? sendJSON(res, 200, up) : sendError(res, 404, 'Misafir bulunamadı.');
  });

  // --- Personel ---
  r.get('/api/staff', (req, res) => {
    sendJSON(res, 200, db.all('staff'));
  });

  // --- Rezervasyonlar ---
  r.get('/api/reservations', (req, res) => {
    const { q, status, source, from, to } = req.query;
    let list = db.all('reservations').map(enrichReservation);
    if (status) list = list.filter((x) => x.status === status);
    if (source) {
      if (source === 'direct') list = list.filter((x) => x.source === 'direct');
      else if (source === 'ota') list = list.filter((x) => x.source !== 'direct');
      else list = list.filter((x) => x.source === source);
    }
    if (from) list = list.filter((x) => x.checkOut > from);
    if (to) list = list.filter((x) => x.checkIn < to);
    if (q) {
      const s = q.toLowerCase();
      list = list.filter((x) => x.guestName.toLowerCase().includes(s) || x.code.toLowerCase().includes(s));
    }
    list.sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.code.localeCompare(b.code));
    sendJSON(res, 200, list);
  });

  r.get('/api/reservations/:id', (req, res) => {
    const found = db.get('reservations', req.params.id);
    found ? sendJSON(res, 200, enrichReservation(found)) : sendError(res, 404, 'Rezervasyon bulunamadı.');
  });

  r.post('/api/reservations', async (req, res) => {
    const b = await readBody(req);
    if (!b.roomTypeId || !b.roomId || !b.checkIn || !b.checkOut) {
      return sendError(res, 400, 'Oda tipi, oda no, giriş ve çıkış tarihleri zorunludur.');
    }
    if (b.checkOut <= b.checkIn) return sendError(res, 400, 'Çıkış tarihi girişten sonra olmalıdır.');
    // KURAL: Giriş tarihi iş gününden eski olamaz
    if (b.checkIn < today()) return sendError(res, 400, `Giriş tarihi iş gününden (${today()}) eski olamaz.`);

    // Seçilen oda: geçerli, arızasız ve seçilen tarihlerde boş olmalı
    const room = db.get('rooms', b.roomId);
    if (!room) return sendError(res, 400, 'Geçerli bir oda seçin.');
    if (room.outOfOrder) return sendError(res, 400, `Oda ${room.number} arızalı; seçilemez.`);
    const clash = db.all('reservations').some((r) =>
      r.roomId === b.roomId && (r.status === 'confirmed' || r.status === 'checked_in') &&
      b.checkIn < r.checkOut && r.checkIn < b.checkOut);
    if (clash) return sendError(res, 400, `Oda ${room.number} seçilen tarihlerde dolu.`);

    // Müsaitlik + kısıtlama kontrolü (overbooking önleme) — oda tipinden
    const avail = pricing.checkAvailability(room.typeId, b.checkIn, b.checkOut);
    if (!avail.ok && !b.overrideAvailability) return sendError(res, 409, avail.reason || 'Seçilen tarihlerde müsaitlik yok.');

    // Misafir: mevcut id ya da yeni kayıt (Ad Soyad zorunlu)
    let guestId = b.guestId;
    if (!guestId) {
      if (!b.guestName || !b.guestName.trim()) return sendError(res, 400, 'Misafir adı soyadı zorunludur.');
      const g = db.insert('guests', {
        id: uid('gst'), name: b.guestName, phone: b.guestPhone || '',
        idNumber: b.idNumber || '', nationality: b.nationality || '', vip: !!b.vip, notes: '',
      });
      guestId = g.id;
    }
    // Fiyat manuel girilir (kapı) veya kanaldan gelir; fiyat motoru yalnız OTA regülasyonu içindir.
    const nn = nights(b.checkIn, b.checkOut);
    const rate = num(b.ratePerNight, 0);
    const computedTotal = rate * nn;
    const source = b.source || 'direct';
    let channelName = 'Doğrudan';
    let channelId = null;
    if (source !== 'direct') {
      const ch = db.get('channels', source);
      if (ch) { channelName = ch.name; channelId = ch.id; }
    }
    const reservation = {
      id: uid('res'),
      code: reservationCode(),
      guestId,
      roomTypeId: room.typeId,
      roomId: b.roomId,
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      nights: nn,
      adults: num(b.adults, 1),
      children: num(b.children, 0),
      status: b.status || 'confirmed',
      source,
      channelName,
      channelId,
      ratePerNight: rate,
      totalAmount: computedTotal,
      paidAmount: num(b.paidAmount, 0),
      notes: b.notes || '',
      externalRef: null,
      folioId: null,
      createdAt: new Date().toISOString(),
    };
    db.insert('reservations', reservation);
    auth.audit(req, 'create', 'reservation', reservation.id, `${reservation.code} rezervasyonu oluşturuldu (${(db.get('guests', guestId) || {}).name || ''})`, reservation.roomId);
    sendJSON(res, 201, enrichReservation(reservation));
  });

  r.put('/api/reservations/:id', async (req, res) => {
    const b = await readBody(req);
    const existing = db.get('reservations', req.params.id);
    if (!existing) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    const checkIn = b.checkIn || existing.checkIn;
    const checkOut = b.checkOut || existing.checkOut;
    if (checkOut <= checkIn) return sendError(res, 400, 'Çıkış tarihi girişten sonra olmalıdır.');
    const rate = b.ratePerNight != null ? num(b.ratePerNight) : existing.ratePerNight;
    const nn = nights(checkIn, checkOut);
    const patch = {
      guestId: b.guestId || existing.guestId,
      roomTypeId: b.roomTypeId || existing.roomTypeId,
      roomId: b.roomId || existing.roomId,
      checkIn, checkOut, nights: nn,
      adults: b.adults != null ? num(b.adults) : existing.adults,
      children: b.children != null ? num(b.children) : existing.children,
      ratePerNight: rate,
      totalAmount: rate * nn,
      paidAmount: b.paidAmount != null ? num(b.paidAmount) : existing.paidAmount,
      notes: b.notes != null ? b.notes : existing.notes,
    };
    if (b.source && b.source !== existing.source) {
      patch.source = b.source;
      if (b.source === 'direct') { patch.channelName = 'Doğrudan'; patch.channelId = null; }
      else {
        const ch = db.get('channels', b.source);
        patch.channelName = ch ? ch.name : existing.channelName;
        patch.channelId = ch ? ch.id : null;
      }
    }
    const up = db.update('reservations', req.params.id, patch);
    sendJSON(res, 200, enrichReservation(up));
  });

  // Check-in
  r.post('/api/reservations/:id/checkin', async (req, res) => {
    const b = await readBody(req);
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    if (resv.status === 'checked_out' || resv.status === 'cancelled') {
      return sendError(res, 400, 'Bu rezervasyon için check-in yapılamaz.');
    }
    // KURAL: Giriş tarihi gelmeden (gelecek tarihli) check-in yapılamaz
    if (resv.checkIn > today()) {
      return sendError(res, 400, `Giriş tarihi (${resv.checkIn}) gelmeden check-in yapılamaz. İş günü: ${today()}.`);
    }
    const roomId = b.roomId || resv.roomId;
    if (!roomId) return sendError(res, 400, 'Check-in için oda seçin.');
    const room = db.get('rooms', roomId);
    if (!room) return sendError(res, 404, 'Oda bulunamadı.');
    if (room.outOfOrder) return sendError(res, 400, 'Oda arızalı; kullanılamaz.');
    const occupiedByOther = db.findOne('reservations', (x) => x.roomId === roomId && x.status === 'checked_in' && x.id !== resv.id);
    if (occupiedByOther) return sendError(res, 400, `${room.number} nolu oda başka bir misafir tarafından kullanılıyor.`);

    // Dolu oda her zaman temiz + arızasızdır
    db.update('rooms', roomId, { status: 'occupied', housekeeping: 'clean', outOfOrder: false });
    // Check-in sırasında resepsiyonun girdiği misafirler (varsa) rezervasyona işlenir
    const patch = { status: 'checked_in', roomId };
    if (Array.isArray(b.guests) && b.guests.length) {
      const guestIds = b.guests.map((gg) => {
        // Daha önce konaklamış misafir seçildiyse (id ile) yeni kayıt açma, mevcut kaydı kullan/güncelle
        if (gg.id && db.get('guests', gg.id)) {
          db.update('guests', gg.id, guestFields(gg));
          return gg.id;
        }
        const g = { id: uid('gst'), guestType: 'adult', nationality: 'TR', vip: false, ...guestFields(gg) };
        if (!g.name) g.name = 'Misafir';
        db.insert('guests', g);
        return g.id;
      });
      patch.guestIds = guestIds;
      patch.guestId = guestIds[0];
      patch.adults = Math.max(1, b.guests.filter((g) => g.guestType !== 'child').length);
      patch.children = b.guests.filter((g) => g.guestType === 'child').length;
    }
    const up = db.update('reservations', req.params.id, patch);
    billing.ensureFolio(up, req);
    const ciGuest = db.get('guests', up.guestId);
    auth.audit(req, 'checkin', 'reservation', up.id, `${up.code} — ${ciGuest ? ciGuest.name : 'misafir'} giriş yaptı (oda ${room.number})`, room.id);
    sendJSON(res, 200, { ok: true, reservation: enrichReservation(up), folio: billing.folioSummary(up.folioId) });
  });

  // Check-out (bakiye kontrolü + folio kapatma + KBS çıkış)
  r.post('/api/reservations/:id/checkout', async (req, res) => {
    const b = await readBody(req);
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    if (resv.status !== 'checked_in') return sendError(res, 400, 'Sadece otelde olan misafirler için check-out yapılabilir.');

    const folio = billing.ensureFolio(resv, req);
    const sum = billing.folioSummary(folio.id);
    // Ödenmemiş bakiye varsa ve zorlanmadıysa uyar
    // KURAL: Bakiye varken çıkış YAPILAMAZ (force ile dahi geçilemez).
    if (sum.balance > 0.5) {
      return sendJSON(res, 200, { ok: false, needsSettlement: true, balance: sum.balance, folioId: folio.id, reservationCode: resv.code });
    }

    if (resv.roomId) {
      // Oda boşalır (rezerve kalkar) ve kirli olarak işaretlenir
      db.update('rooms', resv.roomId, { status: 'available', housekeeping: 'dirty' });
    }
    db.update('folios', folio.id, { status: 'closed' });
    const up = db.update('reservations', req.params.id, { status: 'checked_out', paidAmount: sum.paidTotal });
    const coGuest = db.get('guests', up.guestId);
    auth.audit(req, 'checkout', 'reservation', up.id, `${up.code} — ${coGuest ? coGuest.name : 'misafir'} çıkış yaptı (bakiye ${sum.balance}₺)`, resv.roomId);
    sendJSON(res, 200, { ok: true, reservation: enrichReservation(up) });
  });

  // İptal
  r.post('/api/reservations/:id/cancel', async (req, res) => {
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    if (resv.roomId) {
      const room = db.get('rooms', resv.roomId);
      if (room && room.status === 'occupied') db.update('rooms', resv.roomId, { status: 'available', housekeeping: 'dirty' });
    }
    const priorRoom = resv.roomId;
    const up = db.update('reservations', req.params.id, { status: 'cancelled', roomId: null });
    auth.audit(req, 'cancel', 'reservation', up.id, `${up.code} rezervasyonu iptal edildi`, priorRoom);
    sendJSON(res, 200, enrichReservation(up));
  });

  // Oda atama
  r.post('/api/reservations/:id/assign-room', async (req, res) => {
    const b = await readBody(req);
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    const room = db.get('rooms', b.roomId);
    if (!room) return sendError(res, 404, 'Oda bulunamadı.');
    if (resv.status === 'checked_in') db.update('rooms', b.roomId, { status: 'occupied' });
    const up = db.update('reservations', req.params.id, { roomId: b.roomId });
    auth.audit(req, 'assign', 'reservation', up.id, `${up.code} → oda ${room.number} atandı`, room.id);
    sendJSON(res, 200, enrichReservation(up));
  });

  // Rezervasyona misafir ekle
  r.post('/api/reservations/:id/guests', async (req, res) => {
    const b = await readBody(req);
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    const g = { id: uid('gst'), guestType: 'adult', nationality: 'TR', vip: false, ...guestFields(b) };
    if (!g.name) return sendError(res, 400, 'Ad ve soyad zorunludur.');
    db.insert('guests', g);
    const ids = (Array.isArray(resv.guestIds) ? resv.guestIds.slice() : [resv.guestId].filter(Boolean));
    ids.push(g.id);
    const up = db.update('reservations', resv.id, { guestIds: ids });
    auth.audit(req, 'update', 'reservation', resv.id, `Misafir eklendi: ${g.name}`, resv.roomId);
    sendJSON(res, 200, enrichReservation(up));
  });
  // Rezervasyondan misafir çıkar
  r.delete('/api/reservations/:id/guests/:guestId', (req, res) => {
    const resv = db.get('reservations', req.params.id);
    if (!resv) return sendError(res, 404, 'Rezervasyon bulunamadı.');
    let ids = (Array.isArray(resv.guestIds) ? resv.guestIds.slice() : [resv.guestId].filter(Boolean));
    if (ids.length <= 1) return sendError(res, 400, 'Rezervasyonda en az bir misafir kalmalıdır.');
    ids = ids.filter((x) => x !== req.params.guestId);
    const patch = { guestIds: ids };
    if (resv.guestId === req.params.guestId) patch.guestId = ids[0];
    const up = db.update('reservations', resv.id, patch);
    auth.audit(req, 'update', 'reservation', resv.id, 'Misafir çıkarıldı', resv.roomId);
    sendJSON(res, 200, enrichReservation(up));
  });

  // --- Oda Temizliği (kondisyon bazlı: Temiz / Kirli / Arızalı; Rezerve overlay) ---
  r.get('/api/housekeeping', (req, res) => {
    const rooms = db.all('rooms').map(enrichRoom).sort((a, b) => a.number.localeCompare(b.number));
    // Kirli/Temiz her odada geçerlidir; Rezerve ve Arızalı bağımsız kaplamalardır
    const counts = {
      total: rooms.length,
      dirty: rooms.filter((r) => r.housekeeping === 'dirty').length,
      clean: rooms.filter((r) => r.housekeeping === 'clean').length,
      reserved: rooms.filter((r) => r.reserved).length,
      occupied: rooms.filter((r) => r.occupied).length,
      empty: rooms.filter((r) => !r.occupied && !r.reserved).length,
      outOfOrder: rooms.filter((r) => r.outOfOrder).length,
    };
    sendJSON(res, 200, { rooms, counts });
  });
  // Toplu kondisyon güncelleme (housekeeping çoklu seçim için)
  r.post('/api/housekeeping/bulk', async (req, res) => {
    const b = await readBody(req);
    const ids = Array.isArray(b.roomIds) ? b.roomIds : [];
    const patch = {};
    if (b.housekeeping) patch.housekeeping = b.housekeeping;
    if (typeof b.outOfOrder === 'boolean') patch.outOfOrder = b.outOfOrder;
    let n = 0;
    ids.forEach((id) => { if (db.update('rooms', id, patch)) n += 1; });
    auth.audit(req, 'update', 'room', null, `${n} oda kondisyonu toplu güncellendi`);
    sendJSON(res, 200, { ok: true, updated: n });
  });

  // --- Channel Manager / OTA ---
  r.get('/api/channels', (req, res) => {
    // apiKey'i maskele
    const list = db.all('channels').map((c) => ({
      ...c,
      apiKeyMasked: c.apiKey ? c.apiKey.slice(0, 3) + '••••' + c.apiKey.slice(-3) : '',
      hasKey: !!c.apiKey,
    }));
    sendJSON(res, 200, list);
  });
  r.post('/api/channels', async (req, res) => {
    const b = await readBody(req);
    if (!b.name) return sendError(res, 400, 'Kanal adı zorunludur.');
    const slug = (b.slug || b.name).toLowerCase().replace(/[^a-z0-9]/g, '');
    const channel = {
      id: uid('ch'),
      name: b.name,
      slug,
      color: b.color || '#0f1e3d',
      apiKey: b.apiKey || '',
      apiEndpoint: b.apiEndpoint || '',
      connected: false,
      status: 'disconnected',
      commission: num(b.commission, 15),
      autoSync: false,
      lastSyncAt: null,
      roomMappings: [],
    };
    sendJSON(res, 201, db.insert('channels', channel));
  });
  r.put('/api/channels/:id', async (req, res) => {
    const b = await readBody(req);
    const patch = {};
    ['name', 'apiEndpoint', 'color'].forEach((k) => { if (b[k] != null) patch[k] = b[k]; });
    if (b.apiKey != null) patch.apiKey = b.apiKey;
    if (b.commission != null) patch.commission = num(b.commission);
    if (b.autoSync != null) patch.autoSync = !!b.autoSync;
    if (Array.isArray(b.roomMappings)) patch.roomMappings = b.roomMappings;
    const up = db.update('channels', req.params.id, patch);
    up ? sendJSON(res, 200, up) : sendError(res, 404, 'Kanal bulunamadı.');
  });
  r.delete('/api/channels/:id', (req, res) => {
    const ok = db.remove('channels', req.params.id);
    ok ? sendJSON(res, 200, { ok: true }) : sendError(res, 404, 'Kanal bulunamadı.');
  });
  r.post('/api/channels/:id/test', (req, res) => {
    sendJSON(res, 200, cm.test(req.params.id));
  });
  r.post('/api/channels/:id/connect', (req, res) => {
    const out = cm.connect(req.params.id);
    sendJSON(res, out.ok ? 200 : 400, out);
  });
  r.post('/api/channels/:id/disconnect', (req, res) => {
    sendJSON(res, 200, cm.disconnect(req.params.id));
  });
  r.post('/api/channels/:id/sync', async (req, res) => {
    const b = await readBody(req);
    const out = cm.sync(req.params.id, b.kind || 'all');
    sendJSON(res, out.ok === false ? 400 : 200, out);
  });
  r.post('/api/channels/sync-all', (req, res) => {
    sendJSON(res, 200, cm.syncAll());
  });

  // --- Senkron günlüğü ---
  r.get('/api/synclogs', (req, res) => {
    const { channelId, limit } = req.query;
    let list = db.all('syncLogs');
    if (channelId) list = list.filter((x) => x.channelId === channelId);
    list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const lim = num(limit, 50);
    sendJSON(res, 200, list.slice(0, lim));
  });

  // --- Takvim ---
  r.get('/api/calendar', (req, res) => {
    const month = req.query.month || today().slice(0, 7);
    const meta = monthMeta(month);
    const sellable = db.all('rooms').filter((x) => !x.outOfOrder).length;
    const active = db.all('reservations').filter((x) => x.status === 'confirmed' || x.status === 'checked_in' || x.status === 'checked_out');

    const days = [];
    for (let d = 1; d <= meta.daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const staying = active.filter((x) => nightWithinStay(date, x.checkIn, x.checkOut));
      const arrivals = active.filter((x) => x.checkIn === date);
      const departures = active.filter((x) => x.checkOut === date);
      days.push({
        date,
        day: d,
        occupied: staying.length,
        available: Math.max(0, sellable - staying.length),
        arrivals: arrivals.length,
        departures: departures.length,
        occupancyPct: sellable ? Math.round((staying.length / sellable) * 100) : 0,
      });
    }

    // Ay ile kesişen rezervasyonlar (şerit çizimi için)
    const monthStart = `${month}-01`;
    const monthEnd = addDays(`${month}-${String(meta.daysInMonth).padStart(2, '0')}`, 1);
    const inMonth = active
      .filter((x) => x.checkIn < monthEnd && x.checkOut > monthStart)
      .map(enrichReservation)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    sendJSON(res, 200, { month, meta, sellable, days, reservations: inMonth });
  });

  // --- Gösterge Paneli ---
  r.get('/api/dashboard', (req, res) => {
    const t = today();
    const rooms = db.all('rooms');
    const total = rooms.length;
    const outOfOrder = rooms.filter((x) => x.outOfOrder).length;
    const sellable = total - outOfOrder;
    const occupied = rooms.filter((x) => x.status === 'occupied').length;
    const dirty = rooms.filter((x) => x.housekeeping === 'dirty').length;

    // Oda durumu donut dilimleri (birbirini dışlar, toplam = total)
    const reservedRoomIds = new Set(db.all('reservations').filter((r) => r.status === 'confirmed' && r.roomId && r.checkIn === t).map((r) => r.roomId));
    const roomStatus = {
      dolu: rooms.filter((x) => !x.outOfOrder && x.status === 'occupied').length,
      rezerve: rooms.filter((x) => !x.outOfOrder && x.status !== 'occupied' && reservedRoomIds.has(x.id)).length,
      bos: rooms.filter((x) => !x.outOfOrder && x.status !== 'occupied' && !reservedRoomIds.has(x.id)).length,
      arizali: outOfOrder,
    };

    const reservations = db.all('reservations');
    const inHouse = reservations.filter((x) => x.status === 'checked_in');
    const arrivalsToday = reservations.filter((x) => x.checkIn === t && (x.status === 'confirmed' || x.status === 'checked_in'));
    const departuresToday = reservations.filter((x) => x.checkOut === t && (x.status === 'checked_in' || x.status === 'checked_out'));
    const pendingArrivals = arrivalsToday.filter((x) => x.status === 'confirmed');

    // Bu geceki oda geliri (otelde olanların gecelik fiyat toplamı)
    const roomRevenueTonight = inHouse.reduce((s, x) => s + (x.ratePerNight || 0), 0);
    const adr = occupied ? Math.round(roomRevenueTonight / occupied) : 0;
    const revpar = sellable ? Math.round(roomRevenueTonight / sellable) : 0;
    const occupancyPct = sellable ? Math.round((occupied / sellable) * 100) : 0;

    // Kanal kırılımı (iptal/gelmedi hariç) — dönem bazlı: Günlük / Haftalık / Aylık (giriş tarihine göre)
    const breakdownFor = (pred) => {
      const by = {};
      reservations.filter((x) => x.status !== 'cancelled' && x.status !== 'no_show' && pred(x)).forEach((x) => {
        const key = x.channelName || 'Doğrudan';
        if (!by[key]) by[key] = { name: key, count: 0, revenue: 0, source: x.source };
        by[key].count += 1;
        by[key].revenue += x.totalAmount || 0;
      });
      return Object.values(by).sort((a, b) => b.revenue - a.revenue);
    };
    const channelPeriods = {
      day: breakdownFor((x) => x.checkIn === t),
      week: breakdownFor((x) => x.checkIn >= t && x.checkIn < addDays(t, 7)),
      month: breakdownFor((x) => x.checkIn >= t && x.checkIn < addDays(t, 30)),
    };
    const channelBreakdown = channelPeriods.month;

    const pendingHousekeeping = dirty;

    sendJSON(res, 200, {
      date: t,
      rooms: { total, sellable, occupied, available: sellable - occupied, outOfOrder, dirty, occupancyPct },
      kpis: { adr, revpar, roomRevenueTonight, occupancyPct },
      arrivalsToday: arrivalsToday.map(enrichReservation),
      departuresToday: departuresToday.map(enrichReservation),
      counts: {
        arrivals: arrivalsToday.length,
        pendingArrivals: pendingArrivals.length,
        departures: departuresToday.length,
        inHouse: inHouse.length,
        toClean: dirty,
        pendingHousekeeping,
      },
      channelBreakdown,
      channelPeriods,
      roomStatus,
    });
  });

  // --- Yardımcı: sıfırlama (demo/test) ---
  r.post('/api/reset', (req, res) => {
    if (req.user && req.user.role !== 'admin') return sendError(res, 403, 'Yalnızca yönetici sıfırlayabilir.');
    db.reset();
    bootstrap(); // kullanıcıları, pansiyon planlarını ve folyoları yeniden oluştur
    sendJSON(res, 200, { ok: true });
  });

  // Üretim katmanı rotalarını kaydet (auth, rate/inventory, folio, kbs, raporlar…)
  registerExtraRoutes(r);

  return r;
}
