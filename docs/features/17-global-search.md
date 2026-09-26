# F8 – Global Search

| | |
|---|---|
| **ID** | F8 |
| **Status** | Planned – ready for implementation |
| **Depends on** | F2, F4, F5, F6, F7 |
| **Used by** | – (consumer of all features) |

## 1. Goal

One search field, reachable from everywhere, that finds **app items** in a fraction of a second: songs, lyrics lines, notes, dates, setlists, chat messages, members, tags and settings. HiDrive files are **not** searched by name or content (decision) – the search is about the band's content inside the app.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I type part of a lyric line and find the song, and it opens right at that line. |
| US-2 | I type a venue ("Stadtfest") and find the gig, its setlist and the chat discussion about it. |
| US-3 | I type "okt" and see the dates in October. |
| US-5 | I find my own private note about a solo. |
| US-6 | Typos and umlauts don't matter ("Grüsse", "gruesse", "Gruße" all work). |
| US-7 | I find settings ("Dunkelmodus") without clicking through menus. |

## 3. Screens & UI

### 3.1 Opening the search
- Search icon in the top bar on every screen (F3); desktop: search field in the top bar + **`Ctrl/⌘ + K`**.
- Phone: full-screen search page (`/search`), keyboard opens immediately.
- Tablet/desktop: overlay panel ("command palette") above the current screen; `Esc` closes it; the underlying screen stays as it was.
- Deep link: `/search?q=stadtfest`.

### 3.2 Before typing
- **Letzte Suchen** (last 8 on this device, "Verlauf löschen").
- **Schnellzugriff:** next event, current setlist, recently opened songs (max. 3 each).

### 3.3 Results
- Results appear while typing (from 2 characters, debounced ~150 ms).
- **Filter chips:** Alle · Songs · Songtexte · Termine · Setlists · Notizen · Chat · Mitglieder.
- **Grouped by type** in a fixed order: **Songs → Songtexte → Termine → Setlists → Notizen → Chat → Mitglieder → Einstellungen**. Empty groups are not shown. Each group shows the best **5** hits + "Alle 23 anzeigen" (switches to that filter).
- Each result row:
  - Type icon
  - Title (e.g. song title, event title + date, setlist name)
  - Snippet with the **matched words highlighted** (e.g. lyrics line, note text, message text)
  - Context line: "Songtext · Hell Is Empty", "Notiz von Lisa", "Nur für dich", "Chat · Do, 12. Sep.", "Auftritt · Sa, 10. Okt. · vergangen"
- **Archived songs** (F4 §6.10): not in the main results; at the end of the songs/lyrics groups a collapsed "3 Treffer im Archiv anzeigen".
- Keyboard: ↑/↓ select, Enter opens; on phones tap.
- No results: "Nichts gefunden für ‚xyz'" + hint "Tippfehler? Versuch es mit einem kürzeren Begriff." + "Im Archiv suchen" if archived hits exist.

### 3.4 What a result opens

| Type | Opens |
|---|---|
| Song (title, tag, key) | Song detail |
| Lyrics hit | Song detail, **Songtext** tab, scrolled to the matching line, line highlighted (PDF: page with the hit) |
| Song note (public / own private) | Song detail, notes tab, note highlighted |
| Event | Event detail (for series: the matching/next occurrence) |
| Setlist (name, entry note, interlude, own personal note) | Setlist detail, entry highlighted |
| Chat message | Chat scrolled to the message, highlighted (or item discussion if it has context) |
| Member | Member detail (F2) |
| Tag | Song list filtered by that tag |
| Setting / menu item | That screen |

## 4. Search Sources (what is indexed)

| Source | Fields | Notes |
|---|---|---|
| Songs (F4) | display title, version labels, tags, key, tuning | archived → separate group; hidden files excluded; file names/paths are **not** indexed |
| Lyrics (F4) | full text, per line | pdf (if it contains text), docx, txt; extracted once per file, cached by modification time |
| Song notes (F4) | text, author | public notes + **only my own** private notes |
| Events (F5) | title, type name, location, description, date terms | past events included, marked "vergangen"; cancelled marked |
| Setlists (F7) | name, entry notes, interlude texts, song titles in it, own personal notes | |
| Chat (F6) | text, author, context item | deleted messages excluded; system info lines included |
| Members (F2) | name, instrument | active; former ones marked |
| Tags (F4) | name | |
| Navigation & settings (F3) | labels + synonyms ("Dunkelmodus", "dark", "Nachtmodus") | |

## 5. Matching Rules

- **Normalization** (same for index and query): lowercase; `ä→ae`, `ö→oe`, `ü→ue`, `ß→ss` and additionally the plain vowel form (`ä→a`), so "Grüße", "Gruesse", "Grusse" all match; other accents removed; punctuation ignored.
- **Prefix matching:** "burn" finds "Burning Sky".
- **Typo tolerance:** 1 typo for words with ≥ 4 characters, 2 for ≥ 8.
- **Multiple words:** all words must match (AND), in any order.
- **Ranking:** exact title match > title prefix > other title/name hits > content hits; newer items rank higher on ties (upcoming events before past ones).
- **Dates:** month names and abbreviations ("Oktober", "okt"), weekdays, and `dd.mm.` / `dd.mm.yyyy` match events on those dates. "heute", "morgen", "übermorgen", "nächste Woche" too. Without a year, upcoming dates rank first.
- No stop-word removal (song titles like "The End" must stay findable).
- **Shared normalizer:** the song list filter (F4), setlist song picker (F7) and member pickers use the same normalization functions (`core/search/normalize.ts`), so search feels identical everywhere (R-UX-06).

## 6. Behaviour & Rules

### 6.1 Index lifecycle
- Client-side full-text index (MiniSearch) in a **Web Worker**, so typing never stutters.
- Built from cached data at app start; persisted in IndexedDB for instant availability; **updated incrementally** when data changes (repositories emit change events).
- Lyrics text extraction runs in the background after the scan, throttled; the index is usable before it's finished ("Songtexte werden noch indexiert …" hint in the lyrics group).
- Chat history is loaded month by month in the background for indexing.
- Scope: per band and **per member** (contains private notes). Logout/profile switch deletes it (F2 §5.5); rebuild on next login.

### 6.2 Feature contribution (R-CODE-02)
Each feature provides a `search.ts`:

```ts
interface SearchSource {
  type: SearchResultType;                    // "song" | "lyrics" | "event" | …
  labelKey: string;                          // group title
  getDocuments(ctx): Promise<SearchDoc[]>;   // initial build
  onChange(cb: (changes: SearchDocChange[]) => void): Unsubscribe;
  open(hit: SearchHit): RouteTarget;         // where a result leads
}
```

Adding a new feature to the search = adding one `SearchSource`; the search UI doesn't change.

### 6.3 Privacy
- Other members' private notes and personal setlist notes are never loaded into the index (R-SEC-01).
- Recent searches are stored device-locally only and cleared on logout.

### 6.4 Performance targets
- Results visible < 100 ms after the debounce for ~100 songs with lyrics, ~1,000 chat messages and all other app items.
- Index size on the device: a few MB.

## 7. Data Model & Storage

Nothing on HiDrive. Device-local (IndexedDB):

| Key | Content |
|---|---|
| `search-index:<bandId>:<memberId>` | serialized index + version |
| `lyrics-text:<fileId>:<mtime>` | extracted plain text per lyrics file |
| `recent-searches:<bandId>` | last 8 queries |

## 8. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Index still building | Show partial results + small hint; complete as soon as ready |
| Scanned PDF without text layer | Only file name/song title searchable; lyrics group hint "Text nicht durchsuchbar" on that song (future: OCR) |
| Item deleted after indexing | Removed via change event; if opened anyway: "Nicht mehr vorhanden" |
| Very generic query ("a") | Min. 2 characters |
| Offline | Search works on the cached index |

## 9. i18n Keys (examples)

| Key | German text |
|---|---|
| `search.placeholder` | Suchen … |
| `search.recent` / `.clearRecent` | Letzte Suchen / Verlauf löschen |
| `search.groups.songs` / `.lyrics` / `.events` / `.setlists` / `.notes` / `.chat` / `.members` / `.settings` | Songs / Songtexte / Termine / Setlists / Notizen / Chat / Mitglieder / Einstellungen |
| `search.showAll` | Alle {{count}} anzeigen |
| `search.archivedHits` | {{count}} Treffer im Archiv anzeigen |
| `search.empty` | Nichts gefunden für „{{q}}" |
| `search.emptyHint` | Tippfehler? Versuch es mit einem kürzeren Begriff. |
| `search.indexing` | Songtexte werden noch indexiert … |
| `search.context.private` | Nur für dich |

## 10. Changes to Other Features

- **F4 / F7:** list and picker filters use the shared normalizer (§5).
- **F2:** logout clears index and recent searches (already defined).
- **F4 song detail / F7 / F6:** support "highlight target" parameters in their routes (e.g. `?line=12`, `?note=n_…`, `?message=c_…`).

## 11. Out of Scope / Later

- OCR for scanned lyrics PDFs and photos
- Searching HiDrive files by name or content (decided against for v1; could be added as its own `SearchSource`)
- Saved searches

## 12. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Scope | **App items only** (songs, lyrics, notes, events, setlists, chat, members, tags, settings). No HiDrive file search – neither names nor content |
| 2 | Result layout | Grouped by type, fixed order Songs → Songtexte → Termine → Setlists → Notizen → Chat → Mitglieder → Einstellungen |
| 3 | Date search | Yes in v1 ("okt", "10.10.", "morgen", "nächste Woche") |
| – | Archived songs | Collapsed group at the end (F4) |
