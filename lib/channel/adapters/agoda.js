// Agoda adapter (mock). Gerçek: Agoda YCS / Connectivity API.
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'agoda',
  name: 'Agoda',
  keyPrefix: 'ag_',
  maxPull: 3,
  roomTypeCodes: ['STD', 'DLX', 'JRS'],
});
