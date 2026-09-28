import { config, redirectUri } from '@/config';
import { exchangeCode, type HiDriveTokens } from './tokens';

const STATE_KEY = 'bandapp.oauthState';
/** Written by public/callback.html */
const CALLBACK_KEY = 'bandapp.oauthCallback';

function randomState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Sends the member to the HiDrive login page (F1 §4, step 2). */
export function startLogin(): void {
  const state = randomState();
  sessionStorage.setItem(STATE_KEY, state);
  const url = new URL(config.hidrive.authorizeUrl);
  url.searchParams.set('client_id', config.hidrive.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.hidrive.scope);
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('lang', 'de');
  window.location.assign(url.toString());
}

export type CallbackResult =
  | { status: 'none' }
  | { status: 'success'; tokens: HiDriveTokens }
  | { status: 'error'; reason: 'denied' | 'state' | 'exchange' };

/** Finishes a login after callback.html handed back the query (F1 §4, steps 4–5). */
export async function completeLoginIfPending(): Promise<CallbackResult> {
  const query = sessionStorage.getItem(CALLBACK_KEY);
  if (query === null) return { status: 'none' };
  sessionStorage.removeItem(CALLBACK_KEY);
  const expectedState = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);

  const params = new URLSearchParams(query);
  if (params.get('error')) return { status: 'error', reason: 'denied' };
  const code = params.get('code');
  if (!code || !expectedState || params.get('state') !== expectedState) return { status: 'error', reason: 'state' };

  try {
    return { status: 'success', tokens: await exchangeCode(code) };
  } catch {
    return { status: 'error', reason: 'exchange' };
  }
}
