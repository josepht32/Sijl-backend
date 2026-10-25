import * as nodeCrypto from 'crypto';

if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeCrypto,
    configurable: true,
  });
}
