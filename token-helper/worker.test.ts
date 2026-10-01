// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error – plain JS worker module
import worker from './worker.js';

const env = {
  HIDRIVE_CLIENT_ID: 'client-id',
  HIDRIVE_CLIENT_SECRET: 'client-secret',
  ALLOWED_ORIGINS: 'https://unterkraehe.github.io, http://localhost:5173',
};
const ORIGIN = 'https://unterkraehe.github.io';

function post(path: string, body: unknown, origin = ORIGIN) {
  return new Request(`https://bandorganizer-auth.example.workers.dev${path}`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('token helper worker (R-CODE-10)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects other origins', async () => {
    const res = await worker.fetch(post('/token', { code: 'x' }, 'https://evil.example'), env);
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers preflight for the app origin', async () => {
    const res = await worker.fetch(
      new Request('https://h.example/token', { method: 'OPTIONS', headers: { Origin: ORIGIN } }),
      env,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('exchanges an authorization code, adding the secret server-side', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }), { status: 200 }),
    );
    const res = await worker.fetch(post('/token', { code: 'the-code' }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ access_token: 'a', refresh_token: 'r' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://my.hidrive.com/oauth2/token');
    const form = new URLSearchParams(String(init!.body));
    expect(Object.fromEntries(form)).toEqual({
      client_id: 'client-id',
      client_secret: 'client-secret',
      grant_type: 'authorization_code',
      code: 'the-code',
    });
  });

  it('refreshes tokens and passes HiDrive errors through', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
    );
    const res = await worker.fetch(post('/refresh', { refresh_token: 'old' }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_grant' });
  });

  it('validates input and configuration', async () => {
    expect((await worker.fetch(post('/token', {}), env)).status).toBe(400);
    expect((await worker.fetch(post('/other', { code: 'x' }), env)).status).toBe(404);
    expect((await worker.fetch(post('/token', { code: 'x' }), { ALLOWED_ORIGINS: ORIGIN })).status).toBe(500);
  });
});

describe('push notifications (F6 §4.5)', () => {
  afterEach(() => vi.restoreAllMocks());

  async function vapidEnv() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    return {
      pair,
      env: {
        ...env,
        VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'),
        VAPID_PRIVATE_KEY: jwk.d!,
        VAPID_SUBJECT: 'mailto:band@example.com',
        BAND_ACCOUNT: 'rockband',
      },
    };
  }

  async function device() {
    const nodeCrypto = await import('node:crypto');
    const ecdh = nodeCrypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = nodeCrypto.randomBytes(16);
    return { ecdh, auth, sub: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } } };
  }

  const pushRequest = (body: unknown, token = 'good-token') =>
    new Request('https://h.example/push', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  it('encrypts per device so that only the device can read it, signed with VAPID', async () => {
    const { env: pushEnv, pair } = await vapidEnv();
    const dev = await device();
    const sent: { url: string; init: RequestInit }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/user/me')) return new Response(JSON.stringify({ alias: 'rockband' }), { status: 200 });
      sent.push({ url, init: init! });
      return new Response(null, { status: 201 });
    });
    const payload = { title: 'Lisa', body: 'Probe heute 30 min später?', url: '/chat' };
    const res = await worker.fetch(pushRequest({ subscriptions: [dev.sub], payload }), pushEnv);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ endpoint: dev.sub.endpoint, status: 201 }] });

    // decrypt with an independent implementation (http_ece, RFC 8188/8291)
    const ece = (await import('http_ece')).default;
    const body = Buffer.from(sent[0]!.init.body as Uint8Array);
    const plain = ece.decrypt(body, { version: 'aes128gcm', privateKey: dev.ecdh, authSecret: dev.auth });
    expect(JSON.parse(plain.toString('utf8'))).toEqual(payload);

    // VAPID header: signature valid for the push service's origin
    const headers = sent[0]!.init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    const [, jwt, k] = headers.Authorization!.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(pushEnv.VAPID_PUBLIC_KEY);
    const [h, c, s] = jwt!.split('.');
    const claims = JSON.parse(Buffer.from(c!, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, Buffer.from(s!, 'base64url'), new TextEncoder().encode(`${h}.${c}`));
    expect(ok).toBe(true);
  });

  it('only the band account may send, only to real push services', async () => {
    const { env: pushEnv } = await vapidEnv();
    const dev = await device();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/user/me')) return new Response(JSON.stringify({ alias: 'someone-else' }), { status: 200 });
      return new Response(null, { status: 201 });
    });
    expect((await worker.fetch(pushRequest({ subscriptions: [dev.sub], payload: {} }), pushEnv)).status).toBe(403);
    expect((await worker.fetch(new Request('https://h.example/push', { method: 'POST', headers: { Origin: ORIGIN }, body: '{}' }), pushEnv)).status).toBe(401);

    vi.restoreAllMocks();
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/user/me')) return new Response(JSON.stringify({ alias: 'RockBand' }), { status: 200 });
      return new Response(null, { status: 201 });
    });
    const evil = { ...dev.sub, endpoint: 'https://internal.example.com/admin' };
    const res = await worker.fetch(pushRequest({ subscriptions: [evil], payload: {} }), pushEnv);
    expect(await res.json()).toEqual({ results: [{ endpoint: evil.endpoint, status: 'invalid' }] });
    expect(calls.some((u) => u.includes('internal.example.com'))).toBe(false);
  });

  it('publishes the public key for the app', async () => {
    const { env: pushEnv } = await vapidEnv();
    const res = await worker.fetch(new Request('https://h.example/push/key', { headers: { Origin: ORIGIN } }), pushEnv);
    expect(await res.json()).toEqual({ publicKey: pushEnv.VAPID_PUBLIC_KEY });
  });
});

describe('reminders before events (F6 §4.7)', () => {
  afterEach(() => vi.restoreAllMocks());

  async function reminderEnv() {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    const kv = new Map<string, string>();
    return {
      kv,
      env: {
        ...env,
        VAPID_PUBLIC_KEY: Buffer.from(raw).toString('base64url'),
        VAPID_PRIVATE_KEY: jwk.d!,
        VAPID_SUBJECT: 'mailto:band@example.com',
        BAND_ACCOUNT: 'rockband',
        REMINDERS: {
          get: async (key: string, type?: string) => (kv.has(key) ? (type === 'json' ? JSON.parse(kv.get(key)!) : kv.get(key)) : null),
          put: async (key: string, value: string) => void kv.set(key, value),
        },
      },
    };
  }

  async function subscription(name: string) {
    const nodeCrypto = await import('node:crypto');
    const ecdh = nodeCrypto.createECDH('prime256v1');
    ecdh.generateKeys();
    return { endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: nodeCrypto.randomBytes(16).toString('base64url') } };
  }

  const put = (body: unknown, token = 'good-token') =>
    new Request('https://h.example/reminders', {
      method: 'PUT',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  const hidrive = (alias = 'rockband') =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('/user/me') ? new Response(JSON.stringify({ alias }), { status: 200 }) : new Response(null, { status: 201 }),
    );

  it('stores the uploaded list – only for the band account, only well-formed', async () => {
    const { env: rEnv, kv } = await reminderEnv();
    const sub = await subscription('lisa');
    const upload = { members: { m_lisa: { subscriptions: [sub], jobs: [{ at: 1_000_000, payload: { title: 'Probe', body: 'Do · 19:00', url: 'calendar/e_1' } }] } } };

    hidrive('someone-else');
    expect((await worker.fetch(put(upload), rEnv)).status).toBe(403);
    expect(kv.size).toBe(0);

    vi.restoreAllMocks();
    hidrive();
    expect((await worker.fetch(put({ members: { m_lisa: { subscriptions: [sub], jobs: [{ at: 'soon' }] } } }), rEnv)).status).toBe(400);
    const res = await worker.fetch(put(upload), rEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(JSON.parse(kv.get('schedule')!).members).toEqual(upload.members);

    const { REMINDERS: _kv, ...withoutKv } = rEnv;
    void _kv;
    expect((await worker.fetch(put(upload), withoutKv)).status).toBe(501);
  });

  it('the timer sends what became due in the last 5 minutes, only to real push services', async () => {
    const { env: rEnv, kv } = await reminderEnv();
    const lisa = await subscription('lisa');
    const now = Date.parse('2026-10-10T18:00:00Z');
    const job = (minutesAgo: number, title: string) => ({ at: now - minutesAgo * 60_000, payload: { title, body: '', url: 'calendar/e_1' } });
    kv.set(
      'schedule',
      JSON.stringify({
        members: {
          m_lisa: { subscriptions: [lisa, { ...lisa, endpoint: 'https://internal.example.com/x' }], jobs: [job(6, 'too old'), job(4, 'due'), job(0, 'due now'), job(-1, 'next run')] },
        },
      }),
    );
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      calls.push(String(input));
      return new Response(null, { status: 201 });
    });
    const waits: Promise<unknown>[] = [];
    await worker.scheduled({ scheduledTime: now }, rEnv, { waitUntil: (p: Promise<unknown>) => waits.push(p) });
    expect(await Promise.all(waits)).toEqual([2]);
    expect(calls).toEqual([lisa.endpoint, lisa.endpoint]);
  });
});

describe('calendar subscription (F5 §6.5b, v0.19.1)', () => {
  afterEach(() => vi.restoreAllMocks());

  const kvEnv = () => {
    const kv = new Map<string, string>();
    return {
      kv,
      env: {
        ...env,
        BAND_ACCOUNT: 'rockband',
        REMINDERS: {
          get: async (key: string) => kv.get(key) ?? null,
          put: async (key: string, value: string) => void kv.set(key, value),
          delete: async (key: string) => void kv.delete(key),
        },
      },
    };
  };
  const SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
  const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Overload\r\nEND:VCALENDAR\r\n';
  const upload = (method: 'PUT' | 'DELETE', body: unknown) =>
    new Request('https://h.example/calendar', {
      method,
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: 'Bearer good-token' },
      body: JSON.stringify(body),
    });
  const hidrive = (alias = 'rockband') =>
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ alias }), { status: 200 }));
  // calendar apps send no Origin header
  const fetchIcs = (secret: string, method = 'GET') => worker.fetch(new Request(`https://h.example/calendar/${secret}.ics`, { method }), kvEnvCurrent);
  let kvEnvCurrent: ReturnType<typeof kvEnv>['env'];

  it('stores the calendar for the band only and serves it to calendar apps', async () => {
    const { env: cEnv, kv } = kvEnv();
    kvEnvCurrent = cEnv;
    hidrive('someone-else');
    expect((await worker.fetch(upload('PUT', { secret: SECRET, ics: ICS }), cEnv)).status).toBe(403);
    vi.restoreAllMocks();
    hidrive();
    expect((await worker.fetch(upload('PUT', { secret: 'short', ics: ICS }), cEnv)).status).toBe(400);
    expect((await worker.fetch(upload('PUT', { secret: SECRET, ics: '<html>' }), cEnv)).status).toBe(400);
    expect((await worker.fetch(upload('PUT', { secret: SECRET, ics: ICS }), cEnv)).status).toBe(200);
    expect(kv.get(`ics:${SECRET}`)).toBe(ICS);

    const res = await fetchIcs(SECRET);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(await res.text()).toBe(ICS);
    expect((await fetchIcs(SECRET, 'HEAD')).status).toBe(200);
    expect((await fetchIcs('ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).status).toBe(404);

    expect((await worker.fetch(upload('DELETE', { secret: SECRET }), cEnv)).status).toBe(200);
    expect((await fetchIcs(SECRET)).status).toBe(404);
  });

  it('without the KV store: uploads say "not configured", the address is not found', async () => {
    const { REMINDERS: _kv, ...noKv } = kvEnv().env;
    void _kv;
    kvEnvCurrent = noKv as never;
    expect((await worker.fetch(upload('PUT', { secret: SECRET, ics: ICS }), noKv)).status).toBe(501);
    expect((await fetchIcs(SECRET)).status).toBe(404);
  });
});
