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
