# F2 – In-App Member Login

| | |
|---|---|
| **ID** | F2 |
| **Status** | Planned – ready for implementation |
| **Depends on** | F1 (HiDrive connection) |
| **Used by** | Songs (note authors, private notes), Chat, Calendar (absences), Setlists, Audio engine (practice settings) |

## 1. Goal

Know **which band member** is using the app on a device: for the name in the chat, authorship of notes/events, absences and private notes. Chosen once per device, then remembered.

**What this is not:** security. All members share the HiDrive login, which is the real security layer. The member login is an *identity*, and the UI never pretends otherwise (R-SEC-01).

## 2. User Stories

| # | Story |
|---|---|
| US-1 | As a member on a new device, I tap my name once and I'm in. |
| US-2 | As a new member, I create my own profile in under 30 seconds. |
| US-3 | As the member doing the first-time band setup, I create my profile right after it. |
| US-4 | As a member, I change my name, color or instrument later. |
| US-5 | On a shared device (rehearsal room laptop), I switch to my profile or log out. |
| US-6 | When someone leaves the band, their profile disappears from the selection, but their old messages and notes still show their name. |
| US-7 | As a member, I see who is in the band (members overview). |

## 3. First-Start Flow

```
Willkommen ─► Mit HiDrive verbinden ─► [Band einrichten]* ─► Wer bist du? ─► Start
                                                              │
                                                              └─► Ich bin neu ─► Profil anlegen ─► Start
* only if the band was never set up (F1)
```

- If the band has **no members yet** (right after first-time setup), "Wer bist du?" is skipped and "Profil anlegen" opens directly (US-3).
- After choosing a profile, the app goes to the start screen and never shows this flow again on this device, unless the member logs out.

## 4. Screens & UI

### 4.1 "Wer bist du?" (profile selection)

- Heading: **"Wer bist du?"**, subline: "Wähle dein Profil. Du musst das auf diesem Gerät nur einmal machen."
- Grid of large member cards (avatar, name, instrument). Phone: 2 columns; tablet/desktop: 3–4 columns. 12 members must fit without feeling crowded (R-UI-09).
- Sorted alphabetically by name.
- Last card: **"+ Ich bin neu"**.
- Small link at the bottom: "Ehemalige Mitglieder anzeigen" (only if any exist) → shows inactive profiles, which can be reactivated.
- Tap on a card → start screen. No PIN, no password.

### 4.2 "Profil anlegen" / "Profil bearbeiten"

| Field | Required | Details |
|---|---|---|
| Name (`Name`) | yes | 1–30 characters, trimmed. Must be unique among active members (case-insensitive): "Diesen Namen gibt es schon. Bist du das? → Zu deinem Profil" |
| Instrument / Rolle | no | Free text with suggestions: Gesang, Gitarre, Bass, Schlagzeug, Keyboard, Technik, Management |
| Farbe | yes (auto) | Pre-selected: first unused color of the palette (§7). Changeable; used colors shown but still selectable |
| Avatar | – | Initials on the chosen color (no photos, see §10) |

- Button: **"Los geht's"** (create) / **"Speichern"** (edit).
- Live preview of how the name will look in the chat.

### 4.3 Settings → "Mein Profil"

- Edit profile (4.2)
- **"Profil wechseln"** → back to "Wer bist du?"
- **"Abmelden"** → same as switching, plus clears private cached data on the device (§6)
- Info text: "Dein Profil zeigt den anderen, wer etwas geschrieben hat. Es ist kein Passwortschutz – alle Bandmitglieder teilen sich den HiDrive-Zugang."

### 4.4 "Mitglieder" (members overview)

- Reachable via the main menu ("Mehr" on phones) and by tapping a name/avatar anywhere in the app.
- List of active members: avatar, name, instrument.
- Member detail: name, instrument, "Mitglied seit", upcoming absences (from F5, once available).
- Action on other members' detail pages: **"Ist nicht mehr in der Band"** → confirmation dialog ("Lisa als ehemaliges Mitglied markieren? Ihre Nachrichten und Notizen bleiben erhalten. Du kannst das jederzeit rückgängig machen.") → deactivate (§5.4). Available to every member.

## 5. Behaviour & Rules

### 5.1 Identity
- Each member gets a random, permanent `memberId` (e.g. `m_` + 10 random characters). Never derived from the name, so renaming changes nothing elsewhere.
- All other records reference members **only by `memberId`**. Names and colors are always resolved at display time from the member list, so a rename shows everywhere immediately.

### 5.2 Device session
- Stored device-locally (IndexedDB), scoped per band (R-CODE-03): `{ bandId, memberId, since }`.
- The session never expires on its own.
- If the stored member no longer exists or was deactivated: show "Wer bist du?" again with a short note.

### 5.3 Editing
- A member can only edit **their own** profile.
- Edits use the conflict check from R-DATA-07 (compare modification time before saving).

### 5.4 Deactivation instead of deletion
- Profiles are never deleted (R-DATA-05).
- Deactivated members:
  - are hidden from "Wer bist du?", the members overview, and pickers (e.g. absences),
  - keep showing their name and color on existing messages, notes and events, with a subtle "(ehemalig)" in detail views,
  - can be reactivated from "Ehemalige Mitglieder anzeigen".
- Deactivating the profile you're currently logged in with logs you out on that device.

### 5.5 Logout / switching on shared devices
- Switching or logging out clears from the device: the session, cached **private** notes, and the local search index (it may contain private notes, see F8).
- The HiDrive connection is **not** affected ("Verbindung trennen" is separate in F1).

### 5.6 No roles
- All members have the same rights. No admin.

## 6. Data Model & Storage

### 6.1 HiDrive: `_BandApp/members/<memberId>.json`

```json
{
  "id": "m_k3f9x2p7qa",
  "schemaVersion": 1,
  "displayName": "Lisa",
  "role": "Gesang",
  "color": "c04",
  "avatar": { "type": "initials" },
  "pin": null,
  "active": true,
  "deactivatedAt": null,
  "deactivatedBy": null,
  "createdAt": "2026-09-24T15:30:00Z",
  "createdBy": "m_k3f9x2p7qa",
  "updatedAt": "2026-09-24T15:30:00Z",
  "updatedBy": "m_k3f9x2p7qa"
}
```

- `color` stores a **palette key**, not a hex value, so the palette can be tuned for light/dark mode without migrating data.
- `pin` is always `null` in v1 (no PINs, §10). The field is reserved so PINs could be added later without a schema change; if ever used, it would hold a salted PBKDF2 hash via the Web Crypto API, never the plain PIN.

### 6.2 Device-local (IndexedDB)

| Key | Content |
|---|---|
| `session:<bandId>` | `{ memberId, since }` |
| `members-cache:<bandId>` | last loaded member list (for instant display, R-UX-07) |

### 6.3 Loading
- The member list (≤ ~12 small files) is loaded at app start and refreshed in the background together with other data.

## 7. Color Palette

- 12 named colors (`c01` … `c12`), clearly distinguishable from each other, also for common color vision deficiencies where possible.
- Each color has a light- and dark-mode variant; white/dark initials must meet WCAG AA contrast on it (R-UI-05).
- Color is never the only way to tell members apart: name or initials are always shown next to it.
- Exact values are defined with the design system (F3).

## 8. Search Contribution

- Member names and instruments → result opens the member detail (4.4).
- Used as a filter elsewhere ("Notizen von Lisa", "Nachrichten von Tom").

## 9. Edge Cases & Errors

| Case | Behaviour |
|---|---|
| New member types a name that already exists | Offer "Bist du das?" → go to that profile instead of creating a duplicate |
| Two people create profiles at the same moment | Separate files, no conflict. A rare duplicate name is shown with the instrument as a distinguishing hint |
| HiDrive unreachable during profile creation | Keep the form, show "Speichern nicht möglich – keine Verbindung", allow retry |
| Member list can't be loaded on a device with an existing session | Use the cached list; the member can keep working |
| Member file edited/broken manually on HiDrive | Skip it with a log entry; never overwrite it automatically |
| More than 12 members | Still works (grid scrolls); palette colors repeat with a different initials style |

## 10. Decisions

| # | Question | Decision | Reason |
|---|---|---|---|
| 1 | PIN | **No PIN** | Adds a step on every switch and protects nothing real, since everyone shares the HiDrive login |
| 2 | Avatars | **Initials on color only** | Simple, no image storage; photos possible later |
| 3 | Deactivating others | **Any member, with confirmation** | Former members won't do it themselves; reactivation is always possible |

## 11. Implementation Notes (i18n keys, examples)

| Key | German text |
|---|---|
| `profile.select.title` | Wer bist du? |
| `profile.select.subtitle` | Wähle dein Profil. Du musst das auf diesem Gerät nur einmal machen. |
| `profile.select.new` | Ich bin neu |
| `profile.select.showFormer` | Ehemalige Mitglieder anzeigen |
| `profile.form.name` | Name |
| `profile.form.role` | Instrument / Rolle |
| `profile.form.color` | Farbe |
| `profile.form.submitCreate` | Los geht's |
| `profile.form.nameTaken` | Diesen Namen gibt es schon. Bist du das? |
| `profile.settings.switch` | Profil wechseln |
| `profile.settings.logout` | Abmelden |
| `profile.settings.info` | Dein Profil zeigt den anderen, wer etwas geschrieben hat. Es ist kein Passwortschutz – alle Bandmitglieder teilen sich den HiDrive-Zugang. |
| `members.detail.deactivate` | Ist nicht mehr in der Band |
| `members.detail.deactivateConfirm` | {{name}} als ehemaliges Mitglied markieren? Nachrichten und Notizen bleiben erhalten. Du kannst das jederzeit rückgängig machen. |
| `members.detail.reactivate` | Wieder aktivieren |

## 12. Out of Scope / Later

- Real per-member authentication (would need own accounts on a server)
- Roles and permissions
- Profile photos
- Optional PIN (field reserved in the data model)
- Per-member notification settings (with push notifications, see future plans)
- "Zuletzt aktiv" / online status
