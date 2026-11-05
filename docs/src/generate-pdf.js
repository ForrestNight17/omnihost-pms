// PDF generation script using Puppeteer
// Usage: node docs/src/generate-pdf.js

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// Dynamic import for puppeteer (installed locally in docs/)
async function run() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
    puppeteer = puppeteer.default ?? puppeteer;
  } catch {
    console.error('❌  Puppeteer bulunamadı. Önce yükleyin:');
    console.error('    cd docs && npm install');
    process.exit(1);
  }

  const outDir = join(__dirname, '..'); // docs/
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const jobs = [
    {
      html: join(__dirname, 'tanitim.html'),
      pdf:  join(outDir,    'OmniHost_PMS_Tanitim_Dosyasi.pdf'),
      name: 'Tanıtım Dosyası',
    },
    {
      html: join(__dirname, 'bmc.html'),
      pdf:  join(outDir,    'OmniHost_PMS_Business_Model_Canvas.pdf'),
      name: 'Business Model Canvas',
    },
  ];

  console.log('🚀  PDF üretimi başlıyor...\n');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--font-render-hinting=none'],
  });

  for (const job of jobs) {
    if (!existsSync(job.html)) {
      console.warn(`⚠️   Kaynak bulunamadı, atlanıyor: ${job.html}`);
      continue;
    }
    console.log(`📄  Üretiliyor: ${job.name}`);
    const page = await browser.newPage();

    // Google Fonts yüklenmesi için kısa süre bekle
    await page.goto(`file://${job.html.replace(/\\/g, '/')}`, {
      waitUntil: 'networkidle0',
      timeout: 30_000,
    });

    // Fontların render edilmesi için ek bekleme
    await new Promise(r => setTimeout(r, 1500));

    await page.pdf({
      path: job.pdf,
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      displayHeaderFooter: false,
    });

    await page.close();
    console.log(`   ✅  Kaydedildi: ${job.pdf}\n`);
  }

  await browser.close();
  console.log('🎉  Tüm PDF\'ler docs/ klasörüne kaydedildi.');
}

run().catch(err => { console.error('❌  Hata:', err.message); process.exit(1); });
