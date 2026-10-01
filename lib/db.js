// Basit, bağımlılıksız JSON dosya veritabanı.
// Tüm koleksiyonlar bellekte tutulur, her değişiklikte diske yazılır.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildSeed } from './seed.js';
import { today as realToday } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

/** Bilinen koleksiyonlar. */
const COLLECTIONS = [
  'roomTypes',
  'rooms',
  'guests',
  'reservations',
  'housekeepingTasks',
  'staff',
  'channels',
  'syncLogs',
  // Üretim katmanı
  'users',
  'sessions',
  'auditLogs',
  'boardPlans',
  'ratePlans',
  'rates',
  'inventory',
  'folios',
  'folioItems',
  'payments',
  'invoices',
  'kbsRecords',
  'currencies',
  'expenses',
  'corporateAccounts',
];

const DEFAULT_SETTINGS = {
  hotelName: 'OmniHost PMS',
  legalName: 'OmniHost PMS',
  taxOffice: '',
  taxNumber: '',
  address: '',
  phone: '',
  email: '',
  baseCurrency: 'TRY',
  kdvAccommodation: 10, // konaklama KDV %
  kdvFnb: 10, // yiyecek-içecek KDV %
  kdvGeneral: 20, // genel KDV %
  accommodationTaxRate: 2, // konaklama vergisi %
  breakfastPrice: 350, // kişi/gece kahvaltı fiyatı (KDV dahil, F&B) — folioya adisyon olarak eklenir
  kbsFacilityCode: 'TR-IST-000123',
  efaturaProvider: 'izibiz', // entegratör (mock)
  currentDate: null, // gün sonu ile ilerletilen operasyonel tarih (null=gerçek bugün)
};

let data = null;

function ensureShape(obj) {
  const out = obj && typeof obj === 'object' ? obj : {};
  for (const c of COLLECTIONS) {
    if (!Array.isArray(out[c])) out[c] = [];
  }
  out.settings = { ...DEFAULT_SETTINGS, ...(out.settings || {}) };
  return out;
}

/** Otel/vergi ayarlarını döndürür. */
export function getSettings() {
  return load().settings;
}
/** Ayarları günceller. */
export function updateSettings(patch) {
  const d = load();
  d.settings = { ...d.settings, ...patch };
  persist();
  return d.settings;
}

/** Operasyonel (iş) tarihi — gün sonu ile ilerletilmişse onu, değilse gerçek bugünü döndürür. */
export function businessToday() {
  return load().settings.currentDate || realToday();
}

/** Veritabanını yükler; dosya yoksa seed ile oluşturur. */
export function load() {
  if (data) return data;
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      data = ensureShape(JSON.parse(raw));
    } else {
      data = ensureShape(buildSeed());
      persist();
      console.log('[db] Yeni veritabanı seed verisiyle oluşturuldu.');
    }
  } catch (err) {
    console.error('[db] Yükleme hatası, seed veriyle başlatılıyor:', err.message);
    data = ensureShape(buildSeed());
    persist();
  }
  return data;
}

/** Diske yazar. */
export function persist() {
  if (!data) return;
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[db] Kaydetme hatası:', err.message);
  }
}

/** Veritabanını seed'e sıfırlar. */
export function reset() {
  data = ensureShape(buildSeed());
  persist();
  return data;
}

function coll(name) {
  const d = load();
  if (!Array.isArray(d[name])) d[name] = [];
  return d[name];
}

/** Tüm kayıtlar (opsiyonel filtre fonksiyonu ile). */
export function all(name, predicate) {
  const list = coll(name);
  return predicate ? list.filter(predicate) : list.slice();
}

/** id ile tek kayıt. */
export function get(name, id) {
  return coll(name).find((x) => x.id === id) || null;
}

/** Koşula uyan ilk kayıt. */
export function findOne(name, predicate) {
  return coll(name).find(predicate) || null;
}

/** Yeni kayıt ekler (id yoksa çağıran atamalı) ve kaydeder. */
export function insert(name, obj) {
  coll(name).push(obj);
  persist();
  return obj;
}

/** id ile kayda patch uygular ve kaydeder. */
export function update(name, id, patch) {
  const list = coll(name);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch };
  persist();
  return list[idx];
}

/** id ile kaydı siler. */
export function remove(name, id) {
  const list = coll(name);
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  persist();
  return true;
}

export default {
  load,
  persist,
  reset,
  all,
  get,
  findOne,
  insert,
  update,
  remove,
  getSettings,
  updateSettings,
  businessToday,
};
