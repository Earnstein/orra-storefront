import { expect, test, type Locator, type Page } from "@playwright/test";

import { products as seedProducts } from "../src/db/seed/catalog";
import { NEW_ARRIVALS_PAGE_LIMIT } from "../src/lib/catalog/merchandising";

// Assertions use seed facts that rarely change (names, prices, category membership) and match
// stock labels by pattern, so a locally edited dev database doesn't cause false failures.

/** Moves focus with the Tab key until `target` has it, so :focus-visible applies as for a keyboard user. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error("Tab never reached the target");
}

test("home shows the newest products", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "New this season" }) });
  const tiles = section.locator('a[href^="/products/"]');
  await expect(tiles).toHaveCount(8);
  await expect(tiles.first()).toContainText("Top-handle bag");
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
  await expect(tabs.getByRole("link", { name: "All", exact: true })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: "Shoes", exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/new\/shoes$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shoes");
  const tiles = page.getByRole("main").locator('a[href^="/products/"]');
  // The tab narrows the newest batch, so expect the shoes among the newest seed products — not all of them.
  const shoes = seedProducts.filter((product) => product.category === "shoes");
  const expected = seedProducts
    .slice(0, NEW_ARRIVALS_PAGE_LIMIT)
    .filter((product) => product.category === "shoes")
    .map((product) => `/products/${product.slug}`);
  expect(expected.length).toBeLessThan(shoes.length);
  await expect(tiles).toHaveCount(expected.length); // waits for the new page, unlike evaluateAll
  const hrefs = await tiles.evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(expected);
});

test("unknown pages return 404", async ({ page }) => {
  expect((await page.goto("/products/does-not-exist"))?.status()).toBe(404);
  expect((await page.goto("/collections/new/does-not-exist"))?.status()).toBe(404);
});

test("unknown pages show the styled 404", async ({ page }) => {
  for (const path of ["/does-not-exist", "/products/does-not-exist"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "New in" })).toHaveAttribute("href", "/collections/new");
    await expect(main.getByRole("link", { name: "Women" })).toBeVisible();
  }
});

test("keyboard focus is visible on inverse bands", async ({ page }) => {
  await page.goto("/does-not-exist");
  const targets = [
    page.getByRole("main").getByRole("link", { name: "New in" }), // the 404 band
    page.getByRole("contentinfo").getByRole("link", { name: "Contact us" }), // the footer
  ];
  for (const target of targets) {
    await tabTo(page, target);
    const { outline, band } = await target.evaluate((el) => ({
      outline: getComputedStyle(el).outlineColor,
      band: getComputedStyle(el.closest("section, footer")!).backgroundColor,
    }));
    expect(outline).not.toBe(band);
  }
});

test("no horizontal overflow", async ({ page }) => {
  // The project's own viewport, then the narrowest phone we support (the mobile project is 412 wide).
  for (const width of [page.viewportSize()!.width, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of ["/", "/products/double-monk-shoe", "/collections/new", "/stories", "/stories/knitwear", "/does-not-exist"]) {
      await page.goto(path);
      // clientWidth excludes a vertical scrollbar, unlike innerWidth, so a scrollbar can't hide an overflow.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBe(0);
    }
  }
});
