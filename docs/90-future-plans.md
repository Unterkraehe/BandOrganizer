# Future Plans

> Features planned for after v1. The v1 architecture already prepares for them — the "Prepared by" column lists which decisions keep these doors open. Before starting one of these, move it into its own feature file.

## 1. Planned Features

| # | Feature | Description | Prepared by |
|---|---|---|---|
| L1 | **Offline mode / caching** | Use songs, lyrics, setlists and calendar without internet (e.g. on stage, in the rehearsal room basement). Choose songs/setlists to keep offline; queue changes and upload later. | PWA + service worker, IndexedDB, repositories as single data access point, one file per record (easy to merge queued changes) |
| L2 | **Multiple bands** | Switch between bands, each with its own storage (HiDrive account/folder). Separate member profiles per band. | R-CODE-03 band-scoped repositories, `app.json` per band folder |
| L3 | **Other cloud providers** | Google Drive, maybe Dropbox, OneDrive, Nextcloud/WebDAV. | `StorageProvider` interface (R-CODE-01), provider-specific code isolated in `core/storage/<provider>/` |
| L6 | **Lyrics export for singers** | PDF with the lyrics of all songs of a setlist in setlist order, including setlist notes, plus song notes each member flagged as "setlist-relevant". | F7 setlist structure, F4 lyrics renderers, note IDs |
| L4 | **Further main features** | New modules added via the feature registry. | R-CODE-02 feature modules + menu registry |

## 2. Notes per Planned Feature

### L1 Offline mode
- Needs decisions: storage limits on phones (especially iOS), which content is cached automatically, how to show "offline available".
- Conflict handling for queued offline changes builds on R-DATA-07.

### L2 Multiple bands
- Band switcher in the top bar / settings.
- Tokens and caches stored per band on the device.
- Question: can one member profile span multiple bands, or separate profiles per band?

### L6 Lyrics export for singers
- In the song view, any note (public or private) can be flagged **"setlist-relevant"**. The flag is **per member** – also on public notes, so Lisa can flag a public note for her export without affecting Tom's.
- Export: one PDF in setlist order: cover page (setlist name, event), per song the lyrics + setlist entry notes + the exporting member's personal entry notes + the member's flagged song notes; blocks/pauses/interludes as separators.
- Technical notes: PDF lyrics need page merging (e.g. pdf-lib), docx/txt lyrics are laid out as text; generated in the browser; saved via the system dialog or into `_BandApp/exports/` (R-DATA-03).
- Planned storage for flags: `_BandApp/songs/<songId>/notes/flags/<memberId>.json` → `{ "setlistRelevant": ["n_…", "n_…"] }` (one file per member, no conflicts).

### L3 Other providers
- Each provider needs its own OAuth registration and backend config.
- Feature code must not change — if it has to, the interface is wrong and gets fixed first.

## 3. Ideas Backlog (not yet decided)

- Push notifications: ✅ chat messages and event changes since v0.13.0 (F6 §4.6). Still open: reminders before events, notification for **new** events, per-chat mute
- Attendance (Zu-/Absagen) per gig/rehearsal – ✅ done in F5 (v0.7.0)
- Practice mode: play a setlist as playlist, speed control, A–B loop – ✅ done (setlist mode v0.8.0, practice view v0.6.0)
- Photo gallery for live photos on HiDrive
- Band finances (Bandkasse): income, expenses, gig fees
- Equipment / backline list and "who brings what"
- Contacts: venues, organizers, sound engineers
- Tasks / to-do list for the band
- Upload new song ideas/voice memos from the phone
- Chord sheets and more song attachments (tabs, sheet music PDFs) via F10 uploads
- Setlist print/stage view: optional key, tuning and duration per song
- More lyrics formats (.doc, .odt, .rtf, .pages, photos with OCR) via the pluggable renderers from F4
- Calendar export (ICS) for personal calendars
- Additional UI languages (e.g. English)
- Band-specific app icon on the home screen (needs per-band manifest/icon generation)
- Profile photos and optional profile PIN (F2 keeps the data model ready)

Ideas move from here to section 1 once the band decides to build them.
