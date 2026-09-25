<div align="center">

# OmniHost PMS

**Production-ready Hotel Property Management System + Channel Manager**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-brightgreen)](package.json)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Turkish Market](https://img.shields.io/badge/market-Turkey-red)](README.md)

*A full-featured hotel PMS built with zero npm dependencies — just Node.js.*

</div>

---

## ✨ Features

OmniHost PMS covers the full lifecycle of hotel operations, from front-desk to night audit.

### 🏨 Front Office
| Module | Description |
|--------|-------------|
| **Dashboard** | Live occupancy, ADR, RevPAR, daily revenue, arrivals & departures |
| **Reception Rack** | Visual room rack (A/B block + floor), check-in, check-out, walk-in |
| **Reservations** | Availability-aware booking with date-based pricing, status actions |
| **Monthly Calendar** | Grid view + room-type Gantt strip |
| **Housekeeping** | Room condition board — Clean / Dirty / Out-of-Order + Reserved overlay |

### 💰 Revenue & Distribution
| Module | Description |
|--------|-------------|
| **Rate & Inventory** | Per-room-type × per-date rate editor; min/max stay, stop-sell, CTA/CTD |
| **Channel Manager v2** | Real ARI push/pull, overbooking-safe availability, sync log |
| **Reports** | Revenue & occupancy, channel production (commission/net), VAT summary |

**Ready OTA Adapters:** Booking.com · Expedia · Airbnb · Agoda · Hotels.com · Tatilbudur · Otelz · Trip.com

### 🧾 Finance & Legal (Turkey-compliant)
| Module | Description |
|--------|-------------|
| **Folio & Invoice** | Posting, extras, multi-method payments, partial collection, reversal |
| **VAT Engine** | 10% accommodation / 20% general + 2% Accommodation Tax (Konaklama Vergisi) |
| **e-Invoice** | e-Fatura/e-Arşiv adapter ready (`lib/integrations/efatura.js`) |
| **KBS** | EGM/Jandarma identity notification — XML generation, TC/passport |
| **Night Audit** | Date advance, no-show processing, TCMB live FX rates, daily close report |

### 🔐 Security & Admin
- **scrypt** password hashing + session-token auth
- **RBAC** — roles: `admin`, `reception`, `housekeeping`, `accounting`
- **Audit log** — every critical action is recorded (who, what, when)
- Financial entries are **never deleted** — cancellations use reversal entries

---

## 🚀 Quick Start

```bash
git clone https://github.com/alimusayev/omnihost-pms.git
cd omnihost-pms
node server.js
```

Open **http://localhost:4173** in your browser.

> **No `npm install` required.** OmniHost PMS has zero external dependencies.

### Demo Accounts

| Username | Password | Role | Access |
|----------|----------|------|--------|
| `admin` | `admin123` | Administrator | All modules |
| `resepsiyon` | `resepsiyon123` | Reception | Front office, reservations, folio, pricing, KBS |
| `muhasebe` | `muhasebe123` | Accounting | Folios, invoices, reports, night audit |
| `kat` | `kat123` | Housekeeping | Dashboard, room conditions |

---

## 🏗️ Architecture

```
omnihost-pms/
├── server.js                 # HTTP server + auth injection + bootstrap
├── lib/
│   ├── api.js                # Core REST routes (~900 lines)
│   ├── apiExtra.js           # Extended routes — channel, KBS, night audit
│   ├── auth.js               # scrypt, session management, RBAC, audit
│   ├── billing.js            # Folio engine, VAT + accommodation tax, invoices
│   ├── bootstrap.js          # Startup: users, folios, room assignment
│   ├── db.js                 # JSON file DB + settings + business date
│   ├── pricing.js            # Rate & inventory engine, availability, overbooking guard
│   ├── seed.js               # Initial data (62 rooms, reservations, guests)
│   ├── router.js             # Lightweight HTTP router + static file server
│   ├── util.js               # UID, date helpers
│   ├── channel/              # Channel Manager v2
│   │   ├── manager.js        # ARI push/pull orchestrator
│   │   └── adapters/         # bookingcom · expedia · airbnb · agoda · hotelscom
│   │                         # tatilbudur · otelz · tripcom · base
│   └── integrations/
│       ├── efatura.js        # e-Invoice adapter (UBL-TR ready)
│       ├── kbs.js            # KBS identity notification adapter
│       └── tcmb.js           # TCMB live FX rate fetcher
└── public/                   # Pure JS SPA — no framework
    ├── index.html
    ├── css/app.css           # Design system (light + dark theme)
    └── js/
        ├── app.js            # Router, auth guard, theme
        ├── store.js          # Client-side state
        ├── ui.js             # Shared UI components
        ├── api.js            # Fetch wrapper
        └── views/            # 13 view modules (dashboard, stay, reservations…)
```

### Room Layout

| Block | Floors | Rooms | Types |
|-------|--------|-------|-------|
| **A** | 1–4 | 19 rooms | DLX · STD · ECO · ENG |
| **B** | 1–6 | 43 rooms | FAM · ECO · STD · SUP · SP2 · CRN |
| **Total** | | **62 rooms** | 8 room types |

---

## 🇹🇷 Turkish Market Compliance

| Requirement | Status |
|-------------|--------|
| VAT 10% (accommodation) / 20% (general) | ✅ Built into folio/invoice engine |
| Accommodation Tax (Konaklama Vergisi) 2% | ✅ Auto-calculated, shown separately |
| e-Fatura / e-Arşiv (GİB) | ⚙️ Adapter ready — integrator account needed |
| KBS (EGM/Jandarma) identity notification | ⚙️ Adapter ready — facility credentials needed |
| TCMB live FX rates | ✅ Live fetch (`today.xml`) + fallback |

---

## 🔌 Going to Production

External services require real credentials. Integration points are marked `// REAL API:` in the code:

- **OTA sync** → Booking.com Connectivity / Expedia EPS or RateGain/STAAH middleman
- **e-Invoice** → İzibiz / Uyumsoft / e-Finans + Mali Mühür
- **KBS** → EGM/Jandarma web service + facility identity
- **Virtual POS** → bank or iyzico payment gateway

### Recommended next steps
- [ ] JSON file DB → **PostgreSQL** or **SQLite** (concurrency & scale)
- [ ] HTTPS termination (reverse proxy), session refresh, rate limiting
- [ ] Enable real integrations with live credentials
- [ ] Booking engine (commission-free direct reservations) + 5651 logging

---

## 📄 License

MIT © 2026 Ali Musayev
