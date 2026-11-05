# 🗂️ Business Model Canvas
## OmniHost PMS — İstanbul Küçük Ölçekli Butik Otel Pazarı

> **Hedef:** İstanbul'daki 10–50 odalı bağımsız butik oteller
> **Kurucu:** Ali Musayev · **Yıl:** 2026

---

## 📐 Canvas Görünümü

```
┌────────────────────┬────────────────────┬────────────────────┬────────────────────┐
│  🤝 TEMEL          │  ⚙️ TEMEL           │  💎 DEĞER          │  👥 MÜŞTERİ        │
│     ORTAKLAR       │     FAALİYETLER    │     ÖNERİSİ        │     İLİŞKİLERİ     │
│                    │                    │                    │                    │
│  • OTA platformları│  • Yazılım geliş. │  • 30 sn kurulum   │  • Self-servis      │
│  • e-Fatura ent.   │  • Yasal güncell.  │  • Sıfır IT ekibi  │  • Ücretsiz trial  │
│  • Otel dernekleri │  • Müşteri desteği │  • Türkiye tam     │  • WhatsApp destek │
│  • Muhasebe firms. │  • OTA uyum testi  │    uyumu           │  • Video eğitim    │
│  • Node.js toplul. │  • Satış/pazarlama │  • PMS+CM tek çatı │  • Topluluk forum  │
├────────────────────┼────────────────────┤                    ├────────────────────┤
│  🏛️ TEMEL          │                    │  • KBS/e-Fatura    │  📦 MÜŞTERİ        │
│     KAYNAKLAR      │                    │    yerleşik        │     SEGMENTLERİ    │
│                    │                    │  • 8 OTA tek panel │                    │
│  • OmniHost kodu   │                    │  • Veri mülkiyeti  │  ANA HEDEF:        │
│  • Ali'nin uzmanlık│                    │  • KDV motoru oto. │  10–50 odalı       │
│  • Türkiye pazar   │                    │  • Aylık ₺ bazlı   │  İstanbul butik    │
│    bilgisi         │                    │    abonelik        │  otelleri          │
│  • OTA adaptörleri │                    │                    │                    │
│  • Yasal uyum bil. │                    │                    │  İKİNCİL:          │
├────────────────────┴────────────────────┼────────────────────┤  Apart & Pansiyon  │
│  💰 GELİR AKIŞLARI                      │  📢 KANALLAR       │  Hostel ağları     │
│                                         │                    │  Tatil köyleri     │
│  • Aylık abonelik (SaaS)                │  • LinkedIn doğr.  │                    │
│  • Kurulum / onboarding ücreti          │  • Otel fuar       │                    │
│  • Premium destek paketi                │  • Sektör dernekl. │                    │
│  • Ek modül lisansı (gelecek)           │  • Muhasebe ofis.  │                    │
│  • Referans komisyonu                   │  • Referans ağı    │                    │
├─────────────────────────────────────────┴────────────────────┴────────────────────┤
│  📊 MALİYET YAPISI                                                                 │
│                                                                                    │
│  • Yazılım geliştirme & bakım  • Yasal uyum güncellemeleri  • Pazarlama & satış   │
│  • Hosting & altyapı           • Müşteri destek              • Muhasebe & idare    │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 1. Müşteri Segmentleri

### 🎯 Ana Segment: İstanbul Butik Otel Sahipleri

**Kim?**
- 10–50 odalı bağımsız, aile işletmeli butik oteller
- Özellikle: Sultanahmet, Beyoğlu, Galata, Kadıköy, Bebek, Balat semtleri
- Otel sahibi genellikle aynı zamanda günlük yönetici
- Teknik bilgisi kısıtlı, zaman baskısı yüksek profil

**Sorunları:**
- Rezervasyonları hâlâ Excel veya kağıt defterle yönetiyor
- Birden fazla OTA'ya ayrı ayrı giriş yaparak güncelleme kaybediyor
- KBS bildirimi için ayrıca İçişleri Bakanlığı portalını kullanıyor
- e-Fatura için muhasebecisini arıyor, gecikme yaşıyor

**İstanbul Pazar Büyüklüğü (Tahmin):**
| Segment | Tesis Sayısı | Adreslenebilir Pazar |
|---------|-------------|---------------------|
| 10–30 odalı butik | ~800 | Yüksek öncelikli |
| 31–80 odalı butik | ~400 | İkincil hedef |
| Apart & pansiyon | ~600 | Ek segment |
| **TOPLAM** | **~1.800** | **TAM PAZAR** |

### 🔵 İkincil Segment
- Ege ve Akdeniz kıyılarındaki butik oteller (Bodrum, Çeşme, Kapadokya)
- Hostel zincirlerinin küçük mülkleri

---

## 💎 2. Değer Önerisi

### OmniHost'un Rakipsiz Avantajları

```
          KARMAŞIKLIK
               ▲
  Kurumsal     │    ← Pahalı, kurulum aylar sürer
  PMS          │
               │
  OmniHost ───►│◄─── DOĞRU NOKTA: Güçlü ama basit
               │
  Excel/Kağıt  │    ← Yetersiz, hata riski yüksek
               └─────────────────────────► MALİYET
```

### Değer Önerisi Kanvası

| Kazanım | Nasıl Sağlanıyor? |
|---------|-----------------|
| **30 saniyede kurulum** | `node server.js` — sunucu, hosting, IT gerektirmez |
| **Sıfır öğrenme eğrisi** | Türkçe arayüz, otelci diline uygun terminoloji |
| **8 OTA tek ekrandan** | Booking.com, Expedia, Airbnb, Agoda, Tatilbudur, Otelz... |
| **Overbooking riski sıfır** | Gerçek zamanlı kontenjan motoru (`pricing.js`) |
| **KBS otomatik XML** | Jandarma/EGM bildirimi sistem içinden |
| **e-Fatura hazır adaptör** | Tek tıkla fatura — muhasebeci aramak yok |
| **KDV otomatik hesaplama** | %10/%20 KDV + %2 Konaklama Vergisi — ayrı kalem |
| **Veri sizin** | Veriler yerel veya kendi sunucunuzda — KVKK uyumlu |
| **Aylık ₺ bazlı abonelik** | Döviz riskine karşı TL fiyatlandırma |

---

## ⚙️ 3. Temel Faaliyetler

### Geliştirme ve Sürdürme
- OmniHost çekirdek kodunun bakımı ve yeni özellik geliştirme
- OTA API uyum güncellemeleri (Booking.com, Expedia API değişiklikleri)
- GİB e-Fatura ve EGM KBS mevzuat güncellemeleri
- Güvenlik yamaları (scrypt, session token, audit log)

### Satış ve Pazarlama
- İstanbul otel semtlerinde (Sultanahmet, Beyoğlu) yerinde satış
- LinkedIn içerik pazarlaması ve ağ geliştirme
- Otelcilik fuarları ve TÜROB/TUYED etkinlikleri
- Muhasebe ve mali müşavir ortaklık programı

### Müşteri Başarısı
- Online onboarding (video + WhatsApp rehberlik)
- Aylık kullanım raporu ve müşteri sağlığı takibi
- Referans programı yönetimi

---

## 🤝 4. Temel Ortaklar

| Ortak Türü | Katkısı | Önem |
|-----------|---------|------|
| **OTA Platformları** (Booking.com, Expedia vb.) | API erişimi, bağlantı sertifikasyonu | 🔴 Kritik |
| **e-Fatura Entegratörleri** (İzibiz, Uyumsoft, e-Finans) | Gerçek canlı fatura gönderimi | 🔴 Kritik |
| **Mali Müşavirler / SMMM** | Referans kaynağı, güvenilirlik | 🟠 Yüksek |
| **Otelcilik Dernekleri** (TÜROB, TUYED, TUROB-İST) | Sektör erişimi, toplu satış | 🟠 Yüksek |
| **Sanal POS Sağlayıcıları** (iyzico, Paytr) | Kart ödeme entegrasyonu | 🟡 Orta |
| **Cloud/VPS Sağlayıcıları** (DigitalOcean, Hetzner) | Müşteri hosting seçeneği | 🟡 Orta |

---

## 🏛️ 5. Temel Kaynaklar

### Entelektüel Kaynaklar
- **OmniHost PMS kaynak kodu** — 8 OTA adaptörü, Türkiye uyum modülleri
- **Türkiye otelcilik mevzuat bilgisi** — KBS, GİB, TCMB entegrasyonları
- **Fiyatlandırma motoru** — dinamik kontenjan, overbooking koruması

### İnsan Kaynakları
- **Ali Musayev** (Kurucu) — Full-stack geliştirme + satış + müşteri başarısı
- **Planlanan:** Müşteri başarısı uzmanı (Y1), Frontend geliştirici (Y2)

### Finansal Kaynaklar
- Bootstrap aşaması (şu an)
- Tasarım Fabrikası hibe/mentörlük desteği (hedeflenen)
- İlk 10 müşteriden yinelenen gelir

---

## 📢 6. Kanallar

### Edinim Kanalları

```
FARKINDALIIK → İLGİ → DEĞERLENDİRME → SATIN ALMA → SADAKAT
     │              │         │               │           │
  LinkedIn      Demo video  30 günlük     Abonelik    Referans
  Fuarlar       Blog içer.  ücretsiz     aktivasyon   programı
  TÜROB         Referans    deneme        (online)     Topluluk
  Muhasebeci    ağızdan ağz
```

| Kanal | Maliyet | Dönüşüm Tahmini |
|-------|---------|----------------|
| **LinkedIn direkt erişim** | Düşük | %3–5 |
| **Otelcilik fuarları** (EMITT, WTM İstanbul) | Orta | %8–12 |
| **SMMM/Mali müşavir referansı** | Düşük | %15–20 |
| **Sektör dernek üyeliği** | Orta | %5–8 |
| **Ağızdan ağıza (otelci komşusu)** | Sıfır | %25–35 |

---

## 👥 7. Müşteri İlişkileri

### Edinim Aşaması
- **Ücretsiz 30 günlük deneme** — kredi kartı gerekmez
- **Kişisel onboarding araması** (kurucu ile 1:1, 60 dk)
- Canlı demo: `http://localhost:4173` — 30 saniyede kendi bilgisayarında kurar

### Sürdürme Aşaması
- **WhatsApp destek hattı** — Türkçe, mesai saatleri
- **Video eğitim kütüphanesi** — modül başına 5–10 dk klipler
- **Aylık ürün güncellemesi bülteni** — mevzuat değişiklikleri dahil
- **Müşteri başarı skoru** takibi (aylık aktif kullanım oranı)

### Büyüme Aşaması
- **Referans programı:** 1 müşteri getir → 1 ay ücretsiz
- **Erken benimseyenler topluluğu** — beta özellik erişimi
- **Yıllık otelci buluşması** (İstanbul)

---

## 💰 8. Gelir Akışları

### Fiyatlandırma Modeli (Taslak)

| Paket | Fiyat (aylık, KDV hariç) | Kapsam |
|-------|--------------------------|--------|
| **Starter** | ₺ 1.490 / ay | ≤ 20 oda, PMS + 2 OTA |
| **Growth** | ₺ 2.490 / ay | ≤ 50 oda, PMS + 8 OTA + e-Fatura |
| **Pro** | ₺ 3.990 / ay | Sınırsız oda, multi-mülk, öncelikli destek |
| **Yıllık ön ödeme** | %20 indirim | Tüm paketler |

> 💡 *Rakip kıyaslama: Piyasadaki muadil çözümler \$150–\$400/ay (≈ ₺5.000–₺14.000/ay) + ayrıca Channel Manager ücreti talep eder.*

### Ek Gelir Kalemleri

| Kalem | Tutar | Notlar |
|-------|-------|--------|
| **Kurulum & veri aktarım** | ₺ 2.500 (tek seferlik) | Mevcut rezervasyonları içe aktar |
| **Premium destek SLA** | ₺ 990 / ay ek | 4 saat yanıt garantisi |
| **Özel entegrasyon** | ₺ 5.000+ (proje bazlı) | POS, spa, restoran vb. |

### Gelir Projeksiyonu (12 Ay)

| Dönem | Müşteri Sayısı | Aylık Tekrarlayan Gelir (MRR) |
|-------|---------------|------------------------------|
| **Ay 1–3** (Pilot) | 5 müşteri | ₺ 10.000 |
| **Ay 4–6** (Büyüme) | 20 müşteri | ₺ 40.000 |
| **Ay 7–9** (Ölçek) | 50 müşteri | ₺ 105.000 |
| **Ay 10–12** (Stabilizasyon) | 80 müşteri | ₺ 175.000 |

---

## 📊 9. Maliyet Yapısı

### Sabit Maliyetler (Aylık)

| Kalem | Tahmini Tutar |
|-------|--------------|
| Kurucu maaşı (bootstrap aşaması) | ₺ 30.000 |
| Hosting & altyapı (VPS, CI/CD) | ₺ 2.500 |
| Muhasebe & hukuki | ₺ 3.000 |
| Araç & yazılım lisansları | ₺ 1.500 |
| **Toplam Sabit** | **₺ 37.000** |

### Değişken Maliyetler

| Kalem | Tutar |
|-------|-------|
| Satış & pazarlama (fuar, LinkedIn reklam) | Gelirin %15'i |
| Müşteri destek (dışarıdan) | Müşteri başına ₺ 200 |
| OTA API geliştirme maliyeti | Proje bazlı |

### Kâra Geçiş Analizi (Break-even)

```
Aylık sabit maliyet:    ₺ 37.000
Ortalama müşteri değeri: ₺ 2.100 / ay (Growth paketi)

Break-even = 37.000 / 2.100 ≈ 18 müşteri

→ Tahminen Ay 5–6'da break-even noktasına ulaşılır.
```

---

## 🎯 İstanbul'a Özel Go-to-Market Stratejisi

### Faz 1 — Pilot (Ay 1–3): "Sultanahmet'ten Başla"
- Sultanahmet, Galata, Beyoğlu bölgesindeki **5 butik otel** ile beta ortaklığı
- Kurucunun **yüz yüze ziyareti** ve kişisel onboarding
- Geri bildirimlerle hızlı iterasyon
- **Hedef:** 5 referans müşteri + 3 video testimonial

### Faz 2 — Büyüme (Ay 4–6): "Muhasebeci Kanalı"
- İstanbul'daki **turizm sektörü SMMM'leri** ile ortaklık
- Her yönlendirilen müşteri için mali müşavire **referans komisyonu**
- EMITT fuarında stand/sunum
- **Hedef:** 20 aktif müşteri

### Faz 3 — Ölçek (Ay 7–12): "Dernek Kanalı"
- TÜROB İstanbul Bölge üyeliği
- Üye otellere **toplu indirim paketi**
- Tatilbudur ve Otelz ortaklık programına başvuru
- **Hedef:** 80 aktif müşteri, İzmir/Ankara genişlemesi

---

## 📈 Temel Metrikler (KPI)

| Metrik | Hedef (12 Ay) |
|--------|--------------|
| Aktif müşteri sayısı | 80 |
| Aylık Tekrarlayan Gelir (MRR) | ₺ 175.000 |
| Müşteri elde tutma oranı (Churn) | < %3 / ay |
| Net Tavsiye Skoru (NPS) | > 50 |
| Ortalama kurulum süresi | < 2 saat |
| Müşteri başına yaşam boyu değer (LTV) | ₺ 70.000+ |
| LTV / CAC oranı | > 5x |

---

## ⚠️ Riskler ve Azaltma Stratejileri

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| OTA API politika değişikliği | Orta | Yüksek | Çoklu adaptör mimarisi, yedek kanal |
| Büyük rakibin piyasaya girişi | Düşük | Orta | Türkiye uyumu ve yerel destek avantajı |
| JSON DB ölçeklenme sorunu | Düşük | Orta | PostgreSQL migrasyonu planı hazır |
| GİB/EGM mevzuat değişikliği | Yüksek | Orta | Yasal takip servisi, hızlı güncelleme SLA |
| Müşteri teknik direnç | Orta | Düşük | Video eğitim, WhatsApp destek, onsite visit |

---

*OmniHost PMS Business Model Canvas · Hazırlayan: Ali Musayev · Ekim 2026*
*İstanbul Kültür Üniversitesi Tasarım Fabrikası Başvurusu kapsamında hazırlanmıştır.*
