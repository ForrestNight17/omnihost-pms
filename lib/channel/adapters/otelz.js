// Otelz adapter (mock). Gerçek: Otelz.com otel/kanal API'si.
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'otelz',
  name: 'Otelz',
  keyPrefix: 'oz_',
  maxPull: 2,
  roomTypeCodes: ['STD', 'DLX', 'JRS', 'EXE', 'ROY'],
});
