// TCMB (Merkez Bankası) döviz kuru servisi.
// Gerçek kaynak: https://www.tcmb.gov.tr/kurlar/today.xml (günlük gösterge kurları).
// Ağ erişimi varsa gerçek kur çekilir; yoksa makul varsayılan kurlara düşer.
import https from 'https';

const FALLBACK = {
  USD: { code: 'USD', name: 'ABD Doları', forexBuying: 39.10, forexSelling: 39.25 },
  EUR: { code: 'EUR', name: 'Euro', forexBuying: 42.30, forexSelling: 42.48 },
  GBP: { code: 'GBP', name: 'İngiliz Sterlini', forexBuying: 49.60, forexSelling: 49.85 },
  RUB: { code: 'RUB', name: 'Rus Rublesi', forexBuying: 0.43, forexSelling: 0.44 },
};

/** TCMB today.xml'i çekmeye çalışır; başarısızsa fallback döndürür. */
export function fetchRates() {
  return new Promise((resolve) => {
    const done = (rates, source) => resolve({ source, date: new Date().toISOString().slice(0, 10), rates });
    try {
      const req = https.get('https://www.tcmb.gov.tr/kurlar/today.xml', { timeout: 4000 }, (res) => {
        let xml = '';
        res.on('data', (c) => (xml += c));
        res.on('end', () => {
          try {
            const rates = {};
            const blocks = xml.split('<Currency ');
            for (const b of blocks) {
              const code = (b.match(/CurrencyCode="([A-Z]{3})"/) || [])[1];
              if (!code || !FALLBACK[code]) continue;
              const fb = Number((b.match(/<ForexBuying>([\d.]+)<\/ForexBuying>/) || [])[1]);
              const fs = Number((b.match(/<ForexSelling>([\d.]+)<\/ForexSelling>/) || [])[1]);
              const name = (b.match(/<Isim>([^<]+)<\/Isim>/) || [])[1];
              if (fb) rates[code] = { code, name: name || code, forexBuying: fb, forexSelling: fs || fb };
            }
            if (Object.keys(rates).length) done(rates, 'tcmb');
            else done(FALLBACK, 'fallback');
          } catch {
            done(FALLBACK, 'fallback');
          }
        });
      });
      req.on('error', () => done(FALLBACK, 'fallback'));
      req.on('timeout', () => { req.destroy(); done(FALLBACK, 'fallback'); });
    } catch {
      done(FALLBACK, 'fallback');
    }
  });
}
