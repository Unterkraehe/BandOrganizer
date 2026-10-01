# General Rules

> These rules apply to **every** part of the app and **every** change to the code.
> If a feature file seems to conflict with a rule here, this file wins — and the conflict must be resolved in the docs before coding.
> Rules have IDs so they can be referenced in code reviews, commits and feature files.

---

## 1. Data Safety (R-DATA) — highest priority

**R-DATA-01 — Never delete foreign data.**
The app must never delete, overwrite, move or rename any file or folder it did not create itself.

**R-DATA-02 — Foreign files are read-only.**
All files that existed on HiDrive before the app, or were put there by humans, are treated as strictly read-only.

**R-DATA-03 — Where the app may write.**
- App data (JSON records) lives only in the app data folder (`_BandApp/`, overview §8).
- **Uploaded files** (songs, lyrics – F10) go into the folder the member chooses, anywhere in the HiDrive home except `_BandApp/`, **create-only**: always new files (and new folders on explicit request), never overwriting, moving or deleting anything, not even the app's own uploads (v1). On name clash a suffix is added (`Song (2).mp3`). The band logo is stored in `_BandApp/branding/`.
- Explicit exports follow the same create-only rule.

**R-DATA-04 — One safety guard, no bypass.**
Every write, move, rename and delete operation goes through a single guard in `core/storage/`. The guard knows two zones: the app data folder (all app operations allowed) and the rest of the HiDrive home (**create-only**: new files and folders only). Nothing outside the home is ever written; existing files and folders are never changed, moved or deleted. No feature code may call the storage API directly for write operations. The guard must have unit tests.

**R-DATA-05 — Soft delete for app data.**
When a user "deletes" something in the app (a note, message, event, setlist), it is marked as deleted (`deletedAt`, `deletedBy`) instead of removing the file. Hard deletes of app data only happen through an explicit maintenance function, if ever.

**R-DATA-06 — One file per record.**
Each record (message, note, event, setlist, profile) is its own JSON file to avoid conflicting writes.

**R-DATA-07 — Safe updates.**
Updates to a record check that the file has not changed since it was loaded (timestamp/ETag). On conflict: never silently overwrite — show the user both versions or reload and inform them.

**R-DATA-08 — Versioned schema.**
Every JSON file contains `schemaVersion`. The app must read older versions and migrate forward; it must never fail on unknown extra fields.

**R-DATA-09 — Standard record fields.**
Every record contains: `id`, `schemaVersion`, `createdAt`, `createdBy` (memberId), `updatedAt`, `updatedBy`, and optionally `deletedAt`, `deletedBy`. Timestamps in ISO 8601 UTC.

**R-DATA-10 — Human-readable app folder.**
`_BandApp/README.txt` explains in German what the folder is and asks people not to edit it manually.

## 2. Language & Internationalization (R-I18N)

**R-I18N-01 — German only in v1, but i18n-ready.**
The whole UI is in German. The code is built so other languages can be added by adding translation files only.

**R-I18N-02 — No hardcoded UI text.**
Every visible string (labels, buttons, errors, empty states, notifications, `aria-label`s) comes from translation files (`src/locales/de/<namespace>.json`). Code, comments, file names and docs are in English.

**R-I18N-03 — Locale-aware formatting.**
Dates, times, numbers and durations are formatted with the `Intl` API via shared formatters in `core/i18n/`. Never build date strings by hand. Default locale: `de-DE`, time zone: `Europe/Berlin` for display, UTC for storage.

**R-I18N-04 — Plurals and variables via i18n.**
Use i18next plural and interpolation features ("1 Song" / "5 Songs"), never string concatenation.

**R-I18N-05 — Consistent wording.**
Use the glossary in `00-overview.md` §9. Address users informally ("du"). *(To be confirmed.)*

**R-I18N-06 — Keys are structured.**
Translation keys follow `<feature>.<screen>.<element>`, e.g. `songs.detail.addNote`.

**R-I18N-07 — App name is configurable.**
The app name ("Overload App") appears only in the translation key `app.name` and in the build config for the manifest. Never hardcode it anywhere else.

## 3. Responsive Design (R-UI)

**R-UI-01 — Mobile first.**
Design for phone first, then scale up to tablet and desktop. Every screen must work on 360 px width.

**R-UI-02 — Breakpoints.**
Phone `< 768 px`, tablet `768–1199 px`, desktop `≥ 1200 px`. Use the shared layout components, not ad-hoc media queries.

**R-UI-03 — Navigation pattern.**
Phone: bottom navigation bar for the most important features + "Mehr" for the rest. Tablet/desktop: side navigation. Details in `features/12-main-menu.md`.

**R-UI-04 — Touch friendly.**
Interactive elements at least 44 × 44 px. No functionality that is only reachable via hover or right-click.

**R-UI-05 — Keyboard and screen reader friendly.**
All actions reachable by keyboard; visible focus states; semantic HTML; meaningful labels. Target: WCAG 2.1 AA.

**R-UI-06 — Light and dark mode.**
Settings offer "Wie System" (default), "Hell" and "Dunkel". Every screen is designed for both themes. Exceptions: stage view always dark, print always light (`02-design-system.md` §2).

**R-UI-07 — Shared components and design tokens only.**
Buttons, inputs, lists, dialogs, etc. come from `src/ui/`. Colors, fonts, spacing and radii only via the tokens in `02-design-system.md` – no hardcoded values in features.

**R-UI-10 — No hard branding.**
Nothing band-specific (colors, logo, name) is hardcoded. Band identity comes only from the configurable branding in `_BandApp/app.json` (`02-design-system.md` §8).

**R-UI-08 — Safe areas and installability.**
Respect device safe areas (notches), provide app icons and a manifest so the app can be installed to the home screen.

**R-UI-11 — Calm layout: nothing moves under the finger.**
An element that is tapped repeatedly or "blindly" (answer buttons, +/−, play/pause, tabs, filters, reset) must never change its position or size because of the tap or because data arrives. Rules of thumb: (1) content that appears/disappears **above or beside** a tap target reserves its space (blank line, disabled button, `visibility: hidden`) or moves **below** the target; (2) counts/values in fixed-width slots (tabular numbers); (3) titles and list rows keep one line (ellipsis), so header and row heights are constant; (4) bottom space for the mini player is always reserved; (5) floating things (toasts, upload indicator, chat input) sit above the bottom bar / mini player / keyboard, never on top of controls; (6) spinner and icon swaps keep the same size. Verified with the layout-shift audit (see docs §Quality checks).

**R-UI-12 — Touch behaviour.**
No pinch/double-tap zoom (meta viewport + iOS gesture events + `touch-action: manipulation`); inputs are at least 16 px so iOS never zooms into them; no rubber-band/pull-to-refresh on the app frame; every tap gives immediate press feedback; the app chrome is not text-selectable. Swiping horizontally on a bottom-bar screen moves to the neighbouring tab – but never inside sliders, text fields, dialogs, scrollable rows or within 24 px of the screen edge (system back gesture).

**R-UI-13 — Long lists are windowed.**
Lists that can exceed ~60 rows (songs, chat history in the future) render only the rows around the viewport (`VirtualList`) with fixed row heights, memoized rows and lazily built row menus. Tapping a tab must respond in well under 150 ms on a mid-range phone with 300 songs.

**R-UI-09 — Designed for 3–12 members.**
Anything that lists members (chat, absences, availability, note authors) must stay readable with 12 people on a phone screen. Member colors come from a fixed palette of at least 12 clearly distinguishable colors.

## 4. Ease of Use (R-UX) — main UX rule

**R-UX-01 — Two taps to anything important.**
The most common tasks (play a song, see next date, open chat, open a setlist) are reachable within two taps from the start screen.

**R-UX-02 — Plain German, no tech speak.**
No terms like "sync", "token", "JSON", "API" in the UI. Errors explain what happened and what to do next ("Keine Verbindung zu HiDrive. Bitte prüfe deine Internetverbindung.").

**R-UX-03 — Always show state.**
Every screen has defined loading, empty, error and success states. No blank screens, no silent failures.

**R-UX-04 — Forgiving interactions.**
Prefer undo over confirmation dialogs. Confirmation dialogs only for actions that are hard to reverse.

**R-UX-05 — Sensible defaults.**
Forms are pre-filled wherever possible (e.g. new event: next Friday 19:00 for rehearsal). Minimum number of required fields.

**R-UX-06 — Consistency.**
Same action = same icon, same position, same wording across all features.

**R-UX-07 — Fast feel.**
Show cached data immediately and refresh in the background. Actions update the UI instantly (optimistic updates) and roll back with a message if saving fails.

**R-UX-08 — Audio keeps playing.**
Song playback continues while navigating through the app (persistent mini player).

## 5. Architecture & Code (R-CODE)

**R-CODE-01 — Storage only via `StorageProvider`.**
No feature imports HiDrive-specific code. HiDrive is one implementation of the provider interface.

**R-CODE-02 — Features are modules.**
Each feature lives in `src/features/<name>/` with the standard layout (overview §7) and registers itself (menu entry, routes, search contribution). Adding a feature must not require changes in other features.

**R-CODE-03 — Band-aware data.**
Every repository call is scoped to the active band/storage context, even though v1 has only one band. (Prepares multi-band support.)

**R-CODE-04 — No secrets in the client.**
The HiDrive client secret and similar credentials live only in the token helper's environment variables (Cloudflare secrets), never in the repository or the browser bundle.

**R-CODE-10 — Token helper stays tiny.**
The token helper exchanges authorization codes and refresh tokens and – since v0.13 (decision log 2026-09-30) – delivers push notifications the app prepared, and – since v0.14 (decision log 2026-10-01) – sends reminders before events from one KV entry the app uploads (the only thing it stores). It stores nothing else, logs no tokens or messages, accepts requests only from the app's own origin, never handles files, sends pushes only for a valid login of the band's HiDrive account and only to real push services. Any further responsibility needs a decision-log entry first.

**R-CODE-11 — Subscribe to slices, not to everything.**
Frequently changing state (player position ~4×/s, chat polling) must be read through selectors (`usePlayerSelect`, `useSyncExternalStore` with a stable snapshot). A screen that only needs "which song is playing" must not re-render while the position ticks. Dialogs and menus render in a portal at the top level of the page.

**R-CODE-05 — TypeScript strict mode.**
No `any` without a comment explaining why.

**R-CODE-06 — Tests for the critical parts.**
Required: safety guard (R-DATA-04), data migrations (R-DATA-08), repositories. UI tests for main flows.

**R-CODE-07 — Docs first.**
Before implementing or changing a feature, its feature file is updated. The feature file's status and the overview's feature index are kept current. Every larger technical decision goes into the decision log (overview §10). When the structure changes (new feature, storage path, provider, shared mechanism, convention), `docs/92-code-map.md` is updated as well; `npm run map` regenerates the code index.

**R-CODE-08 — Small, reviewable changes.**
One feature or sub-feature per change; commit messages in English, referencing feature IDs (e.g. `F4: add song list sorting`).

**R-CODE-12 — Code map first.**
Before changing code, read `docs/92-code-map.md` (concepts, data layout, recipes, gotchas) and look files up in `docs/93-code-index.md` (generated). Work in this order: find the files → change → run the relevant tests (`npm run check -- <filter>`) → `npm run check` before anything is delivered. Deliveries are made with `npm run pack`, which never includes `src/config.ts` (it holds the band's own HiDrive client ID).

**R-CODE-09 — Static hosting on GitHub Pages.**
The app must run as static files. Routing works under the repository sub-path (configurable base path) and survives page reloads on deep links (SPA fallback). The repository is public on the free GitHub plan, so nothing confidential may ever be committed (see R-CODE-04). The token helper (F1) lives in `token-helper/` and is deployed separately to Cloudflare Workers.

## 6. Privacy & Security (R-SEC)

**R-SEC-01 — Honest privacy.**
Because all members share the same HiDrive login, "private" data (e.g. private notes) is only hidden in the app, not technically secret. The UI must not promise more than that (e.g. "Nur für dich sichtbar in der App").

**R-SEC-02 — HTTPS only.**
App and backend are served exclusively over HTTPS.

**R-SEC-03 — Minimal data.**
Store only what a feature needs. No tracking or analytics without the band's explicit decision.

**R-SEC-04 — Device logout.**
Every device can log out of the member profile and disconnect HiDrive in the settings.

## 7. Feature File Template

Every file in `features/` uses this structure:

1. Header (ID, status, dependencies)
2. Goal
3. User stories
4. Screens & UI
5. Behaviour & rules (feature-specific, must not conflict with this file)
6. Data model & storage
7. Search contribution
8. Edge cases & errors
9. Open questions
10. Out of scope / later
