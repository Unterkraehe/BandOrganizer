# Code map

> **Read this first when you change code** (rule R-CODE-12). It explains how the code is organised and how things are done here.
> To find a specific file, use [`93-code-index.md`](93-code-index.md) (generated: every file with its purpose and exports, all routes, texts, tests).
> Keep this map current when you add a feature, a storage path, a provider, a shared mechanism or a convention (R-CODE-07).

## 1. Commands

| Command | What it does |
|---|---|
| `npm run check` | **Everything CI does** + the code index: types → lint → code index → all tests → build. One line per step, details only on failure |
| `npm run check -- --quick` | Types + lint + code index only (seconds) |
| `npm run check -- flows/songs` | Types, lint, index, **only the tests whose path matches** (extra arguments go to vitest), build. Add `--no-build` to skip the build |
| `npm run map` | Regenerate `docs/93-code-index.md` (also part of `check`) |
| `npm run pack -- --out <dir> [--docs-copy <dir>] [--suffix -x]` | Hand-off zip without git: `BandOrganizer-v<version>.zip` (runs `check` first, never contains `src/config.ts`, `node_modules`, `dist`). With git, deliver by commit |
| `node scripts/serve.mjs start\|stop\|status [port]` | Serves the production build (`vite preview`, default port 4173) in the background – for `scripts/qa/` |
| `python3 scripts/qa/<script>.py` | Phone-sized browser checks (see `scripts/qa/README.md`) |
| `npm run dev` / `build` / `preview` / `test` / `lint` | The usual |

Scripts work from any directory (they locate the repo root themselves). Demo-mode URL options for manual and browser tests: `?demo-songs=300` (many songs), `?demo-latency=250` (every storage call takes 250 ms, like a real HiDrive on a phone).

## 2. Layers and rules of thumb

```
app/   wires everything: providers, routes, gate screens (welcome → band setup → profile), toasts, error boundary
features/<name>/   one folder per feature; uses core/ and ui/, and other features' hooks/components (e.g. Discussion, EventSetlist, useCalendar)
core/  feature-independent logic (storage + guard, auth, audio engine, session, i18n, data helpers)
ui/    shared components and layout; uses core/ (session, theme, color, i18n formats, feature registry)
locales/de/<namespace>.json   all visible texts (German)
```

Imports use the alias `@/` = `src/` (`tsconfig.app.json`).

Dependency direction: `features → core + ui (+ each other)`, `app → everything`, `ui → core`, `core → nothing`. Known exceptions, **don't add more**: `core/session` loads the members through `features/members` (the session knows who is in the band), `ui/Avatar` uses `initials` from `features/members/model`, and features show toasts with `useNotify` from `@/app/notify/NotifyProvider` (the only `app/` import allowed in features).

- **A feature appears in the app only when registered** (`features/index.ts` → `FeatureRegistration`: path, order, `bottomBar`/`more`, element, extra `routes`, optional `useBadge`). Navigation and routes are generated from it.
- **Storage only through `SafeStorage`** (`core/storage/guard.ts`) – never a provider directly. Zones: `_BandApp/` = everything; rest of the home = create-only; outside the home = read-only. Share links only for files inside `_BandApp/`.
- **Everything the user sees is a German i18n key** (`useTranslation('ns')`, other namespaces as `t('ns:key')`; plurals `_one`/`_other`). Code, comments, docs: English. Add a namespace in `core/i18n/index.ts`.
- **Time zone is Europe/Berlin** (`core/i18n/format.ts`, `features/calendar/time.ts`: `toLocal`, `fromLocal`, date arithmetic on `YYYY-MM-DD` strings). Never parse local date strings with `new Date()`.
- **IDs and records:** `newId('prefix')`; stored records extend `RecordBase` (`createdAt/By`, `updatedAt/By`, `deletedAt/By` → soft delete) and carry `schemaVersion` (`core/data/migrate.ts`).

### Provider order (outer → inner, `app/App.tsx`)
ErrorBoundary → Theme → Notify → Session → *(gate by `status.kind`: `loading` → LoadingScreen, `signedOut` → WelcomeScreen, `error` → ConnectionErrorScreen, `needsSetup` → BandSetupScreen, `selectMember` → ProfileSelectScreen, `ready` → app)* → Library → Uploads → Calendar → Reminder → Setlist → SetlistMode → Chat → router. Inside the router (`app/routes.tsx`): Search provider → top-bar extras (search button) → AppShell; search overlay and notification navigator are siblings of the shell.

## 3. Feature → where it lives

Texts: `src/locales/de/<same name>.json`. Docs: `docs/features/`. Flow tests (whole UI in demo mode): `src/app/flows/<name>.test.tsx`; unit tests sit next to their code.

| Feature (doc) | Folder | Key files | Tests |
|---|---|---|---|
| F1 HiDrive connection (10) | `core/storage/`, `core/storage/hidrive/`, `core/auth/`, `core/files/`, `core/session/`, `token-helper/`, `public/callback.html` | `guard.ts` (safety guard), `HiDriveProvider.ts`, `BandSession.tsx`, `scan.ts`, `worker.js` | `guard.test`, `HiDriveProvider.test`, `scan.test`, `tokens.test`, `token-helper/worker.test` |
| F2 Member login (11) | `features/members/`, `features/profile/`, `app/gate/` | `repository.ts`, `MembersPage`, `ProfileForm`, `ProfileSelectScreen` | `members.test`, `flows` (App.test) |
| F3 App shell (12) | `app/`, `ui/layout/`, `ui/swipe.ts`, `features/start/`, `features/more/` | `routes.tsx`, `AppShell.tsx`, `Page.tsx`, `StartPage` | `App.test`, `flows/touch` |
| F4 Songs (13) | `features/songs/` (+ `lyrics/`, `practice/`, `uploads/`), `core/lyrics/` | `model.ts` (songs from files + meta), `library.ts` (store), `repository.ts`, `SongsPage`, `SongDetailPage`, `VersionsSection`, `NotesSection` | `songs.test`, `flows/songs`, `flows/uploads-lyrics`, `flows/practice` |
| F5 Calendar (14) | `features/calendar/` | `store.ts`, `recurrence.ts`, `time.ts`, `subscription.ts`, `ics.ts`, `EventFormPage` | `recurrence.test`, `store.test`, `flows/calendar` |
| F6 Chat (15) | `features/chat/`, `core/events.ts`, `features/notifications/` | `store.ts`, `ChatProvider`, `Composer`, `MessageItem`, `push.ts`, `payload.ts` | `chat.test`, `notifications.test`, `flows/chat` |
| F7 Setlists (16) | `features/setlists/` | `store.ts`, `model.ts`, `SetlistEditorPage`, `PrintSheet` + `Print.module.css`, `SetlistModeProvider` | `setlists.test`, `PrintSheet.test`, `flows/setlists` |
| F8 Search (17) | `features/search/`, `core/search/` | `SearchProvider.tsx` (collects documents from all features), `engine.ts` (MiniSearch), `dates.ts`, `SearchPanel` | `search.test`, `normalize.test`, `flows/search` |
| F9 Audio engine (18) | `core/audio/`, `public/vendor/signalsmith-stretch/` | `engine.ts`, `PlayerProvider.tsx` (`usePlayer`, `usePlayerSelect`), `stretch.ts` | `engine.test`, `practice.test` |
| F10 Uploads (19) | `features/songs/uploads/`, `core/uploads/` | `queue.ts`, `validate.ts`, `names.ts`, `FolderPicker`, `NewSongPage`, `AdoptSuggestionDialog` | `uploads.test`, `flows/uploads-lyrics` |
| Settings | `features/settings/`, `core/theme/`, `core/band/` | `SettingsPage`, `BandSettingsPage`, `band.ts` (`BandConfig`), `textSize.ts` | `theme.test`, `members.test` |

## 4. Where data lives (HiDrive, `_BandApp/`)

Full tree with explanations: overview §8. Who reads/writes it:

| Path | Code | Notes |
|---|---|---|
| `app.json`, `branding/` | `core/band/band.ts`, `logo.ts` | `BandConfig`: name, color, logos, standard upload folder, `scan.excludedPaths`, `scan.suggestionFolders` |
| `members/` | `features/members/repository.ts` | |
| `tags/`, `songs/<id>/meta.json`, `songs/<id>/notes/…` | `features/songs/repository.ts`, `library.ts`, `useSongNotes.ts` | meta is created lazily; field-level update with conflict check |
| `songs/<id>/practice/<memberId>.json` | `features/songs/practice.ts` | tempo/pitch/loop per member and version |
| `calendar/events|exceptions|answers/` | `features/calendar/repository.ts`, `store.ts` | a member only writes their own answer file |
| `calendar/export/` | `features/calendar/subscription.ts` | `band.ics` + `subscription.json` (share link) |
| `setlists/<id>/` | `features/setlists/repository.ts`, `store.ts` | personal notes: one file per member |
| `chat/messages|reactions|read/` | `features/chat/store.ts` | one file per message; polling, no server |
| `push/<memberId>/<deviceId>.json` | `features/notifications/push.ts` | Web Push subscription of one device |
| `reminders/<memberId>.json` | `features/notifications/reminders.ts`, `ReminderProvider.tsx` | a member's reminder settings; the computed list goes to the token helper's KV (`PUT /reminders`), not to HiDrive |

Device-local (localStorage, keys `bandapp.*`): tokens, theme, text size, song list view/sort/suggestions toggle, calendar view, caches per band (`bandapp.chat.<band>.<member>`, `bandapp.calendar.<band>`, …), last upload folders, search history, setlist mode, drafts.

Conflicts: no `If-Match` (not allowed by CORS) – every `FileEntry.version` is an `mtime:chash` string; `writeJson(path, data, { expectedVersion })` throws `ConflictError` if the file changed.

## 5. Shared mechanisms (use these, don't reinvent)

| Need | Use |
|---|---|
| A store with cached-first loading | Class with `getState / subscribe / set`, a Provider using `useSyncExternalStore` (see `calendar/store.ts` + `CalendarProvider.tsx`); cache in `localStorage` via a `cacheKey` |
| Instant feedback for writes | **Optimistic pattern:** apply the change to state → `await` the write → in `catch` restore the old state and rethrow (see `LibraryStore.update`, `CalendarStore.saveEvent/answer`, `SetlistStore.save`). Components close forms/dialogs at once and show a toast on failure |
| Refresh after the app was in the background | `onAppResume(listener)` (`core/resume.ts`) – every provider that holds server data registers one |
| One feature tells another about a change | System event bus `core/events.ts` (`emitSystemEvent` / `onSystemEvent`); the chat turns events into info lines and pushes |
| Player state in lists | `usePlaySong()` (track + status) or `usePlayerSelect(selector)` – **never** `usePlayer()` outside player UI (position changes ~4×/s) |
| Long lists (> 60 rows) | `ui/VirtualList` with fixed-height rows (R-UI-13) |
| Floating UI | `Dialog`, `ConfirmDialog`, `Menu` render through a portal – never position overlays inside sticky/transformed parents |
| Hide something when printing | `data-no-print` attribute |
| Push notifications | Client: `features/notifications/push.ts` (subscribe, `sendPush`); service worker: `public/push-sw.js`; worker: `token-helper/worker.js` (`/push`) |
| Timed notifications (reminders) | `features/notifications/reminders.ts` computes every member's jobs for 8 weeks (`computeReminders`), `ReminderProvider` uploads them (`PUT /reminders`, only after a fresh calendar load – `CalendarStore.isFresh()` – and only if the hash changed); the worker's `scheduled()` (Cron every 5 min) sends jobs due in the last 5 min. Texts are rendered in the app at upload time: absolute dates only, never "Morgen" |
| Search contribution | Add documents in `features/search/SearchProvider.tsx` (+ result route); text matching via `core/search/normalize.ts` |
| Swipe / touch rules | `ui/swipe.ts`, `ui/layout/useTouchGuards.ts`; tab screens set `html[data-swipe-tabs]` (`touch-action: pan-y`) |

## 6. Recipes

**New screen in an existing feature:** page component → route in the feature's `index.ts` (`routes`) → texts in `locales/de/<ns>.json` → test in `src/app/flows/<feature>.test.tsx` → update the feature file in `docs/features/`.

**New feature:** `src/features/<name>/` with `index.ts` (`FeatureRegistration`), list it in `features/index.ts`, text namespace + `core/i18n/index.ts`, a Provider in `app/App.tsx` if it has a store, search documents, feature file + overview index + roadmap, `whatsNew.json`.

**New stored record:** type extending `RecordBase` in `model.ts`, functions in `repository.ts` using only `SafeStorage`, path under `_BandApp/<area>/` (add it to overview §8 and §4 above), `schemaVersion: 1`, tests with `MemoryStorageProvider`, `expectedVersion` on updates.

**New setting:** band-wide → field in `BandConfig` (`core/band/band.ts`) + `updateBandSettings`; per device → `localStorage` key `bandapp.<area>.<name>`; texts under `settings`.

**New ⋯ menu entry:** `useSongActions.tsx` (songs) or the component's `Menu items`; use the function form (`items={() => …}`) inside lists.

**Release (app change):** bump `version` in `package.json`, add the German "Was ist neu" entry as the **first** key in `src/locales/de/whatsNew.json` (a test enforces version = newest entry), update docs, `npm run check`, commit (`/release` does this routine). Hand-off without git: `npm run pack -- --out <dir>`.

## 7. Gotchas (learned the hard way)

**HiDrive API**
- Paths are `root/users/<name>/…` (the app uses absolute paths and converts in `HiDriveProvider`: `toApiPath` / `fromApiPath`); names in responses are URL-encoded.
- `PUT`/`POST /file` address a file by `dir` + `name`, **never `path`** (400). Create-only = `POST` without `on_exist`. `POST /file/copy` for server-side copies. Share links: `POST /sharelink`.
- `createFolder` creates ONE folder; `SafeStorage` creates missing parents, only inside its zones.
- Not verified on the real HiDrive yet: `/file/copy`, share link as calendar subscription, ETag headers (spikes S1–S6 in `03-roadmap.md`).

**Tests**
- Flow tests drive the real UI in demo mode with German labels: `enterDemo(user, path)` from `src/test/demo.tsx`, `beforeEach(() => localStorage.clear())`. Row menus are named `Weitere Aktionen für <Titel>`.
- jsdom has no layout: `VirtualList` renders plainly up to 60 rows; stand-ins for `matchMedia`, audio and `URL.createObjectURL` are in `src/test/setup.ts`.
- `src/config.ts` holds the band's HiDrive client ID (empty in a fresh checkout). Tests pass either way; **never put it into a delivery** – `npm run pack` excludes it.
- A targeted flow run takes ~10–15 s; the full suite ~1–1.5 min on one CPU.

**Browser checks (`scripts/qa/`)**
- `npm run build`, then `node scripts/serve.mjs start`; stop it afterwards. Don't search processes by name (`pkill -f`) – it can kill the shell that runs the command.
- Playwright `name=` matches substrings: use `exact=True` for "Name" (it also matches "Bandname").
- Headless push test needs `channel='chromium'` (new headless mode) to show notifications.
- A shell tool call may be limited to a few minutes: start long jobs detached and write output to a file.

**Code**
- Run `tsc -b` in the repo root only (`npm run check` does).
- `npm run check` needs `node_modules` (`npm ci`) and `npm`/`npx` on the PATH; it stops with a clear message otherwise. `npm run map` (`node scripts/gen-code-index.mjs`) needs only Node.
- Don't bundle `signalsmith-stretch` – it builds its AudioWorklet from its own source text; it is vendored in `public/vendor/` and loaded with a dynamic import.
- pdf.js must stay on the v4 **legacy** build (v5 needs very new JS features).
- A `<select>` is as wide as its longest option – always `width: 100%; min-width: 0` in grids/flex.
- A page that scrolls itself when it opens (chat) must do it after React Router's `<ScrollRestoration>` (`app/routes.tsx`), which resets to the top in a layout effect of the root route – i.e. in `requestAnimationFrame`, not in the page's own `useLayoutEffect`.
- `usePlayer()` in a list screen = full re-render ~4×/s while music plays (see §5).

## 8. Open items (as of v0.14.0)

Device tests still open: S1/S2 (ETag, file IDs after rename), S4 (share link works as subscription), S5 (.ics on phones), S6 (large uploads), iPhone with tempo/pitch + lock screen, chat input with the keyboard on iPhone/Android, push notifications on real devices, `POST /file/copy`. Everything else planned is built; the band test phase decides 1.0.0 (`03-roadmap.md`).
