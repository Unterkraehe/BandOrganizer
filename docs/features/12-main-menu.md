# F3 – Main Menu & App Shell

| | |
|---|---|
| **ID** | F3 |
| **Status** | Planned – ready for implementation |
| **Depends on** | F1, F2 |
| **Used by** | all features |

## 1. Goal

The frame of the app: start screen, navigation, top bar, mini player, settings and app-wide notices. It must work on every screen size and grow with new features without redesign.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | When I open the app, I first see new chat messages, then what's coming up. |
| US-2 | From an upcoming rehearsal on the start screen, I open its setlist's songs in one tap and start practicing. |
| US-3 | I reach Songs, Kalender and Chat in one tap from anywhere. |
| US-4 | I can search from any screen. |
| US-5 | A song keeps playing while I navigate, and I can control it from anywhere. |
| US-6 | When a new app version is available, I'm told and can update with one tap. |

## 3. Layout per Device

| | Phone (< 768 px) | Tablet (768–1199 px) | Desktop (≥ 1200 px) |
|---|---|---|---|
| Main navigation | Bottom bar | Navigation rail (icons + short labels, left) | Full sidebar (left) |
| Items shown | Start, Songs, Kalender, Chat, **Mehr** | all items | all items |
| Search | Icon in top bar | Icon in top bar | Search field in top bar + `Ctrl/⌘ + K` |
| Mini player | Above the bottom bar | Bottom of the screen | Bottom of the sidebar |
| Profile | Avatar in top bar → "Mein Profil" | same | Bottom of sidebar |

### Navigation items (fixed order, same for everyone)

| Order | Item | Icon (proposal) | Phone | Badge |
|---|---|---|---|---|
| 1 | Start | home | bottom bar | – |
| 2 | Songs | music | bottom bar | – |
| 3 | Kalender | calendar | bottom bar | – |
| 4 | Chat | message | bottom bar | unread count |
| 5 | Setlists | list-ordered | Mehr | – |
| 6 | Mitglieder | users | Mehr | – |
| 7 | Einstellungen | settings | Mehr | – |
| … | future features | – | Mehr | – |

- Menu order is **fixed**, not customizable (decision: no reason for rearrangement).
- Icons from one icon set (proposal: Lucide), always shown with a text label (R-UX-06).

## 4. Screens

### 4.1 Start (dashboard)

Widgets in fixed order. Each widget is provided by its feature via the widget registry (§6.2).

**① Neue Nachrichten** (from F6 Chat)
- If unread messages exist: header "Neue Nachrichten (3)", the latest up to **3** messages (avatar, name, first line, time), button "Zum Chat".
- If nothing is unread: one compact line "Keine neuen Nachrichten" with a link to the chat. Doesn't take space from the events.

**② Nächste Termine** (from F5 Calendar)
- Header "Nächste Termine", link "Alle Termine".
- Shows the next **5** upcoming gigs, rehearsals and other events, **no matter how far in the future** (no time limit). Absences don't count toward the 5.
- Each event card:
  - Type icon + color (Auftritt, Probe, Abwesenheit, Sonstiges)
  - Relative date: "Heute", "Morgen", otherwise "Sa, 10. Okt."; time; location
  - Conflict hint if a member is absent: "Tom ist abwesend"
  - Answer summary ("4 ✓ · 1 ? · 1 ✗ · 1 offen") and **my answer buttons** ✓ / ? / ✗ directly on the card; "Antwort fehlt" marker if I haven't answered (F5 §6.1)
  - **If a setlist is attached:** setlist name + number of songs and a prominent button **"Setlist üben"** → opens Songs in setlist mode (§5) with that setlist.
  - Tap on the card (outside the button) → event detail.
- Absences appear as additional compact lines ("Tom abwesend · 12.–19. Okt."), but only those that overlap one of the 5 shown events or start within the next 14 days.
- Empty state: "Keine anstehenden Termine" + button "Termin anlegen".

Later widgets (examples): recently added songs, open tasks. They are appended after ② unless decided otherwise.

### 4.2 Mehr (phone only)

Simple list of the remaining navigation items (Setlists, Mitglieder, Einstellungen, future features) with icon and label.

### 4.3 Einstellungen

| Section | Content |
|---|---|
| Mein Profil | → F2 (edit, Profil wechseln, Abmelden) |
| HiDrive | Connection status, "Verbindung trennen" (F1) |
| Songs finden | Excluded folders, "Jetzt neu suchen" with last scan time (F1) |
| Darstellung | Wie System (default) / Hell / Dunkel (R-UI-06) |
| Band | Band name, band color, optional logo (`02-design-system.md` §8) – visible to all members |
| Sprache | hidden until a second language exists (R-I18N-01) |
| Über die App | App name, version, "Nach Updates suchen" |

### 4.3a Swipe navigation, keyboard (phones, v0.11.0)
- **Swipe left/right** on Start, Songs, Kalender, Chat or Mehr moves to the neighbouring bottom-bar tab (short fade). Ignored: vertical-ish moves, starts within 24 px of a screen edge, text fields, sliders, dialogs/menus, horizontally scrollable areas (chip rows, PDF) and elements marked `data-no-swipe` (month grid). Not active on detail screens and on tablet/desktop.
- **On-screen keyboard:** while it is open the bottom bar and mini player step aside (`--kb-inset`, `data-keyboard` on `<html>`), so the chat input sits right above the keyboard.
- **Bottom space:** the mini player's space is always reserved; `--dock-h` (bar + mini player if shown) tells pinned elements where the bottom edge of the free area is.
- Top bar titles stay on one line (ellipsis); the "+" buttons of Songs/Kalender/Setlists show only the icon on narrow phones.

### 4.4 Top bar

- Left: screen title (on sub-screens: back arrow + title).
- Right: search icon, profile avatar.
- On the start screen the title is the app name "Overload App" (from `app.name`, R-I18N-07).

## 5. Setlist Mode (cross-feature)

Opening a setlist "in Songs" turns the song list into a practice/rehearsal queue. Triggered by "Setlist üben" on the dashboard, event detail (F5) or setlist detail (F7).

- **Songs screen in setlist mode:**
  - Banner at the top: "Setlist: Stadtfest 2026 · 12 Songs · 48 Min." + **"Beenden"** (back to the normal song list).
  - Songs in setlist order with position numbers; block headers, pauses and interludes ("Ansage") shown as separators; direct transitions (red ↓) always continue to the next song, even with auto-advance off.
  - My personal entry notes and the public entry notes shown under each song.
  - Songs whose audio file is missing are shown greyed out with a hint and skipped during playback.
- **Song detail / fullscreen view in setlist mode:** position "3 / 12", name of the next song, buttons "Vorheriger" / "Nächster".
- **Playback:** the audio engine (F9) gets the setlist as a queue. **Auto-advance** to the next song after a song ends (default see §11). Tempo/pitch settings follow F9 rules.
- **Mini player:** shows "3 / 12" and a "next" button while in setlist mode.
- **State:** device-local only (not written to HiDrive), survives reload; ends with "Beenden" or when another setlist is opened.
- **Deep link:** `/songs?setlist=<setlistId>`.

## 6. Behaviour & Rules

> **Setlist mode implemented (v0.8.0)** – see F7 implementation notes.

### 6.1 Feature registry
Each feature registers (R-CODE-02):

```ts
interface FeatureRegistration {
  id: string;                    // "songs"
  labelKey: string;              // "nav.songs"
  icon: IconName;
  route: string;                 // "/songs"
  order: number;                 // fixed position, §3
  placement: "bottomBar" | "more";
  badge?: () => Observable<number | null>;
}
```

### 6.2 Dashboard widget registry

```ts
interface DashboardWidget {
  id: string;                    // "chat.unread"
  order: number;                 // 10 = messages, 20 = events, later ones ≥ 30
  component: ComponentType;
  isVisible?: (ctx) => boolean;
}
```

### 6.3 Routes

| Route | Screen |
|---|---|
| `/` | Start |
| `/songs`, `/songs?setlist=:id`, `/songs/:songId` | Songs (F4) |
| `/calendar`, `/calendar/:eventId` | Kalender (F5) |
| `/chat` | Chat (F6) |
| `/setlists`, `/setlists/:id` | Setlists (F7) |
| `/search` | Suche (F8) |
| `/members`, `/members/:memberId` | Mitglieder (F2) |
| `/settings` | Einstellungen |
| `/more` | Mehr (phone) |
| `/callback.html` | static OAuth callback (F1), not a router route |

- Every screen has its own URL; browser back and Android back button work as expected.
- Deep links survive reloads on GitHub Pages (SPA fallback, R-CODE-09).
- Scroll position is restored when going back to a list.
- Unsaved input (e.g. a half-written note) triggers "Änderungen verwerfen?" when leaving.

### 6.4 App-wide notices
- **No connection to HiDrive:** small bar below the top bar "Offline – zeige gespeicherte Daten" (R-UX-02/03).
- **New app version:** toast "Neue Version verfügbar" + "Aktualisieren" (service worker update). Never reload automatically while audio is playing or input is unsaved.
- **Install hint:** shown once on phones that can install the PWA ("Zum Startbildschirm hinzufügen"); on iPhone with short instructions (Teilen → Zum Home-Bildschirm). Dismissable forever.

### 6.4a "Was ist neu"
- After an update, the start screen shows a card "Neu in Version x.y.z" with 2–4 short points from `src/locales/de/whatsNew.json`, until dismissed (per device and version).

### 6.5 Start behaviour
- The app always opens on **Start**, except when opened via a deep link.
- Cached data is shown immediately, then refreshed (R-UX-07).

## 7. Data Model & Storage

Nothing on HiDrive. Device-local only:

| Key | Content |
|---|---|
| `bandapp.theme` (localStorage, read before first paint) | `light` / `dark` / `system` |
| `bandapp.whatsNewSeen` | last version whose "Was ist neu" card was dismissed |
| `setlistMode:<bandId>` | `{ setlistId, position }` |
| `installHintDismissed` | boolean |

## 8. Search Contribution

Navigation items and settings entries (e.g. "Dunkelmodus", "HiDrive", "Mitglieder").

## 9. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Attached setlist was deleted (soft) | No "Setlist üben" button; event shows "Setlist nicht mehr vorhanden" |
| Setlist contains songs whose audio file is gone | Setlist mode still opens; those songs are greyed out and skipped |
| Many unread messages | Widget shows the latest 3 + total count |
| Chat or calendar fails to load | That widget shows its own error with "Erneut versuchen"; the other widget still works |
| New member with no data yet | Friendly empty states with first actions ("Termin anlegen", "Zum Chat") |

## 10. i18n Keys (examples)

| Key | German text |
|---|---|
| `nav.start` / `nav.songs` / `nav.calendar` / `nav.chat` / `nav.more` | Start / Songs / Kalender / Chat / Mehr |
| `nav.setlists` / `nav.members` / `nav.settings` | Setlists / Mitglieder / Einstellungen |
| `dashboard.messages.title` | Neue Nachrichten ({{count}}) |
| `dashboard.messages.none` | Keine neuen Nachrichten |
| `dashboard.events.title` | Nächste Termine |
| `dashboard.events.practiceSetlist` | Setlist üben |
| `dashboard.events.empty` | Keine anstehenden Termine |
| `setlistMode.banner` | Setlist: {{name}} · {{count}} Songs · {{duration}} |
| `setlistMode.end` | Beenden |
| `app.updateAvailable` | Neue Version verfügbar |

## 11. Decisions & Proposed Defaults

| # | Topic | Status | Value |
|---|---|---|---|
| 1 | Phone bottom bar | ✅ decided | Start, Songs, Kalender, Chat + Mehr |
| 2 | Dashboard order | ✅ decided | New messages first, then upcoming events |
| 3 | Setlist button on events | ✅ decided | "Setlist üben" opens Songs in setlist mode |
| 4 | Menu rearrangement | ✅ decided | No, fixed for everyone |
| 5 | Number of messages previewed | ✅ decided | 3 |
| 6 | Upcoming events shown | ✅ decided | next 5, no time limit |
| 7 | Absences on dashboard | ✅ decided | extra compact lines, not counted in the 5; only if overlapping a shown event or starting within 14 days |
| 8 | Auto-advance in setlist mode | ✅ decided | **on** for practice; one tap to switch off (useful in rehearsals where you stop between songs) |

## 12. Out of Scope / Later

- Customizable dashboard/menu
- Push notifications
- Additional dashboard widgets
