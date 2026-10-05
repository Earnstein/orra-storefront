import { expect, test, type Page } from "@playwright/test";

import { products as seedProducts } from "../src/db/seed/catalog";

// Results on listings: toolbar, Load more and sort. Expected values come from the seed.
// :visible because Cache Components keeps the previous route mounted but hidden after a
// client-side navigation (see collections.spec.ts).
const productLinks = (page: Page) => page.getByRole("main").locator('a[href^="/products/"]:visible');
const loadMore = (page: Page) => page.getByRole("button", { name: "Load more" });

const women = seedProducts.filter((product) => product.audience !== "men");
const bags = seedProducts.filter((product) => product.category === "bags");

test("load more appends and survives reload", async ({ page }) => {
  expect(women.length).toBeGreaterThan(24);
  await page.goto("/collections/women");
  await expect(page.getByText(`${women.length} items sorted by Newest`)).toBeVisible();
  await expect(page.getByText(`Showing 24 of ${women.length}`)).toBeVisible();
  await expect(productLinks(page)).toHaveCount(24);

  await loadMore(page).click();
  await expect(productLinks(page)).toHaveCount(women.length);
  await expect(page).toHaveURL(/[?&]page=2(&|$)/);
  await expect(page.getByText(`${women.length - 24} more items loaded`)).toBeAttached();
  await expect(loadMore(page)).toHaveCount(0);

  await page.reload();
  await expect(productLinks(page)).toHaveCount(women.length);
  await expect(loadMore(page)).toHaveCount(0);
});

test("Load more replaces the history entry", async ({ page }) => {
  await page.goto("/collections/bags");
  await page.goto("/collections/women");
  await loadMore(page).click();
  await expect(page).toHaveURL(/page=2/);
  await page.goBack();
  await expect(page).toHaveURL(/\/collections\/bags$/);
});

test("sort by price, low to high", async ({ page }) => {
  await page.goto("/collections/bags?sort=price-asc");
  await expect(page.getByText(`${bags.length} items sorted by Price: low to high`)).toBeVisible();
  const expected = [...bags].sort((a, b) => a.price - b.price).map((product) => `/products/${product.slug}`);
  await expect(productLinks(page)).toHaveCount(expected.length);
  expect(await productLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(expected);
});

test("a listing of 24 or fewer has no Load more", async ({ page }) => {
  expect(bags.length).toBeLessThanOrEqual(24);
  await page.goto("/collections/bags");
  await expect(productLinks(page)).toHaveCount(bags.length);
  await expect(page.getByText(`Showing ${bags.length} of ${bags.length}`)).toBeVisible();
  await expect(loadMore(page)).toHaveCount(0);
});

test("a hand-edited page past the end shows everything", async ({ page }) => {
  expect((await page.goto("/collections/bags?page=9&sort=nope&colour=nope"))?.status()).toBe(200);
  await expect(productLinks(page)).toHaveCount(bags.length);
});
