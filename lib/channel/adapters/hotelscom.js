// Hotels.com adapter (mock). Gerçek: Expedia Group / Hotels.com dağıtım API'si.
import { makeMockAdapter } from './base.js';

export default makeMockAdapter({
  slug: 'hotelscom',
  name: 'Hotels.com',
  keyPrefix: '',
  maxPull: 2,
  roomTypeCodes: ['STD', 'DLX', 'EXE'],
});
