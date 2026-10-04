import { expect, test } from "@playwright/test";

// Assertions use seed facts that rarely change (names, prices, category membership) and match
// stock labels by pattern, so a locally edited dev database doesn't cause false failures.

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
  await tabs.getByRole("link", { name: "Bags", exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/new\/bags$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bags");
  const tiles = page.getByRole("main").locator('a[href^="/products/"]');
  await expect(tiles).toHaveCount(2); // waits for the new page, unlike evaluateAll
  const hrefs = await tiles.evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  expect(hrefs.sort()).toEqual(["/products/leather-tote-tan", "/products/top-handle-bag-teal"]);
});

test("unknown pages return 404", async ({ page }) => {
  expect((await page.goto("/products/does-not-exist"))?.status()).toBe(404);
  expect((await page.goto("/collections/new/does-not-exist"))?.status()).toBe(404);
});

test("no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/products/double-monk-shoe", "/collections/new"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBe(0);
  }
});
