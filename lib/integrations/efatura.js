// e-Fatura / e-Arşiv entegratör adapteri (İzibiz/Uyumsoft/e-Finans vb.).
// Şu an MOCK: GİB'e gerçek gönderim sertifikalı entegratör hesabı + Mali Mühür gerektirir.
// Gerçek entegrasyonda UBL-TR 1.2 XML üretilip entegratörün SOAP/REST servisine gönderilir.
import crypto from 'crypto';

/**
 * Faturayı e-Fatura/e-Arşiv olarak gönderir.
 * @returns {status:'sent'|'error', uuid, message}
 */
export function send(invoice, settings) {
  // Basit doğrulama
  if (!invoice.customerName) {
    return { status: 'error', uuid: null, message: 'Müşteri adı zorunlu.' };
  }
  if (invoice.type === 'efatura' && (!invoice.taxNumber || invoice.taxNumber.length < 10)) {
    return { status: 'error', uuid: null, message: 'e-Fatura için geçerli vergi/TC no gerekli.' };
  }

  const uuid = crypto.randomUUID();

  // REAL API: const ubl = buildUBLTR(invoice, settings);
  // REAL API: const res = await fetch(`${providerEndpoint}/gonder`, {
  // REAL API:   method: 'POST', headers: { Authorization: providerToken, 'Content-Type': 'application/xml' }, body: ubl });
  // REAL API: return mapProviderResponse(await res.json());

  const label = invoice.type === 'efatura' ? 'e-Fatura' : 'e-Arşiv';
  return {
    status: 'sent',
    uuid,
    message: `${label} ${settings.efaturaProvider} entegratörüne iletildi (No: ${invoice.number}).`,
  };
}

/** UBL-TR taslak XML üretici (gerçek entegrasyon için iskelet). */
export function buildUBLTR(invoice, settings) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <ProfileID>${invoice.type === 'efatura' ? 'TICARIFATURA' : 'EARSIVFATURA'}</ProfileID>
  <ID>${esc(invoice.number)}</ID>
  <IssueDate>${(invoice.issuedAt || '').slice(0, 10)}</IssueDate>
  <DocumentCurrencyCode>${esc(invoice.currency || 'TRY')}</DocumentCurrencyCode>
  <AccountingSupplierParty><Party><PartyName><Name>${esc(settings.legalName)}</Name></PartyName>
    <PartyTaxScheme><CompanyID>${esc(settings.taxNumber)}</CompanyID></PartyTaxScheme></Party></AccountingSupplierParty>
  <AccountingCustomerParty><Party><PartyName><Name>${esc(invoice.customerName)}</Name></PartyName>
    ${invoice.taxNumber ? `<PartyTaxScheme><CompanyID>${esc(invoice.taxNumber)}</CompanyID></PartyTaxScheme>` : ''}</Party></AccountingCustomerParty>
  <LegalMonetaryTotal>
    <LineExtensionAmount currencyID="${esc(invoice.currency)}">${invoice.net}</LineExtensionAmount>
    <TaxInclusiveAmount currencyID="${esc(invoice.currency)}">${invoice.grandTotal}</TaxInclusiveAmount>
    <PayableAmount currencyID="${esc(invoice.currency)}">${invoice.grandTotal}</PayableAmount>
  </LegalMonetaryTotal>
</Invoice>`;
}
