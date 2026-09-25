// Başlangıç (seed) verisi. Tüm tarihler ÇALIŞMA ANINDAKİ bugüne göre üretilir,
// böylece Resepsiyon/Takvim her zaman canlı giriş/çıkış gösterir.
import { uid, reservationCode, today, addDays, nights, toISODate } from './util.js';

const BOARDS = ['RO', 'BB', 'HB', 'FB'];

const FIRST_NAMES = [
  'Ahmet', 'Ayşe', 'Mehmet', 'Elif', 'Mustafa', 'Zeynep', 'Can', 'Deniz',
  'James', 'Emma', 'Liam', 'Olivia', 'Hans', 'Sophie', 'Marco', 'Giulia',
  'Yusuf', 'Fatma', 'Ali', 'Selin', 'Omar', 'Layla', 'Ivan', 'Anna',
];
const LAST_NAMES = [
  'Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Aydın', 'Öztürk', 'Arslan',
  'Smith', 'Johnson', 'Müller', 'Rossi', 'Dubois', 'García', 'Petrov', 'Novak',
];
const NATIONS = ['TR', 'GB', 'DE', 'IT', 'FR', 'US', 'RU', 'AE', 'NL', 'ES'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

function buildRoomTypes() {
  return [
    { id: 'rt_eco', code: 'ECO', name: 'Ekonomi Oda', baseRate: 2200, capacity: 2, description: 'Ekonomik ve fonksiyonel, 18 m².' },
    { id: 'rt_std', code: 'STD', name: 'Standart Oda', baseRate: 2800, capacity: 2, description: 'Konforlu standart oda, 24 m².' },
    { id: 'rt_sup', code: 'SUP', name: 'Superior Oda', baseRate: 3600, capacity: 2, description: 'Geniş superior oda, 30 m².' },
    { id: 'rt_sp2', code: 'SP2', name: 'Superior 2+1', baseRate: 4200, capacity: 3, description: 'Aile için superior 2+1, 40 m².' },
    { id: 'rt_dlx', code: 'DLX', name: 'Deluxe Oda', baseRate: 4800, capacity: 2, description: 'Deluxe konfor, 38 m², king yatak.' },
    { id: 'rt_fam', code: 'FAM', name: 'Family Room', baseRate: 5200, capacity: 4, description: 'Geniş aile odası, 45 m².' },
    { id: 'rt_crn', code: 'CRN', name: 'Corner Suite', baseRate: 7500, capacity: 3, description: 'Köşe suit, 60 m², panoramik manzara.' },
  ];
}

function buildRooms() {
  const T = { ECO: 'rt_eco', STD: 'rt_std', SUP: 'rt_sup', SP2: 'rt_sp2', DLX: 'rt_dlx', FAM: 'rt_fam', CRN: 'rt_crn' };
  // Otel oda çizelgesi — [blok, kat, oda no, tip]
  const spec = [
    // A BLOK
    ['A', 0, '601', 'DLX'], ['A', 0, '602', 'ECO'], ['A', 0, '603', 'ECO'], ['A', 0, '604', 'ECO'],
    ['A', 1, '1001', 'DLX'], ['A', 1, '1002', 'DLX'], ['A', 1, '1003', 'STD'], ['A', 1, '1004', 'STD'], ['A', 1, '1005', 'DLX'],
    ['A', 2, '2001', 'DLX'], ['A', 2, '2002', 'DLX'], ['A', 2, '2003', 'STD'], ['A', 2, '2004', 'STD'], ['A', 2, '2005', 'DLX'],
    ['A', 3, '3001', 'DLX'], ['A', 3, '3002', 'DLX'], ['A', 3, '3003', 'STD'], ['A', 3, '3004', 'STD'], ['A', 3, '3005', 'DLX'],
    // B BLOK
    ['B', 0, '501', 'FAM'], ['B', 0, '502', 'ECO'], ['B', 0, '503', 'ECO'], ['B', 0, '504', 'ECO'], ['B', 0, '505', 'STD'], ['B', 0, '506', 'SUP'], ['B', 0, '507', 'STD'], ['B', 0, '508', 'ECO'],
    ['B', 1, '101', 'FAM'], ['B', 1, '102', 'ECO'], ['B', 1, '103', 'ECO'], ['B', 1, '104', 'ECO'], ['B', 1, '105', 'STD'], ['B', 1, '106', 'STD'], ['B', 1, '107', 'SUP'], ['B', 1, '108', 'ECO'], ['B', 1, '109', 'SP2'], ['B', 1, '110', 'CRN'],
    ['B', 2, '201', 'FAM'], ['B', 2, '202', 'ECO'], ['B', 2, '203', 'ECO'], ['B', 2, '204', 'ECO'], ['B', 2, '205', 'STD'], ['B', 2, '206', 'STD'], ['B', 2, '207', 'SP2'], ['B', 2, '208', 'ECO'], ['B', 2, '209', 'SP2'], ['B', 2, '210', 'CRN'],
    ['B', 3, '301', 'FAM'], ['B', 3, '302', 'ECO'], ['B', 3, '303', 'ECO'], ['B', 3, '304', 'ECO'], ['B', 3, '305', 'STD'], ['B', 3, '306', 'STD'], ['B', 3, '307', 'SUP'], ['B', 3, '308', 'ECO'], ['B', 3, '309', 'SP2'], ['B', 3, '310', 'CRN'],
    ['B', 4, '401', 'ECO'], ['B', 4, '402', 'ECO'], ['B', 4, '403', 'ECO'], ['B', 4, '404', 'SUP'], ['B', 4, '405', 'STD'],
  ];
  const featureByType = {
    ECO: ['Sigara İçilmez', 'Klima'],
    STD: ['Klima', 'Mini Bar'],
    SUP: ['Balkon', 'Mini Bar', 'Klima'],
    SP2: ['Balkon', 'Bağlantılı Oda', 'Klima'],
    DLX: ['Şehir Manzara', 'Mini Bar', 'Klima'],
    FAM: ['Bağlantılı Oda', 'Klima', 'Mini Bar'],
    CRN: ['Panoramik Manzara', 'Jakuzi', 'Balkon'],
  };
  const rooms = spec.map(([block, floor, number, code]) => ({
    id: `room_${number}`,
    number,
    typeId: T[code],
    block,
    floor,
    status: 'available', // available | occupied  (occupied = Rezerve)
    housekeeping: 'clean', // clean | dirty
    outOfOrder: false, // Arızalı (kondisyondan bağımsız)
    features: featureByType[code] || ['Klima'],
  }));
  const oo = rooms.find((r) => r.number === '404'); // bir oda arızalı
  if (oo) oo.outOfOrder = true;
  return rooms;
}

function buildStaff() {
  return [
    { id: 'stf_1', name: 'Selim Koç', role: 'manager', active: true },
    { id: 'stf_2', name: 'Derya Aksoy', role: 'reception', active: true },
    { id: 'stf_3', name: 'Burak Şen', role: 'reception', active: true },
    { id: 'stf_4', name: 'Hülya Demir', role: 'housekeeping', active: true },
    { id: 'stf_5', name: 'Meryem Yıldız', role: 'housekeeping', active: true },
    { id: 'stf_6', name: 'Gökhan Er', role: 'housekeeping', active: true },
    { id: 'stf_7', name: 'Ayla Toprak', role: 'housekeeping', active: false },
  ];
}

const FEMALE_NAMES = ['Ayşe', 'Elif', 'Zeynep', 'Deniz', 'Emma', 'Olivia', 'Sophie', 'Giulia', 'Fatma', 'Selin', 'Layla', 'Anna'];
const BIRTH_PLACES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep', 'Trabzon', 'London', 'Berlin', 'Moscow', 'Paris', 'Roma'];

function randomTC() {
  let s = String(randInt(1, 9));
  for (let i = 0; i < 10; i++) s += randInt(0, 9);
  return s;
}
function randomBirthDate() {
  const y = randInt(1955, 2004);
  const m = String(randInt(1, 12)).padStart(2, '0');
  const d = String(randInt(1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildGuests(n) {
  const guests = [];
  for (let i = 0; i < n; i++) {
    const fn = pick(FIRST_NAMES);
    const ln = pick(LAST_NAMES);
    const nationality = pick(NATIONS);
    guests.push({
      id: uid('gst'),
      firstName: fn,
      lastName: ln,
      name: `${fn} ${ln}`,
      gender: FEMALE_NAMES.includes(fn) ? 'K' : 'E', // E=Erkek, K=Kadın
      idType: nationality === 'TR' ? 'tc' : 'passport',
      idNumber: nationality === 'TR' ? randomTC() : 'P' + randInt(1000000, 9999999),
      birthDate: randomBirthDate(),
      birthPlace: pick(BIRTH_PLACES),
      guestType: 'adult', // adult | child
      email: `${fn}.${ln}`.toLowerCase().replace(/[^a-z.]/g, '') + `${randInt(1, 99)}@ornek.com`,
      phone: `+90 5${randInt(30, 59)} ${randInt(100, 999)} ${randInt(10, 99)} ${randInt(10, 99)}`,
      nationality,
      vip: Math.random() < 0.18,
      notes: '',
    });
  }
  return guests;
}

function statusFromDates(checkIn, checkOut, t) {
  if (checkOut <= t) return 'checked_out';
  if (checkIn <= t && t < checkOut) return 'checked_in';
  return 'confirmed';
}

export function buildSeed() {
  const t = today();
  const roomTypes = buildRoomTypes();
  const rooms = buildRooms();
  const staff = buildStaff();
  const guests = buildGuests(26);

  const channels = [
    { id: 'ch_booking', name: 'Booking.com', slug: 'bookingcom', color: '#003580', apiKey: '', apiEndpoint: 'https://distribution-xml.booking.com/2.0', connected: false, status: 'disconnected', commission: 15, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_expedia', name: 'Expedia', slug: 'expedia', color: '#00355f', apiKey: '', apiEndpoint: 'https://services.expediapartnercentral.com', connected: false, status: 'disconnected', commission: 18, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_airbnb', name: 'Airbnb', slug: 'airbnb', color: '#ff5a5f', apiKey: '', apiEndpoint: 'https://api.airbnb.com/v2', connected: false, status: 'disconnected', commission: 14, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_agoda', name: 'Agoda', slug: 'agoda', color: '#5c2d91', apiKey: '', apiEndpoint: 'https://affiliateapi7643.agoda.com', connected: false, status: 'disconnected', commission: 17, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_hotels', name: 'Hotels.com', slug: 'hotelscom', color: '#d32f2f', apiKey: '', apiEndpoint: 'https://api.ean.com/v3', connected: false, status: 'disconnected', commission: 16, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_tatilbudur', name: 'Tatilbudur', slug: 'tatilbudur', color: '#f5333f', apiKey: '', apiEndpoint: 'https://connect.tatilbudur.com/api/v1', connected: false, status: 'disconnected', commission: 16, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_otelz', name: 'Otelz', slug: 'otelz', color: '#00b4a0', apiKey: '', apiEndpoint: 'https://api.otelz.com/connect/v2', connected: false, status: 'disconnected', commission: 15, autoSync: false, lastSyncAt: null, roomMappings: [] },
    { id: 'ch_tripcom', name: 'Trip.com', slug: 'tripcom', color: '#2577e3', apiKey: '', apiEndpoint: 'https://openapi.trip.com/v1', connected: false, status: 'disconnected', commission: 15, autoSync: false, lastSyncAt: null, roomMappings: [] },
  ];

  const reservations = [];
  const usedRoomByDay = {}; // roomId -> set of nights already booked (basit çakışma önleme)

  function assignRoom(typeId, checkIn, checkOut) {
    const nightsList = [];
    for (let d = checkIn; d < checkOut; d = addDays(d, 1)) nightsList.push(d);
    const candidates = rooms.filter((r) => r.typeId === typeId && !r.outOfOrder);
    for (const room of candidates) {
      const set = usedRoomByDay[room.id] || new Set();
      const clash = nightsList.some((n) => set.has(n));
      if (!clash) {
        nightsList.forEach((n) => set.add(n));
        usedRoomByDay[room.id] = set;
        return room.id;
      }
    }
    return null;
  }

  function addReservation(opts) {
    const { guest, typeId, checkIn, checkOut, source = 'direct', channel = null, forceStatus } = opts;
    const rt = roomTypes.find((x) => x.id === typeId);
    const nn = nights(checkIn, checkOut);
    const rate = Math.round(rt.baseRate * (0.9 + Math.random() * 0.35));
    const status = forceStatus || statusFromDates(checkIn, checkOut, t);
    let roomId = null;
    if (status === 'checked_in' || status === 'checked_out') {
      roomId = assignRoom(typeId, checkIn, checkOut);
    }
    const total = rate * nn;
    const paid = status === 'checked_out' ? total : Math.round(total * (Math.random() < 0.5 ? 0 : 0.3));
    const res = {
      id: uid('res'),
      code: reservationCode(),
      guestId: guest.id,
      guestIds: [guest.id],
      roomTypeId: typeId,
      roomId,
      checkIn,
      checkOut,
      nights: nn,
      adults: randInt(1, Math.min(2, rt.capacity)),
      children: Math.random() < 0.25 ? randInt(1, 2) : 0,
      board: pick(BOARDS),
      status,
      source,
      channelName: channel ? channel.name : 'Doğrudan',
      channelId: channel ? channel.id : null,
      ratePerNight: rate,
      totalAmount: total,
      paidAmount: paid,
      notes: '',
      createdAt: new Date(Date.now() - randInt(1, 40) * 86400000).toISOString(),
    };
    reservations.push(res);
    if (roomId && status === 'checked_in') {
      const room = rooms.find((r) => r.id === roomId);
      if (room) room.status = 'occupied';
    }
    return res;
  }

  const connectedChannels = channels.filter((c) => c.connected);
  let gi = 0;
  const nextGuest = () => guests[(gi++) % guests.length];

  // 1) Otelde konaklayanlar (in-house) — bugünü kapsayan
  for (let i = 0; i < 9; i++) {
    const inOff = -randInt(1, 5);
    const outOff = randInt(1, 6);
    const ch = Math.random() < 0.5 ? pick(connectedChannels) : null;
    addReservation({
      guest: nextGuest(),
      typeId: pick(roomTypes).id,
      checkIn: addDays(t, inOff),
      checkOut: addDays(t, outOff),
      source: ch ? ch.id : 'direct',
      channel: ch,
    });
  }

  // 2) Bugün çıkış yapacaklar (checked_in, checkout = bugün)
  for (let i = 0; i < 4; i++) {
    const ch = Math.random() < 0.5 ? pick(connectedChannels) : null;
    addReservation({
      guest: nextGuest(),
      typeId: pick(roomTypes).id,
      checkIn: addDays(t, -randInt(1, 4)),
      checkOut: t,
      forceStatus: 'checked_in',
      source: ch ? ch.id : 'direct',
      channel: ch,
    });
  }

  // 3) Bugün giriş yapacaklar (confirmed, checkin = bugün, henüz check-in olmamış)
  for (let i = 0; i < 5; i++) {
    const useOta = Math.random() < 0.6;
    const ch = useOta ? pick(connectedChannels) : null;
    addReservation({
      guest: nextGuest(),
      typeId: pick(roomTypes).id,
      checkIn: t,
      checkOut: addDays(t, randInt(1, 5)),
      forceStatus: 'confirmed',
      source: ch ? ch.id : 'direct',
      channel: ch,
    });
  }

  // 4) Gelecek rezervasyonlar
  for (let i = 0; i < 22; i++) {
    const inOff = randInt(1, 40);
    const useOta = Math.random() < 0.55;
    const ch = useOta ? pick(connectedChannels) : null;
    addReservation({
      guest: nextGuest(),
      typeId: pick(roomTypes).id,
      checkIn: addDays(t, inOff),
      checkOut: addDays(t, inOff + randInt(1, 7)),
      source: ch ? ch.id : 'direct',
      channel: ch,
    });
  }

  // 5) Geçmiş (checked_out)
  for (let i = 0; i < 10; i++) {
    const inOff = -randInt(6, 30);
    const ch = Math.random() < 0.5 ? pick(connectedChannels) : null;
    addReservation({
      guest: nextGuest(),
      typeId: pick(roomTypes).id,
      checkIn: addDays(t, inOff),
      checkOut: addDays(t, inOff + randInt(1, 5)),
      source: ch ? ch.id : 'direct',
      channel: ch,
    });
  }

  // 6) Birkaç iptal / gelmedi
  for (let i = 0; i < 3; i++) {
    const inOff = randInt(2, 20);
    addReservation({
      guest: nextGuest(),
      typeId: pick(roomTypes).id,
      checkIn: addDays(t, inOff),
      checkOut: addDays(t, inOff + randInt(1, 4)),
      forceStatus: Math.random() < 0.5 ? 'cancelled' : 'no_show',
    });
  }

  // Housekeeping: bugün çıkış yapan odalar kirli + görev; birkaç stayover
  const housekeepingTasks = []; // görev-akışı kaldırıldı; oda kondisyonu (temiz/kirli/arızalı) kullanılır

  // KURAL: Dolu (occupied) odalar her zaman temiz kalır. Yalnızca BOŞ odalar kirli olabilir.
  // Çeşitlilik için birkaç boş odayı kirli yap.
  rooms.filter((r) => r.status === 'available' && !r.outOfOrder).slice(0, 8).forEach((r) => {
    r.housekeeping = 'dirty';
  });

  const syncLogs = [
    { id: uid('log'), channelId: 'ch_booking', channelName: 'Booking.com', direction: 'pull', kind: 'reservations', status: 'success', message: '2 yeni rezervasyon alındı', count: 2, timestamp: new Date(Date.now() - 3600_000).toISOString() },
    { id: uid('log'), channelId: 'ch_agoda', channelName: 'Agoda', direction: 'push', kind: 'availability', status: 'success', message: 'Müsaitlik güncellendi (40 oda)', count: 40, timestamp: new Date(Date.now() - 1800_000).toISOString() },
    { id: uid('log'), channelId: 'ch_expedia', channelName: 'Expedia', direction: 'push', kind: 'rates', status: 'success', message: 'Fiyatlar gönderildi', count: 5, timestamp: new Date(Date.now() - 7200_000).toISOString() },
  ];

  return {
    roomTypes,
    rooms,
    guests,
    reservations,
    housekeepingTasks,
    staff,
    channels,
    syncLogs,
  };
}
