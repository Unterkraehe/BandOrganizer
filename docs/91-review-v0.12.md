# Review v0.12.0 (M9)

> Accessibility, performance and states review before the band test phase. Date: 2026-09-29.

## Accessibility

Automated check with **axe-core** (WCAG 2 A/AA + best practices) on Start, Songs, Song detail, Neuer Song, Kalender, Termin anlegen, Chat, Setlists, Suche, Einstellungen, Mitglieder, Kalender abonnieren – phone (dark) and desktop (light).

| Finding | Fix |
|---|---|
| Month grid used `grid`/`gridcell` roles without rows | Plain group of buttons with full date labels; weekday header hidden from screen readers |
| White text on orange (Auftritt) 3.9:1 | Dark text on orange (≥ 4.5:1) |
| `--text-faint` below 4.5:1 in both themes | Light `#717179`, dark `#8b8b94` |
| Zoom disabled (`user-scalable=no`) | **Intentional** (band request, app feel). Compensation: **Textgröße** setting (Normal / Groß / Sehr groß) |

Result after fixes: only the intentional zoom finding remains.

Not automated, to check by hand in the test phase: VoiceOver/TalkBack walkthrough of the main flows; keyboard-only use on desktop (all actions are buttons/links with labels; menus close with Esc).

## Performance

| Measurement (simulated mid-range phone, CPU 4× slower) | Value |
|---|---|
| Songs tab with 300 songs | 75–100 ms (was 510–640 ms, fixed in v0.11) |
| Kalender / Chat tab | 20 ms / 7 ms |
| First start, slow mobile network (1.6 Mbit/s, 150 ms) | first content after ~2.2 s |
| Later starts (installed app, cached) | first content after ~0.6 s |

The main bundle is ~840 kB (≈250 kB compressed); PDF and Word support load only when needed. Splitting features into separate chunks would save ~0.5 s on the *first* start only – not worth the complexity for v1.

## Loading / empty / error states

All main screens reviewed. Fixed: Setlists showed "Noch keine Setlists" also while loading or after an error; a missing setlist showed the wrong message. Now: loading hint, error with "Erneut versuchen", "Diese Setlist gibt es nicht (mehr)".

## Data safety

Guard tests (incl. new share-link rule) green: the app writes only inside `_BandApp/` and creates new files (never overwrites/moves/deletes) elsewhere; share links only for files inside `_BandApp/`.

## Band test phase – checklist

See the delivery message of v0.12.0; results go into this file.

## Follow-ups after the review (v0.12.1 – v0.13.4)

- **Zoom:** the intentional "no zoom" finding stays; the text size setting is the compensation.
- **Perceived speed:** v0.12.5 made all waiting actions optimistic (see decision log 2026-09-30); `?demo-latency=250` simulates HiDrive round trips for checking this.
- **New screens/settings since the review:** notifications settings (v0.13.0), suggestion folders in the song scan settings (v0.13.2), "In die Songliste übernehmen" dialog (v0.13.3). Not yet part of an automated accessibility run – `scripts/qa/axe-audit.py` runs the same axe-core check again.
