/**
 * BandOrganizer token helper – Cloudflare Worker (docs/features/10-hidrive-connection.md §4).
 *
 * The ONLY job of this worker: exchange a HiDrive authorization code or refresh token for
 * tokens, adding the client secret that must never be in the browser app (R-CODE-04).
 *
 * Second job (v0.13): send push notifications (F6 §4.5). The app asks the worker to deliver an
 * already prepared notification to the band's devices; the worker encrypts it per device
 * (Web Push, RFC 8291/8292) and hands it to the push services of Google/Apple/Mozilla.
 *
 * Rules (R-CODE-10): no storage, no logging of tokens, codes or messages, requests only from
 * the app's own origin, no file access. Push requests need a valid HiDrive login of the band.
 *
 * Environment variables (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   HIDRIVE_CLIENT_ID      (text)    – the client ID from the HiDrive registration
 *   HIDRIVE_CLIENT_SECRET  (secret)  – the client secret, stored encrypted
 *   ALLOWED_ORIGINS        (text)    – comma-separated, e.g. "https://unterkraehe.github.io"
 *   VAPID_PUBLIC_KEY       (text)    – push key pair (token-helper/generate-vapid-keys.mjs)
 *   VAPID_PRIVATE_KEY      (secret)
 *   VAPID_SUBJECT          (text)    – contact for the push services, e.g. "mailto:band@example.com"
 *   BAND_ACCOUNT           (text)    – HiDrive user name of the band account; only it may send pushes
 */

const HIDRIVE_TOKEN_URL = 'https://my.hidrive.com/oauth2/token';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const originAllowed = allowed.includes(origin);

    if (request.method === 'GET' && url.pathname === '/') {
      return new Response('BandOrganizer token helper: ok', { headers: { 'Content-Type': 'text/plain' } });
    }

    if (!originAllowed) {
      return json({ error: 'origin_not_allowed' }, 403, null);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/push/key' && request.method === 'GET') {
      if (!env.VAPID_PUBLIC_KEY) return json({ error: 'push_not_configured' }, 501, origin);
      return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, origin);
    }

    if (url.pathname === '/push' && request.method === 'POST') {
      return handlePush(request, env, origin);
    }

    if (request.method !== 'POST' || (url.pathname !== '/token' && url.pathname !== '/refresh')) {
      return json({ error: 'not_found' }, 404, origin);
    }

    if (!env.HIDRIVE_CLIENT_ID || !env.HIDRIVE_CLIENT_SECRET) {
      return json({ error: 'helper_not_configured' }, 500, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_request' }, 400, origin);
    }

    const form = new URLSearchParams({
      client_id: env.HIDRIVE_CLIENT_ID,
      client_secret: env.HIDRIVE_CLIENT_SECRET,
    });

    if (url.pathname === '/token') {
      if (typeof body.code !== 'string' || !body.code) return json({ error: 'invalid_request' }, 400, origin);
      form.set('grant_type', 'authorization_code');
      form.set('code', body.code);
    } else {
      if (typeof body.refresh_token !== 'string' || !body.refresh_token) {
        return json({ error: 'invalid_request' }, 400, origin);
      }
      form.set('grant_type', 'refresh_token');
      form.set('refresh_token', body.refresh_token);
    }

    let upstream;
    try {
      upstream = await fetch(HIDRIVE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: form.toString(),
      });
    } catch {
      return json({ error: 'hidrive_unreachable' }, 502, origin);
    }

    // Pass HiDrive's answer through unchanged (tokens go straight to the app, nothing is kept here).
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  },
};

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(data, status, origin) {
  const headers = origin ? { ...corsHeaders(origin) } : { 'Cache-Control': 'no-store' };
  headers['Content-Type'] = 'application/json';
  return new Response(JSON.stringify(data), { status, headers });
}

/* ------------------------------------------------------------------------------------------ */
/* Push notifications (Web Push with VAPID, RFC 8030 / 8291 / 8292) – WebCrypto only          */
/* ------------------------------------------------------------------------------------------ */

const HIDRIVE_API = 'https://api.hidrive.strato.com/2.1';
const MAX_SUBSCRIPTIONS = 60;
const MAX_PAYLOAD = 3000;
// Only real push services – the worker must never be usable to call arbitrary URLs.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9.-]+\.notify\.windows\.com$/,
];

async function handlePush(request, env, origin) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return json({ error: 'push_not_configured' }, 501, origin);
  }
  // 1. Only members of the band: the caller must be logged in to the band's HiDrive account.
  const auth = request.headers.get('Authorization') || '';
  if (!/^Bearer \S+$/.test(auth)) return json({ error: 'unauthorized' }, 401, origin);
  let me;
  try {
    const res = await fetch(`${HIDRIVE_API}/user/me?fields=alias`, { headers: { Authorization: auth } });
    if (res.status === 401) return json({ error: 'unauthorized' }, 401, origin);
    if (!res.ok) return json({ error: 'hidrive_error' }, 502, origin);
    me = await res.json();
  } catch {
    return json({ error: 'hidrive_unreachable' }, 502, origin);
  }
  if (env.BAND_ACCOUNT && String(me.alias || '').toLowerCase() !== env.BAND_ACCOUNT.trim().toLowerCase()) {
    return json({ error: 'forbidden' }, 403, origin);
  }

  // 2. Validate the request.
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_request' }, 400, origin);
  }
  const subscriptions = Array.isArray(body.subscriptions) ? body.subscriptions : null;
  const payload = JSON.stringify(body.payload ?? null);
  if (!subscriptions || subscriptions.length > MAX_SUBSCRIPTIONS || payload.length > MAX_PAYLOAD) {
    return json({ error: 'invalid_request' }, 400, origin);
  }

  // 3. Encrypt and send to every device.
  const vapidKey = await importVapidKey(env);
  const results = await Promise.all(
    subscriptions.map(async (sub) => {
      const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
      try {
        const target = new URL(endpoint);
        if (target.protocol !== 'https:' || !PUSH_HOSTS.some((host) => host.test(target.hostname))) {
          return { endpoint, status: 'invalid' };
        }
        if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return { endpoint, status: 'invalid' };
        const encrypted = await encryptPayload(sub.keys, new TextEncoder().encode(payload));
        const jwt = await vapidJwt(target.origin, env.VAPID_SUBJECT, vapidKey);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '86400',
            Urgency: 'high',
          },
          body: encrypted,
        });
        // 404/410: the device unsubscribed – the app removes the subscription
        return { endpoint, status: res.status };
      } catch {
        return { endpoint, status: 'error' };
      }
    }),
  );
  return json({ results }, 200, origin);
}

let cachedVapid = null;
async function importVapidKey(env) {
  if (cachedVapid && cachedVapid.pub === env.VAPID_PUBLIC_KEY) return cachedVapid.key;
  const pub = b64uDecode(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64uEncode(pub.slice(1, 33)),
    y: b64uEncode(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY.trim(),
    ext: true,
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  cachedVapid = { pub: env.VAPID_PUBLIC_KEY, key };
  return key;
}

/** VAPID (RFC 8292): a short-lived signed token proving who sends the push. */
async function vapidJwt(audience, subject, key) {
  const enc = (obj) => b64uEncode(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })}`;
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${b64uEncode(new Uint8Array(signature))}`;
}

/** Message encryption for Web Push (RFC 8291, "aes128gcm"): only the receiving device can read it. */
async function encryptPayload(keys, plaintext) {
  const uaPublic = b64uDecode(keys.p256dh);
  const authSecret = b64uDecode(keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = concat(plaintext, new Uint8Array([2])); // single, last record: delimiter 0x02
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

function utf8(text) {
  return new TextEncoder().encode(text);
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function b64uEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uDecode(text) {
  const base64 = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
