# F5 – Calendar

| | |
|---|---|
| **ID** | F5 |
| **Status** | Implemented incl. subscription (v0.12.0; via the token helper since v0.19.1). Spike S4 answered: HiDrive share links are unsuitable (expire, download limit). S5 (.ics on iPhone/Android) pending |

> **Subscription – implementation notes (v0.12.0)**
> **v0.19.1 – subscription via the token helper (spike S4 answered):** HiDrive share links don't work as subscriptions: they expire and allow only a limited number of downloads (HiDrive API: `ttl` and `maxcount` default to the tariff maximum; a calendar app fetches every few hours), and their address is a HiDrive web page, not the file. A band member's Google subscription showed "page not found". Now: "Abo-Link erstellen" makes a random 32-character secret and uploads the band calendar (.ics) to the token helper (`PUT /calendar`, band login, KV store); the link is `…workers.dev/calendar/<secret>.ics` (served as `text/calendar`, no origin check, no expiry, no limit). Every member's app re-uploads a few seconds after calendar changes (only if the .ics changed, compared per device; only after a fresh calendar load). "Neuen Link erstellen" = new secret, the old one is deleted; "Abo beenden" deletes it. `subscription.json` (schema 2) holds `secret` + `url`; an old share-link subscription (`shareId`) shows a notice "funktioniert nicht mehr – neuen Link erstellen" and its share link is deleted when a new link is made. `band.ics` on HiDrive is no longer written. Demo mode: an example address, nothing leaves the browser. Decision log 2026-10-01.
>
> Original implementation (until v0.19.0):
> - Kalender → ⋯ → "Kalender abonnieren" (also in Einstellungen and via search). "Abo-Link erstellen" writes `_BandApp/calendar/export/band.ics` and creates a HiDrive share link (`POST /sharelink?path=…&type=file`) for exactly this file; the link is stored in `calendar/export/subscription.json` so every member sees it.
> - While a subscription exists, every app rewrites `band.ics` a few seconds after calendar changes – only when the content actually changed (compared per device).
> - "Neuen Link erstellen" deletes the old share link first (old subscriptions stop working); "Abo beenden" deletes the link and marks the subscription inactive. `band.ics` stays (app file).
> - The safety guard only allows share links for files inside `_BandApp/` – band files can never be shared by the app.
> - Buttons: "Kopieren" and "In Kalender-App öffnen" (`webcal://` – iPhone/Outlook subscribe directly). Short instructions for iPhone, Google (via calendar.google.com → Per URL) and Outlook.
> - **Spike S4 still open:** whether HiDrive's share URL delivers the raw file (calendar apps need `BEGIN:VCALENDAR…`) or a download page. The page shows a test hint. If it's a download page → implement the documented fallback (token-helper endpoint, R-CODE-10 amendment).

> **Implementation notes (v0.7.0)**
> - Recurrence engine in `src/features/calendar/recurrence.ts`: weekly (every n weeks, several weekdays), monthly (nth weekday or day of month), until/count; computed in Berlin local time (DST-safe), plus RRULE for export.
> - Recurrences are stored structured (`freq`, `interval`, `byDay`, `monthly`, `until`, `count`) **and** as `rrule` string.
> - Answers store `answeredFor` (the occurrence start when answering); if the start changed, "bitte prüfen" is shown – no extra writes needed.
> - "Diesen und alle folgenden" ends the old series (`until` = day before) and creates a new one; a `COUNT` limit is dropped in that case, and answers of the following dates are **not** carried over to the new series (v1 simplification).
> - Absence "cancel for all following" ends the series.
> - Answers are loaded for the past 7 and next 180 days.
> - `.ics` export: VTIMEZONE Europe/Berlin, RRULE, cancelled dates as `STATUS:CANCELLED` overrides; on phones via the share sheet, otherwise download.
> - Optimistic (v0.12.5): `CalendarStore` shows creating, editing, cancelling and answering immediately, saves in the background and rolls back with a message on failure; the event form closes at once.
> - Chat info lines, the setlist link and the subscription were added later (F6, F7, §6.5b).
| **Depends on** | F1, F2, F3 |
| **Used by** | F3 Dashboard, F7 Setlists, F8 Search, F6 Chat (info lines) |

## 1. Goal

One shared band calendar for gigs, rehearsals, absences and other dates — with recurring events, yes/no answers per member, and a way to get the dates into personal calendars.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I see the upcoming dates as a list, or a month at a glance. |
| US-2 | I create our weekly rehearsal once as a recurring event. |
| US-3 | I cancel or move a single rehearsal without touching the series. |
| US-4 | I enter a gig with meeting time, start, location and a setlist. |
| US-5 | I say yes, no or maybe to a rehearsal or gig with one tap (also on the start screen). |
| US-6 | I see who said yes, no or maybe, and who hasn't answered yet. |
| US-7 | I enter my vacation; the app shows me as unavailable for everything in that period. |
| US-8 | I add a single date to my phone calendar. |
| US-9 | I subscribe to the band calendar in my phone calendar so new dates appear automatically. |

## 3. Event Types

| Type | UI name | Icon/color | Fields | Answers (Zu-/Absage) | Recurring |
|---|---|---|---|---|---|
| `gig` | Auftritt | star / accent color | Titel*, Datum*, Treffpunkt/Get-in (time), Beginn*, Ende, Ort (name + address), Beschreibung, Setlist | yes (default on) | yes |
| `rehearsal` | Probe | music / blue | Datum*, Beginn*, Ende, Ort, Beschreibung ("Schwerpunkt"), Setlist | yes (default on) | yes |
| `absence` | Abwesenheit | plane / grey | Von*, Bis* (all-day), Notiz – always for the current member | no | yes (e.g. "jeden Montag") |
| `other` | Sonstiges | calendar / purple | Titel*, Datum*, Zeit or ganztägig, Ort, Beschreibung | optional (default off) | yes |

\* required. The type list is extendable (new types = new entry in the type registry + translations).

## 4. Screens & UI

### 4.1 Kalender (`/calendar`)

- **View switch:** "Liste" | "Monat". Default: phone → Liste, tablet/desktop → Monat (remembered per device).
- **Liste ("Demnächst"):** grouped by month, each event as a card: type icon, relative date ("Heute", "Morgen", "Sa, 10. Okt."), time, title/location, answer summary ("4 ✓ · 1 ? · 1 ✗ · 1 offen"), my own answer buttons, 🔁 icon for recurring, setlist badge + "Setlist üben" (F3 §5).
- **Monat:** grid; events as colored chips, absences as grey bars across days; tap a day → day list; long press / double click on an empty day → new event on that date.
  - **v0.14.4 – phones:** tapping a day opens its events in a panel from the bottom (the shared `Dialog`: event cards with answer buttons + "Termin am … anlegen"; empty days say "Keine Termine an diesem Tag."). Reason: in a band test the day list below the grid was off screen and a tap seemed to do nothing. Closes with ✕ or a tap outside (like every dialog, not with the back gesture). Tablets/desktop keep the list below the grid.
- **Filter chips:** Auftritte, Proben, Abwesenheiten, Sonstiges (all on by default).
- **"Vergangene Termine"** link at the end of the list (past events are never deleted).
- **"+" button** (floating on phone, in the top bar on desktop) → new event (§4.3).
- **Menu (⋯):** "Kalender abonnieren", "Alle Termine exportieren" (§6.5).

### 4.2 Termin-Detail (`/calendar/:eventId` or `/calendar/:eventId/:occurrence`)

- Header: type, title, date/time (with meeting time for gigs), 🔁 "Jeden Donnerstag" for series
- Location with "In Karten öffnen" (opens the device's map app via a maps link)
- Description
- **Zu-/Absagen** section:
  - My answer: three large buttons **"Ich bin dabei"** / **"Vielleicht"** / **"Ich kann nicht"**, optional short comment ("komme 30 Min. später", "kläre das bis Freitag")
  - Lists: Zugesagt · Vielleicht · Abgesagt · Abwesend (from absences, automatic) · Noch offen – with avatars
- **Conflict hint** if members are absent: "Tom ist abwesend (Urlaub 12.–19. Okt.)"
- **v0.18.1 (R-UX-09):** ✎ (Bearbeiten, only who may edit) and ⋯ (Zum Kalender hinzufügen, Absagen / Wieder ansetzen, Löschen) in the top bar – no button row at the bottom; the comment field appears after "Kommentar hinzufügen" (or right away if you already have a comment); "Meine Erinnerung" is one line with "Ändern" (F6 §4.7).
- Setlist (v0.18.0): one tappable card (name, songs, duration → the setlist page, ← returns to the event), "Setlist abspielen", "Setlist bearbeiten" (not just "Bearbeiten" – the event has its own), ⋯ = Andere Setlist / Verknüpfung entfernen; if none: "Setlist verknüpfen", "Neue Setlist für diesen Termin" (after saving the new setlist shows its page, ← leads back to the event)
- Actions: "Bearbeiten", "Zum Kalender hinzufügen" (.ics, §6.5), "Absagen" (cancel event, §6.3), "Löschen"
- Footer: "Erstellt von Lisa · zuletzt geändert von Tom am …"

### 4.3 Termin anlegen / bearbeiten

1. **Type chooser:** four large buttons (Auftritt, Probe, Abwesenheit, Sonstiges).
2. **Form** with only that type's fields and smart defaults (R-UX-05):
   - Probe: day/time/location of the **last rehearsal** pre-filled
   - Auftritt: Beginn 20:00, Treffpunkt 2 h before Beginn (editable)
   - Abwesenheit: always for me, all-day
   - Location field suggests previously used locations
3. **Wiederholung** (collapsed by default): "Nie" (default), "Jede Woche", "Alle 2 Wochen", "Jeden Monat (z. B. 2. Donnerstag)", "Benutzerdefiniert" (every n weeks on selected weekdays). End: "Nie" / "Am [Datum]" / "Nach [n] Terminen".
4. **Zu-/Absagen erbitten** toggle (default per type, §3).
5. Save → back to detail; an info line appears in the band chat (§6.7).

**Edit scope for recurring events** (when editing/deleting one occurrence): dialog "Nur diesen Termin" / "Diesen und alle folgenden" / "Alle Termine der Serie".

## 5. Recurring Events

- A series is stored once with a recurrence rule (RRULE subset, RFC 5545), not as many copies.
- Occurrences are computed on the device in **Europe/Berlin local time** (a 19:00 rehearsal stays 19:00 across daylight-saving changes).
- **Exceptions** are separate files per occurrence (one file per record, R-DATA-06):
  - cancelled occurrence ("Diese Probe fällt aus") → shown struck through with "Fällt aus", still visible
  - changed occurrence (other time, location, description, setlist)
- **"Diesen und alle folgenden"** ends the old series the day before (`until`) and creates a new series from that occurrence on. Existing answers for later occurrences are kept if the date stays the same.
- An occurrence is identified by `seriesId` + original local start date (`2026-10-15`), so answers and exceptions stay attached even if the occurrence is moved.
- Open-ended series are only computed for a visible range (e.g. 12 months ahead); the list shows "weitere Termine folgen".

## 6. Behaviour & Rules

### 6.1 Answers (Zu-/Absagen)
- States per member and event occurrence: **zugesagt**, **vielleicht**, **abgesagt**, **offen** (no answer). Optional comment, max. 200 characters.
- "Vielleicht" counts as not yet decided: the event keeps showing "Antwort fehlt"-style reminders for that member in a softer form ("Noch unsicher").
- A member with an absence covering the event is shown as **"abwesend"** automatically; they can still say yes explicitly (e.g. vacation ends early) – an explicit answer wins.
- Each member can only set their own answer. Answers can be changed any time until the event is over.
- Answers are available for gigs and rehearsals by default, optional for "Sonstiges", never for absences.
- If an event's date/time is changed, existing answers are kept but marked "Termin wurde geändert – bitte Antwort prüfen" for the affected members.
- The start screen (F3) shows my answer buttons (✓ / ? / ✗) directly on each event card; unanswered events get a small "Antwort fehlt" marker.

### 6.2 Absences
- Members can only enter, edit and delete absences **for themselves**. Others see them read-only.
- Absences are all-day ranges (Von–Bis, inclusive).
- Overlaps with gigs/rehearsals produce conflict hints in the detail, list and dashboard.

### 6.3 Cancel vs. delete
- **"Absagen"** (cancel): event stays visible, struck through, "Abgesagt von Lisa". Default for gigs/rehearsals that won't happen – everyone still sees what changed.
- **"Löschen"**: soft delete (R-DATA-05) with undo, for events entered by mistake. Hidden from all views.

### 6.4 Time handling
- Stored: ISO 8601 with UTC offset for timed events; local date (`YYYY-MM-DD`) for all-day events and absences.
- Displayed via shared formatters in `de-DE` / `Europe/Berlin` (R-I18N-03).

### 6.5 Personal calendars

**a) Single export (v1, no spike needed)**
- "Zum Kalender hinzufügen" on an event creates an `.ics` file in the browser and hands it to the device (download / share sheet). The phone's calendar app offers to import it.
- "Alle Termine exportieren" creates one `.ics` with all upcoming events (series as RRULE).
- Exported events carry a stable UID, so re-importing updates instead of duplicating (where the calendar app supports it).
- No file is written to HiDrive for single exports.

**b) Subscription (preferred, needs spike)**
Goal: a URL that members add once in their calendar app ("Kalender abonnieren"); new/changed dates appear automatically (calendar apps refresh every few hours, not instantly).

Plan:
1. The app keeps an always-current `_BandApp/calendar/export/band.ics`, regenerated from all events after every calendar change (app-created file, overwriting it is allowed by R-DATA-01/03).
2. A **HiDrive share link** is created once for this file. Calendar apps subscribe to that link.
3. Settings → Kalender shows the link with "Kopieren" and short instructions for iPhone, Android/Google, Outlook.

Risks and fallback:
- HiDrive share links may lead to a download page instead of the raw file, or change when the file is overwritten. → **Spike.**
- Fallback: the Cloudflare token helper gets one extra read-only endpoint `GET /calendar/<secret>.ics` that fetches the shared file and returns it with `Content-Type: text/calendar`. It still stores nothing (only the share link in its config). This requires an R-CODE-10 amendment + decision-log entry.
- **Privacy:** anyone who has the subscription link can see the band dates (not files). The link can be renewed in the settings ("Neuen Link erstellen"), which invalidates the old one.

### 6.6 Setlist link
- One setlist per event (or per occurrence for series). "Setlist abspielen" (until v0.15: "Setlist üben") plays it in the player, queue tab open (F3 §5).
- Linking is also possible from the setlist side (F7).

### 6.7 Info lines in the chat
Automatic, small info lines in the band chat (F6) for **new**, changed and cancelled gigs, rehearsals and other events (date/time/location changed, event or single occurrence cancelled; new since v0.14.3: "Lisa hat Probe am … eingetragen", a series by its first date). Not for absences or answers.

### 6.8 Seeing other members' changes (v0.14.3)
While the app is open, the calendar checks HiDrive every 60 s, every 20 s while the calendar or an event page is open, never in the background (`CalendarStore.refresh()`): one listing of `events/` (+ the exception folders of series), then only new or changed files are read (by file version), plus the answers of those events. When the chat brings another member's event info line, the calendar checks at once. A refresh never touches entries that changed locally while it was reading (your own save in flight). Answers of unchanged events are still only reloaded on start / return to the app.
Examples: "Lisa hat die Probe am Do, 15. Okt. abgesagt", "Tom hat den Auftritt ‚Stadtfest' auf 19:30 verschoben".

## 7. Data Model & Storage

All in `_BandApp/calendar/`:

```
calendar/
├─ events/<eventId>.json                          ← single events and series (with rrule)
├─ exceptions/<eventId>/<YYYY-MM-DD>.json         ← cancelled/changed occurrences of a series
├─ answers/<eventId>/<occurrenceKey>/<memberId>.json
└─ export/subscription.json                       ← the subscription link (secret + address); the .ics itself lives in the token helper (v0.19.1)
```

`occurrenceKey` = `single` for non-recurring events, otherwise the original local date.

### 7.1 Event

```json
{
  "id": "e_4k2m9x",
  "schemaVersion": 1,
  "type": "rehearsal",
  "title": null,
  "allDay": false,
  "start": "2026-10-01T19:00:00+02:00",
  "end": "2026-10-01T22:00:00+02:00",
  "meetingTime": null,
  "location": { "name": "Proberaum", "address": "…" },
  "description": "Schwerpunkt: neue Songs",
  "recurrence": { "rrule": "FREQ=WEEKLY;BYDAY=TH", "until": null, "count": null },
  "answersEnabled": true,
  "setlistId": null,
  "memberId": null,
  "status": "active",
  "cancelledAt": null, "cancelledBy": null,
  "createdAt": "…", "createdBy": "m_…", "updatedAt": "…", "updatedBy": "m_…",
  "deletedAt": null, "deletedBy": null
}
```

- `memberId` only for absences. `status`: `active` | `cancelled`.

### 7.2 Exception (one occurrence of a series)

```json
{
  "schemaVersion": 1,
  "eventId": "e_4k2m9x",
  "occurrenceDate": "2026-10-15",
  "cancelled": false,
  "override": { "start": "2026-10-15T20:00:00+02:00", "location": { "name": "Halle" } },
  "setlistId": "s_…",
  "createdAt": "…", "createdBy": "m_…", "updatedAt": "…", "updatedBy": "m_…"
}
```

### 7.3 Answer

```json
{
  "schemaVersion": 1,
  "eventId": "e_4k2m9x",
  "occurrenceKey": "2026-10-15",
  "memberId": "m_…",
  "status": "yes",
  "comment": "komme 30 Min. später",
  "needsReview": false,
  "updatedAt": "…"
}
```

`status`: `yes` | `maybe` | `no` (no file = open).

### 7.4 Loading
- Events + exceptions are loaded at start and cached (small data set).
- Answers are loaded for the visible range (upcoming events) and cached.

## 8. Search Contribution

Titles, types, locations, descriptions, dates ("Oktober", "Stadtfest", "Proberaum"). Past events included, marked as past.

## 9. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Two members edit the same event | Conflict check (R-DATA-07) |
| Series edited while someone answers an occurrence | Independent files, no conflict |
| Event moved to another day | Answers kept, marked "bitte prüfen" |
| Deactivated member | Old answers stay visible; not listed as "offen" for future events |
| New member joins | Listed as "offen" for all future events with answers |
| Absence of a member for an event without answers | Conflict hint only |
| `.ics` download not supported (some installed PWAs on iOS) | Fallback: open the `.ics` in a new browser tab / share sheet – spike on a real iPhone |

## 10. i18n Keys (examples)

| Key | German text |
|---|---|
| `calendar.types.gig` / `.rehearsal` / `.absence` / `.other` | Auftritt / Probe / Abwesenheit / Sonstiges |
| `calendar.view.list` / `.month` | Liste / Monat |
| `calendar.answer.yes` / `.maybe` / `.no` | Ich bin dabei / Vielleicht / Ich kann nicht |
| `calendar.answer.summary` | {{yes}} ✓ · {{maybe}} ? · {{no}} ✗ · {{open}} offen |
| `calendar.answer.missing` | Antwort fehlt |
| `calendar.answer.review` | Termin wurde geändert – bitte Antwort prüfen |
| `calendar.recurrence.weekly` | Jede Woche |
| `calendar.editScope.this` / `.following` / `.all` | Nur diesen Termin / Diesen und alle folgenden / Alle Termine der Serie |
| `calendar.cancelled` | Fällt aus |
| `calendar.conflict` | {{name}} ist abwesend |
| `calendar.export.single` | Zum Kalender hinzufügen |
| `calendar.subscribe` | Kalender abonnieren |

## 11. Changes to Other Features

- **F3 Dashboard:** event cards get my answer buttons (✓ / ? / ✗) and the "Antwort fehlt" marker.
- **F6 Chat:** info lines for changed/cancelled events (§6.7).
- **F7 Setlists:** link a setlist to an event or a single occurrence.

## 12. Spikes

1. HiDrive share link for `band.ics`: raw file URL? Stable after overwrite? Works as a subscription in iOS, Google Calendar, Outlook?
2. `.ics` single export from an installed PWA on iPhone and Android.

## 13. Decisions & Proposed Defaults

| # | Topic | Status | Value |
|---|---|---|---|
| 1 | Recurring events | ✅ decided | v1, with single-occurrence exceptions |
| 2 | Answers | ✅ decided | Yes/No per member and occurrence |
| 3 | Personal calendars | ✅ decided | Single `.ics` export in v1; subscription via HiDrive share link (spike), fallback via token helper |
| 4 | Answer options | ✅ decided | "Ich bin dabei" / "Vielleicht" / "Ich kann nicht" + optional comment |
| 5 | Absences for others | ✅ decided | Not allowed – only for yourself |
| 6 | Chat info lines | ✅ decided | Only changed and cancelled events |

## 14. Out of Scope / Later

- ~~Reminders before events~~ – built in v0.14.0, see F6 §4.7. Still later: "Antwort fehlt" reminders
- Two-way sync with Google/Apple/Outlook calendars
- Gig fees / finances (see future plans)
- Availability polls for finding a date ("Wann könnt ihr?")
