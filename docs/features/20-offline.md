# F11 – Offline Mode

| | |
|---|---|
| **ID** | F11 (was future plan L1) |
| **Status** | Planned (2026-10-05) – milestone M10, after spike S8. **Built ahead (v1.0.1): song sync (§4.7)** |
| **Depends on** | F1 (session, storage), F3 (shell, settings), F4 (songs, lyrics), F9 (audio engine) |
| **Used by** | F12 Several bands (device data per band) |

## 1. Goal & Positioning

The app opens and is useful **without internet**: in the rehearsal room basement, on stage when the venue WLAN fails, on the train. Step 1 is **read and play**: everything already on the phone can be opened and played; changes need internet and say so.

Why read-only first (decision 2026-10-05): it covers the real situations (practising, playing a setlist, reading lyrics on stage) with little risk. Offline changes need a queue and conflict handling for every kind of record – that is a later step (§10).

## 2. User Stories

| # | Story |
|---|---|
| US-1 | In the rehearsal room without signal, I open the app and play the songs of today's setlist with lyrics. |
| US-2 | On stage, setlist, stage view and lyrics work even when the venue WLAN is down. |
| US-3 | I choose which songs and setlists stay on my phone and see how much space they use. |
| US-4 | When I'm offline I can see it at once, and buttons that need internet say so instead of failing. |
| US-5 | Back online, the app catches up by itself – no reload, no login. |

## 3. Screens & UI

- **Offline indicator** (all screens): small line under the top bar "Offline – letzter Stand von 14:32". Not a dialog, nothing to dismiss; disappears when the connection is back ("Wieder online" toast, once).
- **Controls that need internet** (R-UX-10 §4 "no dead taps"): shown disabled with the reason "Braucht Internet" (hint text or on tap a short toast). One mechanism for all features (§4.3), not per screen.
- **Song list:** a small "auf dem Gerät" mark on songs whose audio is saved. Offline, songs without saved audio are dimmed; tapping "Abspielen" says "Nicht offline gespeichert".
- **⋯ menus of song and setlist:** "Offline speichern" / "Offline entfernen". Saving shows progress in the menu row and a toast when done (R-UX-10).
- **New screen: Einstellungen → "Offline & Speicher"** (`/settings/offline`; navigation map F3 §4.5):
  - Switches: "Songs der nächsten Termine speichern" (range: 7 / 14 / 30 days), "Zuletzt gespielte Songs behalten" (limit: 250 MB / 500 MB / 1 GB / 2 GB).
  - Storage: "Belegt 1,2 GB · frei ca. 8 GB" (`navigator.storage.estimate()`), grouped list: Gespeicherte Setlists, Gespeicherte Songs, Zuletzt gespielt – each entry removable.
  - "Alles vom Gerät entfernen" (confirm dialog).
  - If the browser refuses permanent storage: hint "Das Handy darf gespeicherte Songs bei Platzmangel löschen."

## 4. Behaviour & Rules

### 4.1 Starting offline
Today the start needs the network (`getUserInfo()` in `BandSession` → otherwise `ConnectionErrorScreen`). New: the device remembers the last connection (home, app root, alias, band config, members, current member). Without network the app starts from that in **offline mode** and keeps trying in the background (every 30 s and on `online`). A login that expired while offline is only asked for once the network is back.

### 4.2 Data on the device
- The stores already load cached-first from `localStorage` (calendar, chat, setlists, library). These caches move to **IndexedDB** (one database, data per band): `localStorage` holds ~5 MB, which several bands, lyrics and chat history would exceed.
- **Lyrics:** every lyrics file that was opened, plus those of saved songs, is kept (text/HTML; PDFs as blob), keyed by path + file version.
- **Logos and voice notes** of saved songs are kept the same way.
- **Audio:** kept as blobs keyed by **path + file version** (`FileEntry.version`) – a changed file is fetched again when online. The audio engine already loads through one hook (`AudioEngine` `loadBlob`, `core/audio/PlayerProvider.tsx`); the cache sits in that hook.
- Which recording of a song: the Band-Version. Other versions are kept when they are played ("zuletzt gespielt").

### 4.3 What needs internet
- `SafeStorage` refuses writes while offline (`OfflineError`) before calling the provider – safety net for anything the UI misses. The optimistic pattern already rolls back on failure.
- A hook `useOnline()` plus a `needsOnline` prop on `Button`/menu items disables controls with the reason. Every write control gets it (sweep through all features; `feedback-check.py` must stay at "dead: 0").
- Exception: **own practice settings** (tempo/pitch/loop, one file per member) are kept on the device and written when back online – only the member writes that file, so there is no conflict.
- Chat read status is written when back online.

### 4.4 What is kept (each switchable per device and band)
| Rule | Default | Removed automatically? |
|---|---|---|
| **Upcoming:** songs of setlists of events in the next N days | on, 14 days | no – after the event the songs become "zuletzt gespielt" |
| **Chosen:** songs and setlists marked "Offline speichern" | – | no, only by the user |
| **Recently played:** every played song | on, 500 MB | yes, oldest first when over the limit |

Downloads run one at a time in the background while the app is open and online, pause while a song loads for playback, and stop on `QuotaExceededError` (toast "Speicher voll – …").

### 4.5 Back online
`online` event or a successful request → leave offline mode → the existing resume refresh (`onAppResume`) runs, writes held back (§4.3) are sent, background downloads continue. Polling (chat, calendar) is paused while offline.

### 4.6 Permanent storage
When the user first saves something, the app asks for `navigator.storage.persist()`. Whether phones keep the data (especially iPhones) is spike **S8**.

### 4.7 Song sync instead of a full scan (built in v1.0.1)
Before, every app start listed every folder of the cloud storage and read every song's `meta.json` (two requests per song). Now the app remembers a **tree version** per folder – a marker that changes when anything below the folder changes (`FileEntry.treeVersion`; HiDrive: the directory's content hash `chash`) – and only reads folders whose marker changed:
- **Files** (`scanFiles` with `previous`, `LibraryStore.scan()`): the home folder is listed; an unchanged sub-folder is not opened, its files are taken over from the last result. A new file costs the listings on its path only. Nothing new = **one** request.
- **Song data** (`syncSongMetas`, `LibraryStore.reloadMeta()`): one listing of `_BandApp/songs/`; only songs whose folder changed are read.
- The sync runs at every start and every return from the background (it is cheap); the song list shows the cached songs at once, as before.
- **Safety nets:** the refresh buttons ("Neu suchen" in Songs and in the settings) always read everything; the first sync after 7 days does too; a changed list of excluded folders does too. A folder that can't be read keeps its songs and is tried again next time. Storage that reports no tree versions is read completely, as before.
- Einstellungen → "Songs finden" shows what the last run did: "1 Ordner durchsucht · 12 unveränderte Ordner übersprungen".
- Remembered in the device cache next to the song list (`bandapp.library.<band>.scan` → `snapshot`, `fullScanAt`; `.metaFolders`).
- **To verify on the real HiDrive** (checklist A): that the directory `chash` really changes for every change below (new file, changed file, deleted file, renamed file, in a sub-sub-folder).

## 5. Data Model & Storage

Nothing new on the cloud storage. On the device:

```
IndexedDB "bandapp"
├─ data      key "<bandId>/<store>" → cached store state (calendar, chat, setlists, library, members, band)
├─ files     key "<bandId>/<path>@<version>" → Blob + { kind: audio|lyrics|logo|voice, size, reasons[], lastUsedAt }
└─ pending   key "<bandId>/<path>" → held-back own practice settings / read status
localStorage bandapp.offline.<bandId>   offline rules (switches, ranges, limits)
```

Leaving a band on this device ("Verbindung trennen", F12 "Band entfernen") deletes that band's offline data.

## 6. Search Contribution

Search works offline on the cached data and the existing lyrics text cache (`features/search/lyricsCache.ts`). No change.

## 7. Edge Cases & Errors

- **File changed on the cloud** while saved: online → fetched again; offline → the saved version plays.
- **Phone deleted the saved data** (storage pressure): the app notices missing files, removes the marks and downloads again when online.
- **"Lie-fi"** (connected but nothing gets through): a request that fails with a network error switches to offline mode; retries every 30 s.
- **Storage full:** downloads stop, toast with a link to "Offline & Speicher".
- **Large WAV files:** count against the limit like any file; S8 checks that phones store blobs of 50+ MB.

## 8. i18n Keys (examples)

| Key | German |
|---|---|
| `offline.banner` | Offline – letzter Stand von {{time}} |
| `offline.backOnline` | Wieder online |
| `offline.needsInternet` | Braucht Internet |
| `offline.notSaved` | Nicht offline gespeichert |
| `offline.save` / `offline.remove` | Offline speichern / Offline entfernen |
| `offline.settings.title` | Offline & Speicher |
| `offline.settings.upcoming` | Songs der nächsten Termine speichern |
| `offline.settings.recent` | Zuletzt gespielte Songs behalten |
| `offline.storageFull` | Speicher voll – gespeicherte Songs unter „Offline & Speicher“ verwalten |

## 9. Changes to Other Features

- **F1:** session start from the remembered connection (§4.1); `SafeStorage` offline guard (§4.3).
- **F3:** offline indicator in `AppShell`; new settings screen + navigation map entry; `Button`/`Menu` `needsOnline`.
- **F4:** list marks, ⋯ "Offline speichern", lyrics cache; F9 `loadBlob` cache hook.
- **F5/F6/F7/F10:** every write control gets `needsOnline`; F7 setlist ⋯ "Offline speichern".
- **Code map:** new shared mechanism "device cache" (§5 of `92-code-map.md`) and the IndexedDB layout (§4).

## 10. Out of Scope / Later

- **Changes while offline** (queue + upload later with conflict handling, R-DATA-07) – own step after this feature ("L1b").
- "Nur im WLAN herunterladen": phones don't tell web apps reliably whether they are on WLAN (iPhones not at all) – not offered.
- Downloads while the app is closed (Background Fetch isn't available on iPhones).
- Uploads while offline.

## 11. Decisions

| Date | Decision |
|---|---|
| 2026-10-05 | Step 1 = read and play; changes need internet (maintainer). |
| 2026-10-05 | Kept on the device: songs of upcoming setlists, chosen songs/setlists and recently played songs; each rule switchable by the user (maintainer). |

## 12. Steps (each a release)

1. **Offline start:** remembered connection, offline indicator, `needsOnline` sweep, store caches in IndexedDB. → The app opens offline and shows everything except files.
2. **Lyrics, logos, voice notes** kept on the device.
3. **Audio:** "Offline speichern" + recently played + "Offline & Speicher" screen (needs S8).
4. **Upcoming setlists** downloaded automatically.
