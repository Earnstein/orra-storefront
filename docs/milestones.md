# Milestones

Each milestone is a group of merged pull requests, recorded here with its tag and GitHub Release when the last one merges. Newest first. Process: see "How we ship" in `CLAUDE.md` and the roadmap spec in `docs/superpowers/specs/`.

## v0.3.0 — Browse · 2026-10-05
- **Scope:** styled 404 and error pages; collection pages for New, Women, Men and each category, with category tabs and a product `audience` field (women, men, unisex); 48 products, each with a colour family and a material, from photos checked for brand marks; production-safe database scripts (`db:seed` and `db:migrate` refuse production unless asked, and local development uses its own Neon branch); an editorial block system with two stories; Women and Men landing pages, now the primary nav's destinations.
- **Pull requests:** [#8 M2 Browse spec and plan](https://github.com/Earnstein/orra-storefront/pull/8) · [#9 Styled 404 and error pages](https://github.com/Earnstein/orra-storefront/pull/9) · [#10 Collection pages, the audience field and production-safe db scripts](https://github.com/Earnstein/orra-storefront/pull/10) · [#11 Catalogue grown to 48 products with colour family and material](https://github.com/Earnstein/orra-storefront/pull/11) · [#12 Stories on an editorial block system](https://github.com/Earnstein/orra-storefront/pull/12) · [#13 Women and Men landing pages](https://github.com/Earnstein/orra-storefront/pull/13)
- **Release:** https://github.com/Earnstein/orra-storefront/releases/tag/v0.3.0
- **URL:** https://orra-storefront.vercel.app
- **Carried forward:** M3 Find decides the pagination style ("load more" or numbered pages), the price filter control (bands or a range) and the Vercel function region (next to the Neon database); the e2e empty-state test has nothing to exercise now that every Women and Men tab has products; rotate the Neon production database password (before v1.0.0).

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
