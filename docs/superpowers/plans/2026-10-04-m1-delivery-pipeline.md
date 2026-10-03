# M1 Delivery Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the repo on GitHub with tests, CI, per-PR Vercel previews on their own Neon database branches, and milestone records, so every later module ships through branch → PR → CI → preview → merge → milestone.

**Architecture:** Unit and integration tests run in Vitest (Node); database queries are tested against in-memory PGlite with the real Drizzle migrations and the real seed. End-to-end smoke tests run in Playwright against a production build. GitHub Actions runs everything on each PR, using a throwaway, auto-expiring Neon branch for the build and end-to-end tests. Vercel builds previews; its Neon integration gives each preview its own database branch, which a build script migrates and seeds.

**Tech Stack:** Next.js 16, Drizzle 0.45, Neon, Vitest 5, PGlite 0.5, Playwright 1.63, GitHub Actions (`actions/checkout@v7`, `actions/setup-node@v7`, `neondatabase/create-branch-action@v6`, `neondatabase/delete-branch-action@v3`), Vercel with the Neon integration, `gh` CLI (authenticated as the user).

**Spec:** `docs/superpowers/specs/2026-10-04-roadmap-to-live-design.md` (sections "Delivery process" and "M1: Delivery pipeline"). M1 has no separate spec.

## Global Constraints

- npm only; Node 24 in CI.
- Do not add `@vitejs/plugin-react` (it fails to install; Vite 8 compiles JSX natively, per `CLAUDE.md`).
- One module = one branch (`feat/…`, `fix/…`, `docs/…`, `chore/…`) = one PR, assigned to the GitHub Milestone `M1 · Delivery pipeline`.
- The implementer opens and updates PRs but never merges them. **The user approves by squash-merging.** Each task that opens a PR ends by waiting for that merge.
- Every `git push` and tag push needs the user's approval (`.claude/settings.json`). Repository settings, secrets and dashboard changes are made or confirmed by the user.
- Stage files by path; never `git add -A` (the user installs things in the working tree in parallel).
- Secrets are never committed or echoed. `.env.example` lists every variable with an empty or placeholder value.
- Previews and CI never touch the production database: each gets its own Neon branch.
- Versions: the baseline `v0.1.0` is commit `c19ac94` (current `main`). M1 ends at `v0.2.0`.
- No attribution anywhere: no `Co-Authored-By` trailers, "generated with" lines or watermarks in commits, PRs, release notes or tags.

## Review Focus

1. **A cancelled or failed CI run leaves its Neon branch behind**, and the free plan caps branches. Expected: the delete step runs `if: always()`, and every CI branch is created with an expiry 2 hours out as a backstop. *Pinned in Task 6, Step 6.*
2. **A production deploy runs the seed**, resetting live content and stock. Expected: production builds migrate but never seed. *Pinned in Task 8, test `never seeds production`.*
3. **Every redeploy of the same preview re-runs the seed.** Expected: the seed is idempotent; running it twice leaves 5 categories and 9 products with no duplicates. *Pinned in Task 4, test `is idempotent`.*
4. **Database URLs or generated secrets end up in CI logs.** Expected: none appear. *Pinned in Task 6, Step 5 (log grep).*
5. **End-to-end tests run locally against a dev database someone has edited** (stock changed in Drizzle Studio) and fail falsely. Expected: assertions use seed facts that edits rarely change (names, prices, category membership) and match the stock label by pattern, not exact count; CI always runs on a freshly seeded branch. *Pinned in Task 5's spec style.*

---

### Task 1: Publish the repository, baseline release and roadmap PR

**Files:** none in the repo (the spec and this plan are already committed on `docs/roadmap`).

**Interfaces:**
- Produces: remote `origin` (GitHub repo `<owner>/<repo>`); tag `v0.1.0`; GitHub Milestone titled exactly `M1 · Delivery pipeline`; PR for `docs/roadmap`.

- [ ] **Step 1: Confirm with the user:**
  - the repo name (default `orra-storefront`; avoid "shopify", which is a trademark);
  - public visibility (branch protection on the free plan requires a public repo; the history was already scanned and has no secrets);
  - whether the newly installed skills (`.agents/skills/{brainstorming,executing-plans,writing-plans}` and the `skills-lock.json` change) go into Task 2's PR.
- [ ] **Step 2: Create the repo without pushing**

Run: `gh repo create <repo> --public --source . --remote origin`
Expected: `✓ Created repository <owner>/<repo>` and `✓ Added remote`.

- [ ] **Step 3: Configure merge settings**

Run: `gh repo edit --enable-squash-merge --enable-merge-commit=false --enable-rebase-merge=false --delete-branch-on-merge`
Expected: exit 0.

- [ ] **Step 4: Tag the baseline**

Run: `git tag -a v0.1.0 c19ac94 -m "v0.1.0 — Baseline: homepage, product pages, New arrivals, Postgres catalogue, auth wiring"`

- [ ] **Step 5: Push (user approval)**

Run: `git push -u origin main && git push origin v0.1.0 && git push -u origin docs/roadmap`
Expected: three successful pushes.

- [ ] **Step 6: Create the milestone and the baseline release**

```bash
gh api repos/{owner}/{repo}/milestones -f title="M1 · Delivery pipeline" \
  -f description="v0.2.0. Spec: docs/superpowers/specs/2026-10-04-roadmap-to-live-design.md"
gh release create v0.1.0 --title "v0.1.0 — Baseline" --notes "Homepage with hero carousel; product pages with gallery, Add to bag and Save for later (browser-only); New arrivals with category tabs; catalogue in Neon Postgres via Drizzle; Better Auth (email + password) with the Infra dashboard plugin."
```
Expected: milestone JSON with a `number`; a release URL.

- [ ] **Step 7: Open the roadmap PR**

Run: `gh pr create --base main --head docs/roadmap --title "Roadmap to v1.0.0 and M1 plan" --milestone "M1 · Delivery pipeline" --body "Adds the roadmap spec and the M1 implementation plan. No code changes."`
Expected: PR URL.

- [ ] **Step 8: Wait for the user to merge.** Check: `gh pr view docs/roadmap --json state -q .state` → `MERGED`. Then `git checkout main && git pull --ff-only`.

### Task 2: Process docs (PR `docs/process`)

**Files:**
- Create: `.github/pull_request_template.md`
- Create: `docs/milestones.md`
- Modify: `CLAUDE.md`: add a `## How we ship` section after `## Commands`
- Modify: `.gitignore`: add `.superpowers/`, `/playwright-report/`, `/test-results/`, `/blob-report/`, `/playwright/.cache/`
- (If the user said yes in Task 1) add: `.agents/skills/{brainstorming,executing-plans,writing-plans}/**`, `skills-lock.json`

**Interfaces:**
- Produces: the PR template's headings (later PR bodies follow them) and the `docs/milestones.md` entry format that Task 9 appends to.

- [ ] **Step 1: Branch** — `git checkout -b docs/process main`.
- [ ] **Step 2: Write the PR template** with exactly these sections:
  - `## What and why`
  - `## How it was tested`, a checklist:
    - `- [ ] CI green (lint, typecheck, unit, e2e, build)`
    - `- [ ] Browser-checked at 375 / 1024 / 1280 / 1440 px: spacing against tokens, no console errors`
    - `- [ ] Tests written first for new behaviour`
  - `## Screenshots` (Desktop / Mobile)
  - `## Preview` (Vercel preview link)
  - `## Plan / spec` (task numbers and doc links)
- [ ] **Step 3: Write `docs/milestones.md`**. Newest first. One `##` section per release:

```markdown
## v0.1.0 — Baseline · 2026-10-04
- **Scope:** Homepage, product pages, New arrivals, Postgres catalogue, Better Auth wiring.
- **Pull requests:** none (before GitHub)
- **Release:** https://github.com/<owner>/<repo>/releases/tag/v0.1.0
- **URL:** not deployed
```
- [ ] **Step 4: Write `## How we ship` in `CLAUDE.md`**. Six lines at most, summarising the spec's Delivery process and linking the spec. Include: one branch and PR per module; the user squash-merges; milestone = tag + GitHub Release + `docs/milestones.md`; each milestone has its own spec and plan.
- [ ] **Step 5: Commit, push (approval) and open the PR**

```bash
git add .github/pull_request_template.md docs/milestones.md CLAUDE.md .gitignore   # plus the skills paths if approved
git commit -m "Add PR template, milestone log and shipping process"
git push -u origin docs/process
gh pr create --fill --milestone "M1 · Delivery pipeline"
```
- [ ] **Step 6: Wait for the merge**, then `git checkout main && git pull --ff-only`.

### Task 3: Vitest and unit tests for the pure rules (PR `feat/unit-tests`, part 1 of 2)

**Files:**
- Modify: `package.json`
  - devDependencies: `vitest@^5.0.3`; bump `@types/node` from `^20` to `^24` (Vitest 5's optional peer requires ≥ 24).
  - scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.
- Create: `vitest.config.mts`
- Create: `src/test/server-only.ts`
- Test: `src/lib/bag/rules.test.ts`, `src/lib/catalog/stock.test.ts`, `src/lib/catalog/delivery.test.ts`, `src/lib/format.test.ts`
- Modify: `CLAUDE.md`
  - add `npm test` / `npm run test:watch` to Commands;
  - remove "There is no test runner configured yet.";
  - remove the "If adding Vitest…" gotcha, keeping only the plugin-react warning.

**Interfaces:**
- Produces: the `npm test` command. Vitest resolves `@/…` to `src/…` and `server-only` to `src/test/server-only.ts`, and includes `src/**/*.test.ts` and `scripts/**/*.test.ts`.

- [ ] **Step 1: Branch and install**

Run: `git checkout -b feat/unit-tests main && npm install -D vitest@^5.0.3 @types/node@^24`
Expected: install succeeds with no peer-dependency errors.

- [ ] **Step 2: Create `vitest.config.mts`**
  - `test.environment: "node"`
  - `test.include: ["src/**/*.test.ts", "scripts/**/*.test.ts"]`
  - `resolve.alias`: `@` → `<root>/src`, and `server-only` → `<root>/src/test/server-only.ts`
  - no plugins

  `src/test/server-only.ts` is `export {};` with a one-line comment explaining why the alias exists: the real package throws outside React Server Components.

- [ ] **Step 3: Write the failing tests** (they import real modules; assertions below):

```ts
// src/lib/bag/rules.test.ts
expect(addToBag(EMPTY_BAG, "a", 5)).toEqual({ state: { lines: [{ slug: "a", quantity: 1 }], saved: [] }, added: true });
expect(addToBag({ lines: [{ slug: "a", quantity: 1 }], saved: [] }, "a", 5).state.lines).toEqual([{ slug: "a", quantity: 2 }]);
const full = { lines: [{ slug: "a", quantity: 2 }], saved: [] };
expect(addToBag(full, "a", 2)).toEqual({ state: full, added: false });           // never exceeds stock
expect(addToBag(EMPTY_BAG, "a", 0).added).toBe(false);                            // sold out
expect(bagCount({ lines: [{ slug: "a", quantity: 2 }, { slug: "b", quantity: 3 }], saved: [] })).toBe(5);
expect(quantityInBag(EMPTY_BAG, "missing")).toBe(0);
expect(toggleSaved(toggleSaved(EMPTY_BAG, "a"), "a")).toEqual(EMPTY_BAG);         // save then unsave
expect(isSaved(toggleSaved(EMPTY_BAG, "a"), "a")).toBe(true);
for (const junk of [null, "x", 42, undefined]) expect(parseBagState(junk)).toEqual(EMPTY_BAG);
expect(parseBagState({
  lines: [{ slug: "a", quantity: 1 }, { slug: "b", quantity: 0 }, { slug: "c", quantity: 1.5 }, { quantity: 2 }, null],
  saved: ["a", 1, null],
})).toEqual({ lines: [{ slug: "a", quantity: 1 }], saved: ["a"] });
expect(parseBagState({ lines: "nope", saved: {} })).toEqual(EMPTY_BAG);

// src/lib/catalog/stock.test.ts — it.each over [units, state, label]
[-1, "out_of_stock", "Sold out"], [0, "out_of_stock", "Sold out"], [1, "low_stock", "Only 1 left"],
[3, "low_stock", "Only 3 left"], [4, "in_stock", "In stock"]
expect(LOW_STOCK_THRESHOLD).toBe(3);

// src/lib/catalog/delivery.test.ts — dates built with new Date(2026, 9, d, 12); compare [year, month, day]
// Mon 5 Oct → earliest Wed 7, latest Fri 9
// Fri 9 Oct → earliest Tue 13, latest Thu 15
// Sat 10 Oct → earliest Tue 13, latest Thu 15
// the input Date is not mutated; DELIVERY_BUSINESS_DAYS equals { min: 2, max: 4 }

// src/lib/format.test.ts
expect(formatPrice(79000)).toBe("$790");
expect(formatPrice(189000)).toBe("$1,890");
expect(formatPrice(0)).toBe("$0");
```

- [ ] **Step 4: Run them**

Run: `npm test`
Expected: 4 files, all tests PASS. These are characterisation tests: the code already exists.

- [ ] **Step 5: Prove the suite can fail.** Temporarily set `LOW_STOCK_THRESHOLD = 2` in `stock.ts` and run `npm test -- src/lib/catalog/stock.test.ts`. Expected: FAIL on `Only 3 left`. Revert, and re-run to PASS.
- [ ] **Step 6: Commit** — `git add package.json package-lock.json vitest.config.mts src/test/server-only.ts src/lib/bag/rules.test.ts src/lib/catalog/stock.test.ts src/lib/catalog/delivery.test.ts src/lib/format.test.ts CLAUDE.md && git commit -m "Add Vitest with unit tests for bag, stock, delivery and price rules"`. Don't push yet; Task 4 shares this PR.

### Task 4: Reusable seed and catalogue query tests on PGlite (PR `feat/unit-tests`, part 2 of 2)

**Files:**
- Move: `scripts/seed-data/catalog.ts` → `src/db/seed/catalog.ts` (`git mv`). Its type import becomes `../schema/catalog`. The seed moves into `src/` because tests now use it, Vercel preview builds will, and so will the M5 demo-reset route.
- Create: `src/db/seed/index.ts`
- Modify: `scripts/seed-catalog.ts`: becomes a CLI wrapper only.
- Create: `src/test/db.ts`
- Modify: `package.json`: devDependency `@electric-sql/pglite@^0.5.8`
- Test: `src/db/seed/seed.test.ts`, `src/lib/catalog/queries.test.ts`
- Modify: `CLAUDE.md`: replace references to `scripts/seed-data/catalog.ts` with `src/db/seed/catalog.ts`

**Interfaces:**
- Consumes: Task 3's Vitest config (`@` alias, `server-only` alias).
- Produces:
  - `type SeedDatabase = PgDatabase<PgQueryResultHKT, typeof schema>` (from `drizzle-orm/pg-core`), in `src/db/seed/index.ts`.
  - `seedCatalog(db: SeedDatabase, now?: Date): Promise<{ categories: number; products: number }>`. Its upsert logic is unchanged from today's script: categories, then products, upserted by slug, with `createdAt = now − index minutes`.
  - `createTestDb(): Promise<SeedDatabase>`, in `src/test/db.ts`: an in-memory PGlite with `casing: "snake_case"`, `migrate(db, { migrationsFolder: "drizzle" })` from `drizzle-orm/pglite/migrator`, then `seedCatalog(db)`.

- [ ] **Step 1: Install** — `npm install -D @electric-sql/pglite@^0.5.8`.
- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/catalog/queries.test.ts
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
expect(await getAllProductSlugs()).toHaveLength(9);
expect((await getNewArrivals()).map((p) => p.slug)).toEqual([
  "top-handle-bag-teal", "double-monk-shoe", "round-sunglasses", "gold-hoop-earrings",
  "leather-biker-jacket", "bomber-jacket-rust", "floral-pump", "fringed-knit-poncho",
]);
const all = await getNewArrivals(24); expect(all).toHaveLength(9); expect(all.at(-1)?.slug).toBe("leather-tote-tan");
const shoe = await getProduct("double-monk-shoe");
expect(shoe).toMatchObject({ name: "Double-monk shoe", category: { slug: "shoes", name: "Shoes" }, price: 79000, colour: "Tan", stock: 2 });
expect(shoe?.images).toHaveLength(2);
expect(await getProduct("does-not-exist")).toBeUndefined();
expect((await getSpotlightProduct()).slug).toBe("leather-tote-tan");
expect((await getRelatedProducts(shoe!)).map((p) => p.slug)).toEqual(["floral-pump", "top-handle-bag-teal", "round-sunglasses", "gold-hoop-earrings"]);
expect((await getCategories()).map((c) => c.slug)).toEqual(["bags", "shoes", "accessories", "jewellery", "ready-to-wear"]);

// src/db/seed/seed.test.ts — each test gets its own createTestDb()
// is idempotent: after a second seedCatalog(db), count(categories) = 5 and count(products) = 9
// rejects negative stock: updating floral-pump's stock to -1 rejects, and its stock is still 3
// blocks deleting a category that has products: deleting "bags" rejects, and "bags" still exists
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm test -- src/db src/lib/catalog/queries.test.ts`
Expected: FAIL, because `@/test/db` and `@/db/seed` don't exist yet.

- [ ] **Step 4: Implement** `src/db/seed/index.ts` (move the logic out of `scripts/seed-catalog.ts`) and `src/test/db.ts`. `scripts/seed-catalog.ts` keeps the env loading and the neon-http client, then calls `seedCatalog(db)` and logs `Seeded <n> categories and <m> products.`
- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all test files PASS (Task 3's four plus these two); typecheck and lint clean.

If `SeedDatabase` doesn't accept both the neon-http and PGlite databases, widen it to the narrowest type that does, and record a ruling.

- [ ] **Step 6: Commit, push (approval) and open the PR**

```bash
git add package.json package-lock.json src/db/seed src/test/db.ts src/lib/catalog/queries.test.ts scripts/seed-catalog.ts scripts/seed-data CLAUDE.md
git commit -m "Move the seed into src/db/seed and test catalogue queries against PGlite"
git push -u origin feat/unit-tests
gh pr create --fill --milestone "M1 · Delivery pipeline"
```
- [ ] **Step 7: Wait for the merge**, then `git checkout main && git pull --ff-only`.

### Task 5: Playwright smoke tests (PR `feat/e2e-tests`)

**Files:**
- Modify: `package.json`: devDependency `@playwright/test@^1.63.0`; script `"test:e2e": "playwright test"`
- Create: `playwright.config.ts`
- Test: `e2e/storefront.spec.ts`
- Modify: `CLAUDE.md`: add `npm run test:e2e` to Commands, with a note: needs `npm run build` and a seeded database; serves on port 3100.

**Interfaces:**
- Produces: `npm run test:e2e`, which runs against `E2E_BASE_URL` if set, otherwise starts `npm run start -- -p 3100`. Projects are named `desktop` and `mobile`. Task 6 runs this in CI.

- [ ] **Step 1: Branch and install**

Run: `git checkout -b feat/e2e-tests main && npm install -D @playwright/test@^1.63.0 && npx playwright install chromium`
Expected: the Chromium download completes.

- [ ] **Step 2: Write `playwright.config.ts`**
  - `testDir: "e2e"`
  - `use.baseURL`: `process.env.E2E_BASE_URL ?? "http://localhost:3100"`
  - `use.trace: "on-first-retry"`
  - `webServer`: only when `E2E_BASE_URL` is unset — `{ command: "npm run start -- -p 3100", url: "http://localhost:3100", reuseExistingServer: !process.env.CI, timeout: 120_000 }`
  - `projects`: `desktop` (`devices["Desktop Chrome"]` with viewport 1440×900) and `mobile` (`devices["Pixel 7"]`)
  - in CI: `forbidOnly: true`, `retries: 1`, reporter `[["github"], ["html", { open: "never" }]]`; locally: `"list"`
- [ ] **Step 3: Write the tests** (both projects):

```ts
// e2e/storefront.spec.ts
test("home shows the newest products", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "New this season" }) });
  await expect(section.locator('a[href^="/products/"]')).toHaveCount(8);
  await expect(section.locator('a[href^="/products/"]').first()).toContainText("Top-handle bag");
});
test("product page shows price and stock", async ({ page }) => {
  await page.goto("/products/double-monk-shoe");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Double-monk shoe");
  await expect(page.getByText("$790").first()).toBeVisible();
  await expect(page.getByText(/^(In stock|Only \d+ left|Sold out)$/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /add to bag|sold out|all available/i }).first()).toBeVisible();
});
test("new arrivals filter by category", async ({ page }) => {
  await page.goto("/collections/new");
  const tabs = page.getByRole("navigation", { name: "Categories" });
  await expect(tabs.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Bags" }).click();
  await expect(page).toHaveURL(/\/collections\/new\/bags$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bags");
  const hrefs = await page.locator('a[href^="/products/"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs.sort()).toEqual(["/products/leather-tote-tan", "/products/top-handle-bag-teal"]);
});
test("unknown pages return 404", async ({ page }) => {
  expect((await page.goto("/products/does-not-exist"))?.status()).toBe(404);
  expect((await page.goto("/collections/new/does-not-exist"))?.status()).toBe(404);
});
test("no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/products/double-monk-shoe", "/collections/new"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
  }
});
```

- [ ] **Step 4: Run them**

Run: `npm run build && npm run test:e2e`
Expected: 10 passed (5 tests × 2 projects).

This uses the local `.env` database. If it isn't freshly seeded, the stock-agnostic assertions still hold.

- [ ] **Step 5: Prove the suite can fail.** Temporarily change `"New this season"` to `"New this seasons"`, run `npm run test:e2e -- --project=desktop -g "home"`, and expect FAIL. Revert.
- [ ] **Step 6: Commit, push (approval), open the PR, wait for the merge**

```bash
git add package.json package-lock.json playwright.config.ts e2e/storefront.spec.ts CLAUDE.md
git commit -m "Add Playwright smoke tests for home, product, new arrivals and 404s"
git push -u origin feat/e2e-tests
gh pr create --fill --milestone "M1 · Delivery pipeline"
```

### Task 6: CI on GitHub Actions with a throwaway Neon branch (PR `chore/ci`)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `npm run lint`, `npm run typecheck`, `npm test` (Tasks 3–4), `npm run test:e2e` (Task 5), `npm run db:migrate`, `npm run db:seed`, `npm run build`.
- Produces: required status checks named exactly **`checks`** and **`e2e`** (job ids), used by Task 7.

- [ ] **Step 1: The user adds the Neon credentials.** I don't handle the key.
  - In the Neon console, create an API key, then run `gh secret set NEON_API_KEY` and paste it.
  - Run `gh variable set NEON_PROJECT_ID --body <project id from Neon → Project settings>`.

  Check: `gh secret list` shows `NEON_API_KEY`, and `gh variable list` shows `NEON_PROJECT_ID`.
- [ ] **Step 2: Write the workflow**

```yaml
name: CI
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
  e2e:
    needs: checks
    runs-on: ubuntu-latest
    env:
      BETTER_AUTH_URL: http://localhost:3100
      NEXT_PUBLIC_APP_URL: http://localhost:3100
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - name: Generate auth secret and branch expiry
        id: prep
        run: |
          secret=$(openssl rand -base64 32); echo "::add-mask::$secret"
          echo "BETTER_AUTH_SECRET=$secret" >> "$GITHUB_ENV"
          echo "expires=$(date -u -d '+2 hours' +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_OUTPUT"
      - name: Create Neon branch
        id: neon
        uses: neondatabase/create-branch-action@v6
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          branch_name: ci-${{ github.run_id }}-${{ github.run_attempt }}
          expires_at: ${{ steps.prep.outputs.expires }}
      - name: Migrate, seed and build
        env: { DATABASE_URL: "${{ steps.neon.outputs.db_url_pooled }}" }
        run: npm run db:migrate && npm run db:seed && npm run build
      - run: npx playwright install --with-deps chromium
      - name: End-to-end tests
        env: { DATABASE_URL: "${{ steps.neon.outputs.db_url_pooled }}" }
        run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: playwright-report, path: playwright-report, retention-days: 7 }
      - name: Delete Neon branch
        if: always() && steps.neon.outputs.branch_id != ''
        uses: neondatabase/delete-branch-action@v3
        with:
          project_id: ${{ vars.NEON_PROJECT_ID }}
          api_key: ${{ secrets.NEON_API_KEY }}
          branch: ${{ steps.neon.outputs.branch_id }}
```

- [ ] **Step 3: Push (approval) and open the PR**

```bash
git checkout -b chore/ci main
git add .github/workflows/ci.yml
git commit -m "Add CI: lint, typecheck, unit, build and e2e on a throwaway Neon branch"
git push -u origin chore/ci
gh pr create --fill --milestone "M1 · Delivery pipeline"
```
- [ ] **Step 4: Watch CI on this PR**

Run: `gh pr checks --watch`
Expected: `checks` pass and `e2e` pass.

- [ ] **Step 5: Leak check**

Run: `gh run view <run-id> --log | grep -c -E "postgres(ql)?://"`
Expected: `0`.

- [ ] **Step 6: Cleanup check.** The user confirms in the Neon console that no `ci-<run-id>-*` branch remains. Then re-run this PR's workflow (`gh run rerun <run-id>`) and cancel it once the e2e job's "Create Neon branch" step has finished (`gh run cancel <run-id>`). Confirm with `gh run view <run-id> --log` that "Delete Neon branch" ran, and the user confirms the `ci-<run-id>-2` branch is gone. If it isn't, it expires within 2 hours.
- [ ] **Step 7: Wait for the merge**, then `git checkout main && git pull --ff-only`.

### Task 7: Protect `main`

**Files:** none (repository settings).

**Interfaces:**
- Consumes: check names `checks` and `e2e` from Task 6, which must have run on `main` at least once.

- [ ] **Step 1: The user confirms the settings change.** Then:

```bash
gh api -X PUT repos/{owner}/{repo}/branches/main/protection --input - <<'JSON'
{ "required_status_checks": { "strict": true, "contexts": ["checks", "e2e"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null, "allow_force_pushes": false, "allow_deletions": false }
JSON
```
Required reviews are 0, because PRs are opened from the user's own account and GitHub doesn't let authors approve their own PRs; merging is the approval. `enforce_admins: false` keeps an emergency bypass for the owner.

- [ ] **Step 2: Verify**

Run: `gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'`
Expected: `["checks","e2e"]`.

### Task 8: Vercel previews with a Neon branch per PR (PR `chore/vercel-previews`)

**Files:**
- Create: `scripts/vercel-build-steps.ts`
- Create: `scripts/vercel-build.ts`
- Create: `vercel.json`: `{ "$schema": "https://openapi.vercel.sh/vercel.json", "buildCommand": "npx tsx scripts/vercel-build.ts" }`
- Test: `scripts/vercel-build-steps.test.ts`
- Modify: `CLAUDE.md`: add an Environments line: previews are migrated and seeded on their own Neon branch; production is migrated but never seeded; CI uses an expiring `ci-*` branch.

**Interfaces:**
- Produces:
  - `buildSteps(vercelEnv: string | undefined): string[]`: npm script names in order.
  - `scripts/vercel-build.ts` runs each step as `npm run <step>` (`spawnSync`, `stdio: "inherit"`) and exits with the first non-zero status.

- [ ] **Step 1: Branch** — `git checkout -b chore/vercel-previews main`.
- [ ] **Step 2: Write the failing test**

```ts
// scripts/vercel-build-steps.test.ts
expect(buildSteps("preview")).toEqual(["db:migrate", "db:seed", "build"]);
expect(buildSteps("production")).toEqual(["db:migrate", "build"]);
it("never seeds production", () => expect(buildSteps("production")).not.toContain("db:seed"));
expect(buildSteps(undefined)).toEqual(["build"]);
expect(buildSteps("development")).toEqual(["build"]);
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- scripts`
Expected: FAIL, because `./vercel-build-steps` is not found.

- [ ] **Step 4: Implement** `buildSteps` and the `vercel-build.ts` runner.
- [ ] **Step 5: Run the tests**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit, push (approval) and open the PR** — `git add scripts/vercel-build-steps.ts scripts/vercel-build.ts scripts/vercel-build-steps.test.ts vercel.json CLAUDE.md`, commit `"Add Vercel build: migrate and seed previews, migrate production"`, push, then `gh pr create --fill --milestone "M1 · Delivery pipeline"`.
- [ ] **Step 7: The user connects Vercel and Neon** in the dashboards. I only verify.
  1. **Import the GitHub repo** (Vercel → Add New → Project, framework Next.js). Leave the build command alone; `vercel.json` sets it. The first production build may fail until step 2 provides `DATABASE_URL`; that's expected.
  2. **Add the Neon integration** (Vercel Marketplace → Neon). Link the *existing* Neon project, enable "create a branch for each preview deployment", and enable deleting the branch when the Git branch is deleted.
  3. **Set environment variables** in Vercel:
     - Production: `BETTER_AUTH_SECRET` (new, `openssl rand -base64 32`), `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` (the production `*.vercel.app` URL), `BETTER_AUTH_API_KEY`.
     - Preview: a different `BETTER_AUTH_SECRET`, and `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` set to the production URL. That's a known limitation until M3 makes auth work on preview URLs; ledger it as a ruling.
  4. **Redeploy production** from the Vercel dashboard.
- [ ] **Step 8: Verify the preview on this PR**
  - Run: `gh pr checks` → the Vercel check passes.
  - Open the preview URL: the home page renders 8 new arrivals and `/collections/new/bags` shows 2 products.
  - The Neon console shows a `preview/chore/vercel-previews` branch.
  - Run: `curl -s -o /dev/null -w "%{http_code}" <production-url>` → `200`.
- [ ] **Step 9: Wait for the merge.** After it, confirm the preview's Neon branch is deleted, then run `git checkout main && git pull --ff-only`.

### Task 9: Record milestone `v0.2.0` (PR `docs/milestone-v0.2.0`)

**Files:**
- Modify: `docs/milestones.md`: new entry at the top, in Task 2's format

**Interfaces:**
- Consumes: the merged PRs of Tasks 1–8; the production URL from Task 8.

- [ ] **Step 1: Check the milestone is otherwise complete**

Run: `gh pr list --search 'milestone:"M1 · Delivery pipeline" is:open'`
Expected: empty.

- [ ] **Step 2: Branch** `docs/milestone-v0.2.0` and add the entry:
  - **Scope:** GitHub repo; Vitest unit and PGlite query tests; Playwright smoke tests; CI with throwaway Neon branches; protected `main`; Vercel previews with per-PR Neon branches; process docs.
  - **Pull requests:** the PR numbers from `gh pr list --search 'milestone:"M1 · Delivery pipeline" is:merged' --json number,title`.
  - **Release:** the v0.2.0 link.
  - **URL:** production.
- [ ] **Step 3: Commit, push (approval), open the PR**, wait for CI to pass and the user to merge.
- [ ] **Step 4: Tag, release and close the milestone** (push approval)

```bash
git checkout main && git pull --ff-only
git tag -a v0.2.0 -m "v0.2.0 — Delivery pipeline" && git push origin v0.2.0
gh release create v0.2.0 --title "v0.2.0 — Delivery pipeline" --notes "<scope lines + links to the milestone's PRs>"
gh api -X PATCH repos/{owner}/{repo}/milestones/<number> -f state=closed
```
- [ ] **Step 5: Verify**
  - Run: `gh release view v0.2.0 --json tagName -q .tagName` → `v0.2.0`.
  - Run: `gh api repos/{owner}/{repo}/milestones/<number> -q .state` → `closed`.
  - The `docs/milestones.md` entry on `main` links to the release.

---

## Execution notes

- **Pauses are part of the plan.** Tasks 1, 2, 4, 5, 6, 8 and 9 end with "wait for the merge", because the user approves by merging. Tasks 1, 6, 7 and 8 also have user-only steps (repo creation choices, secrets, dashboards).
- **Missing companion skills.** `.agents/skills/executing-plans/scripts/task-start` and `task-done` call `../../subagent-driven-development/scripts/*`, which aren't installed. Before execution, either:
  - install obra/superpowers' `subagent-driven-development` (plus `test-driven-development`, `using-git-worktrees`, `requesting-code-review`, `verification-before-completion`, `systematic-debugging`, `finishing-a-development-branch`); or
  - keep the ledger by hand at `.superpowers/sdd/2026-10-04-m1-delivery-pipeline/progress.md` (git-ignored by Task 2), with the same line formats.
