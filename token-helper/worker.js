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
 * Third job (v0.14): reminders before calendar events (F6 §4.7). The app uploads the band's
 * upcoming reminders (PUT /reminders); a Cron Trigger every 5 minutes sends the due ones.
 *
 * Fourth job (v0.19.1): the calendar subscription (F5 §6.5b). The app uploads the band calendar
 * (.ics) under a secret (PUT /calendar); calendar apps fetch it from GET /calendar/<secret>.ics –
 * the only route without an origin check, because Google/Apple/Outlook fetch it from their servers.
 *
 * Rules (R-CODE-10): no logging of tokens, codes or messages, requests only from the app's own
 * origin (except the .ics), no file access. Stored in KV: the reminder list (titles and times of
 * the next 8 weeks' events + push addresses) and the subscribed calendar (.ics), each replaced by
 * every upload. Push, reminder and calendar uploads need a valid HiDrive login of the band.
 *
 * Environment variables (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   HIDRIVE_CLIENT_ID      (text)    – the client ID from the HiDrive registration
 *   HIDRIVE_CLIENT_SECRET  (secret)  – the client secret, stored encrypted
 *   ALLOWED_ORIGINS        (text)    – comma-separated, e.g. "https://unterkraehe.github.io"
 *   VAPID_PUBLIC_KEY       (text)    – push key pair (token-helper/generate-vapid-keys.mjs)
 *   VAPID_PRIVATE_KEY      (secret)
 *   VAPID_SUBJECT          (text)    – contact for the push services, e.g. "mailto:band@example.com"
 *   BAND_ACCOUNT           (text)    – HiDrive user name of the band account; only it may send pushes
 *   REMINDERS              (KV namespace binding) – reminder list and calendar subscription; plus a Cron Trigger every 5 minutes (README.md)
 */

const HIDRIVE_TOKEN_URL = 'https://my.hidrive.com/oauth2/token';

export default {
  /** Cron Trigger (every 5 minutes): send the reminders that became due since the last run. */
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(sendDueReminders(env, controller.scheduledTime));
  },

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

    // Calendar apps fetch the subscription from their own servers – no app origin, no login (the secret is the key)
    const icsMatch = url.pathname.match(/^\/calendar\/([A-Za-z0-9_-]+)\.ics$/);
    if (icsMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveCalendar(icsMatch[1], env, request.method === 'HEAD');
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

    if (url.pathname === '/reminders' && request.method === 'PUT') {
      return handleReminders(request, env, origin);
    }

    if (url.pathname === '/calendar' && (request.method === 'PUT' || request.method === 'DELETE')) {
      return handleCalendar(request, env, origin);
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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
  const denied = await checkBandLogin(request, env, origin);
  if (denied) return denied;

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
  const results = await Promise.all(subscriptions.map(async (sub) => ({ endpoint: endpointOf(sub), status: await deliver(sub, payload, env, vapidKey) })));
  return json({ results }, 200, origin);
}

/** null when the caller is logged in to the band's HiDrive account, otherwise the error response. */
async function checkBandLogin(request, env, origin) {
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
  return null;
}

const endpointOf = (sub) => (typeof sub?.endpoint === 'string' ? sub.endpoint : '');

/** Encrypts and sends one notification to one device. Returns the push service's status or 'invalid'/'error'. */
async function deliver(sub, payload, env, vapidKey) {
  const endpoint = endpointOf(sub);
  try {
    const target = new URL(endpoint);
    if (target.protocol !== 'https:' || !PUSH_HOSTS.some((host) => host.test(target.hostname))) return 'invalid';
    if (typeof sub.keys?.p256dh !== 'string' || typeof sub.keys?.auth !== 'string') return 'invalid';
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
    return res.status;
  } catch {
    return 'error';
  }
}

/* ------------------------------------------------------------------------------------------ */
/* Reminders before events (F6 §4.7)                                                          */
/* ------------------------------------------------------------------------------------------ */

const REMINDER_KEY = 'schedule';
/** must match the Cron Trigger: each run sends what became due in the last interval */
const CRON_INTERVAL_MS = 5 * 60 * 1000;
const MAX_REMINDER_BYTES = 1024 * 1024;
const MAX_MEMBERS = 30;
const MAX_DEVICES_PER_MEMBER = 10;
const MAX_JOBS_PER_MEMBER = 500;

async function handleReminders(request, env, origin) {
  if (!env.REMINDERS || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    return json({ error: 'reminders_not_configured' }, 501, origin);
  }
  const denied = await checkBandLogin(request, env, origin);
  if (denied) return denied;

  const text = await request.text();
  if (text.length > MAX_REMINDER_BYTES) return json({ error: 'invalid_request' }, 400, origin);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid_request' }, 400, origin);
  }
  const members = validReminders(body);
  if (!members) return json({ error: 'invalid_request' }, 400, origin);
  await env.REMINDERS.put(REMINDER_KEY, JSON.stringify({ members, updatedAt: Date.now() }));
  return json({ ok: true }, 200, origin);
}

/** Returns the cleaned-up member map, or null if the upload is malformed. */
function validReminders(body) {
  const members = body && typeof body.members === 'object' && !Array.isArray(body.members) ? body.members : null;
  if (!members || Object.keys(members).length > MAX_MEMBERS) return null;
  const clean = {};
  for (const [memberId, entry] of Object.entries(members)) {
    const subscriptions = Array.isArray(entry?.subscriptions) ? entry.subscriptions : null;
    const jobs = Array.isArray(entry?.jobs) ? entry.jobs : null;
    if (!subscriptions || !jobs || subscriptions.length > MAX_DEVICES_PER_MEMBER || jobs.length > MAX_JOBS_PER_MEMBER) return null;
    for (const job of jobs) {
      if (!Number.isFinite(job?.at) || !job.payload || typeof job.payload !== 'object') return null;
      if (JSON.stringify(job.payload).length > MAX_PAYLOAD) return null;
    }
    clean[memberId] = {
      subscriptions: subscriptions.map((s) => ({ endpoint: endpointOf(s), keys: { p256dh: String(s?.keys?.p256dh ?? ''), auth: String(s?.keys?.auth ?? '') } })),
      jobs: jobs.map((j) => ({ at: j.at, payload: j.payload })),
    };
  }
  return clean;
}

/** Sends every reminder with `at` in (now - interval, now]. Returns the number of notifications sent. */
async function sendDueReminders(env, now) {
  if (!env.REMINDERS || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return 0;
  const stored = await env.REMINDERS.get(REMINDER_KEY, 'json');
  if (!stored?.members) return 0;
  const vapidKey = await importVapidKey(env);
  const sends = [];
  for (const { subscriptions, jobs } of Object.values(stored.members)) {
    for (const job of jobs) {
      if (job.at <= now - CRON_INTERVAL_MS || job.at > now) continue;
      const payload = JSON.stringify(job.payload);
      for (const sub of subscriptions) sends.push(deliver(sub, payload, env, vapidKey));
    }
  }
  const results = await Promise.all(sends);
  return results.filter((status) => typeof status === 'number' && status < 300).length;
}

/* ------------------------------------------------------------------------------------------ */
/* Calendar subscription (F5 §6.5b, v0.19.1)                                                   */
/* ------------------------------------------------------------------------------------------ */

const SECRET = /^[A-Za-z0-9_-]{32}$/;
const MAX_ICS_BYTES = 1024 * 1024;
const icsKey = (secret) => `ics:${secret}`;

async function serveCalendar(secret, env, headOnly) {
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
  if (!env.REMINDERS || !SECRET.test(secret)) return notFound();
  const ics = await env.REMINDERS.get(icsKey(secret));
  if (ics === null) return notFound();
  return new Response(headOnly ? null : ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="band.ics"',
      // calendar apps poll every few hours; a short cache keeps changes visible soon
      'Cache-Control': 'public, max-age=300',
    },
  });
}

async function handleCalendar(request, env, origin) {
  if (!env.REMINDERS) return json({ error: 'calendar_not_configured' }, 501, origin);
  const denied = await checkBandLogin(request, env, origin);
  if (denied) return denied;
  const text = await request.text();
  if (text.length > MAX_ICS_BYTES + 200) return json({ error: 'invalid_request' }, 400, origin);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid_request' }, 400, origin);
  }
  const secret = typeof body?.secret === 'string' ? body.secret : '';
  if (!SECRET.test(secret)) return json({ error: 'invalid_request' }, 400, origin);
  if (request.method === 'DELETE') {
    await env.REMINDERS.delete(icsKey(secret));
    return json({ ok: true }, 200, origin);
  }
  const ics = typeof body.ics === 'string' ? body.ics : '';
  if (!ics.startsWith('BEGIN:VCALENDAR') || ics.length > MAX_ICS_BYTES) return json({ error: 'invalid_request' }, 400, origin);
  await env.REMINDERS.put(icsKey(secret), ics);
  return json({ ok: true }, 200, origin);
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
