/**
 * BandOrganizer token helper – Cloudflare Worker (docs/features/10-hidrive-connection.md §4).
 *
 * The ONLY job of this worker: exchange a HiDrive authorization code or refresh token for
 * tokens, adding the client secret that must never be in the browser app (R-CODE-04).
 *
 * Rules (R-CODE-10): no storage, no logging of tokens or codes, requests only from the
 * app's own origin, no file access.
 *
 * Environment variables (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
 *   HIDRIVE_CLIENT_ID      (text)    – the client ID from the HiDrive registration
 *   HIDRIVE_CLIENT_SECRET  (secret)  – the client secret, stored encrypted
 *   ALLOWED_ORIGINS        (text)    – comma-separated, e.g. "https://unterkraehe.github.io"
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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
