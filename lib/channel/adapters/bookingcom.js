// Booking.com adapter (mock). Gerçek: Booking.com Connectivity API (XML/JSON).
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'bookingcom',
  name: 'Booking.com',
  keyPrefix: 'bk_',
  maxPull: 3,
  roomTypeCodes: ['STD', 'DLX', 'JRS', 'EXE', 'ROY'],
});
