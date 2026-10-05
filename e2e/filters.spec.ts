import { expect, test, type Page } from "@playwright/test";

import { products as seedProducts } from "../src/db/seed/catalog";

// Results on listings: toolbar, Load more, sort and the filter sheet. Expected values come from
// the seed. Tests that only read the page navigate with waitUntil "domcontentloaded" (the load
// event waits for every image); tests that click the results' controls wait for "load", so the
// page has hydrated before the first click.
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
  await page.goto("/collections/bags?sort=price-asc", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(`${bags.length} items sorted by Price: low to high`)).toBeVisible();
  const expected = [...bags].sort((a, b) => a.price - b.price).map((product) => `/products/${product.slug}`);
  await expect(productLinks(page)).toHaveCount(expected.length);
  expect(await productLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(expected);
});

test("a listing of 24 or fewer has no Load more", async ({ page }) => {
  expect(bags.length).toBeLessThanOrEqual(24);
  await page.goto("/collections/bags", { waitUntil: "domcontentloaded" });
  await expect(productLinks(page)).toHaveCount(bags.length);
  await expect(page.getByText(`Showing ${bags.length} of ${bags.length}`)).toBeVisible();
  await expect(loadMore(page)).toHaveCount(0);
});

test("a hand-edited page past the end shows everything", async ({ page }) => {
  expect((await page.goto("/collections/bags?page=9&sort=nope&colour=nope", { waitUntil: "domcontentloaded" }))?.status()).toBe(200);
  await expect(productLinks(page)).toHaveCount(bags.length);
});

const sheet = (page: Page) => page.getByRole("dialog", { name: "Filter and sort" });
const blackWomen = women.filter((product) => product.colourFamily === "black").length;
const brownWomen = women.filter((product) => product.colourFamily === "brown").length;

test("filter, back and reload", async ({ page }) => {
  expect(blackWomen).toBeGreaterThan(0);
  await page.goto("/collections/women");
  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  await sheet(page).getByRole("button", { name: "Colour" }).click();
  await sheet(page).getByRole("checkbox", { name: `Black (${blackWomen})` }).check();
  await expect(sheet(page).getByRole("button", { name: `Show ${blackWomen} items` })).toBeVisible();
  await sheet(page).getByRole("button", { name: /^Show \d+ items?$/ }).click();

  await expect(sheet(page)).toHaveCount(0);
  await expect(page).toHaveURL(/colour=black/);
  await expect(page.getByRole("button", { name: "Remove filter: Black" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter and sort (1)" })).toBeVisible();
  await expect(page.getByText(`${blackWomen} items sorted by Newest`)).toBeVisible();
  await expect(productLinks(page)).toHaveCount(Math.min(blackWomen, 24));

  await page.goBack();
  await expect(page).not.toHaveURL(/colour=/);
  await expect(page.getByText(`${women.length} items sorted by Newest`)).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/colour=black/);
  await page.reload();
  await expect(page.getByText(`${blackWomen} items sorted by Newest`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove filter: Black" })).toBeVisible();
});

test("the sort name opens the sheet at Sort", async ({ page }) => {
  await page.goto("/collections/bags");
  await page.getByRole("button", { name: "Newest", exact: true }).click();
  await sheet(page).getByRole("radio", { name: "Price: high to low" }).check();
  await sheet(page).getByRole("button", { name: `Show ${bags.length} items` }).click();
  await expect(page).toHaveURL(/sort=price-desc/);
  await expect(page.getByText(`${bags.length} items sorted by Price: high to low`)).toBeVisible();
});

test("closing the sheet discards the draft", async ({ page }) => {
  await page.goto("/collections/women");
  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  await sheet(page).getByRole("button", { name: "Colour" }).click();
  await sheet(page).getByRole("checkbox", { name: `Black (${blackWomen})` }).check();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/colour=/);

  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  await sheet(page).getByRole("button", { name: "Colour" }).click();
  await expect(sheet(page).getByRole("checkbox", { name: `Black (${blackWomen})` })).not.toBeChecked();
});

test("two quick filter changes: the latest wins", async ({ page }) => {
  expect(brownWomen).toBeGreaterThan(0);
  await page.goto("/collections/women?colour=black&colour=brown&stock=in");
  await expect(page.getByRole("button", { name: "Remove filter: Black" })).toBeVisible();
  await page.getByRole("button", { name: "Remove filter: Black" }).click();
  await page.getByRole("button", { name: "Remove filter: Brown" }).click();

  const inStock = women.filter((product) => product.stock > 0);
  await expect(page).toHaveURL(/\/collections\/women\?stock=in$/);
  await expect(page.getByText(`${inStock.length} items sorted by Newest`)).toBeVisible();
  await expect(productLinks(page)).toHaveCount(Math.min(inStock.length, 24));
  await expect(page.locator("main [aria-busy=true]")).toHaveCount(0);
});

test("Clear all removes every filter", async ({ page }) => {
  await page.goto("/collections/women?colour=black&material=leather&sort=price-asc");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/collections\/women\?sort=price-asc$/);
  await expect(page.getByText(`${women.length} items sorted by Price: low to high`)).toBeVisible();
});

test("removing chips by keyboard keeps focus among the chips, then on Filter and sort", async ({ page }) => {
  await page.goto("/collections/women?colour=black&colour=brown");
  await page.getByRole("button", { name: "Remove filter: Black" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Remove filter: Brown" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /^Filter and sort/ })).toBeFocused();
  await expect(page).toHaveURL(/\/collections\/women$/);
});

test("Show without changes doesn't add a history entry", async ({ page }) => {
  await page.goto("/collections/bags");
  await page.goto("/collections/women");
  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  await sheet(page).getByRole("button", { name: `Show ${women.length} items` }).click();
  await expect(sheet(page)).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/\/collections\/bags$/);
});
