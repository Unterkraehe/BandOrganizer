---
description: Run the browser checks in scripts/qa against the production build (phone layout, performance, accessibility, menus, push)
argument-hint: [script name, default: all except print-pdf]
---
Run the browser checks from `scripts/qa/` (see its README). Argument: `$ARGUMENTS` (a script name without `.py`; empty = all except `print-pdf`).

1. `npm run build`, then `node scripts/serve.mjs start`.
2. Run the script(s) with `python3 scripts/qa/<name>.py` – one at a time, long ones detached with output to a file. Needs Python with `playwright` (`pip install playwright pillow`, `playwright install chromium`); if missing, say so and stop.
3. Always `node scripts/serve.mjs stop` at the end, also after failures.
4. Report per script: pass/fail with the key numbers (layout shift, tab-switch ms, axe findings, menu on screen, notification shown, late/dead taps). Compare with the targets in `scripts/qa/README.md`. For failures, find the cause in the code before proposing a fix.
