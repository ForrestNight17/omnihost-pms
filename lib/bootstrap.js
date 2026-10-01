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

  // 9) Kurumsal Cari Hesaplar (idempotent)
  seedCorporateAccounts();

  // 10) Gider Kalemleri (idempotent)
  seedExpenses();

  // 11) Kara Liste Misafirleri (idempotent)
  seedBlacklist();
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

const SEED_CORP_ACCOUNTS = [
  { id: 'corp_bkg', name: 'Booking.com B.V.', type: 'agency', code: 'OTA-BKG', taxOffice: 'Büyük Mükellefler', taxNumber: '1780029341', contactPerson: 'Hotel Partner Desk', email: 'partners@booking.com', phone: '+31 20 715 2100' },
  { id: 'corp_exp', name: 'Expedia Partner Solutions', type: 'agency', code: 'OTA-EXP', taxOffice: 'Büyük Mükellefler', taxNumber: '3810051289', contactPerson: 'Partner Support', email: 'lodging@expedia.com', phone: '+1 800 397 3342' },
  { id: 'corp_tb', name: 'Tatilbudur Seyahat A.Ş.', type: 'agency', code: 'AGN-TB', taxOffice: 'Zincirlikuyu', taxNumber: '8310023419', contactPerson: 'Erol Bey (Kontrat Müdürü)', email: 'kontrat@tatilbudur.com', phone: '+90 216 709 9500' },
  { id: 'corp_oz', name: 'Otelz.com Turizm Ltd.', type: 'agency', code: 'AGN-OZ', taxOffice: 'Şişli', taxNumber: '6480194821', contactPerson: 'Acente Operasyon', email: 'destek@otelz.com', phone: '+90 850 333 0 220' },
  { id: 'corp_thy', name: 'Türk Hava Yolları A.Ş.', type: 'corporate', code: 'CORP-THY', taxOffice: 'Büyük Mükellefler', taxNumber: '8760049210', contactPerson: 'Meltem Hanım (Kurumsal Satınalma)', email: 'corporate-hotel@thy.com', phone: '+90 212 463 6363' },
  { id: 'corp_sie', name: 'Siemens Sanayi ve Ticaret A.Ş.', type: 'corporate', code: 'CORP-SIE', taxOffice: 'Ümraniye', taxNumber: '7700038192', contactPerson: 'Kemal Aksoy (İdari İşler)', email: 'travel.tr@siemens.com', phone: '+90 216 459 2000' },
  { id: 'corp_koc', name: 'Koç Sistem Bilgi İletişim A.Ş.', type: 'corporate', code: 'CORP-KOC', taxOffice: 'Kadıköy', taxNumber: '5710082341', contactPerson: 'Zeynep Kaya', email: 'idari@kocsistem.com.tr', phone: '+90 216 556 1000' },
];

function seedCorporateAccounts() {
  if (db.all('corporateAccounts').length) return;
  SEED_CORP_ACCOUNTS.forEach((c) => {
    db.insert('corporateAccounts', {
      ...c,
      discountPct: c.type === 'corporate' ? 15 : 0,
      paymentTermsDays: 30,
      createdAt: new Date().toISOString(),
    });
  });
  console.log('[bootstrap] Kurumsal cari hesaplar oluşturuldu.');
}

function seedExpenses() {
  if (db.all('expenses').length) return;
  const t = db.businessToday();
  const sample = [
    { date: addDays(t, -25), category: 'Personel', description: 'Personel maaş ve prim ödemeleri (Ağustos)', amount: 145000, paymentMethod: 'bank', invoiceNo: 'BORDRO-2026-08' },
    { date: addDays(t, -22), category: 'Enerji', description: 'Elektrik faturası (CK Boğaziçi)', amount: 38200, paymentMethod: 'bank', invoiceNo: 'ELEK-89211' },
    { date: addDays(t, -20), category: 'Mutfak / F&B', description: 'Toptan et, süt ve şarküteri alımı (Metro Grossmarket)', amount: 24600, paymentMethod: 'card', invoiceNo: 'FTR-2026-4412' },
    { date: addDays(t, -18), category: 'Temizlik', description: 'Otel buklet malzemeleri ve endüstriyel deterjan alımı', amount: 16800, paymentMethod: 'bank', invoiceNo: 'FTR-7712' },
    { date: addDays(t, -14), category: 'Bakım & Onarım', description: 'VRF Klima sistemi filtre değişimi ve asansör periyodik kontrol', amount: 12500, paymentMethod: 'bank', invoiceNo: 'SRV-3310' },
    { date: addDays(t, -10), category: 'Mutfak / F&B', description: 'Haftalık taze sebze, meyve ve unlu mamul tedariği', amount: 9800, paymentMethod: 'card', invoiceNo: 'FTR-9901' },
    { date: addDays(t, -7), category: 'Enerji', description: 'Doğalgaz faturası (İGDAŞ)', amount: 14200, paymentMethod: 'bank', invoiceNo: 'DGAZ-55012' },
    { date: addDays(t, -5), category: 'Pazarlama', description: 'Google Ads & Yerel Turizm Rehberi sponsorluk bedeli', amount: 7500, paymentMethod: 'card', invoiceNo: 'ADV-1029' },
    { date: addDays(t, -2), category: 'Sabit Giderler', description: 'Yazılım lisansı ve internet omurga altyapı ücreti', amount: 6200, paymentMethod: 'bank', invoiceNo: 'FTR-4819' },
    { date: t, category: 'Mutfak / F&B', description: 'Açık büfe kahvaltı günlük taze ekmek ve şarküteri ikmali', amount: 3450, paymentMethod: 'cash', invoiceNo: 'FIS-0192' },
  ];
  sample.forEach((e) => {
    db.insert('expenses', {
      id: uid('exp'),
      ...e,
      createdBy: 'Emine Ak (Muhasebe)',
      createdAt: new Date().toISOString(),
    });
  });
  console.log('[bootstrap] Muhasebe örnek gider kalemleri oluşturuldu.');
}

function seedBlacklist() {
  const guests = db.all('guests');
  if (!guests.length) return;
  const hasBlacklist = guests.some((g) => g.blacklist);
  if (hasBlacklist) return;
  const g1 = guests[0];
  const g2 = guests[1];
  if (g1) {
    db.update('guests', g1.id, {
      blacklist: true,
      blacklistReason: 'Otel odasında eşyalara kasıtlı hasar verdi ve mini bar ücretini ödemeden ayrılmaya çalıştı.',
      blacklistDate: '2026-08-15',
      blacklistedBy: 'Selim Koç (Yönetici)',
    });
  }
  if (g2) {
    db.update('guests', g2.id, {
      blacklist: true,
      blacklistReason: 'Gece geç saatte gürültü yaparak komşu odaları rahatsız etti, personelle sözlü münakaşaya girdi.',
      blacklistDate: '2026-09-02',
      blacklistedBy: 'Derya Aksoy (Resepsiyon)',
    });
  }
  console.log('[bootstrap] Örnek kara liste kayıtları güncellendi.');
}

