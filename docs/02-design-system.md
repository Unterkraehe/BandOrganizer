# Design System

> Applies to every screen. Components in `src/ui/` implement these tokens (R-UI-07); features never define their own colors, fonts or spacing.
> **Status:** Planned

## 1. Direction

**Inspiration:** the Overload website (screenshot analysed 2026-09-24):

| Website element | Observed | Taken over? |
|---|---|---|
| Background | Pure black header, dark grey concrete texture (`#494949`) | Dark, near-black base: **yes**. Texture: **no** (decoration, D2) |
| Accent | Strong signal red `#E30613` (headline, logo, active tab, brush stroke) | **Yes**, as Overload's band color (§3.2) – configurable, not hardcoded |
| Navigation / body | Condensed sans (Oswald-like), white nav, grey body text `#999` | **Yes**: Oswald for headings/nav (§4) |
| Overline | "HIER STEPPT DER BÄR" – small, bold, uppercase, white | **Yes** (§4 overline style) |
| Big headline font | Wide, squared display font ("Unsere Gigs") | **No** – too band-specific; the band's logo carries that identity instead |
| Active tab | Red brush-stroke underline | Simplified: solid accent underline (no brush graphics) |
| Lists | Rows with thin separator lines | **Yes** (list rows) |

**But not branded:** the app may later be used by other bands of any genre (future plans L2). So:

- The **base is neutral** (greys, not a band's colors) and works for a rock band as well as a choir or a jazz trio.
- Band identity comes only from **three configurable things** per band (§8): band name, **band color (accent)**, optional band logo.
- The "rock" feel is carried by typography and contrast, not by effects like grunge textures, flames or metal gradients.

**Principles**

| # | Principle | Meaning |
|---|---|---|
| D1 | Stage-ready | High contrast, large touch targets, readable at arm's length and in dark rooms |
| D2 | Content first | Songs, dates and notes are the heroes; chrome stays calm and grey |
| D3 | One accent | The band color is used sparingly: primary buttons, active navigation, current song, focus rings |
| D4 | Meaning over decoration | Colors that carry meaning (red arrow, event types, member colors) are fixed semantic tokens, never the accent |
| D5 | Same everywhere | Same component, same look on phone, tablet and desktop – only layout adapts |

## 2. Themes

| Setting (Einstellungen → Darstellung) | Behaviour |
|---|---|
| **Wie System** (default) | Follows the device's light/dark setting and switches live when it changes |
| **Hell** | Always light |
| **Dunkel** | Always dark |

- Stored per device (F3 §7). Applied before the first paint (no white flash when opening in dark mode).
- **Fixed exceptions:** the **Bühnenansicht** (F7) is always dark, **print layouts** are always black on white – regardless of the setting.
- Dark mode is a first-class theme, not an afterthought: every screen is designed and reviewed in both.

## 3. Color Tokens

All colors are CSS custom properties with a light and a dark value. Names are semantic; hex values are starting points to be tuned during implementation.

### 3.1 Neutrals

| Token | Use | Light | Dark |
|---|---|---|---|
| `--bg` | App background | `#F6F6F7` | `#0E0E10` |
| `--surface-raised` / `--border-raised` | Floating menus (⋯) – clearly lighter than cards in dark mode, white with strong shadow in light mode (v0.13.1) | `#FFFFFF` / `#C9C9CF` | `#36363D` / `#4A4A52` |
| `--surface` | Cards, lists, sheets, bottom bar | `#FFFFFF` | `#202024` |
| `--surface-2` | Raised/hover, inputs | `#EFEFF1` | `#2A2A2F` |
| `--border` | Dividers, outlines | `#DEDEE2` | `#38383E` |
| `--text` | Primary text | `#16161A` | `#F4F4F5` |
| `--text-muted` | Secondary text, meta | `#5E5E66` | `#A1A1AA` |
| `--text-faint` | Placeholders, disabled | `#8E8E96` | `#6B6B73` |

### 3.2 Accent (band color)

| Token | Use |
|---|---|
| `--accent` | Primary buttons, active nav item, current song, progress bars, links |
| `--accent-hover` | Hover/pressed state |
| `--accent-soft` | Subtle highlights (selected rows, highlighted search hits) |
| `--on-accent` | Text/icons on accent (white or near-black, chosen automatically) |
| `--focus-ring` | Keyboard focus outline (derived from accent) |

- Generated from **one band color** (§8) in the OKLCH color space: the app derives hover/soft variants and adjusts lightness per theme so contrast stays ≥ WCAG AA (4.5:1 for text, 3:1 for UI elements).
- If a chosen color can't reach sufficient contrast, the app adjusts it slightly and says so in the color picker ("Farbe für bessere Lesbarkeit angepasst").
- **Default band color:** Overload uses `#E30613` (from the website). Until a band sets its color (and for new bands), the app uses the neutral default **"Messing"** (brass): light `#8A6516`, dark `#D6AE52`, so the app isn't pre-branded for other bands.
- Notes for `#E30613`: white text on it reaches ~4.8:1 (OK); as text color on the dark background it's just below 4.5:1, so the app uses a slightly lighter derived tone for accent-colored *text* in dark mode (automatic, §3.2).
- **Collision rule:** if the band color is close in hue to a semantic color (red accent vs. `--danger` / `--segue`), meaning is still carried by icons and labels (✗, ↓, warning icons), and the event color for gigs is kept distinct (§3.4).

### 3.3 Semantic colors (fixed, not affected by the band color)

| Token | Use |
|---|---|
| `--success` | Zusage ✓, saved states |
| `--warning` | "Vielleicht", conflicts ("Tom ist abwesend"), "Antwort fehlt" |
| `--danger` | Absage ✗, destructive actions, errors |
| `--info` | Info lines, hints |
| `--segue` | **Red arrow** for direct transitions (F7) – always a strong red, also in print |

### 3.4 Event type colors (F5)

| Type | Token | Hue |
|---|---|---|
| Auftritt | `--event-gig` | amber/orange (deliberately **not** red, to stay distinguishable from red band colors and danger) |
| Probe | `--event-rehearsal` | blue |
| Abwesenheit | `--event-absence` | neutral grey |
| Sonstiges | `--event-other` | purple |

Always combined with an icon (never color alone, R-UI-05).

### 3.5 Member colors (F2 §7)

- 12 tokens `--member-c01` … `--member-c12` plus `--member-cXX-on` (text color on it), each with light/dark variants (values in `src/ui/styles/tokens.css`).
- Initials on member colors must meet AA contrast.

## 4. Typography

| Role | Font (proposal) | Style |
|---|---|---|
| Display / headings / navigation | **Oswald** (condensed sans) – matches the website's navigation and overline font, but is common enough to stay neutral | 500–600; uppercase for screen titles, section headers and overlines |
| Overline | Body font | 12–13 px, uppercase, letter-spacing 0.08em, `--text-muted` (like "INTRO: Unsere Band" on the website) |
| Body / UI | **Inter** | 400 / 500 / 600 |
| Numbers (durations, BPM, timers) | Inter with tabular figures | so times don't jump while playing |

- Fonts are **self-hosted** in the app bundle (no Google Fonts CDN): works offline later and avoids GDPR issues with loading fonts from Google servers.
- Fonts are theme tokens (`--font-display`, `--font-body`) so another band/theme could swap them later.

**Type scale (mobile → desktop)**

| Token | Size | Use |
|---|---|---|
| `--fs-xs` | 12 px | Overlines, badges |
| `--fs-sm` | 14 px | Meta info, captions |
| `--fs-md` | 16 px | Body, inputs (never smaller in inputs – avoids iOS zoom) |
| `--fs-lg` | 18–20 px | List titles, card titles |
| `--fs-xl` | 22–26 px | Screen titles |
| `--fs-2xl` | 28–36 px | Start screen greeting, practice view song title |
| Stage scale | 32–64 px | Bühnenansicht, adjustable with A− / A+ |

Line height 1.5 for body, 1.2 for headings; lyrics 1.6 for readability.

## 5. Spacing, Shape, Elevation

- **Spacing:** 4 px grid (`--space-1` = 4 px … `--space-8` = 32 px, `--space-12` = 48 px).
- **Radius:** cards/sheets 12 px, buttons/inputs 10 px, chips/badges full pill, avatars circle.
- **Elevation:** mostly flat with borders; shadows only for floating elements (mini player, sheets, dialogs, menus). In dark mode, elevation = lighter surface instead of shadow.
- **No `backdrop-filter`** (blur) on sticky or fixed elements: it causes repaint bugs with fixed bars in mobile Chrome (seen on Android in v0.3.0). Fixed bars get their own compositing layer (`transform: translateZ(0)`).
- **Touch targets:** min. 44 × 44 px (R-UI-04); primary actions in practice/stage views min. 56 px.
- **Content width:** reading content (lyrics, chat, forms) max. ~720 px on desktop; lists and calendars may use the full width.

## 6. Iconography & Imagery

- **Lucide** icon set, 24 px, stroke 2; always paired with a label in navigation (R-UX-06).
- Consistent mapping (e.g. `music` = song, `calendar` = event, `list-ordered` = setlist, `archive` = archive, `tag` = tag, `pin` = pinned, `arrow-down` = direct transition).
- No stock photos in the UI. Optional band logo (§8) only in the sidebar header, start screen header and login screens.

## 7. Components (overview)

Built once in `src/ui/`, documented with examples in both themes:

| Group | Components |
|---|---|
| Actions | Button (primary/accent, secondary, ghost, danger), icon button, FAB ("+"), segmented control, toggle |
| Inputs | Text field, text area, search field, select, date/time picker, color picker (palette), tag input, slider (tempo), stepper (pitch) |
| Display | Card, list row, chip/badge, avatar (initials), overline + heading, empty state, skeleton loader, progress bar, answer summary ("4 ✓ · 1 ? · 1 ✗") |
| Navigation | Bottom bar, navigation rail, sidebar, top bar, tabs, breadcrumb/back |
| Overlays | Dialog, bottom sheet, menu, toast (with undo), command palette (search) |
| Media | Mini player, full player controls, seek bar with markers and A–B range |

**States** for every interactive component: default, hover, pressed, focus (visible ring), disabled, loading. The pressed state must also work on touch (`:active`), and every tap gets immediate feedback (R-UX-10).

## 8. Band Branding (configurable per band)

| Setting | Where | Default |
|---|---|---|
| Band name | First-time setup (F1), Einstellungen → Band | – (required) |
| Band color (accent) | First-time setup, Einstellungen → Band: palette of ~12 suggestions + custom hex color | neutral palette suggestion; Overload: `#E30613` |
| Band logo (optional) | Einstellungen → Band: upload from the device, or "Aus HiDrive wählen" (v0.19.2) | none → band name in Oswald |

**Logo details (decided: optional upload)**
- Formats: SVG (preferred) or PNG with transparency, max. 2 MB.
- **Two variants**, because logos like Overload's (white lettering) disappear on light backgrounds:
  - "Logo für dunklen Hintergrund" – used in dark theme, stage view, and dark headers
  - "Logo für hellen Hintergrund" (optional) – used in light theme and print
  - If only one variant exists, the app shows the band name as text where the logo wouldn't be readable.
- Upload preview on light and dark background before saving.
- Shown in: sidebar header (desktop), start screen header, welcome/login screens, setlist print header, installable app splash (where the platform allows).
- Stored as app-created files in `_BandApp/branding/` (e.g. `logo-dark.svg`, `logo-light.png`); replacing a logo creates a new file, the old one is kept (R-DATA-05).
- **"Aus HiDrive wählen"** (v0.19.2): a picker shows the folders of the home (without `_BandApp` and hidden folders) and their SVG/PNG files; the chosen image is previewed on the variant's background, then **copied** into `_BandApp/branding/` (same type/size check as an upload). The original is only read, never changed, and the logo keeps working if someone later moves or renames it.
- **App icon** (home screen) stays the app's own neutral icon in v1; band-specific app icons would require per-band builds (future plans).

- All branding is stored in `_BandApp/app.json` (`branding: { color, logoDark, logoLight }`), so all members see the same look. Anyone can change it (no roles), with a chat info line "Lisa hat das Band-Design geändert".
- The app name ("Overload App", R-I18N-07) stays separate from the band branding; a public version would have a neutral app name plus the band's branding.

## 9. Motion

- Short and functional: 150–200 ms ease-out for UI transitions, sheets slide in, lists don't animate on every update.
- **Motion explains where things are (R-UX-09, v0.15.0):** a deeper screen slides in from the right, going back (← back, back gesture, up to a parent) slides in from the left, switching tabs fades, a swipe between tabs slides in the swipe direction (`--dur-screen` 220 ms, `AppShell` `data-nav`). Panels and the player come from the bottom. Screens are animated with `left` on a relatively positioned box, never `transform` (it would re-anchor fixed elements such as the chat input).
- `prefers-reduced-motion`: animations reduced to fades or none.
- No motion while audio-critical actions happen (e.g. no layout jumps under the finger in the stage view).

## 10. Accessibility Summary

- WCAG 2.1 AA contrast in both themes, including accent-derived colors (§3.2).
- Visible focus ring on all interactive elements.
- Color never the only carrier of meaning (icons, labels, patterns).
- Respect system font size where possible; UI must not break at 200 % zoom.

## 11. Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Themes | Wie System (default) / Hell / Dunkel; stage view always dark, print always light |
| 2 | Branding approach | Neutral base, band identity only via name, color, logo |
| 3 | Overload band color | `#E30613` (from the website) |
| 4 | Fonts | Oswald (headings, navigation, overlines) + Inter (body/UI), self-hosted |
| 5 | Band logo | Optional upload, dark and light variant |
| 6 | Website decoration (concrete texture, brush strokes, wide display font) | Not used in the app |

## Addendum (v0.11 – v0.13)

- **Event type chips** (calendar filters) use `Chip` with `tone="gig|rehearsal|absence|other"`: filled with `--event-<type>` and `--event-<type>-on` (readable text color) while active, colored outline while off. In light mode orange (`gig`) uses dark text – white on that orange is only 3.9:1.
- **Floating menus** use `--surface-raised` / `--border-raised` and are rendered at the top level of the page (portal), so rows and headings can never cover them.
- **Text size** (Einstellungen → Darstellung: Normal / Groß 115 % / Sehr groß 130 %) scales the root font size; all sizes are `rem`. It replaces pinch zoom, which is disabled (R-UI-12).
- **Print** is always black on white; `data-no-print` hides app chrome; the setlist print has its own styles (`features/setlists/Print.module.css`).
