# F6 – Band Chat

| | |
|---|---|
| **ID** | F6 |
| **Status** | Implemented (v0.9.0); push notifications since v0.13.0 (§4.6) |

> **v0.11.0:** the input bar is `position: fixed` above the bottom bar / mini player / keyboard and never scrolls away; the list keeps room for it (spacer). Your own message always jumps into view; incoming messages follow only when you are near the bottom.
>
> **Implementation notes (v0.9.0)**
> - Polling: every 10 s while the chat page is open, 60 s elsewhere, immediately when the app returns to the foreground; only the newest two month folders are listed. Edited messages are detected by the file version in the listing.
> - Messages are shown optimistically ("wird gesendet …") and removed again if saving fails.
> - Read status is written at most every 2 s; the "Neue Nachrichten" divider position is taken before anything is marked as read.
> - Info lines come from a small app-wide event bus (`src/core/events.ts`): calendar (changed date/time/location, cancelled, re-scheduled), Band-Version changes and band design changes. Absences and answers never create lines.
> - Reactions: one file per member and message (`reactions/<messageId>/<memberId>.json`, `emoji: null` = removed).
> - Item discussions ("Diskussion") on song, event and setlist detail; they appear in the band chat with a context chip.
| **Depends on** | F1, F2, F3 |
| **Used by** | F3 Dashboard, F4/F5/F7 (item discussions, info lines), F8 Search |

## 1. Goal & Positioning

A **management chat** for things that concern the app's content: songs, dates, setlists. It does **not** replace the band's WhatsApp group (decision). Small talk, photos, quick "wo seid ihr?" stay in WhatsApp.

Consequences for the design:
- Messages can be tied to an app item (song, event, setlist), and each item shows its own discussion.
- App items can be shared as rich cards (play a song, answer an event, open a setlist) directly from the chat.
- No photos/files, no real-time pressure: a short delay is fine, no push notifications in v1.

## 2. User Stories

| # | Story |
|---|---|
| US-1 | I write to the band about app topics and everyone sees it when they open the app. |
| US-2 | I discuss a specific gig/song/setlist, and the discussion is visible right on that item. |
| US-3 | I share a song, event or setlist as a card; others can act on it from the chat (play, answer, open). |
| US-4 | I see the number of unread messages on the Chat tab and the start screen. |
| US-5 | I see info lines when an event was changed/cancelled or a Band-Version changed. |
| US-6 | I reply to a specific message so it's clear what I refer to. |
| US-7 | I edit or delete my own messages. |

## 3. Screens & UI

### 3.1 Chat (`/chat`)

- One band channel ("Band-Chat").
- Messages: others left with avatar + name (member color), mine right; time; "bearbeitet" marker.
- Date separators ("Heute", "Gestern", "Do, 12. Sep.").
- "Neue Nachrichten" divider at the first unread message; the chat opens there.
- **Context label** on messages tied to an item: small chip above the text ("💬 Auftritt Stadtfest · Sa, 10. Okt."); tap → opens the item.
- **Item cards** (when a message shares an item):
  - Song: title, Band-Version duration, ▶ play, "Öffnen"
  - Event: type, date/time, location, answer summary + my answer buttons (✓ / ? / ✗)
  - Setlist: name, song count, duration, "Öffnen", "Setlist üben"
- **Info lines** (system): small, centered, grey ("Lisa hat die Probe am Do, 15. Okt. abgesagt"), tap → item.
- **Input bar:** text field (multi-line, grows), "+" → "Song teilen", "Termin teilen", "Setlist teilen" (pickers with search), send button. Enter sends on desktop, Shift+Enter = new line.
- Long press / hover menu on a message: "Antworten", Reaktion, "Bearbeiten" / "Löschen" (own only), "Zum Element" (if context).

### 3.2 Item discussions (in F4, F5, F7 detail screens)

- Section **"Diskussion"** (collapsed, with count: "Diskussion (4)") on song detail, event detail and setlist detail.
- Shows only messages tied to that item, same look as the chat, with its own input field. A message written here appears in the band chat too, with the context chip.
- Empty: "Noch keine Nachrichten zu diesem Termin" + input.

## 4. Behaviour & Rules

### 4.1 Messages
- Plain text, max. 2,000 characters, links clickable, emojis allowed.
- Optional: `context` (item the message is about), `share` (item card), `replyTo` (quoted message).
- **Replies:** quoted snippet (author + first line) above the message; tap → scrolls to the original.
- **Edit** own messages anytime → "bearbeitet". **Delete** own messages → soft delete, placeholder "Nachricht gelöscht" (R-DATA-05).
- Sent optimistically (R-UX-07): "wird gesendet …" → sent; on error "Nicht gesendet – erneut versuchen".

### 4.2 Info lines (system messages)
Created by the device that performs the action, stored like messages with `type: "system"`:
- F5: event or single occurrence **changed** (date/time/location) or **cancelled** – not new events, not absences, not answers.
- F4: Band-Version of a song changed.
- Design system: band branding (color/logo) changed.
- Info lines carry a `context`, so they also appear in the item's discussion.

### 4.3 Updates (polling)
- Chat open: check for new messages every **10 s**.
- App open elsewhere: every **60 s** (for badges and the dashboard).
- App in background: no polling; refresh immediately when the app comes back into focus.
- With up to 12 devices this stays well below reasonable API usage.

### 4.4 Read status
- Per member, stored on HiDrive (`read/<memberId>.json` → `lastReadAt`), so reading on the phone also clears the badge on the laptop.
- Written at most every few seconds while reading (debounced).
- Unread count = messages after `lastReadAt` from other members (info lines count too).

### 4.6 Push notifications (v0.13)

- **Opt-in per device** in Einstellungen → Benachrichtigungen ("Einschalten" → the phone's permission prompt). Two switches: *Chat-Nachrichten* and *Termin-Änderungen und Absagen* (both on by default). "Test-Benachrichtigung senden" sends one to this device only.
- **What notifies (decided):** every chat message (incl. item discussions) and the info lines for changed / cancelled / re-scheduled events. Not: absences, answers, Band-Version or design changes. Your own messages never notify you.
- **Content (decided):** title "<Sender> · <Band>", text = the message (max. ~180 characters; shared items as "📎 Termin" etc.). Event changes: "Termin abgesagt" + the info line. Tapping opens the message (`chat?message=`) or the event.
- **How:** each device stores its Web Push subscription in `_BandApp/push/<memberId>/<deviceId>.json`. The app of whoever writes the message asks the token helper (`POST /push`, with its HiDrive login) to deliver to all *other* members' devices; the worker encrypts per device (RFC 8291) and signs with VAPID (RFC 8292). Push services only see encrypted data. Devices reported as gone (404/410) are switched off automatically.
- **Open app:** if the app is visible on a device, no notification is shown there (except on Apple devices, where every push must show one).
- **Requirements:** Android – Chrome, installed or not. iPhone/iPad – iOS 16.4+, app installed on the home screen and opened from there. Not in the demo.
- **Setup:** VAPID keys + `BAND_ACCOUNT` in the worker (token-helper/README.md).

### 4.5 Loading history
- Opens with the current month (and the previous one if few messages), older months load when scrolling up ("Ältere Nachrichten laden …").

## 5. Data Model & Storage

```
_BandApp/chat/
├─ messages/<YYYY-MM>/<createdAtMs>_<messageId>.json
├─ reactions/<messageId>/<memberId>.json          (only if reactions are enabled, §12)
└─ read/<memberId>.json
```

### 5.1 Message

```json
{
  "id": "c_7d1k3p",
  "schemaVersion": 1,
  "type": "text",
  "text": "Sollen wir beim Stadtfest mit Burning Sky anfangen?",
  "context": { "type": "event", "id": "e_4k2m9x", "occurrence": "single" },
  "share": null,
  "replyTo": null,
  "createdAt": "2026-09-24T18:02:11Z", "createdBy": "m_…",
  "updatedAt": "…", "updatedBy": "m_…", "editedAt": null,
  "deletedAt": null, "deletedBy": null
}
```

- `type`: `text` | `system`. System messages have `systemKey` + parameters for translation (e.g. `{ "systemKey": "event.cancelled", "params": { … } }`) instead of fixed German text (R-I18N-02).
- `context` / `share`: `{ "type": "song" | "event" | "setlist", "id": "…" }`.
- File names start with the timestamp, so a folder listing is already sorted; new messages are detected by listing the current month folder.

### 5.2 Read status

```json
{ "schemaVersion": 1, "lastReadAt": "2026-09-24T18:05:00Z" }
```

## 6. Search Contribution

Message text, author, date, context item ("Nachrichten zum Stadtfest"). Deleted messages are not indexed.

## 7. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| Shared/context item deleted or archived | Card shows "Nicht mehr vorhanden" / archive icon; message stays |
| Device clocks differ | Sorted by `createdAt`; small differences tolerated; own messages never jump above already-read ones visually |
| Message edited while someone replies | Reply quotes the version at reply time (snippet stored in the reply) |
| Offline | Messages queued with "wird gesendet …" until connection is back (queue in v1 only while the app stays open) |
| Deactivated member | Name shown as "(ehemalig)" in detail; messages stay |

## 8. i18n Keys (examples)

| Key | German text |
|---|---|
| `chat.title` | Band-Chat |
| `chat.newMessages` | Neue Nachrichten |
| `chat.input.placeholder` | Nachricht an die Band … |
| `chat.share.song` / `.event` / `.setlist` | Song teilen / Termin teilen / Setlist teilen |
| `chat.message.edited` / `.deleted` | bearbeitet / Nachricht gelöscht |
| `chat.message.sending` / `.failed` | wird gesendet … / Nicht gesendet – erneut versuchen |
| `chat.reply` | Antworten |
| `chat.discussion.title` | Diskussion ({{count}}) |
| `chat.system.eventCancelled` | {{name}} hat {{event}} abgesagt |
| `chat.system.eventChanged` | {{name}} hat {{event}} geändert: {{change}} |
| `chat.system.bandVersionChanged` | {{name}} hat die Band-Version von „{{song}}" auf „{{version}}" geändert |

## 9. Changes to Other Features

- **F4 / F5 / F7:** "Diskussion" section on detail screens (§3.2).
- **F3:** dashboard widget "Neue Nachrichten" shows the context chip for item-related messages.

## 10. Out of Scope / Later

- Push notifications (future plans)
- Photos, files, voice messages (stay in WhatsApp)
- Several channels
- Read receipts per member ("gelesen von …")

## 11. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Role of the chat | Management chat for app topics; does **not** replace WhatsApp |

## 12. Confirmed Defaults

| # | Topic | Proposal |
|---|---|---|
| 2 | Item discussions | Yes – messages can be tied to a song/event/setlist and appear on that item |
| 3 | Item cards | Yes – share songs, events, setlists as actionable cards |
| 4 | Replies | Yes |
| 5 | Reactions | Yes, small fixed set: 👍 ✅ ❓ 😂 (useful as quick "OK" without a message) |
| 6 | @mentions | No (limited value without push notifications) |
| 7 | Photos/files | No (WhatsApp) |
| 8 | Update delay | ~10 s while the chat is open, 60 s elsewhere |
