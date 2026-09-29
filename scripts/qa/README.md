# Quality checks (phone behaviour)

Small Playwright (Python) scripts that check the things unit tests can't see. They drive the built app in a
phone-sized Chromium in **demo mode**.

```bash
npm run build && npx vite preview --port 4173 &     # serve the build
pip install playwright && playwright install chromium
python3 scripts/qa/layout-shift-audit.py             # layout shifts per screen (CLS incl. shifts right after taps)
python3 scripts/qa/tab-switch-perf.py                # tab tap → content, 300 songs, 4× CPU slowdown
python3 scripts/qa/phone-interaction-check.py        # swipe tabs, answer buttons stay put, pinned chat input, dialog on top
```

Targets (R-UI-11, R-UI-13): layout shift ≈ 0 on every screen; tab switch < 150 ms with 300 songs at 4× slowdown;
answer buttons keep their position when tapped; chat input stays directly above the bottom bar / mini player.

`?demo-songs=300` fills the demo with 300 songs. Not covered here (needs a real device): the on-screen keyboard on
iOS/Android, lock-screen audio, install/PWA behaviour.
