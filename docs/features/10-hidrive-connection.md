# F1 – HiDrive Connection & File Sync

| | |
|---|---|
| **ID** | F1 |
| **Status** | Implemented (v0.2.0) except the real login test – waiting for HiDrive client ID; spikes S1/S2 pending |
| **Depends on** | – |
| **Used by** | all features |

## 1. Goal

Connect the app securely to the band's HiDrive, read existing files (songs, lyrics, setlists, photos) and store the app's own data in the app data folder — without ever touching foreign files (R-DATA).

## 2. User Stories

- As a member, I connect a new device to the band's HiDrive once and never have to think about it again.
- As a member, I see new songs someone uploaded to HiDrive without doing anything.
- As the band, we are sure the app never damages our existing files.

## 3. Screens & UI

- **Willkommen / Einrichtung** (first start on a device): short explanation, button "Mit HiDrive verbinden" → HiDrive login page → back to the app.
- **First-time band setup** (only once per band, when `_BandApp/` doesn't exist yet): can be done by **any** member. Band name, band color (palette, can be changed later), upload folder (F10, default "Band-App Uploads"), create app folder, start the first file scan.
- **Einstellungen → HiDrive**: connection status, connected folders, "Verbindung trennen".
- **Global connection indicator**: small, unobtrusive notice when HiDrive is unreachable.

## 4. Behaviour & Rules

### Authentication (decided: Option B)

HiDrive app type **"server"** + **token helper** on Cloudflare Workers.

| | |
|---|---|
| Access token | valid 1 hour, renewed silently in the background |
| Refresh token | valid 60 days, extended automatically with every use |
| Client secret | only in the token helper's Cloudflare secrets (R-CODE-04) |
| Tokens on the device | stored locally (IndexedDB), never sent anywhere except HiDrive and the token helper |

**Login flow (first connect on a device):**

1. Member taps "Mit HiDrive verbinden".
2. App redirects to the HiDrive authorization page (`client_id`, `redirect_uri`, scope, `state`).
3. Member logs in with the band's HiDrive account and allows access.
4. HiDrive redirects back to `https://unterkraehe.github.io/BandOrganizer/callback.html` with a short-lived authorization code. `callback.html` is a real static file emitted by the build (not an SPA route), so GitHub Pages serves it without a 404 workaround; it hands the code to the app and forwards to the app start.
5. App sends the code to the token helper → helper adds the client secret → HiDrive returns access + refresh token → helper passes them to the app.
6. App stores the tokens and continues to member login (F2).

**Refresh flow:** shortly before the access token expires (or on a 401 response), the app sends the refresh token to the helper and gets a new access token. The member notices nothing. If refreshing fails (e.g. 60 days unused, password changed), the app shows "Verbindung zu HiDrive erneuern" and starts the login flow again.

**Implementation details (v0.2.0):**

| Item | Value |
|---|---|
| Authorize URL | `https://my.hidrive.com/client/authorize` (`client_id`, `response_type=code`, `scope=user,rw`, `redirect_uri`, `state`, `lang=de`) |
| Token URL (used by the helper only) | `https://my.hidrive.com/oauth2/token` |
| API base | `https://api.hidrive.strato.com/2.1` |
| Token helper | `https://bandorganizer-auth.ostworkers.workers.dev` (`token-helper/worker.js`) |
| Config | `src/config.ts` (client ID is not secret) |
| Token storage | `localStorage` key `bandapp.hidrive.tokens` on the device |
| Home folder | `GET /user/me?fields=home,alias` |
| App data folder | fixed: `<home>/_BandApp` (every device must find it without extra input) |
| Conflict check | `version = "<mtime>:<chash>"` compared before writing (no `If-Match`, see CORS test) |
| Uploads | `POST /file?dir=&name=` without `on_exist` → HiDrive refuses existing names (create-only) |

**Demo mode:** "Demo ausprobieren" on the welcome screen runs the whole app against an in-memory storage with a few sample files. Nothing is saved; useful for trying the app without an account and for UI tests.

**Token helper endpoints:**

| Endpoint | Input | Output |
|---|---|---|
| `POST /token` | authorization code, redirect URI | access token, refresh token, expiry |
| `POST /refresh` | refresh token | new access token (+ refresh token if rotated), expiry |

Rules: CORS restricted to the app's origin, no storage, no token logging (R-CODE-10).

**Disconnect:** "Verbindung trennen" in the settings deletes the tokens on this device. If a device is lost, changing the HiDrive password (or revoking access, if HiDrive offers it) cuts off access.

### Audio file discovery (decided)

- The app ignores the folder structure for songs: it **scans the whole HiDrive recursively** and treats every audio file as a song.
- Supported extensions (initial): `.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac` (final list in F4).
- Always skipped: the app data folder `_BandApp/`, hidden/system folders.
- Optional **exclusion list** in the settings (e.g. a folder with raw rehearsal recordings), stored in `_BandApp/app.json`.
- The full scan runs in the background with a progress indicator ("Songs werden gesucht …"). Results are cached on the device; later scans only check for changes (e.g. by folder modification time) to stay fast.
- Expected size: ~100 audio files → the first scan should finish within seconds to a minute (the total number of folders matters more than the number of songs).
- The same scan approach is reused later for lyrics, setlists and photos (details in the respective feature files).
- **Sync strategy (v1):** online-first. Data is fetched from HiDrive, cached in memory/IndexedDB for speed, refreshed in the background (on app focus, on interval, on pull-to-refresh).
- All write operations go through the safety guard (R-DATA-04).

### StorageProvider interface (draft)

```ts
interface StorageProvider {
  id: string;                       // e.g. "hidrive"
  list(path: string): Promise<FileEntry[]>;
  stat(path: string): Promise<FileEntry>;
  readText(path: string): Promise<string>;
  readJson<T>(path: string): Promise<T>;
  getStreamUrl(path: string): Promise<string>;   // for audio/images
  // write operations – only callable through the safety guard
  writeJson(path: string, data: unknown, opts?: { ifMatch?: string }): Promise<FileEntry>;
  createFolder(path: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  delete(path: string): Promise<void>;
}
```

## 5. Data Model & Storage

- `_BandApp/app.json`: `bandName`, `schemaVersion`, `branding: { color, logoDark, logoLight }`, `scan: { excludedPaths: [] }`, `createdAt`, …
- Device-local (IndexedDB): tokens, file index cache, last scan time.

## 6. Search Contribution

None. The file scan only feeds songs and lyrics (F4); HiDrive files are not searchable (F8 decision).

## 7. Edge Cases & Errors

- HiDrive not reachable / token expired / refresh fails → clear German message + "Erneut verbinden".
- Rate limits → back off and retry.
- App folder was manually changed/deleted by someone → detect and offer to recreate (never overwrite what's there).
- Two members set up the band at the same time → before writing, the app re-checks for `app.json`; if it exists now, the second member simply joins. `app.json` is created with "only if it does not exist" semantics so neither setup overwrites the other.
- Setup is only offered when no `app.json` exists. Once set up, there is no way to "set up again" from the app.

## 8. Open Questions

1. ~~GitHub user/repo~~ Resolved: `Unterkraehe` / `BandOrganizer`. App URL `https://unterkraehe.github.io/BandOrganizer/`, redirect URI `https://unterkraehe.github.io/BandOrganizer/callback.html`. If the registration form allows several redirect URIs, a second one for local development can be added later (HiDrive requires HTTPS).
2. **Spike: CORS from the browser.** *Test 1 (2026-09-24, from github.com, fake token): blocked – the 401 response had no `Access-Control-Allow-Origin` header. Inconclusive*, because many APIs only add CORS headers to successful responses or to registered origins. *Test 2 (2026-09-24, curl preflight for `GET /2.1/user/me`, origin `https://unterkraehe.github.io`): ✅ `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: authorization`, `Access-Control-Allow-Methods: GET, OPTIONS`.* → Reading from the browser works. Still to verify:
   *Test 3 (2026-09-24, curl preflight for `PUT` and `POST /2.1/file`, headers `authorization,content-type`): ✅ allowed methods `DELETE, GET, OPTIONS, PATCH, POST, PUT`, allowed headers `authorization,content-type`.* → Writing from the browser works too. (Since the API also allows `DELETE`, the safety guard R-DATA-04 is the only thing protecting foreign files – it must be implemented and tested before any write feature.)
   Still to verify with a real token:
   - Whether response headers like `ETag` are readable (`Access-Control-Expose-Headers` only shows up on real responses, not preflights) – needed for conflict checks (R-DATA-07); otherwise use file metadata (e.g. modification time) from the response body.
   - Conditional headers like `If-Match` are **not** in the allowed request headers, so conflict checks must work via metadata comparison before writing, not via `If-Match`.
   - Final check with a real token once the client credentials arrive.
   - **If CORS works:** architecture unchanged.
   - **If CORS is blocked:** the token helper also becomes an **API proxy** (all HiDrive requests go through the Cloudflare Worker, which adds CORS headers). Only `HiDriveProvider`'s base URL changes (R-CODE-01); R-CODE-10 must then be extended (proxy only, still no storage/logging) with a decision-log entry.
3. ~~Audio streaming~~ Moved to F9 Audio engine: files are downloaded with `fetch` + auth header and played through Web Audio (needed anyway for pitch/tempo).
4. ~~Who does the first setup?~~ Resolved: anyone, as long as it was never set up.
5. ~~Library size?~~ Resolved: ~100 audio files.

## 9. Out of Scope / Later

- Offline mode (see future plans)
- Other providers, multiple bands (see future plans)
