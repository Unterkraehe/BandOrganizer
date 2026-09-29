# F10 – Adding Content & Uploads

| | |
|---|---|
| **ID** | F10 |
| **Status** | Implemented (v0.5.0) – spike S6 (large files on real HiDrive) pending |

> **Implementation notes (v0.5.0)**
> - Upload queue (`src/core/uploads/queue.ts`): 2 parallel, 3 retries with back-off, indicator at the top right with per-file progress and "Erneut versuchen".
> - Checks (`validate.ts`): extension + signature (ID3/MPEG, RIFF/WAVE, fLaC, OggS, ftyp, %PDF, ZIP, OLE, RTF, no NUL bytes in TXT); 200 MB audio / 20 MB lyrics.
> - Unique names by listing the target folder first, plus retry with the next suffix on `AlreadyExists`.
> - The guard's home zone is create-only; new folders from the picker are created by `SafeStorage` only when the file is written.
> - Duplicate detection by name + size against the scan; "Vorhandene verwenden" opens the existing song (new song) or groups it as a version (add recording) / links it (lyrics).
> - Desktop drag & drop: audio onto the song list → "Neuer Song"; onto a song → new version; PDF/Word/TXT onto a song → lyrics upload.
| **Type** | Core module (`src/core/uploads/`) + UI entry points in F4 |
| **Depends on** | F1 (storage, guard), F2 (members) |
| **Used by** | F4 Songs (new song, new version, lyrics), design system (band logo) |

## 1. Goal

Members add new content **from inside the app**: create a new song and upload its MP3, add another recording as a version, upload lyrics. The files are stored on HiDrive automatically, in a tidy, human-readable place – nobody has to open HiDrive separately.

Content that lives only in the app (events, setlists, notes, chat) was already created in-app; this feature covers **files**.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I create a new song, give it a title and upload the MP3 from my phone or laptop. |
| US-2 | I create a new song without audio yet (e.g. a song we're just writing) and add the recording later. |
| US-3 | I add a new recording (e.g. from last rehearsal) as a version to an existing song. |
| US-4 | I upload the lyrics (PDF/Word/TXT) for a song. |
| US-4b | I type or paste lyrics directly in the app, and later correct them. |
| US-5 | I see upload progress and can keep using the app while it uploads. |
| US-6 | If an upload fails, I retry with one tap. |
| US-7 | I am warned when I'm about to upload a file that already exists. |

## 3. Entry Points (UI)

| Where | Action |
|---|---|
| Song list (F4) | **"+ Neuer Song"** (FAB on phone, button in the top bar on desktop) |
| Song detail → Versionen (F4 §4.4) | **"+ Aufnahme hinzufügen"** |
| Song detail → Songtext tab (if none) | **"Songtext hochladen"**, **"Songtext eintippen"** (next to "Songtext-Datei auswählen") |
| Song detail → Songtext (if a `.txt` is linked) | **"Bearbeiten"** (§5.7) |
| Song detail → Songtext (if one exists) | "Andere Datei hochladen" (replaces the *link*, never the old file) |
| Desktop | Drag & drop of files onto the song list (→ new song) or onto a song detail (→ version/lyrics, asks which) |
| Settings → Band | Logo upload (design system §8) – uses the same upload module |

### 3.1 "Neuer Song" dialog

1. **Titel*** (required)
2. **Aufnahme** (optional): "Datei auswählen" → audio file; title is pre-filled from the file name if still empty
   - **"Speichern in"**: target folder, pre-selected (§4.1), tap → folder picker (§4.2)
3. **Songtext** (optional): "Datei auswählen" → PDF/DOCX/TXT, **or** "Eintippen" → text field; both with their own **"Speichern in"** (§4.1)
4. Optional: Tonart, BPM, Stimmung, Tags (collapsed "Weitere Angaben")
5. **"Song anlegen"** → song appears immediately in the list with an upload progress indicator; uploads continue in the background.

### 3.2 Upload progress

- Small upload indicator in the top bar while uploads run ("2 Uploads · 45 %"); tap → upload list with per-file progress, "Abbrechen", "Erneut versuchen".
- The song row/detail shows "Wird hochgeladen … 45 %" and becomes playable when finished.
- Leaving the screen does not cancel uploads. Closing the app does (v1) – the app warns: "Uploads laufen noch – wirklich schließen?" (browser `beforeunload`).

## 4. Storage Location on HiDrive

Uploaded files are **real band files**, so they go into normal, human-readable folders – never into the technical `_BandApp/` folder.

**Decided (2026-09-28): the member chooses the folder for every audio file, lyrics file and typed lyrics individually – anywhere in the band's HiDrive.** Uploads are create-only everywhere (§5.1).

### 4.1 Pre-selected folder ("Speichern in")

A sensible folder is always pre-selected, so a quick upload stays one tap:

| Upload | Pre-selected folder |
|---|---|
| Neuer Song – Aufnahme | Folder of this device's **last audio upload**; the very first time the **standard upload folder** (settings, default `Band-App Uploads`) |
| "+ Aufnahme hinzufügen" (existing song) | Folder of the song's **Band-Version** |
| Songtext-Datei hochladen (new or existing song) | Folder of this device's **last lyrics upload/save** (lyrics often live in their own folder, e.g. "Texte"); first time: standard upload folder |
| Songtext eintippen – first version | Same as lyrics files: last lyrics folder, first time the standard upload folder |
| Songtext bearbeiten – new version | Folder of the **previous version** of this text (changeable) |

Audio and lyrics remember their last folder separately (`bandapp.uploads.lastAudioFolder`, `bandapp.uploads.lastLyricsFolder`).

The field shows the compact path ("Band / Proben / 2026") and "Ändern".

### 4.2 Folder picker

Opened from "Speichern in". Same navigation style as the song folder view (F4 §4.1a), but made for choosing *any* folder:

**Content**
- Shows **all** folders of the HiDrive home (with or without audio), except `_BandApp/` and hidden folders.
- **No compact paths:** every folder is its own level and can be selected – also folders that only contain a single subfolder (unlike the folder view of the song list).
- Files are not shown, only a small count per folder ("12 Dateien") as orientation.
- The pre-selected folder is opened (phone) / expanded and highlighted (tree) when the picker opens.

**Choosing**
- Phone: the folder you are in is the one that gets chosen – **"Hier speichern"** at the bottom, the current path above it ("Speichern in: Band / Proben / 2026").
- Tablet/desktop: click a folder to select it (highlighted), **"Hier speichern"** confirms.

**"Neuer Ordner"**
- Button in the current / selected folder → name field → the new folder appears in the list and is selected immediately.
- It is **only created on HiDrive when the upload is actually saved** – cancelling leaves no empty folders behind.
- If a folder with that name already exists there, no new folder is made: the picker simply opens the existing one ("Den Ordner gibt es schon – geöffnet").
- Several levels at once are possible (new folder inside a new folder).
- Create-only as always (§5.1): creating a folder never changes existing ones.

**Devices**
- Phone (< 768 px): full-screen sheet, step into folders, breadcrumb back, back button goes up one level (closes the picker at the top level).
- Tablet/desktop (≥ 768 px): dialog with an expandable tree.
- Touch targets ≥ 44 px (R-UI-04); keyboard: arrow keys move and open/close folders, Enter selects, Esc closes (R-UI-05).

**Other**
- Warning if the chosen folder is excluded from the song search (F1): "Dieser Ordner wird bei der Songsuche übersprungen – der Song taucht nicht in der Liste auf." with "Trotzdem hier speichern".
- Folder listings are loaded on demand (one level at a time) and cached for the session.

### 4.3 Typed lyrics

Typed lyrics (§5.7) get the same **"Speichern in"** field and picker as lyrics files (§4.1): the editor shows it below the text, pre-selected as in the table above.
- File name: `<Song title> - Text.txt`; every edit is saved as a new file (`<Song title> - Text (2).txt`), by default in the folder of the previous version.

### 4.4 Standard upload folder

- Still set during band setup and in Einstellungen → Band, now labelled **"Standard-Ordner für Uploads"**. It is only the first suggestion (§4.1), not a restriction.
- Original file names are kept (cleaned of characters HiDrive doesn't allow).
- The F1 scan finds uploaded files like any other audio file; they're already linked, so no duplicates appear.

## 5. Behaviour & Rules

### 5.1 Data safety (extends R-DATA)
- **Create-only:** uploads always create **new** files (and, if wanted, new folders). If a name exists, a suffix is added (`Song (2).mp3`). The app never overwrites, replaces, moves or deletes an existing file or folder – also not files it uploaded itself (v1).
- The safety guard (R-DATA-04) treats **the whole HiDrive home (except `_BandApp/`) as a create-only zone**. Updates, moves and deletes there stay forbidden.
- Every uploaded file is recorded (who, when, which song) in the song's `meta.json` (`recordings[].uploadedBy/uploadedAt`, `lyrics.uploadedBy/uploadedAt`).
- "Removing" an uploaded recording from a song = unlinking / hiding (F4 §6.5), never deleting the file.

### 5.2 Songs without audio
- A song can exist **without any recording** (US-2). It gets a random `songId` (app-created songs aren't derived from a file) and shows "Noch keine Aufnahme" + "+ Aufnahme hinzufügen" instead of the player.
- Such songs appear in the list, setlists and search normally; setlist mode skips them for playback.
- The first uploaded recording automatically becomes the Band-Version.

### 5.3 Versions
- "+ Aufnahme hinzufügen" uploads into the song's folder and adds a version with an optional label (pre-filled: "Probe <Datum>" if today is a rehearsal day, else the file name).
- Checkbox "Als Band-Version festlegen" (off by default, except for the first recording).

### 5.4 Allowed files & limits

| Kind | Types | Max. size (proposal) |
|---|---|---|
| Audio | `.mp3`, `.m4a`, `.wav`, `.ogg`, `.flac` | 200 MB (warning above 50 MB: "Große Datei – Upload kann dauern") |
| Lyrics | `.pdf`, `.docx`, `.txt` | 20 MB |
| Logo | `.svg`, `.png` | 2 MB |

- Type check by extension **and** file signature (a renamed file is rejected with a clear message).

### 5.5 Duplicate detection
- Before uploading, the app checks the file index for a file with the same name **and** size: "Diese Datei gibt es schon (Songs/Hell Is Empty/…). Trotzdem hochladen / Vorhandene verwenden".
- "Vorhandene verwenden" links the existing file instead of uploading again.

### 5.6 Technical
- Upload via HiDrive API (`POST /file` into the target folder, create-only) with progress events; CORS allows it (F1 tests).
- Large files: chunked/resumable upload if the HiDrive API supports it (**spike S6**); otherwise single request with retry.
- Upload queue in memory: max. 2 parallel uploads, automatic retry (3×, back-off), then "Erneut versuchen".
- Folders are only created on explicit "Neuer Ordner" in the picker, and only when the upload is saved (§4.2). Uploading into an existing folder never changes that folder.

### 5.7 Typing lyrics in the app
- **"Songtext eintippen"** opens a simple full-screen text editor (plain text, line breaks kept, large font; paste from anywhere). Tips shown once: "Leerzeile = neuer Absatz; Stimmen z. B. mit [Lisa] markieren".
- **Saving creates a new `.txt` file** (UTF-8) in the chosen folder (§4.3): `<Song title> - Text.txt` and links it as the song's lyrics.
- **Editing** ("Bearbeiten", available for any linked `.txt`, typed or found by the scan): the edited text is saved as a **new file** (`<Song title> - Text (2).txt`) and the link switches to it. The previous file is never changed (create-only, R-DATA-03).
  - Side effect: a natural history. The Songtext tab offers "Frühere Fassungen (2)" to view – and if needed re-link – older versions.
  - Conflict check: if someone else saved a newer version while I was editing, I'm asked "Lisa hat den Text gerade geändert – ihre Fassung ansehen / meine trotzdem speichern" (both stay as files).
- PDF and DOCX lyrics can't be edited in the app; "Als Text übernehmen" (copy the extracted text into the editor to create a `.txt`) is offered where text extraction works.
- Unsaved text is kept as a device-local draft until saved or discarded.

## 6. Data Model

- `_BandApp/app.json` → `uploads: { root: "/users/…/Band-App Uploads" }` (standard upload folder = first suggestion)
- Device-local: `bandapp.uploads.lastAudioFolder`, `bandapp.uploads.lastLyricsFolder` (§4.1)
- `meta.json` (F4 §7.1) additions:

```json
"recordings": [
  { "id": "r_2", "fileId": "…", "path": "…/Songs/Hell Is Empty/Probe 2026-10-15.m4a",
    "label": "Probe 15.10.", "uploadedBy": "m_…", "uploadedAt": "…" }
],
"source": "app"
```

`source`: `scan` (derived from an existing file) | `app` (created in the app).

## 7. Search Contribution

None of its own; new songs/lyrics are indexed by F4/F8 as usual.

## 8. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Connection lost during upload | Retry automatically; after 3 failures "Erneut versuchen" |
| App closed during upload | Upload lost (v1); warning before closing; the song stays with "Upload fehlgeschlagen – erneut hochladen" |
| HiDrive storage full | "Kein Speicherplatz mehr auf HiDrive" – no partial files left behind (or clearly named `.part` file, depending on API behaviour, spike S6) |
| Two members create a song with the same title | Two songs (different IDs), folders `Hell Is Empty` and `Hell Is Empty (2)`; hint "Einen Song mit diesem Titel gibt es schon – trotzdem anlegen?" |
| Phone file picker | Uses the system picker (Files app / Google Files); on iPhone also iCloud Drive, etc. |

## 9. i18n Keys (examples)

| Key | German text |
|---|---|
| `uploads.newSong` | Neuer Song |
| `uploads.addRecording` | Aufnahme hinzufügen |
| `uploads.uploadLyrics` | Songtext hochladen |
| `uploads.progress` | Wird hochgeladen … {{percent}} % |
| `uploads.indicator` | {{count}} Uploads · {{percent}} % |
| `uploads.failed` | Upload fehlgeschlagen – erneut versuchen |
| `uploads.duplicate` | Diese Datei gibt es schon. |
| `uploads.useExisting` / `.uploadAnyway` | Vorhandene verwenden / Trotzdem hochladen |
| `uploads.noRecording` | Noch keine Aufnahme |
| `uploads.leaveWarning` | Uploads laufen noch – wirklich schließen? |
| `uploads.typeLyrics` | Songtext eintippen |
| `uploads.lyricsHistory` | Frühere Fassungen ({{count}}) |
| `uploads.lyricsFromPdf` | Als Text übernehmen |

## 10. Out of Scope / Later

- Recording audio directly in the app (e.g. voice memo of a new idea)
- Uploads that continue after the app is closed (background sync)
- Deleting uploaded files from the app
- Other attachments for songs (tabs, chord sheets, sheet music PDFs) – decided: not in v1 (future plans)
- Offline upload queue (with L1)

## 11. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Upload location | ~~One folder per song under the upload root~~ → **Member chooses the folder per upload, anywhere in the HiDrive home (create-only)**, with a pre-selected folder (§4) – changed 2026-09-28 |
| 1a | Picker for | **All** uploads: audio files, lyrics files and typed lyrics (§4.3) – changed 2026-09-28 |
| 2 | Lyrics | Upload **and** type in the app (saved as `.txt`); edits create new files, old versions stay as history |
| 3 | Other attachments | Only audio + lyrics in v1 |
