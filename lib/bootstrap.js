// Başlangıç kurulumu: varsayılan kullanıcılar, pansiyon planları, mevcut
// rezervasyonlara folio + tahsilat, başlangıç döviz kurları. İdempotenttir.
import db from './db.js';
import { hashPassword } from './auth.js';
import * as billing from './billing.js';
import { uid, today, addDays, nights } from './util.js';

const DEFAULT_USERS = [
  { username: 'admin', name: 'Selim Koç', role: 'admin', password: 'admin123' },
  { username: 'resepsiyon', name: 'Derya Aksoy', role: 'reception', password: 'resepsiyon123' },
  { username: 'kat', name: 'Hülya Demir', role: 'housekeeping', password: 'kat123' },
  { username: 'muhasebe', name: 'Emine Ak', role: 'accounting', password: 'muhasebe123' },
];

const SEED_CURRENCIES = [
  { code: 'USD', name: 'ABD Doları', forexBuying: 39.10, forexSelling: 39.25 },
  { code: 'EUR', name: 'Euro', forexBuying: 42.30, forexSelling: 42.48 },
  { code: 'GBP', name: 'İngiliz Sterlini', forexBuying: 49.60, forexSelling: 49.85 },
];

export function bootstrap() {
  // 0) İş günü (operasyonel tarih) — SABİT tutulur; yalnızca manuel Gün Sonu ilerletir.
  //    Böylece gerçek saat gece yarısını geçince tarih kendiliğinden ilerlemez.
  if (!db.getSettings().currentDate) {
    db.updateSettings({ currentDate: today() });
    console.log('[bootstrap] İş günü sabitlendi:', db.getSettings().currentDate);
  }

  // 1) Pansiyon planları kaldırıldı (board konsepti yok). Fiyatlandırma yalnız oda + ekstra.

  // 2) Kullanıcılar
  if (!db.all('users').length) {
    for (const u of DEFAULT_USERS) {
      const { salt, hash } = hashPassword(u.password);
      db.insert('users', { id: uid('usr'), username: u.username, name: u.name, role: u.role, salt, hash, active: true, createdAt: new Date().toISOString() });
    }
    console.log('[bootstrap] Varsayılan kullanıcılar oluşturuldu (admin/admin123 vb.).');
  }

  // 3) Döviz kurları (başlangıç, ağ gerektirmez)
  if (!db.all('currencies').length) {
    const date = new Date().toISOString().slice(0, 10);
    SEED_CURRENCIES.forEach((c) => db.insert('currencies', { id: c.code, ...c, source: 'seed', date }));
  }

  // 4) Aktif rezervasyonlara folio + tahsilat (idempotent)
  const active = db.all('reservations').filter((r) => r.status === 'checked_in' || r.status === 'checked_out');
  let created = 0;
  for (const resv of active) {
    const hadFolio = !!resv.folioId && db.get('folios', resv.folioId);
    const folio = billing.ensureFolio(resv);
    if (hadFolio) continue;
    // Yeni folio: seed tahsilatı işle
    const sum = billing.folioSummary(folio.id);
    if (resv.status === 'checked_out') {
      // Tam tahsil + folyoyu kapat
      if (sum.balance > 0) billing.postPayment(folio.id, { method: 'card', amount: sum.balance, reference: 'Açılış devir' });
      db.update('folios', folio.id, { status: 'closed' });
    } else if (resv.paidAmount > 0) {
      billing.postPayment(folio.id, { method: 'card', amount: Math.min(resv.paidAmount, sum.chargeTotal), reference: 'Ön ödeme' });
    }
    created++;
  }
  if (created) console.log(`[bootstrap] ${created} rezervasyon için folio oluşturuldu.`);

  // 5) Normalizasyon: Dolu (occupied) oda her zaman TEMİZ + ARIZASIZ olmalı
  let normalized = 0;
  db.all('rooms').filter((r) => r.status === 'occupied' && (r.housekeeping !== 'clean' || r.outOfOrder))
    .forEach((r) => { db.update('rooms', r.id, { housekeeping: 'clean', outOfOrder: false }); normalized++; });
  if (normalized) console.log(`[bootstrap] ${normalized} dolu oda temiz/arızasız olarak normalize edildi.`);

  // 6) Yaklaşan bazı onaylı rezervasyonlara oda ata → "Rezerve" durumu (idempotent)
  assignConfirmedRooms();

  // 7) Pansiyon planlarını boşalt (board konsepti kaldırıldı) — idempotent
  clearBoardPlans();

  // 8) Engelli Oda (ENG) tipini kaldır; 603 → Ekonomi + Arızalı — idempotent
  normalizeRooms();
}

// Board konsepti kaldırıldı: boardPlans koleksiyonunu boşaltır.
function clearBoardPlans() {
  const cur = db.all('boardPlans');
  if (!cur.length) return;
  cur.forEach((p) => db.remove('boardPlans', p.id));
  console.log('[bootstrap] Pansiyon planları kaldırıldı (boardPlans boşaltıldı).');
}

// Engelli Oda tipini (rt_eng) PMS'ten kaldırır; ilgili oda/rezervasyonları Ekonomi'ye taşır.
// 603 arızalı yapılır. Canlı veriye zarar vermez (idempotent).
function normalizeRooms() {
  const engType = db.get('roomTypes', 'rt_eng');
  const engRooms = db.all('rooms').filter((r) => r.typeId === 'rt_eng');
  if (!engType && !engRooms.length) return;
  engRooms.forEach((r) => {
    const patch = { typeId: 'rt_eco' };
    // 603 arızalı yapılır — ancak dolu değilse (dolu oda arızalı olamaz kuralı)
    if (r.number === '603' && r.status !== 'occupied') patch.outOfOrder = true;
    db.update('rooms', r.id, patch);
  });
  db.all('reservations').filter((r) => r.roomTypeId === 'rt_eng')
    .forEach((r) => db.update('reservations', r.id, { roomTypeId: 'rt_eco' }));
  if (engType) db.remove('roomTypes', 'rt_eng');
  console.log(`[bootstrap] Engelli Oda tipi kaldırıldı; ${engRooms.length} oda Ekonomi'ye taşındı (603 arızalı).`);
}

function assignConfirmedRooms() {
  const rooms = db.all('rooms');
  const t = db.businessToday(); // iş günü (sabit)
  // Oda rafında "Rezerve" yalnızca BUGÜN girişli rezervasyonları gösterir.
  // Demo için ~8 onaylı rezervasyonu bugün girişli yapıp odaya ata (idempotent).
  const already = db.all('reservations').filter((r) => r.status === 'confirmed' && r.roomId && r.checkIn === t).length;
  const need = 8 - already;
  if (need <= 0) return;
  const pool = db.all('reservations')
    .filter((r) => r.status === 'confirmed' && !r.roomId)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, need);
  if (!pool.length) return;
  const used = {};
  db.all('reservations').filter((r) => r.roomId && (r.status === 'checked_in' || r.status === 'confirmed'))
    .forEach((r) => { (used[r.roomId] = used[r.roomId] || []).push([r.checkIn, r.checkOut]); });
  let assigned = 0;
  for (const resv of pool) {
    const nn = Math.max(1, nights(resv.checkIn, resv.checkOut));
    const newIn = t, newOut = addDays(t, nn);
    const candidates = rooms.filter((rm) => rm.typeId === resv.roomTypeId && !rm.outOfOrder && rm.status !== 'occupied');
    for (const rm of candidates) {
      const ranges = used[rm.id] || [];
      const clash = ranges.some(([a, b]) => newIn < b && a < newOut);
      if (!clash) {
        db.update('reservations', resv.id, { roomId: rm.id, checkIn: newIn, checkOut: newOut, nights: nn });
        (used[rm.id] = used[rm.id] || []).push([newIn, newOut]);
        assigned++;
        break;
      }
    }
  }
  if (assigned) console.log(`[bootstrap] ${assigned} rezervasyon bugün (${t}) girişli "Rezerve" yapıldı.`);
}
