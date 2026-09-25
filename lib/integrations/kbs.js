// KBS — Kimlik Bildirim Sistemi (EGM/Jandarma) adapteri.
// Konaklayan misafirlerin kolluk kuvvetlerine bildirimi YASAL ZORUNLULUK.
// Şu an MOCK: gerçek gönderim KBS tesis kodu + kurum kullanıcı/parola + web servis erişimi gerektirir.
import crypto from 'crypto';

/** Bir konaklama kaydı için KBS bildirim XML'i üretir. */
export function buildKbsXml(record, settings) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<KimlikBildirim>
  <TesisKodu>${esc(settings.kbsFacilityCode)}</TesisKodu>
  <Islem>${record.type === 'checkin' ? 'GIRIS' : 'CIKIS'}</Islem>
  <Misafir>
    <KimlikTuru>${esc(record.idType === 'passport' ? 'PASAPORT' : 'TCKIMLIK')}</KimlikTuru>
    <KimlikNo>${esc(record.idNumber)}</KimlikNo>
    <Ad>${esc(record.firstName)}</Ad>
    <Soyad>${esc(record.lastName)}</Soyad>
    <DogumTarihi>${esc(record.birthDate)}</DogumTarihi>
    <Uyruk>${esc(record.nationality)}</Uyruk>
    <OdaNo>${esc(record.roomNumber || '')}</OdaNo>
    <Tarih>${esc(record.at)}</Tarih>
  </Misafir>
</KimlikBildirim>`;
}

/**
 * KBS bildirimini gönderir (giriş/çıkış).
 * @returns {status:'sent'|'error', reference, message, xml}
 */
export function submit(record, settings) {
  if (!record.idNumber || !record.firstName || !record.lastName) {
    return { status: 'error', reference: null, message: 'Kimlik no, ad ve soyad zorunlu.', xml: null };
  }
  const xml = buildKbsXml(record, settings);
  const reference = 'KBS-' + crypto.randomBytes(5).toString('hex').toUpperCase();

  // REAL API: const res = await fetch(KBS_ENDPOINT, {
  // REAL API:   method: 'POST', headers: { 'Content-Type': 'application/xml', Authorization: kbsAuth }, body: xml });
  // REAL API: return mapKbsResponse(await res.text());

  return {
    status: 'sent',
    reference,
    message: `${record.type === 'checkin' ? 'Giriş' : 'Çıkış'} bildirimi EGM/Jandarma KBS'ye iletildi (Ref: ${reference}).`,
    xml,
  };
}
