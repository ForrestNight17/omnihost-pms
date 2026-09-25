// Fiyat (rate) ve kontenjan (inventory) motoru.
// - Fiyat: rates tablosunda tarih bazlı override yoksa roomType.baseRate + pansiyon farkı.
// - Kontenjan: inventory tablosunda override yoksa fiziksel oda sayısı; satış DİNAMİK hesaplanır
//   (aktif rezervasyonlardan) — böylece sayaç kayması olmaz, overbooking güvenli kontrol edilir.
import db from './db.js';
import { nightWithinStay, nights, addDays, uid } from './util.js';

const ACTIVE_STATUSES = ['confirmed', 'checked_in', 'checked_out'];

/** Bir oda tipinin satılabilir fiziksel oda sayısı (arızalı hariç). */
export function physicalCount(roomTypeId) {
  return db.all('rooms').filter((r) => r.typeId === roomTypeId && !r.outOfOrder).length;
}

/** Belirli tarihte bir oda tipinden satılmış (dolu) oda sayısı. */
export function soldCount(roomTypeId, date, excludeReservationId = null) {
  return db.all('reservations').filter((r) =>
    r.roomTypeId === roomTypeId &&
    ACTIVE_STATUSES.includes(r.status) &&
    r.id !== excludeReservationId &&
    nightWithinStay(date, r.checkIn, r.checkOut)
  ).length;
}

/** Bir oda tipi + tarih için kontenjan bilgisi. */
export function inventoryFor(roomTypeId, date, excludeReservationId = null) {
  const override = db.findOne('inventory', (i) => i.roomTypeId === roomTypeId && i.date === date);
  const allotment = override && override.allotment != null ? override.allotment : physicalCount(roomTypeId);
  const sold = soldCount(roomTypeId, date, excludeReservationId);
  return {
    roomTypeId,
    date,
    allotment,
    sold,
    available: Math.max(0, allotment - sold),
    stopSell: !!(override && override.stopSell),
    minStay: (override && override.minStay) || 1,
    maxStay: (override && override.maxStay) || null,
    cta: !!(override && override.cta), // closed to arrival
    ctd: !!(override && override.ctd), // closed to departure
  };
}

/** Bir oda tipi + tarih için gecelik oda fiyatı (tarih override'ı yoksa baseRate). */
export function rateFor(roomTypeId, date) {
  const rt = db.get('roomTypes', roomTypeId);
  const base = rt ? rt.baseRate : 0;
  const override = db.findOne('rates', (r) => r.roomTypeId === roomTypeId && r.date === date);
  return override && override.price != null ? override.price : base;
}

/** Konaklama teklifi: gece gece fiyat dökümü ve toplam (OTA/ARI için referans). */
export function quote(roomTypeId, checkIn, checkOut) {
  const nightly = [];
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    nightly.push({ date: d, price: rateFor(roomTypeId, d) });
  }
  const roomTotal = nightly.reduce((s, n) => s + n.price, 0);
  return { nights: nightly.length, nightly, roomTotal, avgRate: nightly.length ? Math.round(roomTotal / nightly.length) : 0 };
}

/**
 * Bir konaklama için müsaitlik + kısıtlama kontrolü (overbooking önleme).
 * @returns {ok, reason, failedDate}
 */
export function checkAvailability(roomTypeId, checkIn, checkOut, excludeReservationId = null) {
  const stayNights = nights(checkIn, checkOut);
  if (stayNights <= 0) return { ok: false, reason: 'Geçersiz tarih aralığı.' };

  // Varış kısıtlamaları
  const arrInv = inventoryFor(roomTypeId, checkIn, excludeReservationId);
  if (arrInv.cta) return { ok: false, reason: `${checkIn} tarihinde girişe kapalı (CTA).`, failedDate: checkIn };
  if (arrInv.minStay && stayNights < arrInv.minStay) {
    return { ok: false, reason: `Minimum ${arrInv.minStay} gece konaklama gerekli.`, failedDate: checkIn };
  }
  if (arrInv.maxStay && stayNights > arrInv.maxStay) {
    return { ok: false, reason: `Maksimum ${arrInv.maxStay} gece konaklama izinli.`, failedDate: checkIn };
  }
  // Ayrılış kısıtı
  const depInv = inventoryFor(roomTypeId, checkOut, excludeReservationId);
  if (depInv.ctd) return { ok: false, reason: `${checkOut} tarihinde çıkışa kapalı (CTD).`, failedDate: checkOut };

  // Her gece kontenjan + stop-sell
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    const inv = inventoryFor(roomTypeId, d, excludeReservationId);
    if (inv.stopSell) return { ok: false, reason: `${d} tarihinde satışa kapalı (stop-sell).`, failedDate: d };
    if (inv.available <= 0) return { ok: false, reason: `${d} tarihinde müsait oda yok (kontenjan dolu).`, failedDate: d };
  }
  return { ok: true };
}

/** Bir tarih aralığında oda tipi için kontenjan+fiyat özetini döndürür (takvim editörü / ARI için). */
export function inventoryRange(roomTypeId, from, to) {
  const out = [];
  for (let d = from; d < to; d = addDays(d, 1)) {
    const inv = inventoryFor(roomTypeId, d);
    out.push({ ...inv, rate: rateFor(roomTypeId, d) });
  }
  return out;
}

/** Kontenjan/kısıtlama override'ını bir tarih aralığına uygular (upsert). */
export function setInventory(roomTypeId, from, to, patch) {
  let count = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    const existing = db.findOne('inventory', (i) => i.roomTypeId === roomTypeId && i.date === d);
    if (existing) db.update('inventory', existing.id, patch);
    else db.insert('inventory', { id: uid('inv'), roomTypeId, date: d, allotment: null, stopSell: false, minStay: 1, maxStay: null, cta: false, ctd: false, ...patch });
    count++;
  }
  return count;
}

/** Fiyat override'ını bir tarih aralığına uygular (upsert). */
export function setRate(roomTypeId, from, to, price) {
  let count = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    const existing = db.findOne('rates', (r) => r.roomTypeId === roomTypeId && r.date === d);
    if (existing) db.update('rates', existing.id, { price });
    else db.insert('rates', { id: uid('rate'), roomTypeId, date: d, price });
    count++;
  }
  return count;
}
