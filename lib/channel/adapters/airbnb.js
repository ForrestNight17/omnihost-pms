// Airbnb adapter (mock). Gerçek: Airbnb API (Software Partner programı).
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'airbnb',
  name: 'Airbnb',
  keyPrefix: '',
  maxPull: 2,
  roomTypeCodes: ['JRS', 'EXE', 'ROY'],
});
