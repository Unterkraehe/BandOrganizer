# F13 – OneDrive as Band Storage

| | |
|---|---|
| **ID** | F13 (first step of future plan L3 "other cloud providers") |
| **Status** | Option, on hold until the band decides: second band on a second HiDrive (no new provider needed) or on OneDrive (2026-10-05). If OneDrive: milestone M12, after spike S7 and prerequisites P5/P6 |
| **Depends on** | F1 (storage provider interface, guard, token helper), F12 (several bands) |
| **Used by** | The second band |

## 1. Goal & Positioning

> **Not decided yet:** the second band may also use a second **HiDrive** account – then this feature isn't needed and F12 alone is enough. The maintainer settles it with the band first; this file is the worked-out plan in case they choose OneDrive.

A second band uses the app with **OneDrive** instead of HiDrive. It has no cloud yet; the free 5 GB of a Microsoft account are enough for its music (maintainer, 2026-10-05).

**Account model – same as HiDrive:** the band creates its **own Microsoft account** that holds only band files; all members log in with it (shared login, R-SEC-01 unchanged). Nobody's private files are involved.

Why OneDrive (decision 2026-10-05, alternatives in the decision log): folder paths like HiDrive, built-in protection against overwriting, a standard login that our token helper can keep alive for 90 days, free 5 GB (100 GB for about $2/month if needed). Features don't change at all – only a new `StorageProvider` (R-CODE-01).

## 2. User Stories

| # | Story |
|---|---|
| US-1 | As the second band, we set the app up on our band's OneDrive and use everything Overload uses. |
| US-2 | As a member, I log in once with the band's Microsoft account and stay logged in. |
| US-3 | As someone in both bands, I have Overload on HiDrive and the second band on OneDrive in one app (F12). |

## 3. Screens & UI

- **First start / "Band hinzufügen":** "Wo liegen die Daten eurer Band?" → **HiDrive** · **OneDrive**, then the provider's login page, then band setup or join (unchanged).
- **Texts:** "HiDrive" appears 28 times in the German texts today. Shared screens get provider-neutral wording ("Cloud-Speicher", "Verbindung trennen"); where the provider matters, its name is inserted ("Verbunden mit OneDrive als …").
- Everything else looks and works the same.

## 4. Behaviour & Rules

### 4.1 Login (Microsoft identity platform, personal accounts)
- OAuth 2.0 authorization code flow with tenant `consumers`; scopes `Files.ReadWrite offline_access User.Read`.
- App registration as **Web** platform with a client secret kept in the token helper (R-CODE-04). Refresh tokens then last **90 days and renew with every use**; a browser-only (SPA) registration would need a new login every 24 hours – rejected.
- Token helper: `/token` and `/refresh` get a `provider` field (`hidrive` default, `onedrive`); env `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET`.
- Same redirect page `public/callback.html`; its URL is registered in the Microsoft app registration too.
- **Maintenance:** Microsoft client secrets expire (at most 24 months). The expiry date goes into `token-helper/README.md`; renewing = new secret in the Microsoft portal + Cloudflare.

### 4.2 `OneDriveProvider` (`core/storage/onedrive/`)
Implements `StorageProvider` (`core/storage/types.ts`) on Microsoft Graph `https://graph.microsoft.com/v1.0`:

| Method | Graph |
|---|---|
| `list(path)` | `GET /me/drive/root:/<path>:/children` (paging via `@odata.nextLink`; fields id, name, size, file, folder, lastModifiedDateTime, eTag) |
| `stat(path)` | `GET /me/drive/root:/<path>:` (404 → `null`) |
| `readText` / `readBlob` | `GET …?select=@microsoft.graph.downloadUrl`, then fetch that URL **without** auth header (the `/content` redirect is blocked by CORS in browsers – Microsoft docs) |
| `writeText(…, { expectedVersion })` | `PUT …:/content` with `If-Match: <eTag>` → 412 = `ConflictError` (to verify in S7; fallback: compare before writing, as on HiDrive) |
| `createFile` | `PUT …:/content?@microsoft.graph.conflictBehavior=fail` (up to 250 MB); larger files and upload progress via an upload session in chunks |
| `createFolder` | `POST …/children` `{ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }`; "already exists" is not an error |
| `copyFile` | optional – the guard's fallback (read + create) is enough |
| `move` / `delete` | Graph `PATCH` / `DELETE` – only ever called by the guard inside `_BandApp/` |

- `FileEntry.version` = `eTag`; `FileEntry.id` = item id (stable across rename/move).
- Home = the root of the band's OneDrive; app data in `<root>/_BandApp/` – same layout as on HiDrive (overview §8).
- Throttling: HTTP 429/503 with `Retry-After` → wait and retry (max 3).

### 4.3 Safety (R-DATA)
The guard (`core/storage/guard.ts`) works on paths and stays as it is: `_BandApp/` everything, rest of the home create-only, nothing else. Guard tests run against a fake OneDrive provider as well.

## 5. Data Model & Storage

Identical to HiDrive (overview §8). Device: tokens per connection (F12). Token helper: `BAND_ACCOUNTS` entry `onedrive:<account id>` (F12 §4.5).

## 6. Search Contribution

None – search works on app data, independent of the provider.

## 7. Edge Cases & Errors

- **Download address expired** (valid only minutes): request a new one and retry once.
- **Storage full** (5 GB): Graph error `quotaLimitReached` → upload error "OneDrive ist voll" (F10).
- **Microsoft asks for a security check** on a new phone (code by e-mail/SMS to the band account): happens on Microsoft's login page, nothing for the app to do – but the band must be able to receive those codes (P5).
- **"Unverified publisher"** shown on Microsoft's consent page: expected for a private app; verifying the publisher needs a Microsoft partner account – not planned.

## 8. i18n Keys (examples)

| Key | German |
|---|---|
| `connect.chooseProvider` | Wo liegen die Daten eurer Band? |
| `connect.hidrive` / `connect.onedrive` | HiDrive / OneDrive |
| `storage.connectedAs` | Verbunden mit {{provider}} als {{alias}} |
| `uploads.storageFull` | {{provider}} ist voll – lösche dort Dateien oder erweitere den Speicher |

## 9. Changes to Other Features

- **F1:** provider choice, OneDrive login, `OneDriveProvider`, provider-neutral texts; guard tests for both providers.
- **F10:** upload sessions (chunks, progress) for OneDrive.
- **Token helper:** provider in `/token` + `/refresh`, OneDrive login check, README section "OneDrive".
- **Code map:** new provider folder, OneDrive gotchas (download URL, eTag, conflictBehavior).

## 10. Out of Scope / Later

- Shared folders from a private account (members with their own accounts) – rejected for now (decision log 2026-10-05).
- Google Drive, MEGA, Dropbox – see decision log and future plans L3.
- Graph `delta` API for faster change detection (instead of polling the folders) – possible later.

## 11. Decisions

| Date | Decision |
|---|---|
| 2026-10-05 | If the second band doesn't use HiDrive: OneDrive with a band-only Microsoft account, shared login. Final choice (HiDrive or OneDrive) is the band's (maintainer). |
| 2026-10-05 | Login through the token helper (Web registration, 90-day rolling refresh), not browser-only (24 h). |

## 12. Steps (each a release)

1. **Read:** OneDrive login via the token helper, `OneDriveProvider` read methods, provider choice – the band can browse and play.
2. **Write:** writes with conflict check, folders, uploads with upload sessions, guard tests; provider-neutral texts.
