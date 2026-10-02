---
description: Check that docs, code map and change log match the current code changes
---
Compare the current changes (`git diff` and `git diff --staged`, plus commits not yet on `main`) with the documentation:

1. Feature files in `docs/features/` for every touched area: status line and behaviour text still true? New behaviour documented?
2. `docs/92-code-map.md`: new feature, storage path, provider, shared mechanism, convention or gotcha → add it. Check every statement you touch against the code (e.g. dependency rules, file names).
3. `docs/00-overview.md`: feature index, data layout §8, decision log §10; `docs/03-roadmap.md` status and open tests; `docs/94-device-test-checklist.md` if new things need a real device.
4. `src/locales/de/whatsNew.json` has an entry for an app change (version bump) – not for docs/tooling-only work.
5. New or changed screens: the navigation map (`docs/features/12-main-menu.md` §4.5) shows them with their entry points and where ← back leads; the change passes the R-UX-09 checklist (`docs/01-general-rules.md`), and every new or changed control gives immediate feedback (R-UX-10).
6. `npm run map` (regenerates `docs/93-code-index.md`).

Fix what is out of date and list what you changed. Don't invent behaviour – verify against the code.
