// Ortak yardımcılar: tarih, id, para formatı.

let _counter = 0;

/** Benzersiz kimlik üretir (ör. uid('res') -> "res_lz3k1_7"). */
export function uid(prefix = 'id') {
  _counter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${_counter.toString(36)}${rand}`;
}

/** Rezervasyon kodu üretir (RLH-4F9A2). */
export function reservationCode() {
  const s = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `RLH-${(s + '00000').slice(0, 5)}`;
}

/** Bir Date nesnesini 'YYYY-MM-DD' string'e çevirir (yerel saat). */
export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Bugünün tarihi 'YYYY-MM-DD'. */
export function today() {
  return toISODate(new Date());
}

/** 'YYYY-MM-DD' string'ini yerel Date nesnesine (gün başı) çevirir. */
export function parseDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Bir tarihe gün ekler, 'YYYY-MM-DD' döner. */
export function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** İki tarih arasındaki gece (tam gün) sayısı. */
export function nights(checkIn, checkOut) {
  const a = parseDate(checkIn).getTime();
  const b = parseDate(checkOut).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** [inclusive checkIn, exclusive checkOut) aralığında `day` var mı? Konaklama günü kontrolü. */
export function nightWithinStay(day, checkIn, checkOut) {
  return day >= checkIn && day < checkOut;
}

/** İki tarih aralığının çakışıp çakışmadığı (rezervasyon çakışması için). */
export function rangesOverlap(aIn, aOut, bIn, bOut) {
  return aIn < bOut && bIn < aOut;
}

/** TL para formatı. */
export function money(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ₺';
}

/** Bir ayın (YYYY-MM) gün sayısı ve ilk günün haftadaki yeri gibi bilgiler. */
export function monthMeta(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  // Pazartesi = 0 olacak şekilde (Türkiye takvimi)
  const jsDow = first.getDay(); // 0=Pazar
  const startOffset = (jsDow + 6) % 7;
  return { year: y, month: m, daysInMonth, startOffset, first: toISODate(first) };
}

/** null/undefined güvenli sayı. */
export function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
