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
