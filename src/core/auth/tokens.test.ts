import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, getAccessToken, loadTokens, saveTokens, tokensFromResponse } from './tokens';

describe('HiDrive tokens', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('builds tokens from the response and keeps the old refresh token if none is returned', () => {
    const t = tokensFromResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600, alias: 'band' }, null, 1000);
    expect(t).toEqual({ accessToken: 'a', refreshToken: 'r', expiresAt: 3_601_000, userId: undefined, alias: 'band' });
    const refreshed = tokensFromResponse({ access_token: 'b', expires_in: 3600 }, t, 5000);
    expect(refreshed).toMatchObject({ accessToken: 'b', refreshToken: 'r', alias: 'band' });
  });

  it('returns the stored token while it is valid', async () => {
    saveTokens({ accessToken: 'valid', refreshToken: 'r', expiresAt: Date.now() + 10 * 60_000 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(getAccessToken()).resolves.toBe('valid');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes once for parallel requests shortly before expiry', async () => {
    saveTokens({ accessToken: 'old', refreshToken: 'r1', expiresAt: Date.now() + 30_000 });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 })));
    const [a, b] = await Promise.all([getAccessToken(), getAccessToken()]);
    expect([a, b]).toEqual(['new', 'new']);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(loadTokens()?.refreshToken).toBe('r2');
  });

  it('reports an expired login when refreshing is rejected', async () => {
    saveTokens({ accessToken: 'old', refreshToken: 'dead', expiresAt: 0 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(getAccessToken()).rejects.toMatchObject({ reason: 'expired' } satisfies Partial<AuthError>);
  });
});
