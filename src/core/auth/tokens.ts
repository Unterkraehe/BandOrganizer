import { config } from '@/config';

/**
 * HiDrive tokens on this device (docs/features/10 §4, Option B).
 * Access token: 1 h, refreshed silently via the token helper. Refresh token: 60 days, auto-extended.
 */
export interface HiDriveTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms */
  expiresAt: number;
  userId?: string;
  alias?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  userid?: string;
  alias?: string;
  error?: string;
}

const TOKENS_KEY = 'bandapp.hidrive.tokens';
const REFRESH_MARGIN_MS = 60_000;

export class AuthError extends Error {
  constructor(
    public readonly reason: 'expired' | 'network' | 'helper' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function loadTokens(): HiDriveTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as HiDriveTokens) : null;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: HiDriveTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(TOKENS_KEY);
  } catch {
    // ignore
  }
}

export function tokensFromResponse(data: TokenResponse, previous?: HiDriveTokens | null, now = Date.now()): HiDriveTokens {
  if (!data.access_token) throw new AuthError('invalid', 'Token response without access_token');
  const refreshToken = data.refresh_token ?? previous?.refreshToken;
  if (!refreshToken) throw new AuthError('invalid', 'Token response without refresh_token');
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
    userId: data.userid ?? previous?.userId,
    alias: data.alias ?? previous?.alias,
  };
}

async function callHelper(path: '/token' | '/refresh', body: Record<string, string>): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(config.tokenHelperUrl + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError('network', 'Token helper not reachable');
  }
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok) {
    if (response.status === 400 || response.status === 401) throw new AuthError('expired', data.error ?? 'invalid_grant');
    throw new AuthError('helper', data.error ?? `HTTP ${response.status}`);
  }
  return data;
}

export async function exchangeCode(code: string): Promise<HiDriveTokens> {
  const tokens = tokensFromResponse(await callHelper('/token', { code }));
  saveTokens(tokens);
  return tokens;
}

let refreshInFlight: Promise<HiDriveTokens> | null = null;

/** Refreshes once even if many requests need a new token at the same time. */
export function refreshTokens(current: HiDriveTokens): Promise<HiDriveTokens> {
  refreshInFlight ??= callHelper('/refresh', { refresh_token: current.refreshToken })
    .then((data) => {
      const tokens = tokensFromResponse(data, current);
      saveTokens(tokens);
      return tokens;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Returns a valid access token, refreshing it shortly before it expires. */
export async function getAccessToken(now = Date.now()): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new AuthError('expired', 'Not connected');
  if (tokens.expiresAt - REFRESH_MARGIN_MS > now) return tokens.accessToken;
  return (await refreshTokens(tokens)).accessToken;
}
