---
description: Prepare a release of an app change (version, change log, docs, checks, commit – no push)
argument-hint: [patch|minor|x.y.z]
---
Prepare a release for the current changes. Argument: `$ARGUMENTS` (default: patch).

1. Look at the uncommitted changes (`git status`, `git diff`) and the commits since the last version bump. If they are only docs/tooling (no app change), say so and stop – no version bump then.
2. Bump `version` in `package.json` (patch for fixes/small improvements, minor for new features, or the version given).
3. Add a German entry as the **first** key of `src/locales/de/whatsNew.json`: 1–4 short sentences for band members, plain language, what they will notice (no technical terms).
4. Update the affected feature file(s) in `docs/features/`, the status in `docs/03-roadmap.md` / `docs/00-overview.md` if it changed, and `docs/92-code-map.md` if structure, data paths or conventions changed (R-CODE-07, R-CODE-12). Decision log entry in `docs/00-overview.md` §10 for larger decisions.
5. Run `npm run check` (everything must pass).
6. Commit on a branch (create one if you are on `main`, R-CODE-13) with an English message referencing the feature ID (R-CODE-08). Do **not** merge into `main` or push – a push to `main` deploys; ask first.
7. Summarize for the band: what changed, what was verified, what could only be checked on real devices.
