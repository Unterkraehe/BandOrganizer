# Quality checks (browser behaviour)

Small Playwright (Python) scripts for the things unit tests can't see. They drive the **built** app in demo mode
(phone-sized Chromium unless noted). Shared setup is in `common.py` (`session()`, `open_demo()`, `nav()`, `log()`).

```bash
npm run build && node scripts/serve.mjs start          # serve dist/ on http://localhost:4173/BandOrganizer/ (stop: … stop)
pip install playwright pillow && playwright install chromium
python3 scripts/qa/<script>.py                          # exit code 0 = fine
```

| Script | Checks | Target |
|---|---|---|
| `layout-shift-audit.py` | Layout shifts on every screen, incl. right after taps and when the mini player appears | CLS ≈ 0 (R-UI-11) |
| `tab-switch-perf.py` | Tab tap → content with 300 songs, 4× CPU slowdown | < 150 ms (R-UI-13) |
| `phone-interaction-check.py` | Swipe between tabs, answer buttons stay put, chat input pinned above bottom bar/mini player, dialog on top, zoom guards | all as described in the output |
| `menu-overlay-check.py` | ⋯ menus fully on screen and on top (also last row in the archive), both themes | `on screen: True on top: True` |
| `overflow-check.py [width]` | No screen or scroll area wider than a 360 px (or given) phone, with long texts injected; incl. song page and practice view with a version dropdown | `problems: 0` (R-UI-14) |
| `latency-check.py` | With 250 ms per storage call the UI still reacts at once (optimistic updates); no sideways scrolling | < 300 ms |
| `axe-audit.py` | axe-core accessibility audit, phone dark + desktop light | only the intentional zoom finding |
| `push-sw-check.py` | A push message reaches the service worker and shows the notification (needs Chromium's new headless mode) | notification title/body/tag/url as sent |
| `print-pdf.py [out.pdf]` | Builds a sample setlist and prints it to PDF – look at it with `pdftoppm -r 70 -png out.pdf page` | visual |

`?demo-songs=300` fills the demo with 300 songs, `?demo-latency=250` slows every storage call down (see `docs/92-code-map.md`).
Set `QA_URL` to test another address. Not covered (needs a real device): the on-screen keyboard on iOS/Android,
lock-screen audio, install/PWA behaviour, real push delivery.
