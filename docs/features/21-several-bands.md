# F12 – Several Bands in One App

| | |
|---|---|
| **ID** | F12 (was future plan L2) |
| **Status** | Planned (2026-10-05) – milestone M11 |
| **Depends on** | F1 (session, login, token helper), F2 (profiles), F3 (shell), F11 (device data per band) |
| **Used by** | F13 OneDrive (only if the second band chooses OneDrive) |

## 1. Goal & Positioning

One installed app for several bands. A second band is starting to use the app, with its own members and its own cloud storage – a second HiDrive account or OneDrive (F13), still to be decided by the band. This feature works with HiDrive alone. Some people – like the maintainer – play in both and switch between them on one phone; most members only ever see their one band.

Each band stays completely separate: own storage account, own members, own name/color/logo, own data. Nothing is shared between bands.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I play in two bands: I switch between them with two taps and land on the other band's start screen. |
| US-2 | I get notifications from both bands; tapping one opens the right band at the right place. |
| US-3 | I add a second band on my phone without losing the first one. |
| US-4 | A member of only one band never notices that the app can do more. |
| US-5 | I remove a band from my phone; its login and saved data are gone from the device. |

## 3. Screens & UI

- **Band switcher:** tapping the band logo/name on the start screen (phone) or in the sidebar header (desktop) opens a sheet "Band wechseln": one row per band on this device (logo, name, "als Lisa"), the active one checked, at the bottom "Band hinzufügen". Shown only when the device has more than one band; with one band the logo does nothing (as today) and "Band hinzufügen" lives in the settings.
- **Switching:** short transition in the new band's color, then the new band's start screen (R-UX-09: motion explains where you are). Playback stops – no music of band A while looking at band B.
- **Einstellungen → "Bands"** (`/settings/bands`): list of the bands on this device, "Band hinzufügen", per band "Von diesem Gerät entfernen" (confirm; data on the cloud stays untouched).
- **"Band hinzufügen":** the existing first-start flow – choose storage (only once a second provider exists, F13; with HiDrive only this step is skipped) → login → band setup or join → profile. "Abbrechen" returns to the previous band.
- Navigation map (F3 §4.5): switcher sheet from Start; Einstellungen → Bands.

## 4. Behaviour & Rules

### 4.1 Connections on the device
A **connection** = one band on this device:
`{ id, provider: 'hidrive' | 'onedrive', tokens, home, appRoot, alias, bandId, bandName, color, memberId }`.
The list lives on the device (`bandapp.connections`); tokens are stored per connection (today one global key `bandapp.hidrive.tokens`). **Migration:** on the first start of this version the existing tokens + remembered member become connection 1 – nobody has to log in again.

One band = one storage account (the band's own account, as today: `<home>/_BandApp`). Two bands in one account would need a band-folder choice – out of scope.

### 4.2 Active band
Exactly one band is active. Switching remounts every provider below the session with the connection as React `key` (Library, Uploads, Calendar, Reminder, Setlist, SetlistMode, Chat, Search, Player) – stores, polling and caches of the old band are dropped cleanly. Only the active band polls.

### 4.3 Device data per band
Everything band-related on the device is keyed by band: F11's IndexedDB data and files, and these `localStorage` keys that are global today: `bandapp.hidrive.tokens`, `bandapp.recentSongs`, `bandapp.setlistMode`, `bandapp.songs.expandedFolders`, `bandapp.uploads.lastAudioFolder`, `bandapp.uploads.lastLyricsFolder`, `bandapp.lyricsText`. Already per band: chat, calendar, library, setlists, reminders, member, recent searches. Pure device preferences stay global (theme, text size, sort/view, print and stage options).

### 4.4 Notifications
- The push payload gets the band: `url: "chat?message=…&band=<bandId>"` (`features/notifications/payload.ts`); reminders the same.
- Tap: `NotificationNavigator` / `push-sw.js` → if the band isn't active, switch first, then navigate. Unknown band (removed from the device): open the app with a toast "Diese Band ist nicht mehr auf diesem Gerät".
- The notification title already contains the band name ("Lisa · Overload").
- One device = one push subscription; it is registered in each band's storage (`push/<memberId>/<deviceId>.json`), as today.

### 4.5 Token helper (one worker for all bands)
- **Reminders:** one KV entry per band (`reminders:<bandId>` instead of one `REMINDER_KEY`); the old entry is read once and moved.
- **Band accounts:** `BAND_ACCOUNT` becomes `BAND_ACCOUNTS` = list of `provider:account` (e.g. `hidrive:overload,onedrive:<account id>`); `checkBandLogin` checks the caller's login with the matching provider (HiDrive `/user/me`, OneDrive Graph `/me`).
- Calendar subscription: already keyed by its secret – no change.
- R-CODE-10 grows by "several bands": needs a decision-log entry (done 2026-10-05).

### 4.6 Branding and app name
Name, color and logo inside the app follow the active band (already per band). The **name on the home screen** comes from the web app manifest and is the same for everyone – with a second band, "Overload App" no longer fits everyone. Open question (overview §11).

## 5. Data Model & Storage

Nothing new on the cloud storage. Device: `bandapp.connections` (list above), per-connection tokens, the per-band keys of §4.3. Token helper KV: `reminders:<bandId>`.

## 6. Search Contribution

Search covers the active band only (it is remounted with it).

## 7. Edge Cases & Errors

- **Login of an inactive band expired:** noticed when switching to it → login for that band only; the other bands stay logged in.
- **Same person, different profile names per band:** fine – profiles are per band.
- **Switch while an upload runs:** the switch waits for confirmation "Upload läuft – trotzdem wechseln?" (the upload would be cancelled).
- **Offline:** switching works with F11's remembered connections; each band shows its own offline state.
- **Demo mode:** `?demo-bands=2` opens two demo bands for tests and screenshots.

## 8. i18n Keys (examples)

| Key | German |
|---|---|
| `bands.switchTitle` | Band wechseln |
| `bands.as` | als {{name}} |
| `bands.add` | Band hinzufügen |
| `bands.remove` | Von diesem Gerät entfernen |
| `bands.removeConfirm` | {{band}} wird von diesem Gerät entfernt (Anmeldung und gespeicherte Songs). In der Cloud bleibt alles erhalten. |
| `bands.unknown` | Diese Band ist nicht mehr auf diesem Gerät |
| `bands.uploadRunning` | Upload läuft – trotzdem wechseln? |

## 9. Changes to Other Features

- **F1:** `BandSession` holds a list of connections and an active one; tokens per connection; migration (§4.1); provider choice in the first-start flow (with F13).
- **F3:** switcher sheet, settings screen, navigation map, provider remount by key in `app/App.tsx`.
- **F6:** push payload with band; `NotificationNavigator` switches bands.
- **Token helper:** §4.5; README and `worker.test.ts`.
- **Code map:** provider order and "device data per band" (§2, §4, §5).

## 10. Out of Scope / Later

- Two bands in the same storage account.
- **One calendar across all bands** ("Habe ich an dem Tag schon etwas?") – very useful for people in two bands; later, once both bands use the app.
- Unread badges for inactive bands (step 1: notifications only).

## 11. Decisions

| Date | Decision |
|---|---|
| 2026-10-05 | Both kinds of users: members of one band, and people in both bands who switch on one phone (maintainer). |
| 2026-10-05 | One band = one storage account owned by the band; switching remounts everything below the session; playback stops on switch. |

## 12. Steps (each a release)

1. **Connections + switcher** with HiDrive only: list, migration, per-band device keys, remount, settings screen, demo with two bands.
2. **Notifications per band:** payload, navigator, token helper KV per band and `BAND_ACCOUNTS`.
