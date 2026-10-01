# Overload App – Project Overview

> **App name:** Overload App (may change later – the name is only set in config/translations, see R-I18N-07)
> **Status:** Implementation – v0.14.4: release candidate for 1.0 – all planned features are built; the band test phase decides when it becomes 1.0.0. Working on the code? Start with [`92-code-map.md`](92-code-map.md).
> **Last updated:** 2026-09-24

This file is the entry point for the whole project. Read it first, then `01-general-rules.md` and `02-design-system.md`, then the feature file you are working on. The build order is defined in `03-roadmap.md`.

---

## 1. Vision

A Progressive Web App (PWA) that gives every band member one clean, organized place for everything the band needs: songs, dates, setlists and communication. It sits on top of the band's existing HiDrive cloud storage, so no files have to move and nothing existing gets lost.

**One-sentence goal:** Open the app on any device and find what you need for the band in two taps.

## 2. Current Situation

- All band files live on one **HiDrive** account (Excel sheets, song MP3s, lyrics, setlists, live photos, …).
- All members share the same HiDrive login.
- There is no structured overview; finding things means browsing folders.

## 3. Target Users

| Who | Needs |
|---|---|
| Band members (all equal), **3–12 people** | Listen to songs, read lyrics, see upcoming dates, build setlists, chat |
| Possible later: other bands | Same app, their own HiDrive (see future plans) |

There are no admin roles planned for v1. Every member can do everything (subject to the data-safety rules).

## 4. Feature Index

### Main features (v1)

| # | Feature | File | Status |
|---|---|---|---|
| F1 | HiDrive connection & file sync | `features/10-hidrive-connection.md` | Implemented – real HiDrive login works; spikes S1/S2 pending |
| F2 | In-app member login (profile per device) | `features/11-member-login.md` | Implemented ✅ |
| F3 | Main menu / app shell (incl. dashboard, setlist mode) | `features/12-main-menu.md` | Implemented ✅ |
| F4 | Songs (list, versions, player, practice view, notes) | `features/13-songs.md` | Implemented ✅ |
| F5 | Calendar (gigs, rehearsals, absences, recurring events, answers, export) | `features/14-calendar.md` | Implemented (spikes S4/S5 pending) |
| F6 | Band chat (management chat, item discussions) | `features/15-chat.md` | Implemented ✅ (push notifications since v0.13) |
| F7 | Setlist maker (blocks, notes, transitions, print, stage view, suggestions) | `features/16-setlists.md` | Implemented ✅ |
| F8 | Global search (app items only) | `features/17-global-search.md` | Implemented ✅ |
| F10 | Adding content & uploads (new songs, recordings, lyrics incl. typing, logo) | `features/19-uploads.md` | Implemented (spike S6 pending) |
| F9 | Audio engine (core module: playback, pitch shift, tempo change, A–B loop) | `features/18-audio-engine.md` | Implemented (iPhone retest with effects pending) |

### Later features

See `90-future-plans.md` (offline caching, multiple bands, other cloud providers, further features).

### Build order

See `03-roadmap.md` (milestones M0–M9).

## 5. Architecture Overview

```
┌──────────────────────────────────────────────┐
│  PWA (runs in the browser on every device)   │
│                                              │
│  Features: Songs · Calendar · Chat · …       │
│        │                                     │
│  Repositories (typed data access per feature)│
│        │                                     │
│  StorageProvider interface  ◄── safety guard │
│        │                                     │
│  HiDriveProvider (v1)   [GoogleDrive… later] │
└────────┼─────────────────────────────────────┘
         │ HTTPS
         ▼
┌──────────────────┐  token exchange     ┌──────────────────┐
│ HiDrive REST API │ ◄───────────────────│ Token helper     │
│ + OAuth2 server  │                     │ (tiny serverless │
└──────────────────┘                     │  function)       │
                                         └──────────────────┘
App hosted as static files on GitHub Pages.
```

Key architectural decisions:

- **No own database.** All app data (notes, chat, calendar, setlists, profiles) is stored as JSON files in a dedicated app folder on HiDrive. The band stays in full control of its data.
- **Storage abstraction from day one.** Features never talk to HiDrive directly. They go through a `StorageProvider` interface. This makes Google Drive support and multiple bands possible later without rewrites.
- **One file per record.** Every chat message, note, event, setlist is its own file. This avoids write conflicts when two members save at the same time.
- **Central safety guard.** Every write/move/delete call passes through one guard function that enforces the "never touch foreign files" rule (see `01-general-rules.md`, R-DATA).
- **Static hosting on GitHub Pages + tiny token helper.** The app is pure client-side code on GitHub Pages. A small serverless function (the *token helper*) holds the HiDrive client secret and exchanges/refreshes tokens, so members stay connected for 60 days (auto-extended). It stores no data and never touches files. See F1 §4.

## 6. Tech Stack (as built)

| Area | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | `tsc -b` is part of the build |
| UI | React 19 + Vite 6, CSS Modules + design tokens (`src/ui/`) | Tokens-first (R-UI-07), no CSS framework |
| PWA | `vite-plugin-pwa` (Workbox `generateSW`) + `public/push-sw.js` | Installable; push handlers are loaded into the generated service worker with `importScripts` |
| Routing | React Router 7 (`react-router-dom`) | Routes are generated from the feature registry |
| State / sync | Small own stores per feature (`useSyncExternalStore`) with cached-first loading and optimistic writes | **No TanStack Query** – decided against it: the stores are tiny, HiDrive has no push channel, and each store knows its own conflict rules |
| Device storage | `localStorage` (settings, small caches, tokens, drafts) | **No IndexedDB / Dexie** so far; only needed for the later offline mode (L1) |
| i18n | i18next + react-i18next, German only | One JSON namespace per feature in `src/locales/de/` |
| Search | MiniSearch 7 (client-side, main thread) | See F8 |
| Audio | `<audio>` + blob URL; Web Audio + `signalsmith-stretch` 1.3 (vendored in `public/vendor/`) while tempo/pitch/loop are active | See F9 |
| Documents | `pdfjs-dist` 4 (legacy build) for PDF lyrics, `mammoth` for Word | Loaded only when a lyrics file is opened |
| Long lists | `@tanstack/react-virtual` behind `ui/VirtualList` | R-UI-13 |
| Tests | Vitest 3, Testing Library, jsdom; Playwright (Python) for phone checks in `scripts/qa/` | `npm run check` |
| Hosting | **GitHub Pages**, deployed by GitHub Actions | Free, HTTPS |
| Token helper | One Cloudflare Worker (free tier): HiDrive token exchange + Web Push delivery | `token-helper/`, rule R-CODE-10 |

## 7. Code Structure (as built)

The detailed, current structure lives in two files that are kept up to date with the code:

- [`92-code-map.md`](92-code-map.md) – concepts, layers, where data lives, shared mechanisms, recipes, gotchas (hand-written).
- [`93-code-index.md`](93-code-index.md) – every source file with its purpose and exports, all routes, texts and tests (**generated**: `npm run map`).

In short:

```
BandOrganizer/
├─ docs/               planning, rules, feature files, code map + index
├─ scripts/            check / serve / pack / code index (Node) and qa/ (Playwright, Python)
├─ token-helper/       Cloudflare Worker: HiDrive token exchange + push delivery
├─ public/             icons, callback.html (OAuth), push-sw.js, vendor/signalsmith-stretch
└─ src/
   ├─ app/             shell wiring: providers, routes, gate screens (welcome → setup → profile), toasts
   ├─ core/            feature-independent logic: storage + safety guard, auth, audio, session, i18n, data helpers
   ├─ features/        songs, calendar, chat, setlists, search, members, settings, notifications, start, more, profile
   ├─ ui/              shared components, layout (AppShell, Page), styles/tokens
   ├─ locales/de/      one JSON file per namespace
   └─ test/            test setup + demo helper
```

Dependency direction: `features → core + ui (+ each other)`, `app → everything`, `ui → core`, `core → nothing` (two known exceptions: `core/session` loads members via `features/members`; `ui/Avatar` uses `initials` from the members model). Details: `92-code-map.md` §2.

## 8. App Data Folder on HiDrive

All data the app creates lives in one folder: `_BandApp/` (underscore so it sorts to the top and is clearly technical). The name stays generic on purpose, so renaming the app or supporting other bands later doesn't require moving data. Location: always directly in the HiDrive home folder (`<home>/_BandApp`), so every device finds it without extra input. The audio file scan (F4) always skips this folder.

```
_BandApp/
├─ app.json                              band name, color, logo paths, standard upload folder, scan settings (incl. suggestion folders)
├─ README.txt                            explains to humans what this folder is
├─ branding/logo-<light|dark>-<ms>.<ext> band logos (app-created)
├─ members/<memberId>.json
├─ tags/<tagId>.json
├─ songs/<songId>/
│  ├─ meta.json                          title, key, BPM, tuning, artist, tags, recordings, Band-Version, lyrics link, archive/hidden, merges
│  ├─ notes/public/<noteId>.json
│  ├─ notes/private/<memberId>/<noteId>.json
│  └─ practice/<memberId>.json           tempo / pitch / loop per member and version
├─ calendar/
│  ├─ events/<eventId>.json
│  ├─ exceptions/<eventId>/<YYYY-MM-DD>.json     changed or cancelled single dates of a series
│  ├─ answers/<eventId>/<occurrenceKey>/<memberId>.json
│  └─ export/band.ics, subscription.json         calendar subscription (target of the public share link)
├─ setlists/<setlistId>/
│  ├─ setlist.json
│  └─ personal-notes/<memberId>.json
├─ chat/
│  ├─ messages/<YYYY-MM>/<timestamp>_<messageId>.json
│  ├─ reactions/<messageId>/<memberId>.json
│  └─ read/<memberId>.json
├─ push/<memberId>/<deviceId>.json       Web Push subscription of one device
├─ reminders/<memberId>.json             a member's reminder settings (defaults per event type, per-event choices)
└─ exports/                              planned (L6): files the user explicitly exports
```

Band files (audio, lyrics, photos …) live elsewhere in the HiDrive home and are never changed; the app only creates new files there on upload or "In die Songliste übernehmen" (create-only, R-DATA-03).

Details per folder are defined in the feature files.

## 9. Glossary (German UI terms)

| Concept | UI term (de) |
|---|---|
| Song | Song |
| Rehearsal | Probe |
| Gig | Auftritt / Gig |
| Absence / vacation | Abwesenheit / Urlaub |
| Setlist | Setlist |
| Notes (public / private) | Notizen (für alle / nur für mich) |
| Version of a song | Version |
| Band default version | Band-Version |
| Practice view | Übungsansicht |
| A–B loop | A–B-Schleife |
| Archive / restore | Archivieren / Aus dem Archiv holen |
| Tag | Tag |
| Setlist block | Block (Set 1, Set 2, Zugabe) |
| Interlude between songs | Zwischenpunkt (z. B. Ansage) |
| Direct transition | Direkt weiter (roter Pfeil) |
| Stage view | Bühnenansicht |
| RSVP yes / maybe / no | Zusage / Vielleicht / Absage ("Ich bin dabei" / "Vielleicht" / "Ich kann nicht") |
| Recurring series | Serie / wiederholender Termin |
| Pitch / tempo | Tonhöhe / Tempo |
| Chat | Chat |
| Search | Suche |
| Settings | Einstellungen |

This list grows with the feature plans. Consistent wording is a rule (R-I18N-05).

## 10. Decision Log

| Date | Decision | Reason |
|---|---|---|
| 2026-09-24 | App data stored as JSON files on HiDrive, no own database | Band keeps control, no extra service to pay for |
| 2026-09-24 | `StorageProvider` abstraction from day one | Future cloud providers + multi-band |
| 2026-09-24 | One file per record | Avoid write conflicts |
| 2026-09-24 | Hosting on GitHub Pages (static only) | Free, simple; member login security is not critical, HiDrive login is the main security layer |
| 2026-09-24 | Songs = all audio files found anywhere on HiDrive (recursive scan) | No dependency on folder structure |
| 2026-09-24 | HiDrive auth: "server" app type + token helper on Cloudflare Workers (Option B) | Members connect once per device; hourly re-logins (Option A) would break ease of use |
| 2026-09-24 | GitHub Pages URL: `https://unterkraehe.github.io/BandOrganizer/` | GitHub user Unterkraehe, repo BandOrganizer |
| 2026-09-24 | OAuth redirect lands on a real static file `callback.html` | GitHub Pages can't serve SPA deep links without a 404 workaround |
| 2026-09-24 | Central audio engine with pitch/tempo (Web Audio + signalsmith-stretch) | Planned practice features in fullscreen song view |
| 2026-09-24 | App talks to the HiDrive API directly from the browser (no proxy) | CORS preflight tests passed for reading and writing (`Access-Control-Allow-Origin: *`, all methods, headers `authorization,content-type`) |
| 2026-09-24 | F2: no PIN, initials avatars, any member can deactivate others | Ease of use; HiDrive login is the real security layer |
| 2026-09-24 | F3: fixed menu (Start, Songs, Kalender, Chat + Mehr); dashboard = new messages, then the next 5 upcoming events (no time limit) | Ease of use, same app for everyone |
| 2026-09-24 | Setlist mode: open an event's setlist directly in Songs as a practice queue | Fast access during rehearsals and practice |
| 2026-09-24 | F4: files grouped manually as versions of a song; one Band-Version per song for everyone | Everyone practices the same recording |
| 2026-09-24 | F4 practice view v1: A–B loop, independent tempo/pitch, public (pinned first) and private notes | Practice needs of the band |
| 2026-09-24 | F5: recurring events, yes/maybe/no answers per occurrence, absences only for yourself, chat info lines only for changes/cancellations, .ics export; subscription via HiDrive share link (spike) | Band routine + personal calendars |
| 2026-09-24 | F4: band-wide song archive (hidden by default, shown at the end on demand) and custom tags; timestamp chips jump playback | Focus on current repertoire |
| 2026-09-24 | F7: setlists with blocks, interludes, direct transitions, public + personal entry notes; print per member; no page breaks inside blocks | Stage and rehearsal needs |
| 2026-09-24 | Rehearsal suggestions derived from setlists of past events (no extra tracking); no threshold, 10 least recently played | Simple, no additional data |
| 2026-09-24 | F6: chat is a management chat for app topics, not a WhatsApp replacement; messages can be tied to songs/events/setlists | Clear role, no duplicate of WhatsApp |
| 2026-09-24 | F8: search covers app items only (no HiDrive file search), grouped results, date search in v1 | Focus on band content |
| 2026-09-24 | Theme setting Hell / Dunkel / Wie System, default Wie System; stage view always dark, print always light | Stage use + user choice |
| 2026-09-24 | Neutral design with per-band color and optional logo; inspired by the band website but not branded | App may later serve other bands |
| 2026-09-24 | Overload branding: color `#E30613`, optional logo (dark/light variant); fonts Oswald + Inter | Derived from the band website, kept configurable |
| 2026-09-24 | Files can be uploaded from the app into a configurable upload root (one folder per song), create-only (never overwrite/move/delete); typed lyrics saved as new `.txt` per edit | Add content without opening HiDrive; data safety kept |
| 2026-09-26 | Styling with design tokens + CSS Modules instead of Tailwind | Tokens are the single source of truth; simpler to enforce R-UI-07 |
| 2026-09-26 | Neutral default band color "Messing" until a band sets its own | No pre-branding for other bands (R-UI-10) |
| 2026-09-30 | Work on the code starts from a hand-written code map (`92-code-map.md`) plus a generated index (`93-code-index.md`); maintenance scripts (`npm run check / map / serve / pack`); app flow tests split per feature (`src/app/flows/`) | Faster, safer changes: find the right file at once, run only the relevant tests, one command for CI-equivalent checks, reproducible deliveries |
| 2026-09-30 | Push notifications for chat messages and event changes via the token helper (`POST /push`, Web Push + VAPID, stateless); subscriptions stored in `_BandApp/push/` | Phones freeze background web apps – only push works reliably; no new server needed |
| 2026-10-01 | New events get a chat info line + push like changes ("… hat … eingetragen"); the open app checks the calendar for other members' changes every 60 s (20 s on calendar screens), reading only changed files | In a band test, members with the app open didn't see a new event until they reopened the app |
| 2026-10-01 | Reminders before events (F6 §4.7): each member sets their own (defaults per event type + per event, `_BandApp/reminders/<memberId>.json`). The token helper gets a Cron Trigger (every 5 min) and **one KV entry** with the next 8 weeks' reminders (event titles, times, places, push addresses), uploaded by the members' apps | Phones can't schedule notifications for a web app; a timer needs the data somewhere outside HiDrive. The band accepted titles/times on Cloudflare; a stored HiDrive login on the worker was rejected as riskier |
| 2026-09-30 | Optimistic writes everywhere users wait (song meta incl. grouping, notes, tags, answers, events, setlists): show at once, save in the background, roll back + message on failure. Demo option `?demo-latency=250` simulates HiDrive round trips | Each HiDrive write is 3–4 round trips; with mobile latency actions felt sluggish |
| 2026-09-30 | Tab swipe surface = whole screen with `touch-action: pan-y` on tab screens | Makes swipes real user activations; otherwise Chrome's history-manipulation intervention skips the entries and Back closes the app |
| 2026-09-30 | App-resume refresh (`core/resume.ts`): visibility, bfcache and heartbeat gap → all stores reload | Phones freeze background PWAs; data was stale after returning |
| 2026-09-29 | Printed setlist follows the band's existing paper layout (one block per page, Song/Interpret/Info, grey bars, DIREKT arrows); songs get an optional Interpret | Band is used to it on stage |
| 2026-09-29 | Pinch zoom disabled (app feel, band request); compensated by a text size setting (100/115/130 %) | Accessibility review: the only remaining automated finding is intentional |
| 2026-09-29 | Calendar subscription via HiDrive share link on `_BandApp/calendar/export/band.ics`; share links only allowed inside `_BandApp/` (guard) | F5 §6.5b; spike S4 decides whether the fallback is needed |
| 2026-09-29 | Search index on the main thread (MiniSearch), no Web Worker / IndexedDB in v1 | Fast enough for band-sized data; less complexity |
| 2026-09-28 | Chat info lines via an app-wide event bus (`core/events.ts`) | Features stay independent of the chat |
| 2026-09-28 | Calendar recurrences computed on the device (own engine, Berlin local time); answers remember the start they refer to | No extra library; "bitte prüfen" without extra writes |
| 2026-09-28 | Signalsmith Stretch vendored as static file, loaded on demand; Web Audio only while tempo/pitch ≠ original | Library breaks when bundled; best iOS background behaviour |
| 2026-09-28 | PDF lyrics with pdf.js v4 legacy build | v5+ uses JS features missing in current Chromium/older Safari |
| 2026-09-28 | Uploads: member picks the folder for every audio file, lyrics file and typed lyrics, anywhere in the HiDrive home, create-only | Band keeps its own folder structure; data safety unchanged (never overwrite/move/delete) |
| 2026-09-28 | Song list gets an optional folder view (compact paths; tree ≥ 768 px, step-into on phones), built with M3b | Band wants to browse by HiDrive structure |
| 2026-09-28 | Song metadata updates are field-level read–modify–write on the latest `meta.json`; conflict only when the same field changed | Fewer false conflicts, still R-DATA-07 |
| 2026-09-28 | Deterministic recording IDs (`r_` + hash of file ID/path) | Band-Version and note markers identical on all devices |
| 2026-09-28 | Demo mode ships generated demo songs (WAV, no copyright) | Test playback incl. iPhone lock screen (S3) before HiDrive access |
| 2026-09-28 | Player v0 = `<audio>` + blob URL; Web Audio only while effects are active (M4) | iOS background playback |
| 2026-09-28 | App data folder fixed at `<home>/_BandApp` (not configurable) | New devices must find it without asking |
| 2026-09-28 | Demo mode with in-memory storage | Try the app without HiDrive; UI tests; band preview before login works |
| 2026-09-28 | Token helper deployed at `bandorganizer-auth.ostworkers.workers.dev` | Cloudflare subdomain `ostworkers` |
| 2026-09-24 | App name: "Overload App" | May change later, kept in config only |
| 2026-09-24 | Target band size: 3–12 members | Drives UI for member lists, chat, availability |

## 11. Open Questions (project-wide)

### Open

1. **HiDrive developer registration:** in progress on your side. App type **"server"**, redirect URL `https://unterkraehe.github.io/BandOrganizer/callback.html`.

### Resolved

| # | Question | Answer |
|---|---|---|
| – | Hosting | GitHub Pages |
| – | HiDrive login type | Option B: "server" app type + token helper |
| – | Tech stack | Proposal accepted (works on GitHub Pages) |
| – | HiDrive folder structure | Ignored for songs: all audio files are found automatically |
| – | App name | Overload App (for now) |
| – | Band size | 3–12 members |
| – | GitHub | User `Unterkraehe`, repo `BandOrganizer` |
| – | First-time setup | Anyone, as long as the band was never set up |
| – | Library size | ~100 audio files |

## 12. Prerequisites & Spikes (before/at the start of implementation)

| # | Item | Who | Blocks |
|---|---|---|---|
| P1 | Register the app at the HiDrive developer portal: type **"server"**, redirect URL `https://unterkraehe.github.io/BandOrganizer/callback.html` | Band | F1 and everything else |
| P2 | Create GitHub repo `Unterkraehe/BandOrganizer` (public) and enable GitHub Pages | Band | Deployment |
| P3 | ✅ Cloudflare account (`ostworkers.workers.dev`) – deploy token helper via dashboard (`token-helper/README.md`) | Band | F1 login |
| S1 | Real-token API check: `ETag`/`Access-Control-Expose-Headers`, file metadata for conflict checks | Dev | F1, R-DATA-07 |
| S2 | Are HiDrive file IDs stable across rename/move? | Dev | F4 song identity |
| S3 | ✅ Playback on a real iPhone (installed PWA) incl. lock screen – passed 2026-09-28. Pitch/tempo CPU + background with Web Audio → retest in M4 | Dev + band member with iPhone | F9, F4 |
| S4 | HiDrive share link as calendar subscription (raw file, stable after overwrite, works in iOS/Google/Outlook) | Dev | F5 subscription |
| S5 | `.ics` single export from installed PWA on iPhone and Android | Dev | F5 export |
| S6 | HiDrive upload of large files: size limits, chunked/resumable upload, behaviour on abort | Dev | F10 |
