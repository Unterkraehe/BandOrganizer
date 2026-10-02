# F7 – Setlists

| | |
|---|---|
| **ID** | F7 |
| **Status** | Implemented (v0.8.0); print layout reworked in v0.12.1 – v0.12.3 |

> **Print layout (v0.12.1)** – modelled on the band's own sheet "Playlist Beimerstetten":
> - Every block on its own A4 page: header row with the block name (large) and "<Setlist name> - Stand: <last change, dd.mm.yy>".
> - Table **Song | Interpret | Info / Bemerkung**; small continuous numbers at the left; a grey bar joins songs played as a group (between two announcements; single songs get no bar).
> - Direct transitions: red U-turn arrow + "DIREKT" between the two rows.
> - Interludes as red "--- Ansage ---" rows with their own Info column (`InterludeEntry.note`).
> - Pause box after each block except the last, with its own text (`Block.pauseNote`, e.g. "Pausenmusik!!!") and the minutes.
> - Songs got an optional **Interpret** (`SongMeta.artist`, song edit form). The Interpret column is on by default when any song in the setlist has one (switchable, like "Meine Notizen drucken"; own notes appear in the Info column).
> - **Readability (v0.12.2):** song titles bold; row height and title size are computed per block so the rows fill the A4 page (few songs: up to 64 px rows / 32 px titles; many songs: down to 44 px / 24 px, still one page for ~22 rows). Longer blocks continue on the next page with the header repeated.
> - **Arrows (v0.12.2):** SVG U-turn with dark outline, red gradient and a proper head, centred on the line between the two songs; small "DIREKT" label above it.
> - Colors are kept when printing (`print-color-adjust: exact`). Fixed along the way: printing from a desktop placed the content into the hidden sidebar column.

> **Implementation notes (v0.8.0)**
> - Editor keeps a local draft with undo/redo (100 steps) and saves explicitly; leaving with unsaved changes asks first (router blocker).
> - Drag & drop via pointer events on the grip handle (mouse and touch), plus menu actions (up/down, move to block) for keyboard use.
> - Arrows (`segueToNext`) are normalised on save: only between two songs of the same block.
> - Conflict on save → "Deren Version laden" or "Meine als Kopie speichern".
> - Setlist mode: device-local (`bandapp.setlistMode`), queue = playable song entries; auto-advance (default on) and arrows use the engine's new `ended` counter.
> - Print uses the browser's print dialog; app chrome is hidden with `data-no-print`; blocks use `break-inside: avoid`.
> - The red arrow is a bold "↓" character, so it also shows in black-and-white prints.
> - Rehearsal suggestions look back 3 years of past, not cancelled events with a setlist.
| **Depends on** | F2 (members), F4 (songs, archive, tags), F5 (events), F9 (duration, setlist mode) |
| **Used by** | F3 (setlist mode, dashboard), F5 (event ↔ setlist), F8 (search) |

## 1. Goal

Build setlists for gigs and rehearsals quickly: blocks of songs, notes between songs, direct transitions, durations. Use them on stage (stage view), on paper (print), and for practice (setlist mode). Rehearsal setlists get smart suggestions for songs that haven't been played in a while.

Existing setlists on HiDrive (possibly PDFs) are **not** imported or considered.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I create a setlist with several blocks (Set 1, Set 2, Zugabe). |
| US-2 | I pick songs from all available songs, search, filter by tags, and add several at once. |
| US-3 | I reorder songs by drag & drop, also between blocks, also on the phone. |
| US-4 | I add a note between songs, e.g. "Ansage: Merch-Stand". |
| US-5 | I mark that two songs are played without a break (red arrow). |
| US-6 | I add short notes to songs in the setlist that everyone sees, and my own short notes only I see. |
| US-7 | I load a previous setlist, change it and use it as the new setlist for another event. |
| US-8 | I link a setlist to a gig or rehearsal. |
| US-9 | For a rehearsal setlist, the app suggests songs we haven't played in a while. |
| US-10 | I print the setlist; blocks don't get split across pages. |
| US-11 | On stage I use a large, dark stage view on a tablet or phone. |
| US-12 | I see the duration per block and in total. |

## 3. Structure of a Setlist

```
Setlist "Stadtfest 2026"                     (linked to: Auftritt Sa, 10. Okt.)
├─ Block "Set 1"                             ⏱ 42 Min.
│   1  Hell Is Empty          [Intro länger]           ← entry note (public)
│   2  Burning Sky                                      
│      ↓ (red arrow: direct transition)
│   3  Ashes
│   ── Ansage: Merch-Stand ──                           ← interlude entry
│   4  Night Drive           (my note: Solo 2× – only on my print/stage view)
├─ Pause 20 Min.                             ← between blocks
├─ Block "Set 2"                             ⏱ 38 Min.
│   5  …
└─ Block "Zugabe"
```

| Element | Description |
|---|---|
| **Block** | Named group of entries ("Set 1", "Set 2", "Zugabe"). A setlist has 1…n blocks. Between two blocks there is an optional **Pause** with duration. |
| **Song entry** | Reference to a song (plays its Band-Version). Has: optional **entry note** (public, short, setlist-specific), optional **direct transition** to the next song (red ↓). |
| **Interlude entry** ("Zwischenpunkt") | Text line between songs: "Ansage: …", "Gitarrenwechsel", "Stimmen auf Drop D". Optional duration (e.g. 2 Min.). Not numbered. |
| **Personal entry note** | Each member's own short note per song entry, shown only to them (stage view, print, setlist mode). |

## 4. Screens & UI

### 4.1 Setlist-Übersicht (`/setlists`)

- List, newest first: name, linked event(s) with date, number of songs, total duration.
- Grouped: "Anstehend" (linked to future events), "Ohne Termin", "Vergangen".
- Search field; filter "Auftritte" / "Proben".
- Button **"Neue Setlist"** → choice:
  - "Leer beginnen"
  - "Aus vorheriger Setlist" → pick a setlist → creates a **copy** (§6.5)
- Row menu: "Duplizieren", "Drucken", "Bühnenansicht", "Setlist üben", "Löschen".

### 4.2 Setlist-Detail (`/setlists/:id`)

Read view (default for everyone):
- Header: name, linked event(s), total duration, song count
- Blocks with numbered songs, interludes, arrows, notes (public + my personal ones)
- **v0.18.0 (R-UX-09):** the setlist page is the one setlist screen for every entry point (list, event card, chat card, player queue). Layout like the song page: ← · ✎ · ⋯ in the top bar, title large below, one action pair **"Abspielen"** + **"Bühnenansicht"**; ⋯ = Drucken, Duplizieren, Mit Termin verknüpfen. The editor closes after "Speichern" like every form (back where you came from); a new or duplicated setlist shows its page instead. Row menu in the list also has "Bearbeiten".
- Actions (original design): **"Setlist abspielen"** (until v0.15 "Setlist üben"; plays in the player, F3 §5), **"Bühnenansicht"**, **"Drucken"**, "Bearbeiten", "Duplizieren", "Mit Termin verknüpfen"
- My personal notes can be edited inline here without entering edit mode (small ✎ next to each song).

### 4.3 Setlist-Editor (`/setlists/:id/edit`)

**Layout**
- Desktop/tablet landscape: two columns – **song picker** left, **setlist** right; drag songs from left to right.
- Phone/tablet portrait: setlist full width; **"+ Songs hinzufügen"** opens the picker as a full-screen sheet.

**Setlist side**
- Name (default: event name + date, or "Neue Setlist")
- Kind: Auftritt / Probe (pre-set from the linked event; controls suggestions §6.6)
- Blocks: "+ Block", rename, reorder, delete (only when empty, or with confirmation that its songs are removed)
- Between blocks: "Pause" with minutes (default 20)
- Per entry (swipe or ⋯ menu): drag handle, remove, "Notiz", "Direkt weiter ↓" toggle, move to block …
  - ⏮ / ⏭ (mini player, player, setlist bar) are disabled when no playable song precedes / follows (v0.19.5, R-UX-10).
  - A tap (or Enter) on the drag handle without dragging explains how: "Zum Verschieben gedrückt halten und ziehen – oder im ⋯-Menü …" (v0.19.5, R-UX-10).
- "+ Zwischenpunkt" between any two entries (text, optional minutes)
- Live durations per block and total; songs without known duration show "?" and a hint "Dauer unbekannt – einmal abspielen"
- Undo/redo for every change (R-UX-04)

**Song picker**
- **All available songs**, active first; search field; tag filter chips (F4 §6.11); "Archivierte Songs anzeigen" at the end (F4 §6.10).
- Each row: title, duration, key, tags, ▶ preview (plays via mini player), **"+"** to add to the currently selected block.
- Multi-select mode: select several → "Hinzufügen (5)".
- Songs already in the setlist are marked ✓ (can still be added again, with hint "Schon in der Setlist").
- **Suggestions tab** "Lange nicht gespielt" for rehearsal setlists (§6.6).

**Saving:** explicit "Speichern" (with unsaved-changes warning), because reordering produces many intermediate states and several members could edit.

### 4.4 Bühnenansicht (`/setlists/:id/stage`)

- Dark background, very large song titles, high contrast, landscape and portrait.
- Continuous numbering, entry notes small below the title, **my** personal notes in a distinct style (e.g. italic, my color), interludes as full-width lines, **red ↓ arrows** between directly connected songs, block headers with pause lines.
- Tap a song → marks it as "current" (highlight) so you keep your place; swipe/arrow keys move the highlight.
- Font size A− / A+ (remembered per device); screen stays on (Wake Lock).
- No audio controls by default (stage use); "Setlist üben" is separate.

### 4.5 Drucken

- Opens a print preview page (`/setlists/:id/print`) with a print-optimized layout, then the system print dialog (also "Als PDF speichern").
- **Per member:** the print contains the public entry notes **and the printing member's personal notes**.
- Layout (A4 portrait, proposal):
  - Header: setlist name, event date + location (small)
  - Continuous numbering, large bold song titles
  - Small notes below titles; interludes in italics between songs
  - Red ↓ between directly connected songs (also as a bold "↓" symbol so it's visible in black-and-white prints)
  - Block headers ("Set 1 · 42 Min."), pause lines
- **Page breaks never inside a block** (`break-inside: avoid` per block). Only if a single block is longer than one page, it is split and the next page starts with "Set 1 (Fortsetzung)".
- Print option (checkbox, remembered per device): "Meine Notizen drucken" (on). No further print options in v1.

## 5. Linking Setlists and Events

- An event (or a single occurrence of a series) links to at most one setlist (F5 §6.6).
- A setlist can be linked to **several** events (e.g. the same rehearsal setlist for two rehearsals). Editing then shows "Diese Setlist ist mit 2 Terminen verknüpft – Änderungen gelten für alle" and offers "Stattdessen Kopie bearbeiten".
- Link from either side: event detail "Setlist verknüpfen" or setlist "Mit Termin verknüpfen" (picker of upcoming events, most recent first).
- The event reference lives on the **event** (`setlistId`), so the setlist file doesn't need to change when linking.

## 6. Behaviour & Rules

### 6.1 Entries and numbering
- Songs are numbered **continuously across all blocks** (1…n): if Set 1 ends with song 14, the first song of Set 2 is 15. Interludes and pauses are not numbered.
- Durations use the song's **Band-Version** duration (F4 §6.6), plus interlude minutes; pauses between blocks count only for the total, not for block durations.

### 6.2 Direct transitions (red arrow)
- A song entry can be marked "Direkt weiter" → the arrow connects it to the **next song** in the same block. Interludes in between are not allowed while the arrow is set (the editor warns and asks which to keep).
- Last song of a block can't have an arrow.
- In setlist mode (F3 §5), a direct transition makes the next song start immediately, even if auto-advance is off.

### 6.3 Notes in a setlist
- **Entry note (public):** short, setlist-specific, max. 80 characters, visible to everyone, printed for everyone. Independent from the song's general notes.
- **Personal entry note:** max. 80 characters, only visible to its author (R-SEC-01), stored separately per member (§7) so members never overwrite each other.
- Song-level public notes (F4) are **not** printed automatically (too long). Selected song notes on exports are a planned future feature (future plans L6).

### 6.4 Archived and missing songs
- Archived songs can be added (picker shows them at the end) and are marked with the archive icon.
- If a song's audio file disappears, the entry stays with "Datei fehlt"; durations show "?".

### 6.5 Reusing previous setlists
- "Aus vorheriger Setlist" / "Duplizieren" creates a **new** setlist (new ID, name "Kopie von …" editable) with all blocks, entries, entry notes and transitions. Links to events are **not** copied; the editor then asks "Mit welchem Termin verknüpfen?".
- Personal notes are copied **for the member who duplicates** only (their own notes); other members' personal notes stay with the original.
- The original setlist is never changed by this.

### 6.6 Rehearsal suggestions ("Lange nicht gespielt")
- Shown in the editor when the setlist kind is **Probe**.
- **"Played"** = the song appeared in a setlist linked to a **past, not cancelled** gig or rehearsal (history derived from setlists + events, no extra tracking).
- Candidates: all **active** (not archived, not hidden) songs **not already** in this setlist.
- Sorted: never played first, then longest time since last played. Each row shows "Zuletzt gespielt: vor 3 Monaten (Probe 12.06.)" or "Noch nie gespielt".
- **No time threshold:** the list is simply ordered by "last played", oldest first (never played at the very top), and the **first 10** are shown. "Mehr anzeigen" loads the next 10.
- One tap "+" adds a suggestion to the current block. Tag filters apply to suggestions too.

### 6.7 Editing, conflicts, deleting
- Any member can create and edit any setlist.
- Conflict check on save (R-DATA-07): "Lisa hat diese Setlist gerade geändert" → "Ihre Version laden" / "Meine als Kopie speichern". Never silent overwrite.
- Delete = soft delete (R-DATA-05) with undo; linked events then show "Setlist nicht mehr vorhanden" (F3 §9).

## 7. Data Model & Storage

```
_BandApp/setlists/<setlistId>/
├─ setlist.json
└─ personal-notes/<memberId>.json
```

### 7.1 `setlist.json`

```json
{
  "id": "s_8h2k1q",
  "schemaVersion": 1,
  "name": "Stadtfest 2026",
  "kind": "gig",
  "blocks": [
    {
      "id": "b_1",
      "name": "Set 1",
      "pauseAfterMin": 20,
      "entries": [
        { "id": "x_1", "type": "song", "songId": "song_9c2f1a7e", "note": "Intro länger", "segueToNext": false },
        { "id": "x_2", "type": "song", "songId": "song_1a2b3c4d", "note": null, "segueToNext": true },
        { "id": "x_3", "type": "song", "songId": "song_5e6f7a8b", "note": null, "segueToNext": false },
        { "id": "x_4", "type": "interlude", "text": "Ansage: Merch-Stand", "durationMin": 2 }
      ]
    },
    { "id": "b_2", "name": "Zugabe", "pauseAfterMin": null, "entries": [] }
  ],
  "copiedFrom": null,
  "createdAt": "…", "createdBy": "m_…", "updatedAt": "…", "updatedBy": "m_…",
  "deletedAt": null, "deletedBy": null
}
```

- `kind`: `gig` | `rehearsal` (pre-set from the linked event, editable).
- Entry IDs are stable, so personal notes survive reordering.

### 7.2 `personal-notes/<memberId>.json`

```json
{ "schemaVersion": 1, "notes": { "x_1": "Solo 2×", "x_3": "Kapo raus" }, "updatedAt": "…" }
```

Notes for entries that no longer exist are ignored (kept in the file, never shown).

## 8. Search Contribution

Setlist names, entry notes, interlude texts; "In welchen Setlists ist Song X?" (song detail F4 §4.2 uses the same index). Own personal notes only.

## 9. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Very long block (longer than one A4 page) | Split with "(Fortsetzung)" header – the only allowed break inside a block |
| Same song twice | Allowed, hint "Schon in der Setlist" |
| Song version grouping changes (F4 §6.8) | Entries reference the song, not a file – nothing breaks |
| Song grouped into another (`mergedInto`) | Entry follows automatically to the target song |
| Print on a phone | System print/share dialog; layout identical |
| Two members edit personal notes at the same time | Separate files per member – no conflict |

## 10. i18n Keys (examples)

| Key | German text |
|---|---|
| `setlists.new.empty` / `.fromPrevious` | Leer beginnen / Aus vorheriger Setlist |
| `setlists.block.add` / `.pause` | Block hinzufügen / Pause ({{min}} Min.) |
| `setlists.entry.segue` | Direkt weiter |
| `setlists.entry.interlude` | Zwischenpunkt |
| `setlists.entry.note` / `.myNote` | Notiz / Meine Notiz |
| `setlists.picker.add` | Hinzufügen ({{count}}) |
| `setlists.picker.alreadyIn` | Schon in der Setlist |
| `setlists.suggest.title` | Lange nicht gespielt |
| `setlists.suggest.lastPlayed` | Zuletzt gespielt: {{ago}} ({{event}}) |
| `setlists.suggest.never` | Noch nie gespielt |
| `setlists.linkedMany` | Diese Setlist ist mit {{count}} Terminen verknüpft – Änderungen gelten für alle |
| `setlists.stage` / `.print` | Bühnenansicht / Drucken |
| `setlists.print.continued` | {{block}} (Fortsetzung) |

## 11. Changes to Other Features

- **F3 setlist mode:** respects blocks (block header in the banner), interludes (shown as separators), direct transitions (always continue).
- **F4:** song detail "In Setlists: …" uses setlist data; archive and tag filters reused in the picker.
- **F5:** event ↔ setlist link unchanged (`setlistId` on the event/occurrence); past events feed the "played" history.

## 12. Out of Scope / Later

- Lyrics PDF export for singers with setlist-relevant notes (future plans **L6**)
- Import of old setlists (PDF/Excel)
- Sharing a setlist publicly (e.g. with the sound engineer) as a link
- Extra print/stage info per song (key, tuning, duration) as optional checkboxes

## 13. Decisions & Pending

| # | Topic | Status | Value |
|---|---|---|---|
| 1 | Old setlists | ✅ decided | Not imported / not considered |
| 2 | Structure | ✅ decided | Blocks; no page breaks inside a block when printing |
| 3 | Print/stage content | ✅ decided | Numbering, song names, short public notes, personal notes, interludes ("Ansage"), red arrows for direct transitions |
| 4 | Creating | ✅ decided | All songs selectable + search; load previous setlist, edit, use for another event |
| 5 | Rehearsal suggestions | ✅ decided | Active songs not played in a while |
| 6 | Numbering | ✅ decided | Continuous across blocks (Set 2 continues e.g. with 15) |
| 7 | Public notes on print/stage | ✅ decided | Setlist-specific entry notes only |
| 8 | Suggestions | ✅ decided | No threshold: order by last played (oldest/never first), show first 10 |
| 9 | Extra print info (key, tuning, duration) | ✅ decided | Not in v1 – future suggestion |
