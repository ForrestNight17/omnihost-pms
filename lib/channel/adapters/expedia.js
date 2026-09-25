// Expedia adapter (mock). Gerçek: Expedia Partner Central / EPS Rapid API.
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'expedia',
  name: 'Expedia',
  keyPrefix: 'exp_',
  maxPull: 2,
  roomTypeCodes: ['STD', 'DLX', 'EXE', 'ROY'],
});
