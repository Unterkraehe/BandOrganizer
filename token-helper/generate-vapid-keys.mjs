// Creates the key pair for push notifications. Run once:  node token-helper/generate-vapid-keys.mjs
// Then put the values into the Cloudflare worker (Settings → Variables and Secrets):
//   VAPID_PUBLIC_KEY  (Text)   VAPID_PRIVATE_KEY  (Secret!)
const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = await subtle.exportKey('jwk', pair.privateKey);
const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
console.log('VAPID_PUBLIC_KEY  =', b64u(raw));
console.log('VAPID_PRIVATE_KEY =', jwk.d);
console.log('\nKeep the private key secret – it goes into the worker as a "Secret", nowhere else.');
