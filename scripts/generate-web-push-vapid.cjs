const { generateKeyPairSync } = require('node:crypto');

const { publicKey, privateKey } = generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { format: 'jwk' },
  privateKeyEncoding: { format: 'jwk' },
});

const applicationServerKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(publicKey.x, 'base64url'),
  Buffer.from(publicKey.y, 'base64url'),
]).toString('base64url');

console.log(`EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY=${applicationServerKey}`);
console.log(`WEB_PUSH_VAPID_KEYS_JSON=${JSON.stringify({ publicKey, privateKey })}`);
