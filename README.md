# BandOrganizer – Overload App

A Progressive Web App for band organization: songs, lyrics, notes, practice tools, calendar, setlists and a band chat – all stored on the band's own HiDrive.

- **Live:** https://unterkraehe.github.io/BandOrganizer/
- **Status:** v0.2.0 – M1 (connection, band setup, profiles) built; HiDrive login pending the client ID. Demo mode available. See [`docs/03-roadmap.md`](docs/03-roadmap.md).
- **UI language:** German. Code, comments and docs: English.

## Documentation

Everything is planned in `docs/` – read these before changing anything:

| File | Content |
|---|---|
| [`docs/00-overview.md`](docs/00-overview.md) | Vision, architecture, data layout, decision log |
| [`docs/01-general-rules.md`](docs/01-general-rules.md) | Rules for every change (data safety, i18n, UI, code) |
| [`docs/02-design-system.md`](docs/02-design-system.md) | Tokens, themes, typography, components, branding |
| [`docs/03-roadmap.md`](docs/03-roadmap.md) | Milestones M0–M9 |
| [`docs/features/`](docs/features/) | One file per feature (F1–F10) |
| [`docs/90-future-plans.md`](docs/90-future-plans.md) | Ideas after v1 |

The most important rule: **the app never modifies or deletes files it did not create.** All writes go through the safety guard in `src/core/storage/guard.ts` (R-DATA-04).

## Development

Requirements: Node.js 22 (see `.nvmrc`).

```bash
npm install
npm run dev        # local dev server: http://localhost:5173/BandOrganizer/
npm test           # unit tests (Vitest)
npm run lint       # ESLint
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

## Deployment

Every push to `main` runs lint, tests and build, then deploys to GitHub Pages (`.github/workflows/deploy.yml`).
Repository setting required: **Settings → Pages → Source: GitHub Actions**.

## Project structure

```
src/
├─ app/          app shell, routing, error boundary, update toast
├─ core/
│  ├─ auth/      HiDrive OAuth login + token refresh
│  ├─ band/      band config (app.json), logo
│  ├─ color/     band color → accent tokens
│  ├─ session/   connection, band and member session, demo mode
│  ├─ storage/   StorageProvider interface + safety guard (R-DATA-04), HiDrive provider
│  ├─ data/      record fields, IDs, schema migrations (R-DATA-08/09)
│  ├─ i18n/      i18next setup + date/number formatters (R-I18N)
│  ├─ theme/     light / dark / system theme
│  ├─ features/  feature registry (navigation + routes)
│  └─ pwa/       service worker update + install hint
├─ features/     one folder per feature (start, settings, …)
├─ ui/           design tokens, base styles, shared components
└─ locales/de/   German texts, one JSON file per namespace
token-helper/    Cloudflare Worker for the HiDrive token exchange (see its README)
```
