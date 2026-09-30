# Token helper (Cloudflare Worker)

Exchanges HiDrive authorization codes and refresh tokens, adding the client secret server-side.
Stores nothing, logs nothing, only answers requests from the app's origin (R-CODE-10).

**URL:** `https://bandorganizer-auth.ostworkers.workers.dev`

## Deploy via the Cloudflare dashboard (no tools needed)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker** (the "Hello World" template).
   Name: `bandorganizer-auth` → **Deploy**.
2. **Edit code** → replace everything with the content of `worker.js` → **Deploy**.
3. Worker → **Settings** → **Variables and Secrets** → **Add**:
   | Type | Name | Value |
   |---|---|---|
   | Text | `ALLOWED_ORIGINS` | `https://unterkraehe.github.io` |
   | Text | `HIDRIVE_CLIENT_ID` | client ID from HiDrive |
   | **Secret** | `HIDRIVE_CLIENT_SECRET` | client secret from HiDrive |
   → **Deploy**.
4. Check: opening `https://bandorganizer-auth.ostworkers.workers.dev/` shows `BandOrganizer token helper: ok`.

For local development, add `,http://localhost:5173` to `ALLOWED_ORIGINS`.

## Updating

Paste the new `worker.js` into the dashboard editor and deploy. Variables stay as they are.

## Push notifications (v0.13)

The worker also delivers push notifications for the band chat and event changes. One-time setup:

1. On a computer with Node.js, in the repository folder: `node token-helper/generate-vapid-keys.mjs`
   It prints two values, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
2. Worker → **Settings** → **Variables and Secrets** → **Add**:
   | Type | Name | Value |
   |---|---|---|
   | Text | `VAPID_PUBLIC_KEY` | first value from step 1 |
   | **Secret** | `VAPID_PRIVATE_KEY` | second value from step 1 |
   | Text | `VAPID_SUBJECT` | `mailto:` + an e-mail address of the band, e.g. `mailto:band@example.com` |
   | Text | `BAND_ACCOUNT` | the HiDrive user name of the band account (the name in the HiDrive path, e.g. `rockband`) |
   → **Deploy**.
3. Paste the new `worker.js` into the editor → **Deploy**.
4. Check: `https://bandorganizer-auth.ostworkers.workers.dev/push/key` (opened from the app) returns the public key; in the app: Einstellungen → Benachrichtigungen → Einschalten → "Test-Benachrichtigung senden".

Keep the keys: if `VAPID_PUBLIC_KEY` changes later, every member has to switch notifications off and on again.
