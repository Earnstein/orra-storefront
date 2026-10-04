# Milestones

Each milestone is a group of merged pull requests, recorded here with its tag and GitHub Release when the last one merges. Newest first. Process: see "How we ship" in `CLAUDE.md` and the roadmap spec in `docs/superpowers/specs/`.

## v0.2.0 — Delivery pipeline · 2026-10-04
- **Scope:** GitHub repository (public, squash merges only); Vitest unit tests and catalogue query tests on in-memory Postgres (PGlite); Playwright smoke tests on desktop and mobile; CI on GitHub Actions with a throwaway Neon branch per run and masked credentials; protected `main` (pull request plus `checks` and `e2e` required); Vercel production and per-PR previews, each preview on its own Neon branch (migrated and seeded), production migrated but never seeded, with a guard that stops a preview from touching the production database; PR template and this milestone log.
- **Pull requests:** [#1 Roadmap to v1.0.0 and M1 plan](https://github.com/Earnstein/orra-storefront/pull/1) · [#2 PR template, milestone log and shipping process](https://github.com/Earnstein/orra-storefront/pull/2) · [#3 Vitest unit tests and PGlite query tests](https://github.com/Earnstein/orra-storefront/pull/3) · [#4 Playwright smoke tests](https://github.com/Earnstein/orra-storefront/pull/4) · [#5 CI](https://github.com/Earnstein/orra-storefront/pull/5) · [#6 Vercel build for previews and production](https://github.com/Earnstein/orra-storefront/pull/6)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.2.0
- **URL:** https://orra-storefront.vercel.app
- **Carried forward:** rotate the Neon production database password (before v1.0.0); give local development its own Neon branch (before M3).

## v0.1.0 — Baseline · 2026-10-04
- **Scope:** Homepage, product pages, New arrivals, Postgres catalogue, Better Auth wiring.
- **Pull requests:** none (before GitHub)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.1.0
- **URL:** not deployed
