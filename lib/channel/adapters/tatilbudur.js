// Tatilbudur adapter (mock). Gerçek: Tatilbudur B2B/otel API'si.
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'tatilbudur',
  name: 'Tatilbudur',
  keyPrefix: 'tb_',
  maxPull: 3,
  roomTypeCodes: ['STD', 'DLX', 'JRS', 'EXE', 'ROY'],
});
