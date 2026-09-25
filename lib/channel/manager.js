// Channel Manager çekirdeği: OTA bağlantıları, senkron motoru ve günlük.
import db from '../db.js';
import * as pricing from '../pricing.js';
import { uid, reservationCode, nights, today, addDays } from '../util.js';
import bookingcom from './adapters/bookingcom.js';
import expedia from './adapters/expedia.js';
import airbnb from './adapters/airbnb.js';
import agoda from './adapters/agoda.js';
import hotelscom from './adapters/hotelscom.js';
import tatilbudur from './adapters/tatilbudur.js';
import otelz from './adapters/otelz.js';
import tripcom from './adapters/tripcom.js';
import { genericAdapter } from './adapters/base.js';

const REGISTRY = { bookingcom, expedia, airbnb, agoda, hotelscom, tatilbudur, otelz, tripcom };

/** Kanala uygun adapter'ı döndürür (tanımlı değilse genel adapter). */
export function adapterFor(channel) {
  return REGISTRY[channel.slug] || genericAdapter(channel.slug, channel.name);
}

/** Senkron günlüğüne kayıt ekler (son 200 kayıt tutulur). */
function log(entry) {
  const rec = {
    id: uid('log'),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  db.insert('syncLogs', rec);
  const logs = db.all('syncLogs');
  if (logs.length > 200) {
    const sorted = [...logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const remove = sorted.slice(0, logs.length - 200);
    remove.forEach((l) => db.remove('syncLogs', l.id));
  }
  return rec;
}

/** Bağlantı testi. */
export function test(channelId) {
  const channel = db.get('channels', channelId);
  if (!channel) return { ok: false, message: 'Kanal bulunamadı.' };
  const adapter = adapterFor(channel);
  const result = adapter.ping(channel);
  db.update('channels', channelId, {
    status: result.ok ? (channel.connected ? 'connected' : 'disconnected') : 'error',
  });
  log({
    channelId,
    channelName: channel.name,
    direction: 'pull',
    kind: 'test',
    status: result.ok ? 'success' : 'error',
    message: `Bağlantı testi: ${result.message} (${result.latencyMs} ms)`,
    count: 0,
  });
  return { ...result };
}

/** Kanalı bağlar (API key geçerliyse). */
export function connect(channelId) {
  const channel = db.get('channels', channelId);
  if (!channel) return { ok: false, message: 'Kanal bulunamadı.' };
  const adapter = adapterFor(channel);
  const v = adapter.validateKey(channel.apiKey);
  if (!v.ok) {
    db.update('channels', channelId, { status: 'error' });
    log({ channelId, channelName: channel.name, direction: 'pull', kind: 'test', status: 'error', message: `Bağlanılamadı: ${v.reason}`, count: 0 });
    return { ok: false, message: v.reason };
  }
  const updated = db.update('channels', channelId, { connected: true, status: 'connected', lastSyncAt: new Date().toISOString() });
  log({ channelId, channelName: channel.name, direction: 'push', kind: 'test', status: 'success', message: `${channel.name} kanalına bağlanıldı.`, count: 0 });
  return { ok: true, channel: updated };
}

/** Kanal bağlantısını keser. */
export function disconnect(channelId) {
  const channel = db.get('channels', channelId);
  if (!channel) return { ok: false, message: 'Kanal bulunamadı.' };
  const updated = db.update('channels', channelId, { connected: false, status: 'disconnected' });
  log({ channelId, channelName: channel.name, direction: 'push', kind: 'test', status: 'success', message: `${channel.name} bağlantısı kesildi.`, count: 0 });
  return { ok: true, channel: updated };
}

/** Misafiri e-posta/ada göre bulur, yoksa oluşturur. */
function findOrCreateGuest(raw) {
  let guest = null;
  if (raw.guestEmail) guest = db.findOne('guests', (g) => g.email === raw.guestEmail);
  if (!guest) guest = db.findOne('guests', (g) => g.name === raw.guestName);
  if (guest) return guest;
  guest = {
    id: uid('gst'),
    name: raw.guestName,
    email: raw.guestEmail || '',
    phone: raw.guestPhone || '',
    nationality: raw.nationality || '',
    vip: false,
    notes: 'OTA üzerinden gelen misafir',
  };
  return db.insert('guests', guest);
}

/** OTA'dan yeni rezervasyonları çeker ve PMS'e yazar. */
export function pullReservations(channelId) {
  const channel = db.get('channels', channelId);
  if (!channel) return { ok: false, message: 'Kanal bulunamadı.' };
  if (!channel.connected) {
    log({ channelId, channelName: channel.name, direction: 'pull', kind: 'reservations', status: 'error', message: 'Kanal bağlı değil; rezervasyon çekilemedi.', count: 0 });
    return { ok: false, message: 'Kanal bağlı değil.' };
  }
  const adapter = adapterFor(channel);
  const roomTypes = db.all('roomTypes');
  const raws = adapter.pullReservations(channel, { roomTypes });
  const t = db.businessToday();
  let created = 0;
  let overbookings = 0;
  const createdList = [];

  for (const raw of raws) {
    // Çift kayıt önleme (harici referans)
    const exists = db.findOne('reservations', (r) => r.externalRef && r.externalRef === raw.externalId);
    if (exists) continue;

    const rt = roomTypes.find((x) => x.code === raw.roomTypeCode) || roomTypes[0];
    // Overbooking riski: kontenjan dolu olsa da OTA rezervasyonu bağlayıcıdır, kaydedilir ama işaretlenir
    const av = pricing.checkAvailability(rt.id, raw.checkIn, raw.checkOut);
    if (!av.ok) overbookings += 1;
    const guest = findOrCreateGuest(raw);
    const nn = raw.nights ?? nights(raw.checkIn, raw.checkOut);
    const rate = raw.ratePerNight ?? Math.round(rt.baseRate * (0.9 + Math.random() * 0.3));
    const status = raw.checkIn <= t && t < raw.checkOut ? 'checked_in' : 'confirmed';
    const res = {
      id: uid('res'),
      code: reservationCode(),
      guestId: guest.id,
      roomTypeId: rt.id,
      roomId: null,
      checkIn: raw.checkIn,
      checkOut: raw.checkOut,
      nights: nn,
      adults: raw.adults || 1,
      children: raw.children || 0,
      board: raw.board || 'BB',
      status,
      source: channel.id,
      channelName: channel.name,
      channelId: channel.id,
      ratePerNight: rate,
      totalAmount: rate * nn,
      paidAmount: 0,
      notes: `OTA rezervasyonu (${channel.name})`,
      externalRef: raw.externalId,
      overbooking: !av.ok,
      folioId: null,
      createdAt: new Date().toISOString(),
    };
    db.insert('reservations', res);
    created += 1;
    createdList.push(res);
  }

  db.update('channels', channelId, { lastSyncAt: new Date().toISOString(), status: 'connected' });
  const msg = (created > 0 ? `${created} yeni rezervasyon alındı.` : 'Yeni rezervasyon yok.') + (overbookings ? ` ⚠ ${overbookings} overbooking riski!` : '');
  log({
    channelId,
    channelName: channel.name,
    direction: 'pull',
    kind: 'reservations',
    status: overbookings ? 'error' : 'success',
    message: msg,
    count: created,
  });
  return { ok: true, created, overbookings, reservations: createdList };
}

/** ARI (müsaitlik-fiyat-kontenjan) verisini gerçek rate/inventory tablolarından üretir. */
export function buildARI(windowDays = 30) {
  const from = db.businessToday();
  const to = addDays(from, windowDays);
  const types = db.all('roomTypes');
  let availRoomNights = 0, stopSellDays = 0, ratePoints = 0, minStayDays = 0;
  const perType = [];
  for (const t of types) {
    const days = pricing.inventoryRange(t.id, from, to);
    const avail = days.reduce((s, d) => s + (d.stopSell ? 0 : d.available), 0);
    const stops = days.filter((d) => d.stopSell).length;
    const mins = days.filter((d) => d.minStay > 1).length;
    availRoomNights += avail; stopSellDays += stops; ratePoints += days.length; minStayDays += mins;
    perType.push({ roomTypeId: t.id, name: t.name, available: avail, stopSell: stops, rateFrom: days[0] ? days[0].rate : 0 });
  }
  return { from, to, windowDays, availRoomNights, stopSellDays, minStayDays, ratePoints, roomTypeCount: types.length, perType };
}

/** Müsaitlik veya fiyatları OTA'ya gerçek ARI verisiyle gönderir. */
export function push(channelId, kind) {
  const channel = db.get('channels', channelId);
  if (!channel) return { ok: false, message: 'Kanal bulunamadı.' };
  if (!channel.connected) {
    log({ channelId, channelName: channel.name, direction: 'push', kind, status: 'error', message: 'Kanal bağlı değil; gönderim yapılamadı.', count: 0 });
    return { ok: false, message: 'Kanal bağlı değil.' };
  }
  const adapter = adapterFor(channel);
  const ari = buildARI(30);
  let message, count;
  if (kind === 'rates') {
    adapter.pushRates(channel, { roomTypeCount: ari.roomTypeCount });
    count = ari.ratePoints;
    message = `${ari.ratePoints} oda-gün fiyatı ${channel.name} kanalına gönderildi (${ari.windowDays} gün, ${ari.roomTypeCount} oda tipi).`;
  } else {
    adapter.pushAvailability(channel, { roomCount: ari.availRoomNights });
    count = ari.availRoomNights;
    message = `${ari.availRoomNights} oda-gün müsaitlik gönderildi` + (ari.stopSellDays ? `, ${ari.stopSellDays} gün stop-sell` : '') + (ari.minStayDays ? `, ${ari.minStayDays} gün min-stay` : '') + '.';
  }
  db.update('channels', channelId, { lastSyncAt: new Date().toISOString(), status: 'connected' });
  log({ channelId, channelName: channel.name, direction: 'push', kind, status: 'success', message, count });
  return { ok: true, count, message, ari };
}

/** Tek kanal için toplu senkron: kind = availability | rates | reservations | all. */
export function sync(channelId, kind = 'all') {
  const channel = db.get('channels', channelId);
  if (!channel) return { ok: false, message: 'Kanal bulunamadı.' };
  if (kind === 'availability') return push(channelId, 'availability');
  if (kind === 'rates') return push(channelId, 'rates');
  if (kind === 'reservations') return pullReservations(channelId);
  // all
  const avail = push(channelId, 'availability');
  const rates = push(channelId, 'rates');
  const pull = pullReservations(channelId);
  return {
    ok: avail.ok && rates.ok && pull.ok,
    availability: avail,
    rates,
    reservations: pull,
    created: pull.created || 0,
  };
}

/** Bağlı tüm kanalları senkronize eder. */
export function syncAll() {
  const channels = db.all('channels').filter((c) => c.connected);
  const results = channels.map((c) => ({ channelId: c.id, name: c.name, result: sync(c.id, 'all') }));
  const totalCreated = results.reduce((s, r) => s + (r.result.created || 0), 0);
  return { ok: true, channels: results.length, created: totalCreated, results };
}

export default {
  adapterFor,
  test,
  connect,
  disconnect,
  pullReservations,
  push,
  sync,
  syncAll,
};
