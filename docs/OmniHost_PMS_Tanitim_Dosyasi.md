---
# OmniHost PMS
## Akıllı Otel Yönetiminin Yeni Çağı

**Istanbul Kultur Universitesi — Tasarım Fabrikası**
*Proje Tanıtım Dosyası · 2026*

---

&nbsp;

---

## 👤 Kurucu

**Ali Musayev**
Yazılım Geliştirici & Girişimci

> *"Otel yazılımı piyasasındaki boşluğu tespit ettim: büyük sistemler pahalı ve karmaşık, küçük çözümler ise yetersiz. OmniHost, bu ikisi arasındaki köprüyü kurdu."*

---

&nbsp;

---

## 🎯 Vizyon

> Türkiye konaklama sektöründeki her ölçekteki tesisi — bağımsız butik otellerden zincir işletmelere — dijital dönüşümde öncü hale getirmek.

Türkiye'de **yaklaşık 12.000 turizm belgeli tesis** bulunmaktadır. Bu tesislerin büyük çoğunluğu ya çok pahalı kurumsal yazılımlara bağımlıdır ya da yetersiz, güncel olmayan sistemlerle idare etmektedir.

**OmniHost PMS**, bu denklemi değiştiriyor.

---

&nbsp;

---

## 🔍 Sorun

### Mevcut Pazarın Acı Noktaları

| Sorun | Pazar Gerçekliği |
|-------|-----------------|
| **Yüksek lisans maliyeti** | Kurumsal PMS sistemleri yıllık \$5.000–\$50.000+ talep eder |
| **Kurulum karmaşıklığı** | 3-6 ay implementasyon süresi, pahalı danışmanlık gerektir |
| **Türkiye uyumsuzluğu** | Çoğu yabancı yazılım KBS, e-Fatura, Konaklama Vergisi'ni desteklemez |
| **Vendor lock-in** | OTA entegrasyonları için ayrıca Channel Manager ücreti ödenir |
| **Veri egemenliği yok** | Tüm veriler yurt dışı sunucularda, KVKK riski |

---

&nbsp;

---

## 💡 Çözüm: OmniHost PMS

**OmniHost PMS**, otel operasyonlarının tamamını tek çatı altında yöneten, **Türkiye mevzuatına tam uyumlu**, sıfır harici bağımlılıklı bir **Otel Mülk Yönetim Sistemi + Kanal Yöneticisi**'dir.

```
Rezervasyon → Check-in → Konaklama → Check-out → Fatura → Rapor
           ↕                    ↕                    ↕
        OTA Sync            Housekeeping           KBS/e-Fatura
```

### Temel Fark Yaratıcılar

- 🚀 **Kurulum → 30 saniye.** `node server.js` komutuyla çalışır — sunucu, yazılım, teknik ekip gerekmez
- 📦 **Sıfır npm bağımlılığı.** Tüm sistem saf Node.js üzerine yazılmıştır
- 🇹🇷 **Türkiye'ye özel.** KBS, e-Fatura/e-Arşiv, Konaklama Vergisi yerleşik
- 🔗 **8 OTA entegrasyonu.** Booking.com, Expedia, Airbnb ve daha fazlası

---

&nbsp;

---

## 🏨 Sistem Modülleri

### Ön Büro (Front Office)

| Modül | Detay |
|-------|-------|
| **Canlı Dashboard** | Anlık doluluk, ADR, RevPAR, günlük gelir, varış/çıkış özeti |
| **Resepsiyon Panosu** | Görsel oda haritası (A/B blok + kat görünümü), check-in/out, walk-in |
| **Rezervasyonlar** | Fiyat-bazlı müsaitlik kontrolü, tarihsel fiyatlandırma, durum yönetimi |
| **Aylık Takvim** | Grid görünümü + oda tipi Gantt şeridi |
| **Kat Hizmetleri** | Oda durum panosu — Temiz / Kirli / Arıza + Rezervasyon çakışma görünümü |

### Gelir ve Dağıtım

| Modül | Detay |
|-------|-------|
| **Fiyat ve Kontenjan** | Oda tipi × gün bazlı fiyat editörü; min/maks konaklama, stop-sell, CTA/CTD |
| **Channel Manager v2** | Gerçek ARI push/pull, overbooking-korumalı müsaitlik, senkron günlüğü |
| **Raporlar** | Gelir ve doluluk, kanal üretimi (komisyon/net), KDV özeti |

**Entegre OTA Adaptörleri:**

> `Booking.com` · `Expedia` · `Airbnb` · `Agoda` · `Hotels.com` · `Tatilbudur` · `Otelz` · `Trip.com`

### Finans ve Yasal Uyum (Türkiye)

| Modül | Detay |
|-------|-------|
| **Folyo ve Fatura** | Kayıt açma, ekstralar, çok yöntemli ödeme, kısmi tahsilat, ters kayıt |
| **KDV Motoru** | %10 konaklama / %20 genel KDV + %2 Konaklama Vergisi (otomatik hesaplama) |
| **e-Fatura** | e-Fatura/e-Arşiv adaptörü hazır (UBL-TR formatı) |
| **KBS** | EGM/Jandarma kimlik bildirimi — XML üretimi, TC/pasaport desteği |
| **Gece Denetimi** | Tarih ilerleme, no-show işleme, TCMB canlı döviz kurları, günlük kapanış raporu |

### Güvenlik ve Yönetim

- **scrypt** şifre hashleme + oturum token kimlik doğrulama
- **RBAC** — 4 rol: `admin`, `resepsiyon`, `muhasebe`, `kat hizmetleri`
- **Denetim günlüğü** — her kritik işlem kayıt altına alınır (kim, ne, ne zaman)
- **Finansal bütünlük** — kayıtlar silinmez, iptaller ters kayıtla yapılır

---

&nbsp;

---

## 🏗️ Teknik Mimari

### Tasarım Felsefesi

OmniHost PMS, **"minimal ama eksiksiz"** prensibini benimser:

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (SPA)                        │
│   Vanilla JS · 13 Görünüm Modülü · Dark/Light Tema     │
└──────────────────────┬──────────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────────┐
│                   NODE.JS SERVER                        │
│   server.js → router.js → api.js + apiExtra.js          │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ billing  │ │ pricing  │ │  auth    │ │  channel  │  │
│  │ (folio)  │ │ (ARI)    │ │ (scrypt) │ │ (manager) │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         OTA Adaptörleri (8 kanal)                │   │
│  │  booking · expedia · airbnb · agoda · hotelscom  │   │
│  │  tatilbudur · otelz · tripcom · base             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │         Türkiye Entegrasyonları                  │   │
│  │     e-Fatura (UBL-TR) · KBS · TCMB FX           │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│               JSON File Database                        │
│          (PostgreSQL/SQLite'a yükseltme hazır)          │
└─────────────────────────────────────────────────────────┘
```

### Teknoloji Seçimleri ve Gerekçeleri

| Seçim | Neden? |
|-------|--------|
| **Node.js 18+** | Eşzamansız I/O, evrensel dağıtım, hafif ayak izi |
| **Sıfır bağımlılık** | Güvenlik açığı riski sıfır, paket çakışması yok, offline çalışır |
| **Vanilla JS SPA** | Framework bağımlılığı yok; 5 yıl sonra da çalışır |
| **JSON DB** | Anlık kurulum; production'da DB migrasyonu tek adım |
| **scrypt hash** | bcrypt'ten daha güçlü, timing-attack dirençli |

---

&nbsp;

---

## 🇹🇷 Türkiye Pazar Uyumu

OmniHost PMS, Türkiye konaklama sektörünün **tüm yasal gereksinimlerini** sıfırdan tasarlanmış olarak karşılar:

| Gereksinim | Durum | Açıklama |
|-----------|-------|---------|
| **KDV %10** (konaklama) | ✅ Yerleşik | Folyo/fatura motoru içinde |
| **KDV %20** (genel) | ✅ Yerleşik | Ekstra harcamalar için |
| **Konaklama Vergisi %2** | ✅ Yerleşik | Otomatik hesaplama, ayrı kalem |
| **e-Fatura / e-Arşiv** (GİB) | ⚙️ Adaptör Hazır | Entegratör hesabı ile aktive edilir |
| **KBS** (EGM/Jandarma) | ⚙️ Adaptör Hazır | Tesis kimliği ile aktive edilir |
| **TCMB Canlı Döviz** | ✅ Aktif | `today.xml` + yedek kaynak |

---

&nbsp;

---

## 📊 Pazar Analizi

### Hedef Pazar Segmentleri

```
Katman 1: Bağımsız butik oteller (10–80 oda)   ← Ana hedef
Katman 2: Apart otel ve pansiyon zincirleri
Katman 3: Resort ve tatil köyleri
Katman 4: Hostel ve gençlik yurdu ağları
```

### Rekabetçi Konumlama

| Özellik | OmniHost | Kurumsal PMS | Basit Çözümler |
|---------|----------|-------------|---------------|
| Kurulum süresi | **30 saniye** | 3-6 ay | 1-2 hafta |
| Türkiye uyumu | **Tam** | Kısmi | Yok |
| Channel Manager | **Dahil** | Ayrı ücret | Yok/kısıtlı |
| e-Fatura | **Adaptör hazır** | Ek modül | Yok |
| KBS entegrasyonu | **Yerleşik** | Genellikle yok | Yok |
| Veri egemenliği | **Tam** (local/VPS) | Yurt dışı | Değişken |

---

&nbsp;

---

## 🗺️ Yol Haritası

### Mevcut Durum (v1.0 — Tamamlandı)
- [x] 62 odalı demo hotel verisi ile tam işlevsel sistem
- [x] 8 OTA adaptörü
- [x] Türkiye yasal uyumu (KDV, KBS, e-Fatura)
- [x] 4 kullanıcı rolü, denetim günlüğü
- [x] Gece denetimi ve raporlama

### Kısa Vade (v1.5 — Q1 2027)
- [ ] PostgreSQL veritabanı geçişi (eşzamanlı kullanım ve ölçek)
- [ ] HTTPS terminasyonu + oturum güvenliği
- [ ] Gerçek OTA API kimlik bilgileri ile canlı bağlantı
- [ ] Sanal POS entegrasyonu (iyzico/banka)

### Orta Vade (v2.0 — Q3 2027)
- [ ] Misafir self-servis portali (online check-in/out)
- [ ] Mobil uygulama (React Native — kat personeli için)
- [ ] BI dashboard (veri analitiği, trend tahminleme)
- [ ] SaaS model — çoklu tesis yönetimi

### Uzun Vade (v3.0 — 2028+)
- [ ] AI tabanlı fiyat optimizasyonu (dinamik fiyatlandırma)
- [ ] Yeşil turizm sertifika entegrasyonu
- [ ] Bölgesel genişleme (Orta Asya Türk dili pazarları)

---

&nbsp;

---

## 🤝 Tasarım Fabrikası ile İşbirliği

### OmniHost'un Tasarım Fabrikası İçin Değeri

OmniHost PMS, **erken aşama bir teknoloji girişimi** olarak Tasarım Fabrikası'nın sağlayacağı her türlü desteğe hazır bir zemine sahiptir:

| İhtiyaç | Tasarım Fabrikası Katkısı |
|---------|--------------------------|
| **Kullanıcı araştırması** | Otel yöneticileri ile derinlemesine UX araştırması |
| **UI/UX tasarım** | Dashboard ve iş akışı deneyiminin yeniden tasarımı |
| **Prototip testi** | Gerçek otel ortamında kullanılabilirlik testleri |
| **Mentörlük** | İş modeli, fiyatlandırma, go-to-market stratejisi |
| **Ağ** | Turizm sektörü bağlantıları, pilot müşteri geliştirme |

### Neyi Beraberinde Getiriyoruz?

- ✅ **Çalışan ürün** — Demo'da görülebilir, test edilebilir
- ✅ **Teknik olgunluk** — Üretim seviyesi kod kalitesi
- ✅ **Pazar araştırması** — Türkiye pazarı derin analizi
- ✅ **Kurucunun taahhüdü** — Tam zamanlı odak

---

&nbsp;

---

## 🚀 Canlı Demo

Projeyi 30 saniyede başlatın:

```bash
git clone https://github.com/alimusayev/omnihost-pms.git
cd omnihost-pms
node server.js
# → http://localhost:4173 adresini açın
```

### Demo Hesapları

| Kullanıcı | Şifre | Rol |
|-----------|-------|-----|
| `admin` | `admin123` | Tüm modüller |
| `resepsiyon` | `resepsiyon123` | Ön büro, rezervasyon, folio |
| `muhasebe` | `muhasebe123` | Fatura, rapor, gece denetimi |
| `kat` | `kat123` | Oda durumu |

---

&nbsp;

---

## 🗂️ Business Model Canvas (Özet)

> *Hedef pazar: İstanbul'daki 10–50 odalı bağımsız butik oteller*

### Müşteri Segmenti
- **Ana:** Sultanahmet, Beyoğlu, Galata, Kadıköy, Balat semtlerindeki 10–50 odalı butik oteller
- Otel sahibinin aynı zamanda yönetici olduğu, teknik bilgisi sınırlı profil
- İstanbul'da ~1.800 adreslenebilir tesis

### Değer Önerisi — "30 Saniye Kur, Saat Kazan"

| İstanbul Butik Otelcisinin Acısı | OmniHost Çözümü |
|----------------------------------|----------------|
| OTA'lara ayrı ayrı giriş, müsaitlik farkı | 8 OTA tek panelden, gerçek zamanlı sync |
| KBS için ayrıca portal, geciken bildirim | KBS XML sisteme gömülü, tek tık |
| e-Fatura için muhasebeci beklemek | e-Fatura adaptörü dahil, anında |
| Dövizli yazılım faturası + kur riski | Aylık TL abonelik, döviz riski yok |
| Kurumsal PMS kurulumu için ay beklemek | `node server.js` → 30 saniye |

### Gelir Modeli

| Paket | Aylık Fiyat | Kapsam |
|-------|-------------|--------|
| **Starter** | ₺ 1.490 | ≤ 20 oda · 2 OTA |
| **Growth** | ₺ 2.490 | ≤ 50 oda · 8 OTA · e-Fatura |
| **Pro** | ₺ 3.990 | Sınırsız · Multi-mülk |

> 💡 Rakipler: \$150–\$400/ay + ayrı Channel Manager ücreti = **₺5.000–₺14.000/ay**

### 12 Aylık Büyüme Hedefi

```
Ay 1–3   →   5 pilot müşteri   →  MRR: ₺ 10.000
Ay 4–6   →  20 müşteri         →  MRR: ₺ 40.000
Ay 7–9   →  50 müşteri         →  MRR: ₺105.000
Ay 10–12 →  80 müşteri         →  MRR: ₺175.000
                                Break-even: ~Ay 5-6 (18 müşteri)
```

### Go-to-Market: "Sultanahmet'ten Başla"
1. **Faz 1** — Sultanahmet/Galata'da 5 butik otel ile pilot, yüz yüze onboarding
2. **Faz 2** — Turizm SMMM'leri üzerinden referans kanalı, EMITT fuarı
3. **Faz 3** — TÜROB üyeliği, toplu indirim paketi, İzmir/Ankara genişlemesi

📄 *Detaylı Business Model Canvas ayrı belgede mevcuttur.*

---

&nbsp;

---

## 📬 İletişim

**Ali Musayev**
Kurucu, OmniHost PMS

🔗 [GitHub: alimusayev/omnihost-pms](https://github.com/alimusayev/omnihost-pms)
📄 Lisans: MIT © 2026 Ali Musayev

---

&nbsp;

---

> *"Türkiye'nin konaklama sektörü, Türkiye'de üretilen yazılımı hak ediyor."*
>
> — Ali Musayev, Kurucu

---

*Bu belge İstanbul Kültür Üniversitesi Tasarım Fabrikası başvurusu kapsamında hazırlanmıştır.*
*OmniHost PMS · Tüm hakları saklıdır · 2026*
