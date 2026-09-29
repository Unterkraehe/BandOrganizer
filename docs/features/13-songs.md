# F4 – Songs

| | |
|---|---|
| **ID** | F4 |
| **Status** | Implemented (v0.6.0) incl. lyrics, folder view and practice view (§4.3). Open: desktop master–detail, "Mit Notizen" filter (M8). Spike: HiDrive file ID stability (§6.1) |

> **v0.11.0 performance:** the song list is windowed (`VirtualList`, above 60 rows), rows are memoized with fixed heights (title and details on one line), row menus are built lazily, sorting/filtering use one shared collator and pre-normalized search text, and the list no longer re-renders on playback position ticks. Measured with 300 songs at 4× CPU slowdown: tab tap 510–640 ms → 75–100 ms. Test with `?demo-songs=300` in demo mode.
>
> **M3b implementation notes (v0.5.0)**
> - Detail tabs: **Songtext · Notizen für alle · Meine Notizen** (last tab remembered per device).
> - Lyrics renderers in `src/core/lyrics/renderers.ts`: TXT (UTF-8, fallback Windows-1252), DOCX (mammoth, HTML sanitised to simple formatting), PDF (pdf.js **v4 legacy build**, works on older iOS Safari; v5+ needs very new JS features). Other formats: "Datei öffnen".
> - The scan also collects lyrics documents (pdf, docx, txt, doc, odt, rtf, pages); unlinked documents whose name matches the song title are suggested ("Songtext gefunden – Verknüpfen").
> - Songs created in the app get a random `song_…` id; files listed in a song's `meta.json` belong to that song, even though their deterministic id differs.
> - Folder view: phone = step into folders (`?folder=` in the URL), tablet/desktop = tree (expanded folders remembered). Songs in folders not reachable by the scan are not shown.
> - Tag chips on the list link to the filtered list (`/songs?tag=`).

> **M2 implementation notes (v0.3.0)**
> - "Zuletzt hinzugefügt"/"Neu" use the file's modification time until `firstSeenAt` in `meta.json` exists (M3).
> - Durations are cached per device until they are stored in `meta.json` (M3).
> - Desktop master–detail layout and excluded-folder management are moved to M3.
> - Song IDs: `song_` + FNV-1a hash of the HiDrive file ID (fallback: path).
>
> **M3a implementation notes (v0.4.0)**
> - Recording IDs are deterministic too (`r_` + same hash), so the Band-Version and note markers stay valid on every device.
> - `meta.json` updates are read–modify–write on the latest file; only fields the user changed are written. The edit form fails with a conflict message only if someone changed *the same* field meanwhile (R-DATA-07). Durations are now stored in `meta.json`.
> - Merging writes `mergedInto` on the source song first; the list shows files of merged songs under the target even if the second write fails.
> - Moved/renamed files whose ID changed are re-matched by file name + size (§6.1 fallback) until spike S2 tells us whether this is needed.
> - Not yet: "Mit Notizen" filter (needs note counts without loading every song – with search index M8), chat info line for Band-Version changes (M7), desktop master–detail.
| **Depends on** | F1 (file scan), F2 (members), F3 (shell, setlist mode), F9 (audio engine), F10 (uploads) |
| **Used by** | F7 Setlists, F8 Search, F3 Dashboard |

## 1. Goal

A clear, fast list of all band songs, built automatically from the audio files on HiDrive. Each song has a detail screen with playback, lyrics and notes (for everyone / only for me), plus a fullscreen practice view with tempo and pitch control.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I see all our songs in a list and find one in seconds by typing part of its name. |
| US-2 | I start a song directly from the list, without opening it. |
| US-3 | I open a song and read the lyrics while it plays. |
| US-4 | I write a note for everyone ("Bridge ab jetzt 2×"), optionally tied to a position in the song. |
| US-5 | I write a private note ("Kapo 3. Bund") that only I see. |
| US-6 | I open the fullscreen practice view, slow the song down or shift its pitch, and practice. |
| US-7 | I see key, BPM and tuning of a song at a glance and can correct them. |
| US-8 | I hide files that aren't really songs (e.g. a soundcheck recording) from the list. |
| US-9 | I see which setlists a song is in. |
| US-10 | I group a demo, a live and a rehearsal recording as versions of one song. |
| US-11 | I see which version is the Band-Version, so I practice the right one; I can still listen to the others. |
| US-12 | In a three-voice song, the public notes tell everyone who sings which voice – also in the practice view. |
| US-13 | As the guitarist, I keep private notes about my solo and see them while practicing. |
| US-14 | I loop a difficult part (A–B) and practice it slowed down and transposed. |
| US-15 | I tap the timestamp of a note and playback jumps to that position. |
| US-16 | I archive songs we no longer play, so the list focuses on our current repertoire; I can still find and restore them. |
| US-17 | I tag songs (e.g. "Keyboard-Solo", "Ballade") and filter the list by tags. |

## 3. Terms

| Term | Meaning |
|---|---|
| **Audio file** | A file found by the F1 scan (`.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac`). Read-only (R-DATA-02). |
| **Song** | What the app shows in the list. Holds title, metadata, lyrics link, notes. Linked to one or more audio files (versions). |
| **Version** | One audio file of a song (e.g. "Demo", "Live 2025", "Probe 12.10."). A song has 1…n versions. |
| **Band-Version** | The version the band agreed to practice. Exactly one per song, same for everyone. Played by default everywhere. |

## 4. Screens & UI

### 4.1 Songliste (`/songs`)

- **Top:** search field "Songs durchsuchen" (filters instantly as you type, umlaut- and case-tolerant).
- **Sort** (dropdown): A–Z (default), Zuletzt hinzugefügt.
- **Filter chips:** "Mit Songtext", "Mit Notizen", "Neu" (added in the last 14 days), plus one chip per **tag** (§6.11). Several tags selected = songs that have **all** of them.
- **Active songs only by default.** Archived songs (§6.10) are not part of the normal list or search results.
- **Each row:**
  - ▶ play button on the left (plays without leaving the list; becomes ⏸ when playing; row highlighted)
  - Title (bold), below: duration · key (if set) · "3 Versionen" (if more than one)
  - Small icons: lyrics available, number of notes, "Neu" badge
  - Tags as small chips (max. 3 visible, "+2")
  - Tap on the row (outside ▶) → song detail
- **Row menu (⋯):** "Archivieren" / "Aus dem Archiv holen" (§6.10), "Tags bearbeiten" (§6.11), "Als Version zu anderem Song hinzufügen" (§6.8), "Ist kein Song – ausblenden" (§6.5).
- ▶ in the list always plays the **Band-Version**.
- **Bottom of the list:** "Archivierte Songs anzeigen (12)" → expands an "Archiv" section below the active songs (same row layout, slightly muted, archive icon). The same applies while searching/filtering: active hits first, then "2 Treffer im Archiv anzeigen".
- At the very bottom, smaller: "Ausgeblendete Dateien anzeigen (3)" if any.
- **States:** first scan running → progress "Songs werden gesucht … 42 gefunden"; no audio files → "Keine Songs gefunden" + hint to settings; search without results → "Kein Song gefunden für ‚xyz'".
- **Setlist mode:** see F3 §5 (banner, order, position numbers).
- Desktop: list takes the left column, selected song detail opens on the right (master–detail). Phone/tablet: detail is its own screen.

### 4.1a Ordner-Ansicht (planned for M3b)

> The same navigation is reused as the folder picker for uploads (F10 §4.2) – there without compact paths, so every folder can be chosen.

Optional view of the song list that mirrors the HiDrive folder structure.

- **Toggle** above the list: "Liste" | "Ordner". Remembered per device (`bandapp.songs.view`).
- **Only folders with audio** (directly or deeper) are shown; folders without music never appear. Folders excluded from the scan (F1) don't exist here either.
- **Compact paths:** a chain of folders that each contain nothing but exactly one subfolder (no audio files of their own) is merged into one node, e.g. `Band / Aufnahmen / 2025 / Stadtfest` instead of four levels. A folder becomes its own node again as soon as it contains audio files itself or splits into several subfolders.
- **Navigation per screen size:**
  - Phone (< 768 px): **step into folders** like a file browser. A breadcrumb path at the top ("Alle Ordner › Band / Aufnahmen › 2025") leads back; the browser/Android back button goes up one level.
  - Tablet and desktop (≥ 768 px): **expandable tree**, folders open in place; the expanded state is remembered per device.
  - The current folder (phone) or expanded folders (tree) are part of the URL (`/songs?view=folders&folder=…`), so reloads and deep links keep the place.
- **Folder rows:** folder icon, compact name, number of songs inside (including subfolders).
- **Song rows:** the same rows as in the list (▶, title, meta, tags, "⋯" menu, mini player works as usual).
- **Versions:** a song appears in **every folder that contains one of its files**, marked with the version if it isn't the Band-Version ("Midnight Engine · Live"). Tapping always opens the same song; ▶ plays the version in that folder.
- **Search & filters** (search, "Neu", tags): folders without matches are hidden, folders with matches open automatically (tree) or show match counts (phone).
- **Archive & hidden:** same rules as the list – hidden files never appear, archived songs only with "Archivierte Songs anzeigen".
- **Sorting:** folders A–Z first, then songs according to the chosen sort.

### 4.2 Song-Detail (`/songs/:songId`)

**Header**
- Title, below: chips for key, BPM, tuning, duration (only filled ones)
- Tags as chips below the title (tap → song list filtered by that tag)
- If archived: banner "Dieser Song ist archiviert" + "Aus dem Archiv holen"
- Buttons: "Bearbeiten" (metadata, §4.4), "Vollbild" (practice view, §4.3), ⋯ (Archivieren, Tags bearbeiten, …)
- If in setlist mode: "3 / 12 · Nächster: Song X" + ◀ ▶

**Player**
- Play/pause, seek bar with elapsed/remaining time, ±10 s buttons
- Markers on the seek bar for notes with a time position (tap → jump)
- **Version selector** (only if the song has several versions): list with labels, the Band-Version marked with ★ "Band-Version". Choosing another version plays it for me only, with the hint "Du hörst nicht die Band-Version" + "Zur Band-Version wechseln".
- If tempo/pitch differ from original: small hint "Tempo 80 % · −2 HT" + "Zurücksetzen"

**Content – three tabs** (phone/tablet); on desktop lyrics left, notes right:
1. **Songtext** – lyrics (§6.3). If none: "Kein Songtext verknüpft" + "Songtext-Datei auswählen".
2. **Notizen für alle** (count) – public notes (§6.4)
3. **Meine Notizen** – private notes, with the hint "Nur für dich sichtbar in der App" (R-SEC-01)

**Footer section:** "In Setlists: Stadtfest 2026, Probe 12.10." (links to F7).

### 4.3 Vollbild / Übungsansicht (`/songs/:songId/practice`)

Distraction-free view for practicing at home and in rehearsals. Works in portrait and landscape; the screen stays on while it's open (Wake Lock API, where supported).

**Layout**
- Phone: lyrics fill the screen; controls docked at the bottom; notes as a pull-up panel ("Notizen" handle).
- Tablet landscape / desktop: lyrics left (~⅔), notes panel right (~⅓), controls at the bottom.

**Areas**

1. **Lyrics** – large, zoomable (A− / A+ for text formats, pinch/zoom for PDFs), remembered per device. Manual scrolling only (no autoscroll in v1).
2. **Notes panel** – two sections, always both visible:
   - **Für alle** – public notes, **pinned notes first** (§6.4, e.g. "Stimme 1: Lisa · Stimme 2: Tom · Stimme 3: Max"), then time-marked notes by position, then the rest.
   - **Nur für mich** – my private notes (e.g. solo notes), same ordering.
   - Time-marked notes show their **timestamp as a tappable chip** ("▶ 1:32"). Tapping it jumps playback to that position (§6.4). Time-marked notes are highlighted while playback passes their position.
   - "+ Notiz" directly in the panel (with "Position übernehmen").
3. **Controls**
   - Play/pause, seek bar (with A–B range and note markers), ±10 s
   - **Tempo** (independent of pitch): slider + −/+ buttons, "80 %", "Original"
   - **Tonhöhe** (independent of tempo): −/+ in semitones, "−2 Halbtöne", "Original"
   - **A–B-Schleife** (§6.9): buttons "A setzen", "B setzen", loop on/off, "Schleife löschen"
   - Version selector (compact), Band-Version pre-selected
   - Setlist mode: ◀ previous / next ▶ with next song name
4. Exit with "✕" or back button; playback continues in the mini player.

### 4.4 Song bearbeiten

| Field | Details |
|---|---|
| Titel | Pre-filled with the cleaned file name (§6.2); changing it never renames the file |
| Tonart | Picker: C … B, Dur/Moll (e.g. "Am", "F#") |
| BPM | Number 20–300, optional "Tap"-button to tap the tempo |
| Stimmung | Free text with suggestions: Standard, Drop D, Eb-Standard, … |
| Tags | Chips; type to pick an existing tag or create a new one (§6.11) |
| Songtext-Datei | Linked file, "Ändern" / "Entfernen" (removing only removes the link, never the file) |
| Versionen | List of versions: label (e.g. "Demo", "Live 2025"), file path, ★ "Als Band-Version festlegen", "Als eigenen Song abtrennen" |

Changes are visible to everyone. Standard fields `updatedAt/updatedBy` show "Zuletzt bearbeitet von Lisa".

## 5. Song Lifecycle

Songs come from two sources: **found** on HiDrive by the scan (below), or **created in the app** with uploaded files (F10: "Neuer Song", "Aufnahme hinzufügen", "Songtext hochladen"). App-created songs may have no recording yet.


```
F1 scan finds audio file
   │
   ├─ known file (matched, §6.1) ─► existing song
   │
   └─ new file ─► song appears in the list immediately (derived from the scan)
                  meta.json is created only when something is saved
                  (metadata, note, hide, lyrics link, first duration measurement)
```

- New files are "Neu" for 14 days after they were first seen.
- If a file disappears from HiDrive: the song stays in the list greyed out with "Datei nicht gefunden" as long as it has notes/metadata; songs without any app data simply disappear. Nothing is deleted (R-DATA-05).

## 6. Behaviour & Rules

### 6.1 Song identity (stable across devices and renames)
- `songId` is **deterministic**, derived from the audio file: primarily the HiDrive file ID, fallback the path. Every device computes the same ID, so two devices can never create two songs for one file.
- `meta.json` is created with "only if it does not exist" semantics.
- **Renamed/moved files:** if HiDrive file IDs stay the same across renames/moves, nothing needs to be done. Otherwise the app re-matches a vanished file with a new file of the same name and size and updates `recordings[].path`. *(Spike with real API: are file IDs stable?)*

### 6.2 Title cleaning
From the file name: remove extension, leading track numbers ("01 - ", "03_"), replace `_` with spaces, trim. Example: `07_Hell_Is_Empty_(Demo).mp3` → "Hell Is Empty (Demo)". Always overridable via "Titel".

### 6.3 Lyrics
- **Automatic matching:** the F1 scan also collects text documents; a document whose cleaned name matches a song title is suggested as its lyrics ("Songtext gefunden: Hell Is Empty.txt – verknüpfen?"). No automatic linking without confirmation, so wrong matches don't happen silently.
- **Manual linking:** "Songtext-Datei auswählen" opens a simple HiDrive file picker (filtered to supported formats).
- **Display per format:**

| Format | Display | Searchable text |
|---|---|---|
| `.pdf` | Rendered pages (pdf.js), fit to width, zoomable | Yes, if the PDF contains real text (not a scan) |
| `.docx` | Converted to formatted text in the browser (e.g. mammoth.js) – bold/italic/headings kept, so voice markings stay visible | Yes |
| `.txt` | Plain text | Yes |
| `.doc` (old Word format) and anything else | "Diese Datei kann hier nicht angezeigt werden" + "Datei öffnen" (opens/downloads it, read-only) | File name only |

- Rendered/converted lyrics are cached on the device.
- **Pluggable renderers:** each format is handled by a lyrics renderer module registered by file extension (`core/lyrics/renderers/<format>.ts`, interface: `canRender(ext)`, `render(file) → view`, `extractText(file) → string | null`). Adding a format (e.g. `.odt`, `.rtf`, images with OCR) means adding one renderer – no changes to songs, practice view or search.
- Lyrics files are never modified (R-DATA-02/03). Lyrics can be **typed** in the app and `.txt` lyrics **edited** – each save creates a new file and relinks it (F10 §5.7).

### 6.4 Notes
- Plain text (line breaks kept, links clickable), max. 2,000 characters.
- **Timestamp chips:** every note with a time marker shows "▶ 1:32" – in the song detail, the practice view and the notes panel. Tapping it:
  - jumps playback to that position and starts playing, if this song (in the note's version) is loaded;
  - otherwise loads the note's version of this song first, then jumps and plays.
  - Tempo, pitch and an active A–B loop stay as they are; if the position lies outside the loop, the loop is switched off with a short hint.
- **Pinning:** public notes can be pinned ("Anheften", by any member). Pinned notes are always shown first, in the detail view and the practice view. Typical use: voice assignments. Private notes can be pinned by their owner.
- Notes belong to the **song**, not to a version. A time marker stores the version it was set on; on other versions the note is still shown, with the hint "bei 1:32 (Version Demo)", but without a seek-bar marker.
- Optional **time marker**: while a song is loaded, "Position übernehmen (1:32)" attaches the current position. Tapping the marker jumps there.
- Sorted: pinned first, then notes with time markers by position, then others newest first.
- Public notes show author (avatar + name) and relative date ("vor 2 Tagen").
- **Edit/delete:** only the author, for both public and private notes. Delete = soft delete with undo (R-DATA-05, R-UX-04).
- Conflict check on edit (R-DATA-07).

### 6.5 Hiding files that aren't songs
- **Different from archiving (§6.10):** hiding is for audio files that are *not songs at all* (soundcheck, test recording, voice memo). Archiving is for real songs that aren't in the current repertoire.
- Any member can hide such a file ("Ist kein Song – ausblenden"). Everyone sees the change.
- Hidden files are excluded from the list, search, song pickers and the archive section; they stay in existing setlists.
- Undo via "Ausgeblendete Dateien anzeigen" → "Wieder einblenden".
- For whole folders the F1 exclusion list is the better tool; the hint links there.

### 6.6 Duration
- Measured when a version is first played and stored in `meta.json` so other devices show it immediately. Until then the list shows "–:–".

### 6.7 Playback
- All playback goes through the F9 audio engine. The list, detail, practice view and mini player control the same single engine (R-UX-08).
- Default everywhere (list ▶, setlist mode, mini player): the **Band-Version**.

### 6.8 Versions & Band-Version
- **Grouping is manual**, never automatic: "Als Version zu anderem Song hinzufügen" → pick the target song. When the scan finds a new file whose cleaned name closely matches an existing song, the app only *suggests* it ("Neue Aufnahme ‚Hell Is Empty (Live)' – als Version zu ‚Hell Is Empty' hinzufügen?").
- **Band-Version:** exactly one per song. Any member can change it via ★ "Als Band-Version festlegen" with confirmation ("Alle üben dann diese Version."). Detail shows "Band-Version: Live 2025 · festgelegt von Lisa am 24.09.". Changing it posts an automatic note in the band chat (F6) so nobody misses it.
- When grouping, the target song's Band-Version stays unchanged.
- **Reversible:** "Als eigenen Song abtrennen" turns a version back into its own song. Grouping only links data, it never moves or changes audio files (R-DATA-02). Notes of a grouped song stay where they are and are shown together (`mergedSongIds`), so splitting restores everything.
- Version labels are optional and free text; default label = the cleaned file name.

### 6.9 A–B loop
- Set A and B at the current position (buttons) or by dragging the two handles on the seek bar; minimum length 1 s.
- Loop on/off toggle; loop is shown as a highlighted range on the seek bar.
- Works together with tempo and pitch (F9).
- Remembered per member, song and version together with tempo/pitch (§11); "Schleife löschen" removes it.

### 6.10 Archive
- Any member can archive a song ("Archivieren") and bring it back ("Aus dem Archiv holen"), from the row menu or the song detail. Band-wide, everyone sees the same state. No confirmation, but undo toast (R-UX-04).
- **Archived songs are not visible by default** – in the song list, in search results (song list and global search F8) and in the setlist editor's song picker (F7). Each of these places offers them at the **end**: "Archivierte Songs anzeigen (12)" / "2 Treffer im Archiv anzeigen". Archived songs are shown muted with an archive icon.
- Archived songs keep everything: versions, notes, tags, practice settings. They stay playable.
- Existing setlists keep archived songs (marked with the archive icon); setlist mode plays them normally.
- Archived songs are never offered as rehearsal suggestions (F7).
- "Neu"-badge songs can be archived like any other.

### 6.11 Tags
- **Band-wide custom tags** (e.g. "Keyboard-Solo", "Ballade", "Zugabe-tauglich", "Cover"). Any member can create, assign, rename and delete tags.
- Assign via "Tags bearbeiten" (row menu, detail) or the edit form: type to find an existing tag, "‚xyz' als neuen Tag anlegen" if none matches. Case-insensitive duplicates are prevented.
- **Filtering:** tag chips in the song list and in the setlist song picker; multiple selected tags = AND. Active filters are shown with "Filter zurücksetzen".
- **Manage tags** (Einstellungen → Tags, and from the filter row): rename, delete (with confirmation "Tag ‚Ballade' von 8 Songs entfernen?"), see the number of songs per tag.
- Deleting a tag is a soft delete of the tag record (R-DATA-05); songs just stop showing it.
- Tags are searchable (F8).

## 7. Data Model & Storage

### 7.1 `_BandApp/songs/<songId>/meta.json`

```json
{
  "id": "song_9c2f1a7e",
  "schemaVersion": 1,
  "displayTitle": "Hell Is Empty",
  "recordings": [
    {
      "id": "r_1",
      "fileId": "b1489258310.1234",
      "path": "/users/overload/Songs/07_Hell_Is_Empty.mp3",
      "size": 8123456,
      "label": "Live 2025",
      "durationSec": 241.3,
      "firstSeenAt": "2026-09-24T15:00:00Z"
    }
  ],
  "bandVersion": { "recordingId": "r_1", "setBy": "m_…", "setAt": "…" },
  "mergedSongIds": [],
  "mergedInto": null,
  "key": "Am",
  "bpm": 128,
  "tuning": "Drop D",
  "lyrics": { "fileId": "…", "path": "/users/overload/Texte/Hell Is Empty.txt" },
  "hidden": false,
  "archived": false,
  "archivedAt": null,
  "archivedBy": null,
  "tagIds": ["t_keysolo"],
  "createdAt": "…", "createdBy": "m_…", "updatedAt": "…", "updatedBy": "m_…"
}
```

### 7.2 Notes

- Public: `_BandApp/songs/<songId>/notes/public/<noteId>.json`
- Private: `_BandApp/songs/<songId>/notes/private/<memberId>/<noteId>.json`

```json
{
  "id": "n_…", "schemaVersion": 1,
  "text": "Bridge ab jetzt 2× spielen",
  "positionSec": 92.0,
  "recordingId": "r_1",
  "pinned": false,
  "createdAt": "…", "createdBy": "m_…", "updatedAt": "…", "updatedBy": "m_…",
  "deletedAt": null, "deletedBy": null
}
```

### 7.3 Tags

`_BandApp/tags/<tagId>.json`

```json
{
  "id": "t_keysolo", "schemaVersion": 1,
  "name": "Keyboard-Solo",
  "createdAt": "…", "createdBy": "m_…", "updatedAt": "…", "updatedBy": "m_…",
  "deletedAt": null, "deletedBy": null
}
```

Songs reference tags by `tagIds`, so renaming a tag changes nothing on the songs.

### 7.4 Practice settings (per member)

`_BandApp/songs/<songId>/practice/<memberId>.json`

```json
{
  "schemaVersion": 1,
  "byRecording": {
    "r_1": { "tempo": 0.8, "semitones": -2, "loop": { "startSec": 61.5, "endSec": 84.0, "enabled": true } }
  },
  "updatedAt": "…"
}
```

- A song that was grouped into another (`mergedInto` set) is hidden from the list; its `songId` stays valid so old links keep working (they redirect to the target song).

### 7.5 Device-local
- Song index from the scan (cache), lyrics cache, practice view font size.

### 7.6 Loading strategy
- The list is built from the cached scan + all `meta.json` files (≈100 small files; loaded in parallel, cached).
- Notes are loaded when a song is opened (plus counts for list icons, cached).

## 8. Search Contribution

- Titles (display title + file name), key, tuning, tags
- Archived songs only as a collapsed "im Archiv" group at the end (§6.10)
- Lyrics text (formats that can be read as text)
- Public notes; the member's **own** private notes only (never others', R-SEC-01)
- Result opens the song detail, lyrics hit scrolls to the matching line

## 9. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Same file name in different folders | Two songs; the folder is shown as secondary info in list and detail |
| Audio file can't be decoded (broken/unsupported) | Song shown, player says "Diese Datei kann nicht abgespielt werden" |
| Slow connection | Loading indicator in the player; list stays usable |
| Two members edit metadata at the same time | Conflict check (R-DATA-07): second one sees "Wurde gerade von Lisa geändert" + reload |
| Lyrics file deleted on HiDrive | "Songtext-Datei nicht gefunden" + "Andere Datei wählen" |
| Very large WAV/FLAC | Warning "Große Datei – Laden kann dauern" (F9) |

## 10. i18n Keys (examples)

| Key | German text |
|---|---|
| `songs.list.search` | Songs durchsuchen |
| `songs.list.sort.az` / `songs.list.sort.recent` | A–Z / Zuletzt hinzugefügt |
| `songs.list.filter.lyrics` / `.notes` / `.new` | Mit Songtext / Mit Notizen / Neu |
| `songs.list.scanning` | Songs werden gesucht … {{count}} gefunden |
| `songs.list.hide` | Ist kein Song – ausblenden |
| `songs.list.showHidden` | Ausgeblendete Dateien anzeigen ({{count}}) |
| `songs.archive.do` / `.undo` | Archivieren / Aus dem Archiv holen |
| `songs.archive.show` | Archivierte Songs anzeigen ({{count}}) |
| `songs.archive.searchHits` | {{count}} Treffer im Archiv anzeigen |
| `songs.archive.banner` | Dieser Song ist archiviert |
| `songs.tags.edit` / `.create` / `.reset` | Tags bearbeiten / ‚{{name}}' als neuen Tag anlegen / Filter zurücksetzen |
| `songs.detail.tabs.lyrics` / `.publicNotes` / `.privateNotes` | Songtext / Notizen für alle / Meine Notizen |
| `songs.detail.privateHint` | Nur für dich sichtbar in der App |
| `songs.detail.fileMissing` | Datei nicht gefunden |
| `songs.notes.usePosition` | Position übernehmen ({{time}}) |
| `songs.practice.tempo` / `.pitch` / `.reset` | Tempo / Tonhöhe / Original |
| `songs.practice.semitones` | {{count}} Halbtöne |

## 11. Proposed Defaults (tempo/pitch, shared with F9)

| Topic | Proposal |
|---|---|
| Tempo range | 50–150 %, steps of 5 % (slider allows 1 %) |
| Pitch range | −12 to +12 semitones, whole semitones only |
| Remember tempo/pitch/loop | Per member, song and version (§7.3); "Original" / "Schleife löschen" reset |
| Note time markers | Included in v1 |
| Pinned notes | Included in v1 |
| Tag filter logic | Several tags = AND |
| Metadata fields | Titel, Tonart, BPM, Stimmung |

## 12. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Several recordings | **Grouped as versions** of one song, manually; one **Band-Version** per song for everyone |
| 2 | Lyrics formats | v1: **.pdf, .docx**, plus `.txt` (trivial). Other formats later via pluggable renderers (§6.3) |
| 3 | Practice view v1 | **A–B loop, independent tempo and pitch, public notes (pinned first), private notes** |
| 4 | Timestamp chips | Tap on a note's timestamp jumps playback there (all views) |
| 5 | Archive | Band-wide archive; hidden by default in list, search and setlist picker, shown at the end on demand; restorable |
| 6 | Tags | Band-wide custom tags, filterable |
| – | Not in v1 | Count-in/metronome, lyrics autoscroll |

## 13. Out of Scope / Later

- Setlist-relevant note flags and lyrics PDF export for singers (see future plans L6)

- Chord sheets; editing PDF/DOCX lyrics
- Waveform display
- Count-in / metronome, lyrics autoscroll (practice view)
- More lyrics formats (`.doc`, `.odt`, `.rtf`, `.pages`, photos with OCR) – as new renderers
