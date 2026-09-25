// Folio (folyo), tahsilat, vergi motoru (KDV + Konaklama Vergisi) ve fatura.
// Türkiye kuralı: oda fiyatları KDV DAHİL (brüt) girilir.
//   net = brüt / (1 + KDV%)   ·   KDV = brüt - net
//   Konaklama Vergisi = oda neti * %oran  (KDV hariç bedel üzerinden, ayrı satır)
import db from './db.js';
import { uid, nights, addDays } from './util.js';
import * as efatura from './integrations/efatura.js';

function splitTax(gross, kdvRate) {
  const net = gross / (1 + (kdvRate || 0) / 100);
  const kdv = gross - net;
  return { net: Math.round(net * 100) / 100, kdv: Math.round(kdv * 100) / 100 };
}

/** Rezervasyon için folio döndürür; yoksa oluşturur ve oda + vergi kalemlerini işler. */
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
    currency: settings.baseCurrency,
    createdAt: new Date().toISOString(),
  });
  db.update('reservations', reservation.id, { folioId: folio.id });

  // Oda konaklama kalemleri (gece gece) — fiyat REZERVASYONUN ratePerNight'ından gelir
  // (resepsiyonun manuel girdiği / kanaldan gelen anlaşmalı fiyat). Fiyat motoru YALNIZCA OTA içindir.
  const nightlyRate = Number(reservation.ratePerNight) || 0;
  let roomNetTotal = 0;
  if (nightlyRate > 0) {
    for (let d = reservation.checkIn; d < reservation.checkOut; d = addDays(d, 1)) {
      const { net, kdv } = splitTax(nightlyRate, settings.kdvAccommodation);
      roomNetTotal += net;
      db.insert('folioItems', {
        id: uid('fi'), folioId: folio.id, date: d, type: 'room', category: 'Konaklama',
        description: `Konaklama — ${d}`, qty: 1, unitPrice: nightlyRate, gross: nightlyRate,
        kdvRate: settings.kdvAccommodation, kdvAmount: kdv, netAmount: net,
        accommodation: true, reversed: false, createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
      });
    }
  }
  // Konaklama Vergisi (net üzerinden, KDV'siz — ayrı kalem)
  const accTax = Math.round(roomNetTotal * (settings.accommodationTaxRate / 100) * 100) / 100;
  if (accTax > 0) {
    db.insert('folioItems', {
      id: uid('fi'), folioId: folio.id, date: reservation.checkIn, type: 'accommodation_tax', category: 'Konaklama Vergisi',
      description: `Konaklama Vergisi (%${settings.accommodationTaxRate})`, qty: 1, unitPrice: accTax, gross: accTax,
      kdvRate: 0, kdvAmount: 0, netAmount: accTax, accommodation: false, reversed: false,
      createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
    });
  }
  return folio;
}

/** Ekstra harcama (minibar, restoran, spa vb.) folyoya işler. */
export function postExtra(folioId, { description, category = 'Ekstra', qty = 1, unitPrice, kdvRate, date }, req = null) {
  const settings = db.getSettings();
  const rate = kdvRate != null ? kdvRate : settings.kdvFnb;
  const gross = Math.round(qty * unitPrice * 100) / 100;
  const { net, kdv } = splitTax(gross, rate);
  return db.insert('folioItems', {
    id: uid('fi'), folioId, date: date || db.businessToday(), type: 'extra', category,
    description, qty, unitPrice, gross, kdvRate: rate, kdvAmount: kdv, netAmount: net,
    accommodation: false, reversed: false, createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
  });
}

/** Tahsilat (ödeme) işler. */
export function postPayment(folioId, { method = 'cash', amount, reference = '', date }, req = null) {
  const settings = db.getSettings();
  return db.insert('payments', {
    id: uid('pay'), folioId, date: date || db.businessToday(), method,
    amount: Math.round(amount * 100) / 100, currency: settings.currency || settings.baseCurrency,
    reference, reversed: false, createdBy: req && req.user ? req.user.name : 'sistem', createdAt: new Date().toISOString(),
  });
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

/** Folio özeti: kalemler, ödemeler, bakiye, KDV/vergi dökümü. */
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

  // KDV oranına göre döküm
  const kdvByRate = {};
  items.filter((i) => i.kdvRate > 0).forEach((i) => {
    kdvByRate[i.kdvRate] = kdvByRate[i.kdvRate] || { rate: i.kdvRate, net: 0, kdv: 0 };
    kdvByRate[i.kdvRate].net += i.netAmount;
    kdvByRate[i.kdvRate].kdv += i.kdvAmount;
  });

  return {
    folio, items, payments,
    chargeTotal: round(chargeTotal),
    paidTotal: round(paidTotal),
    balance: round(chargeTotal - paidTotal),
    netTotal: round(netTotal),
    kdvTotal: round(kdvTotal),
    accommodationTax: round(accTax),
    kdvBreakdown: Object.values(kdvByRate).map((x) => ({ rate: x.rate, net: round(x.net), kdv: round(x.kdv) })),
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

  // e-Fatura entegratörüne gönder (adapter — mock/gerçek-hazır)
  const result = efatura.send(invoice, settings);
  db.update('invoices', invoice.id, { efaturaStatus: result.status, efaturaUuid: result.uuid, efaturaMessage: result.message });

  return { ok: true, invoice: db.get('invoices', invoice.id), efatura: result };
}

function round(n) { return Math.round(n * 100) / 100; }
