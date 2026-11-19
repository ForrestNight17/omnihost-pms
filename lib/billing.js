// Folio (folyo), tahsilat ve fatura işlemleri (KDV ve ek vergi karmaşası olmadan sadeleştirilmiş).
import db from './db.js';
import { uid, addDays } from './util.js';
import * as efatura from './integrations/efatura.js';

function splitTax(gross, kdvRate) {
  const net = gross / (1 + (kdvRate || 0) / 100);
  const kdv = gross - net;
  return { net: Math.round(net * 100) / 100, kdv: Math.round(kdv * 100) / 100 };
}

/** Rezervasyon için folio döndürür; yoksa oluşturur ve oda kalemlerini işler. */
export function ensureFolio(reservation, req = null) {
  if (reservation.folioId) {
    const existing = db.get('folios', reservation.folioId);
    if (existing) return existing;
  }
  const settings = db.getSettings();
  const folio = db.insert('folios', {
    id: uid('fol'),
    reservationId: reservation.id,
    guestId: reservation.guestId,
    status: 'open',
    currency: reservation.currency || settings.baseCurrency || 'TRY',
    createdAt: new Date().toISOString(),
  });
  db.update('reservations', reservation.id, { folioId: folio.id });
  syncRoomCharges({ ...reservation, folioId: folio.id }, req);
  return folio;
}

/** Rezervasyonun tarihleri veya gecelik fiyatı değiştiğinde folyodaki oda kalemlerini günceller. */
export function syncRoomCharges(reservation, req = null) {
  if (!reservation || !reservation.folioId) return;
  const folio = db.get('folios', reservation.folioId);
  if (!folio) return;
  if (reservation.currency && folio.currency !== reservation.currency) {
    db.update('folios', folio.id, { currency: reservation.currency });
  }
  // Eski oda ve vergi kalemlerini temizle
  const oldItems = db.all('folioItems').filter((i) => i.folioId === folio.id && (i.type === 'room' || i.type === 'accommodation_tax'));
  oldItems.forEach((i) => db.remove('folioItems', i.id));

  const nightlyRate = Number(reservation.ratePerNight) || 0;
  if (nightlyRate > 0) {
    const endDate = reservation.checkOut > reservation.checkIn ? reservation.checkOut : addDays(reservation.checkIn, 1);
    for (let d = reservation.checkIn; d < endDate; d = addDays(d, 1)) {
      db.insert('folioItems', {
        id: uid('fi'), folioId: folio.id, date: d, type: 'room', category: 'Konaklama',
        description: `Konaklama — ${d}`, qty: 1, unitPrice: nightlyRate, gross: nightlyRate,
        kdvRate: 0, kdvAmount: 0, netAmount: nightlyRate,
        accommodation: true, reversed: false, createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
      });
    }
  }
}

/** Ekstra harcama (minibar, restoran, spa vb.) folyoya işler. */
export function postExtra(folioId, { description, category = 'Ekstra', qty = 1, unitPrice, kdvRate = 0, date }, req = null) {
  const rate = Number(kdvRate) || 0;
  const gross = Math.round(qty * unitPrice * 100) / 100;
  const { net, kdv } = splitTax(gross, rate);
  return db.insert('folioItems', {
    id: uid('fi'), folioId, date: date || db.businessToday(), type: 'extra', category,
    description, qty, unitPrice, gross, kdvRate: rate, kdvAmount: kdv, netAmount: net,
    accommodation: false, reversed: false, createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
  });
}

/** Tahsilat (ödeme) işler. */
export function postPayment(folioId, { method = 'cash', amount, reference = '', date, movementType }, req = null) {
  const settings = db.getSettings();
  const folio = db.get('folios', folioId);
  const resv = folio && folio.reservationId ? db.get('reservations', folio.reservationId) : null;
  const cur = (folio && folio.currency) || (resv && resv.currency) || settings.currency || settings.baseCurrency || 'TRY';
  const mType = movementType || (resv && resv.status === 'confirmed' ? 'REZERVASYON' : 'GİRİŞ');
  const pay = db.insert('payments', {
    id: uid('pay'), folioId, date: date || db.businessToday(), method,
    amount: Math.round(amount * 100) / 100, currency: cur,
    movementType: mType,
    reference, reversed: false, createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
  });
  if (folio && folio.reservationId) {
    const sum = folioSummary(folioId);
    if (sum) db.update('reservations', folio.reservationId, { paidAmount: sum.paidTotal });
  }
  return pay;
}

/** Tek bir tahsilat kaydının TRY karşılığını döndürür. */
export function paymentAmountTRY(p, folioMap = null, fxMap = null) {
  const amt = Number(p.amount) || 0;
  const folio = p.folioId ? (folioMap ? folioMap.get(p.folioId) : db.get('folios', p.folioId)) : null;
  const cur = (folio && folio.currency) || p.currency || 'TRY';
  if (cur === 'TRY') return amt;
  const fx = fxMap ? fxMap.get(cur) : db.findOne('currencies', (c) => c.code === cur);
  const rate = fx ? (Number(fx.forexSelling) || Number(fx.forexBuying) || 1) : 1;
  return amt * rate;
}

/**
 * Tahsilat (ödeme) esaslı ciro hesaplayıcı:
 * Her iş günü 0 ₺ ciro ile başlar; yalnızca ödeme alındıkça (oda, rezervasyon, adisyon/ekstra, cari) yükselir.
 */
export function revenueFromPayments(predicate) {
  const allPayments = db.all('payments').filter((p) => !p.reversed);
  const folios = db.all('folios');
  const folioMap = new Map(folios.map((f) => [f.id, f]));
  const fxMap = new Map(db.all('currencies').map((c) => [c.code, c]));

  // Folyolardaki oda ve ekstra toplamlarını önceden hesapla (TRY cinsinden)
  const folioTotals = new Map();
  db.all('folioItems').forEach((item) => {
    if (item.gross <= 0 || item.reversed) return;
    let entry = folioTotals.get(item.folioId);
    if (!entry) {
      entry = { room: 0, extra: 0 };
      folioTotals.set(item.folioId, entry);
    }
    const folio = folioMap.get(item.folioId);
    const cur = (folio && folio.currency) || 'TRY';
    const fx = cur !== 'TRY' ? fxMap.get(cur) : null;
    const rate = fx ? (Number(fx.forexSelling) || Number(fx.forexBuying) || 1) : 1;
    const grossTRY = (Number(item.gross) || 0) * rate;
    if (item.type === 'extra') entry.extra += grossTRY;
    else entry.room += grossTRY;
  });

  // Her ödemeyi kronolojik sırayla oda / ekstra kalemlerine dağıt
  const folioPaidSoFar = new Map();
  let roomRevenue = 0;
  let extraRevenue = 0;
  let totalPayments = 0;
  const payByMethod = {};

  for (const p of allPayments) {
    const amtTRY = paymentAmountTRY(p, folioMap, fxMap);
    const ft = p.folioId ? folioTotals.get(p.folioId) : null;
    const prevPaid = p.folioId ? (folioPaidSoFar.get(p.folioId) || 0) : 0;

    let roomPart = amtTRY;
    let extraPart = 0;
    if (ft && (ft.room > 0 || ft.extra > 0)) {
      const roomRemaining = Math.max(0, ft.room - prevPaid);
      const toRoom = Math.min(amtTRY, roomRemaining);
      const remAfterRoom = amtTRY - toRoom;
      const extraAlreadyPaid = Math.max(0, prevPaid - ft.room);
      const extraRemaining = Math.max(0, ft.extra - extraAlreadyPaid);
      const toExtra = Math.min(remAfterRoom, extraRemaining);
      const leftover = remAfterRoom - toExtra;
      roomPart = toRoom + leftover;
      extraPart = toExtra;
    }
    if (p.folioId) folioPaidSoFar.set(p.folioId, prevPaid + amtTRY);

    if (!predicate || predicate(p)) {
      roomRevenue += roomPart;
      extraRevenue += extraPart;
      totalPayments += amtTRY;
      const m = p.method || 'cash';
      payByMethod[m] = round((payByMethod[m] || 0) + amtTRY);
    }
  }

  return {
    roomRevenue: round(roomRevenue),
    extraRevenue: round(extraRevenue),
    accommodationTax: 0,
    kdvTotal: 0,
    totalRevenue: round(totalPayments),
    payments: round(totalPayments),
    payByMethod,
  };
}

/** Bir kalemi ters kayıtla iptal eder (finansal kayıt silinmez). */
export function reverseItem(itemId, req = null) {
  const item = db.get('folioItems', itemId);
  if (!item || item.reversed) return null;
  db.update('folioItems', itemId, { reversed: true });
  return db.insert('folioItems', {
    ...item, id: uid('fi'), gross: -item.gross, unitPrice: -item.unitPrice, kdvAmount: -item.kdvAmount,
    netAmount: -item.netAmount, description: `İPTAL: ${item.description}`, reversed: false, reversalOf: itemId,
    createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
  });
}

/** Folio özeti: kalemler, ödemeler ve bakiye. */
export function folioSummary(folioId) {
  const folio = db.get('folios', folioId);
  if (!folio) return null;
  const items = db.all('folioItems').filter((i) => i.folioId === folioId);
  const payments = db.all('payments').filter((p) => p.folioId === folioId && !p.reversed);
  const chargeTotal = items.reduce((s, i) => s + i.gross, 0);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const netTotal = items.reduce((s, i) => s + i.netAmount, 0);
  const kdvTotal = items.reduce((s, i) => s + i.kdvAmount, 0);
  const accTax = items.filter((i) => i.type === 'accommodation_tax').reduce((s, i) => s + i.gross, 0);

  return {
    folio, items, payments,
    chargeTotal: round(chargeTotal),
    paidTotal: round(paidTotal),
    balance: round(chargeTotal - paidTotal),
    netTotal: round(netTotal),
    kdvTotal: round(kdvTotal),
    accommodationTax: round(accTax),
    kdvBreakdown: [],
  };
}

/** Fatura oluşturur (vergi no'ya göre e-Fatura/e-Arşiv) ve e-Fatura adapterine gönderir. */
export function createInvoice(folioId, { customerName, taxNumber = '', taxOffice = '', address = '' }, req = null) {
  const sum = folioSummary(folioId);
  if (!sum) return { ok: false, message: 'Folio bulunamadı.' };
  const settings = db.getSettings();
  const type = taxNumber && taxNumber.length >= 10 ? 'efatura' : 'earsiv';
  const year = new Date().getFullYear();
  const seq = db.all('invoices').length + 1;
  const number = `RLH${year}${String(seq).padStart(6, '0')}`;

  const invoice = db.insert('invoices', {
    id: uid('inv'), folioId, reservationId: sum.folio.reservationId, number, type,
    customerName: customerName || '', taxNumber, taxOffice, address,
    net: sum.netTotal, kdv: sum.kdvTotal, accommodationTax: sum.accommodationTax,
    grandTotal: sum.chargeTotal, currency: sum.folio.currency,
    status: 'issued', efaturaStatus: 'pending', efaturaUuid: null,
    issuedAt: new Date().toISOString(), issuedBy: req && req.user ? req.user.name : 'sistem',
  });

  const result = efatura.send(invoice, settings);
  db.update('invoices', invoice.id, { efaturaStatus: result.status, efaturaUuid: result.uuid, efaturaMessage: result.message });

  return { ok: true, invoice: db.get('invoices', invoice.id), efatura: result };
}

function round(n) { return Math.round(n * 100) / 100; }
