# Implementation Roadmap

> **Status:** M0–M9 built · v0.15.0 = release candidate: the band test phase decides when it becomes **1.0.0** · open tests: S1/S2 (file IDs, ETag), S4 (share link as calendar subscription), S5 (.ics on phones), S6 (large uploads), iPhone with tempo/pitch + lock screen, chat input with keyboard on iPhone/Android, push notifications and event reminders on real devices (needs KV + Cron Trigger in the token helper), HiDrive copy (`POST /file/copy`)
> Order and scope of the build, from an empty repository to v1.0. Each milestone ends with a **deployed version the band can use and test**.

## 1. Principles

1. **Usable after every milestone.** Every milestone is deployed to GitHub Pages and tested by the band. Features that aren't ready simply don't appear in the menu (feature registry, R-CODE-02) – no half-finished screens.
2. **Risky things first.** HiDrive login, the file access, the safety guard and audio on iPhones are tested as early as possible, because they can change the architecture.
3. **Foundations before features.** Safety guard, storage abstraction, i18n and design tokens exist before the first feature uses them – retrofitting them later is expensive.
4. **Docs first (R-CODE-07).** Each milestone starts by re-reading the relevant docs and ends by updating statuses, decision log and any changed details.
5. **Small steps.** Inside a milestone, work happens in small, reviewable changes (R-CODE-08).

## 2. Overview

| # | Milestone | Main content | What the band can do afterwards | Size |
|---|---|---|---|---|
| M0 ✅ | **Fundament** | Project setup, deployment, design system, i18n, storage abstraction + safety guard | Open the (empty) app, install it, switch themes | M |
| M1 🟡 | **Verbinden** | Token helper, HiDrive login, band setup, member profiles, settings | Connect every device, create profiles, set band color/logo | M |
| M2 ✅ | **Hören** | File scan, song list, basic player, mini player, song detail | Browse and play all songs on any device | M |
| M3 ✅ | **Songbibliothek** | Lyrics, notes, metadata, versions/Band-Version, archive, tags, **new songs & uploads**, **folder view** | Read lyrics, write notes, organize the repertoire, add new songs and recordings from the app | L |
| M4 ✅ | **Üben** | Pitch/tempo engine, A–B loop, practice view | Practice with tempo, pitch and loops | M |
| M5 ✅ | **Planen** | Calendar, recurring events, answers, absences, .ics export, dashboard events | Plan rehearsals and gigs, answer, export dates | L |
| M6 ✅ | **Setlists** | Setlist editor, print, stage view, setlist mode, suggestions | Build setlists, print them, use them on stage and for practice | L |
| M7 ✅ | **Austauschen** | Chat, item discussions, cards, info lines, unread badges | Discuss app topics in context | M |
| M8 ✅ | **Finden** | Global search incl. lyrics lines and date search | Find anything in the app from anywhere | M |
| M9 🟡 | **v1.0** | Calendar subscription, polish, accessibility and performance review, band test | Everything in v1, stable | M |

Sizes are relative (S/M/L), not time estimates.

```
P1–P3 (band) ──► M0 ──► M1 ──► M2 ──► M3 ──► M4
                                  │      └──────────► M6 ◄── M5
                                  │                    │
                                  └──► M5              └──► M7 ──► M8 ──► M9
```

M0 can start **before** the HiDrive registration is approved.

## 3. Prerequisites (band, start now)

| # | Task | Needed for |
|---|---|---|
| P1 | HiDrive developer registration: type "server", redirect `https://unterkraehe.github.io/BandOrganizer/callback.html` (can take up to 72 h) | M1 |
| P2 | GitHub repository `Unterkraehe/BandOrganizer` (public), Pages enabled via GitHub Actions | M0 |
| P3 | Free Cloudflare account | M1 |
| P4 | One band member with an iPhone and one with Android available as testers | M2, M4 |

## 4. Milestones in Detail

### M0 – Fundament

**Goal:** a deployed, empty but well-structured app that everything else builds on.

Scope:
- Vite + React + TypeScript (strict), folder structure as in overview §7, lint/format, test setup (Vitest + Testing Library, Playwright for later E2E).
- GitHub Actions: test → build → deploy to GitHub Pages; base path `/BandOrganizer/`, SPA fallback, static `callback.html` placeholder (R-CODE-09).
- PWA: manifest, neutral app icon, service worker with update prompt (F3 §6.4), install hint.
- i18n setup (i18next, `de` namespaces, formatters in `core/i18n/`) (R-I18N).
- Design system: tokens (colors, fonts self-hosted, spacing), light/dark/system theme without flash, base components in `src/ui/` (02-design-system).
- App shell skeleton: bottom bar / rail / sidebar driven by the feature registry, top bar, empty start screen, settings with "Darstellung" (F3).
- `core/storage`: `StorageProvider` interface, **safety guard with unit tests** for both zones (app folder, create-only upload root) (R-DATA-04), in-memory provider for tests.
- `core/data`: record base fields, ID generation, schema versioning + migration helpers (R-DATA-08/09).

Done when: the app is live at `https://unterkraehe.github.io/BandOrganizer/`, installable, theme switch works on phone/tablet/desktop, guard tests pass in CI.

### M1 – Verbinden

**Goal:** every member connects a device and has a profile.

Scope:
- Token helper on Cloudflare Workers (`/token`, `/refresh`, origin-restricted, no storage, no logging) (F1, R-CODE-10).
- HiDrive OAuth flow, silent token refresh, "Verbindung trennen" (F1 §4).
- `HiDriveProvider` (read + guarded write), conflict check via metadata (R-DATA-07).
- **Spikes S1** (ETag/metadata) and **S2** (file ID stability) – results into F1/F4 docs.
- First-time band setup: `_BandApp/` + `app.json` + README, band name, band color (F1).
- Member profiles: "Wer bist du?", create/edit, switch/logout, members overview, deactivate/reactivate (F2).
- Upload module core (F10): create-only upload into the upload root, progress, retry, type/size checks; **Spike S6**.
- Settings: Mein Profil, HiDrive, Band (name, color, upload folder, **logo upload** dark/light – first user of the upload module), Darstellung, Über die App.
- Start screen greeting with band logo/name.

Done when: all members have connected at least one device and created a profile; band design is set; nothing outside `_BandApp/` was written (verified by inspecting HiDrive).

### M2 – Hören

**Goal:** the first real everyday value – all songs playable everywhere.

Scope:
- Recursive file scan with progress, exclusions, caching, incremental rescans (F1 §4).
- Song derivation, deterministic song IDs, title cleaning (F4 §5, §6.1–6.2).
- Song list: search (shared normalizer `core/search/normalize.ts`), sort, "Neu" filter, ▶ from the list (F4 §4.1).
- Audio engine v0: fetch with auth, decode, play/pause/seek, one global instance, Media Session (lock screen), duration measurement stored in `meta.json` (F9, F4 §6.6).
- Mini player; song detail with basic player (no lyrics/notes yet).
- **Spike S3 early in M2:** playback on a real iPhone/Android as installed PWA, including locked screen. If Web Audio stops in the background → implement the documented fallback (plain `<audio>` when no effects are active) before continuing.

Done when: the band uses the app to listen to songs on phones and laptops; playback continues while navigating and on the lock screen (or the fallback is in place).

### M3 – Songbibliothek

**Goal:** the song library is complete (except practice tools).

Scope:
- Lyrics: renderer registry + PDF, DOCX, TXT renderers, suggestion-based matching, manual linking, file picker (F4 §6.3).
- Notes: public/private, pinning, timestamps with jump-to-position chips, seek-bar markers, edit/soft delete/undo (F4 §6.4).
- Metadata editing: title, key, BPM (with tap tempo), tuning (F4 §4.4).
- Versions & Band-Version: grouping, suggestions, split, version selector (F4 §6.8).
- Archive, tags (incl. tag management), "Ist kein Song – ausblenden" (F4 §6.5, §6.10, §6.11).
- **Folder view** for the song list (F4 §4.1a): toggle Liste/Ordner, compact paths, tree on tablet/desktop, step-into navigation on phones.
- **Folder picker for uploads** (F10 §4.2) + guard change: whole home = create-only zone (R-DATA-03/04), with tests.
- **Adding content (F10):** "Neuer Song" (with or without recording), "Aufnahme hinzufügen", "Songtext hochladen", **"Songtext eintippen" / edit `.txt` lyrics with history**, drag & drop on desktop, duplicate detection, upload indicator.
- "In Setlists" section prepared (filled in M6).
- System events for info lines (e.g. Band-Version changed) are **recorded** already; they appear in the chat once M7 exists.

Done when: the band has grouped versions, set Band-Versions, linked lyrics and written first notes; archive and tags are in use.

### M4 – Üben

**Goal:** practicing with the app.

Scope:
- signalsmith-stretch integration (AudioWorklet/WASM): independent tempo and pitch (F9).
- A–B loop, practice settings per member/song/version (F4 §6.9, §7.4).
- Practice view (fullscreen): lyrics, notes panel (pinned first, timestamps), controls, wake lock (F4 §4.3).
- Performance check on older phones (`presetCheaper` if needed).

Done when: members practice with slowed-down/transposed songs and loops on phone and desktop without audible glitches.

### M5 – Planen

**Goal:** the band plans dates in the app.

Scope:
- Event types, list + month view, filters, past events (F5 §3–4).
- Create/edit with smart defaults, cancel vs. delete (F5 §4.3, §6.3).
- Recurring events with exceptions and edit scopes (F5 §5).
- Answers yes/maybe/no with comments, "abwesend" derivation, "bitte prüfen" after changes (F5 §6.1).
- Absences (own only), conflict hints (F5 §6.2).
- Start screen widget "Nächste Termine" with answer buttons and absences (F3 §4.1).
- `.ics` single and bulk export; **Spike S5** (F5 §6.5a).
- Setlist link field prepared (used in M6).

Done when: the next rehearsals and gigs are in the app and members answer there.

### M6 – Setlists

**Goal:** setlists from creation to stage.

Scope:
- Setlist overview, create empty / from previous, duplicate (F7 §4.1, §6.5).
- Editor: blocks, pauses, song picker (search, tags, archive at the end, multi-select), drag & drop incl. touch, interludes, direct transitions, entry notes, personal notes, durations, undo/redo, conflict handling (F7 §4.3, §6).
- Linking with events (both directions), "Setlist üben" everywhere (F7 §5).
- **Setlist mode** in Songs + engine queue with auto-advance, preloading, segues (F3 §5, F9 queue).
- Stage view and print (per member, no page breaks inside blocks) (F7 §4.4–4.5).
- Rehearsal suggestions "Lange nicht gespielt" (F7 §6.6).
- Song detail "In Setlists" filled.

Done when: the setlist for the next gig was built, printed and used in the app; a rehearsal setlist used the suggestions.

### M7 – Austauschen

**Goal:** app-related communication in the app.

Scope:
- Band chat: messages, replies, reactions, edit/delete, date separators, unread divider (F6).
- Polling strategy, shared read status across devices, unread badge (F6 §4.3–4.4).
- Item cards (song/event/setlist) and item discussions on detail screens (F6 §3.2).
- Info lines, including the system events recorded since M3/M5 (F6 §4.2).
- Start screen widget "Neue Nachrichten" (F3 §4.1).

Done when: discussions about gigs/setlists happen in the app next to the items.

### M8 – Finden

**Goal:** one search for everything.

Scope:
- Search index in a Web Worker, persistence, incremental updates, per-member scope and cleanup on logout (F8 §6).
- Sources from all features (`search.ts` per feature), lyrics text extraction in the background.
- UI: command palette (desktop) / full screen (phone), grouped results, filters, recent searches, highlight targets (lyrics line, note, message) (F8 §3).
- Date search (F8 §5).

Done when: typing a lyric fragment, a venue or "okt" finds the right items in under a second on a phone.

### M9 – v1.0

**Goal:** stable, complete v1.

Scope:
- Calendar subscription via HiDrive share link; **Spike S4**; fallback through the token helper if needed (F5 §6.5b).
- Accessibility review (keyboard, screen reader, contrast in both themes, 200 % zoom).
- Performance review (start time, list sizes, memory during playback).
- Error/empty/loading states reviewed on every screen (R-UX-03).
- E2E tests for main flows (connect, play, note, event answer, setlist print).
- Band test phase (1–2 weeks of real use), bug fixing, docs update, version 1.0.0.

Done when: the band uses the app for a full rehearsal-and-gig cycle without falling back to the old way.

## 4a. Releases since the release candidate

| Version | What changed |
|---|---|
| 0.12.1 – 0.12.3 | Printed setlist in the band's own paper layout; larger, bolder text and new "DIREKT" arrows; print preview shows the real A4 page; swipe surface = whole screen (Back works after swiping); app refreshes after a long time in the background; more generous search; song versions in the preview |
| 0.12.4 | Version suggestions by similarity (all "Holy Diver" file name variants) |
| 0.12.5 | Optimistic updates everywhere users wait; song page no longer scrolls sideways with long file names |
| 0.13.0 | Push notifications (chat messages, event changes) through the token helper |
| 0.13.1 | ⋯ menus drawn above everything, with a raised background |
| 0.13.2 – 0.13.3 | Member suggestions ("Vorschläge") in their own section; "In die Songliste übernehmen" copies the Band-Version out of Vorschläge |
| 0.13.4 | Song list toolbar in two rows (switches, then filters) |
| 0.13.5 | Chat opens at the unread divider / newest message again (the router's scroll reset had moved it to the top) |
| 0.14.0 | Reminders before events: per member, defaults per event type + per event; sent by the token helper's timer (Cron Trigger + KV) |
| 0.14.1 | Test notification is shown even while the app is open (Android hid it) |
| 0.14.2 | "Aktualisieren" always ends in a reload (own update sequence instead of the plugin's) |
| 0.14.3 | Calendar picks up other members' changes while open (incremental refresh); new events announced in chat + push |
| 0.14.4 | Month view on phones: tapping a day opens its events in a panel from the bottom |
| 0.14.5 | Practice view fits phones with a version dropdown; rule R-UI-14 (no sideways scrolling) + `overflow-check.py` |
| 0.15.0 | Navigation & clarity step 1: rule R-UX-09, navigation map, ← back on every sub-screen, screen motion (push / back / tab) |

Details per change: feature files (status blocks) and the "Was ist neu" texts in `src/locales/de/whatsNew.json`.

## 4b. Navigation & clarity (plan of 2026-10-01)

Band feedback: navigation is confusing (no way back, mini player opens the song page, song page and practice view look alike, setlist playback takes over the Songs tab, setlists behave differently depending on where they are opened). Rule R-UX-09 + navigation map (`features/12-main-menu.md` §4.5). Released step by step:

| Step | Content | Status |
|---|---|---|
| 1 | Rule R-UX-09, navigation map, ← back everywhere (`Page` + `useBack`), screen motion | ✅ v0.15.0 |
| 2 | One full-screen player growing out of the mini player (replaces the practice view); setlist playback as the player's queue instead of `/songs?setlist=` | open |
| 3 | Calmer song page: info page with one "Abspielen", tabs Songtext / Notizen / Versionen / Infos, rare actions in ⋯ | open |
| 4 | Setlists unified: one setlist page from every entry point, event page with compact setlist card, actions in ⋯ | open |
| 5 | Review of all remaining screens against R-UX-09 | open |

## 5. Definition of Done (every milestone)

- [ ] All visible texts German via i18n keys (R-I18N-02)
- [ ] Works and looks right on phone, tablet, desktop – in light and dark theme
- [ ] Loading, empty, error states present (R-UX-03)
- [ ] No write outside `_BandApp/` (guard tests green, R-DATA)
- [ ] Tests for new repositories/migrations; CI green
- [ ] Deployed to GitHub Pages; update prompt works
- [ ] Docs updated: feature status, decision log, changed details (R-CODE-07)
- [ ] Short changelog for the band ("Was ist neu")

## 6. Versioning & Releases

- Milestone releases: `0.1.0` (M0) … `0.9.0` (M8), `1.0.0` after M9.
- Every deploy shows "Neue Version verfügbar" in the running apps (F3 §6.4).
- A short German "Was ist neu" note per release, shown once after updating (small addition to F3, to be specified in M0).

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| HiDrive registration delayed | M1 blocked | Start P1 now; M0 is independent |
| Large uploads fail on mobile connections (S6) | New songs/recordings can't be added reliably | Resumable upload if available, retry, size warnings |
| File IDs not stable (S2) | Notes could detach after renames | Re-matching by name + size (F4 §6.1), tested in M1 |
| iOS stops Web Audio in background (S3) | Practice/listening on iPhone limited | Fallback plan in M2 before building M4 on top |
| Pitch/tempo too heavy on old phones | Glitches | `presetCheaper`, limit ranges, test in M4 |
| HiDrive share link unusable for subscriptions (S4) | No auto-updating calendars | Fallback via token helper, or single export only |
| HiDrive API rate limits with 12 devices polling | Errors in chat/updates | Conservative polling (F6 §4.3), back-off |
