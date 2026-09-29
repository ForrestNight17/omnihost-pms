// OTA adapter sözleşmesi (arayüz) ve ortak "mock" fabrika.
//
// Gerçek bir entegrasyonda her metod, OTA'nın gerçek REST/XML API'sine
// `fetch(channel.apiEndpoint, { headers: { Authorization: channel.apiKey } })`
// çağrısı yapar. Aşağıda bu noktalar `// REAL API:` ile işaretlenmiştir.
//
// Sözleşme (her adapter şu metodları sağlar):
//   validateKey(apiKey)            -> { ok, reason? }
//   ping(channel)                  -> { ok, latencyMs, message }
//   pullReservations(channel, ctx) -> [ rawBooking, ... ]
//   pushAvailability(channel, ctx) -> { count, message }
//   pushRates(channel, ctx)        -> { count, message }
//
// rawBooking şekli (PMS'e çevrilecek ham OTA rezervasyonu):
//   { externalId, guestName, guestEmail, guestPhone, nationality,
//     roomTypeCode, checkIn, checkOut, nights, adults, children, board, ratePerNight }

import { addDays, today, nights, uid } from '../../util.js';

const FIRST = ['Lucas', 'Mia', 'Noah', 'Ella', 'Leon', 'Sofia', 'Ethan', 'Nora', 'Kaan', 'Ece', 'Jonas', 'Clara', 'Diego', 'Aylin', 'Ryan', 'Maya'];
const LAST = ['Brown', 'Wagner', 'Bianchi', 'Moreau', 'Lopez', 'Ivanov', 'Kowalski', 'Yıldırım', 'Aydın', 'Fischer', 'Costa', 'Nguyen'];
const NATIONS = ['GB', 'DE', 'FR', 'IT', 'US', 'NL', 'RU', 'ES', 'TR', 'AE'];
const BOARDS = ['RO', 'BB', 'HB'];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

/**
 * Bir OTA için standart mock adapter üretir.
 * @param {object} cfg { slug, name, keyPrefix, maxPull, roomTypeCodes }
 */
export function makeMockAdapter(cfg) {
  const roomTypeCodes = cfg.roomTypeCodes || ['STD', 'DLX', 'JRS', 'EXE', 'ROY'];
  return {
    slug: cfg.slug,
    name: cfg.name,

    // Anahtar doğrulama: boşsa demo/test modu (uyarı verir ama bağlantıya izin verir).
    // Gerçek bir key girilmişse minimum uzunluk kontrolü uygulanır.
    validateKey(apiKey) {
      const k = String(apiKey || '').trim();
      if (k.length === 0) {
        // Demo/test modu: key yok ama bağlantıya izin ver (mock adapter çalışır)
        return { ok: true, demo: true };
      }
      if (k.length < 8) {
        return { ok: false, reason: 'API anahtarı en az 8 karakter olmalıdır.' };
      }
      return { ok: true };
    },
    keyExample: (cfg.keyPrefix || 'key_') + 'xxxxxxxxxxxx',

    // Bağlantı testi — gerçekte OTA'nın "ping"/kimlik doğrulama uç noktası çağrılır.
    ping(channel) {
      const latencyMs = randInt(35, 320);
      const v = this.validateKey(channel.apiKey);
      // REAL API: const r = await fetch(`${channel.apiEndpoint}/ping`, { headers: authHeader(channel) });
      if (!v.ok) return { ok: false, latencyMs, message: v.reason };
      const modeNote = v.demo ? ' [Demo Mod — Gerçek API anahtarı girilmemiş]' : '';
      return { ok: true, latencyMs, message: `${cfg.name} kimlik doğrulaması başarılı, uç nokta yanıt veriyor.${modeNote}` };
    },

    // Yeni OTA rezervasyonlarını çeker (0..maxPull adet üretir).
    pullReservations(channel, ctx = {}) {
      // REAL API: const res = await fetch(`${channel.apiEndpoint}/reservations?since=...`, { headers: authHeader(channel) });
      //           return res.json().then(mapToRawBookings);
      const t = today();
      const n = randInt(0, cfg.maxPull ?? 3);
      const out = [];
      for (let i = 0; i < n; i++) {
        const checkIn = addDays(t, randInt(1, 45));
        const checkOut = addDays(checkIn, randInt(1, 6));
        const code = pick(roomTypeCodes);
        out.push({
          externalId: `${cfg.slug}-${uid('bk')}`,
          guestName: `${pick(FIRST)} ${pick(LAST)}`,
          guestEmail: `guest${randInt(1000, 9999)}@${cfg.slug}.example`,
          guestPhone: `+${randInt(1, 49)} ${randInt(100, 999)} ${randInt(1000000, 9999999)}`,
          nationality: pick(NATIONS),
          roomTypeCode: code,
          checkIn,
          checkOut,
          nights: nights(checkIn, checkOut),
          adults: randInt(1, 2),
          children: Math.random() < 0.2 ? 1 : 0,
          board: pick(BOARDS),
          ratePerNight: null, // PMS oda tipi baz fiyatından hesaplanır
        });
      }
      return out;
    },

    // Müsaitlik gönderimi (kaç oda-gün güncellendi).
    pushAvailability(channel, ctx = {}) {
      // REAL API: await fetch(`${channel.apiEndpoint}/availability`, { method:'POST', headers: authHeader(channel), body: JSON.stringify(payload) });
      const roomCount = ctx.roomCount ?? 40;
      return { count: roomCount, message: `${roomCount} oda için müsaitlik ${cfg.name} kanalına gönderildi.` };
    },

    // Fiyat gönderimi (kaç oda tipi güncellendi).
    pushRates(channel, ctx = {}) {
      // REAL API: await fetch(`${channel.apiEndpoint}/rates`, { method:'POST', headers: authHeader(channel), body: JSON.stringify(ratePlan) });
      const typeCount = ctx.roomTypeCount ?? roomTypeCodes.length;
      return { count: typeCount, message: `${typeCount} oda tipi için fiyatlar ${cfg.name} kanalına gönderildi.` };
    },
  };
}

// Kullanıcının elle eklediği, tanımlı adapter'ı olmayan OTA'lar için genel adapter.
export function genericAdapter(slug, name) {
  return makeMockAdapter({ slug, name, keyPrefix: '', maxPull: 2 });
}
