# BandOrganizer – instructions for Claude (Claude Code) and other developers

Band PWA ("Overload App") on top of HiDrive. UI language **German**, code/comments/docs **English**.

## Read first (in this order)
1. `docs/01-general-rules.md` – the rules (data safety R-DATA, UI/UX, code R-CODE).
2. `docs/92-code-map.md` – **code map**: layers, where data lives, shared mechanisms, recipes, gotchas, commands.
3. `docs/93-code-index.md` – generated index of every file (purpose, exports), routes, texts, tests. Use it to find files instead of searching.
4. The feature file in `docs/features/` for the area you touch; `docs/03-roadmap.md` for status and open tests; `docs/00-overview.md` §10 for the decision log.

## Non-negotiables
- The app never modifies or deletes files it did not create. All writes go through `SafeStorage` (`src/core/storage/guard.ts`).
- Visible texts are German i18n keys (`src/locales/de/`). No hard-coded strings.
- New features and screens must be integrated intuitively (R-UX-09): one home reachable in context, ← back everywhere, one primary action, motion that explains where things are, no hidden modes, entry in the navigation map (`docs/features/12-main-menu.md` §4.5).
- Every control answers at once (R-UX-10): pressed state on touch, then the result or visible progress right away, success or failure confirmed – never a tap that seems to do nothing.
- Phones never scroll sideways (R-UI-14): nothing may be wider than a 360 px screen; check UI changes with `scripts/qa/overflow-check.py`.
- Never commit secrets (R-CODE-04): HiDrive client secret and VAPID private key live only in the Cloudflare worker. Don't read, print or ask for `.env*` / `.dev.vars`.
- Work on a branch, never commit directly on `main`; merge into `main` only when the maintainer says so (R-CODE-13) – a push to `main` deploys.
- `src/config.ts` holds the band's HiDrive client ID – don't change it unless asked.
- Don't change appearance or behaviour when the task is only structure/docs/tooling. If in doubt, compare the build output before/after (content hashes of `dist/`).

## Workflow
1. Find the files with the map/index. Change the code (small, reviewable steps, R-CODE-08).
2. While working: `npm run check -- --quick` (types + lint + index, seconds) and `npm run check -- flows/<feature> --no-build` (only that feature's flow tests).
3. Before committing: `npm run check` (types, lint, index, all tests, build = what CI does).
4. App change → bump `version` in `package.json` and add the German entry as the **first** key in `src/locales/de/whatsNew.json` (a test enforces it); update the feature file / roadmap; structure change → update `docs/92-code-map.md` (R-CODE-12). Docs/tooling-only change → no version bump. `/release` does the routine, `/doc-sync` checks docs against your diff.
5. Commit on a branch (R-CODE-13), English message referencing the feature ID (`F4: add song list sorting`). **A push to `main` deploys to GitHub Pages** – merge into `main` only when asked; push only when asked; prefer a pull request (CI runs lint, tests and build on pull requests).

## What you can't test here (say so in your summary, list what the band should try)
Real HiDrive (login only works on the deployed site: redirect URI + worker `ALLOWED_ORIGINS`), real phones (iOS audio on the lock screen, keyboard behaviour, push delivery, install as PWA). The open device tests are in `docs/94-device-test-checklist.md`. Demo mode (`?demo-songs=300`, `?demo-latency=250`) and `scripts/qa/` cover everything else.

## Working style the maintainer likes
- Plain-language summary at the end: what changed, what was checked, what is still unverified, what to test on real devices. Short bullets, no jargon.
- Ask one short question when a request has two plausible readings (e.g. "tags between the switches" – which element?). Otherwise decide, build, and say what you assumed.
- Be honest about limits and mistakes; verify claims against the code before writing them into docs.

## Tools
- `npm run check [-- --quick | --no-build | <test filter>]`, `npm run map`, `node scripts/serve.mjs start|stop|status`, `python3 scripts/qa/<script>.py` (needs `npm run build`, Python + Playwright; see `scripts/qa/README.md`).
- Slash commands (`.claude/commands/`): `/release`, `/qa`, `/doc-sync`.
- `npm run pack` only exists for hand-offs without git (zip without `src/config.ts`); in Claude Code deliver by commit.
- Run npm/tsc from the repo root; long jobs detached with output to a file; never `pkill -f <pattern>`.
