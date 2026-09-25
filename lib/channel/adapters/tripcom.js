// Trip.com adapter (mock). Gerçek: Trip.com (Ctrip) Ebooking / Connectivity API.
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'tripcom',
  name: 'Trip.com',
  keyPrefix: 'tc_',
  maxPull: 4,
  roomTypeCodes: ['STD', 'DLX', 'JRS', 'EXE', 'ROY'],
});
