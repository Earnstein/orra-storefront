import { expect, test, type Page } from "@playwright/test";

import { POPULAR_SEARCHES } from "../src/content/search";
import { products as seedProducts } from "../src/db/seed/catalog";
import { COLOUR_FAMILIES } from "../src/lib/catalog/vocabulary";
import { gotoHydrated } from "./hydration";

// The header search panel, opened from the homepage once its header has hydrated.
const searchButton = (page: Page) => page.getByRole("button", { name: "Search", exact: true });
const openSearch = async (page: Page) => {
  await gotoHydrated(page, "/", searchButton);
  await searchButton(page).click();
  return page.getByRole("dialog", { name: "Search" });
};
const searchbox = (page: Page) => page.getByRole("searchbox", { name: "Search for" });

test("typing shows results, typos included, and Enter opens /search", async ({ page }) => {
  const panel = await openSearch(page);
  await expect(searchbox(page)).toBeFocused();
  for (const term of POPULAR_SEARCHES) await expect(panel.getByRole("link", { name: term, exact: true })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Women", exact: true })).toHaveAttribute("href", "/collections/women?new=1");

  await searchbox(page).fill("lether");
  await expect(panel.locator('a[href="/products/leather-tote-tan"]')).toBeVisible();
  const seeAll = panel.getByRole("link", { name: /^See all \d+ results/ });
  await expect(seeAll).toHaveAttribute("href", "/search?q=lether");
  await expect(panel.getByRole("status")).toHaveText(/^\d+ results?$/);
  expect(await panel.locator('a[href^="/products/"]').count()).toBeLessThanOrEqual(6);

  await searchbox(page).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=lether$/);
  await expect(panel).toHaveCount(0);
});

test("Escape closes the panel and returns focus to the button", async ({ page }) => {
  const panel = await openSearch(page);
  await expect(searchbox(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeFocused();
});

test("no results shows the message and popular searches", async ({ page }) => {
  const panel = await openSearch(page);
  await searchbox(page).fill("zzqxv");
  await expect(panel.getByText("No results for ‘zzqxv’")).toBeVisible();
  await expect(panel.getByRole("link", { name: POPULAR_SEARCHES[0], exact: true })).toBeVisible();
  await expect(panel.locator('a[href^="/products/"]')).toHaveCount(0);
});

test("a suggested category narrows the search", async ({ page }) => {
  const panel = await openSearch(page);
  await searchbox(page).fill("leather");
  const bags = panel.getByRole("link", { name: /^Bags/ });
  await expect(bags).toHaveAttribute("href", "/search?q=leather&category=bags");
});

// The /search page.
const productLinks = (page: Page) => page.getByRole("main").locator('a[href^="/products/"]:visible');
const filterButton = (page: Page) => page.getByRole("button", { name: /^Filter and sort/ });

test("results page: heading, relevance, category filter and Load more", async ({ page }) => {
  await gotoHydrated(page, "/search?q=leather", filterButton);
  await expect(page).toHaveTitle(/^Search/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for ‘leather’");
  const summary = page.getByText(/^\d+ items sorted by Relevance$/);
  await expect(summary).toBeVisible();
  const total = Number((await summary.textContent())!.split(" ")[0]);
  expect(total).toBeGreaterThan(24);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  await filterButton(page).click();
  await expect(page.getByRole("dialog", { name: "Filter and sort" }).getByRole("button", { name: "Category" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(productLinks(page)).toHaveCount(Math.min(total, 48));
  await expect(page).toHaveURL(/[?&]page=2/);
});

test("typing on the page replaces the query", async ({ page }) => {
  await gotoHydrated(page, "/search?q=leather", filterButton);
  await page.getByRole("searchbox", { name: "Search for" }).fill("tote");
  await expect(page).toHaveURL(/\/search\?q=tote$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Results for ‘tote’");
  await expect(page.getByRole("main").locator('a[href="/products/leather-tote-tan"]')).toBeVisible();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/search/);
});

test("Back after typing restores the earlier search", async ({ page }) => {
  await gotoHydrated(page, "/search?q=leather", filterButton);
  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter and sort" });
  await sheet.getByRole("switch", { name: /^In stock/ }).click();
  await sheet.getByRole("button", { name: /^Show \d+ items?$/ }).click();
  await expect(page).toHaveURL(/q=leather&stock=in$/);

  await page.getByRole("main").getByRole("searchbox", { name: "Search for" }).fill("tote");
  await expect(page).toHaveURL(/q=tote&stock=in$/);
  await page.goBack({ waitUntil: "commit" });
  await expect(page).toHaveURL(/\/search\?q=leather$/);
  await expect(page.getByRole("main").getByRole("searchbox", { name: "Search for" })).toHaveValue("leather");
  await page.waitForTimeout(500); // longer than the field's debounce: nothing writes the URL back
  await expect(page).toHaveURL(/\/search\?q=leather$/);
});

test("a header search replaces what was typed on the page", async ({ page }) => {
  await gotoHydrated(page, "/search?q=leather", filterButton);
  await page.getByRole("main").getByRole("searchbox", { name: "Search for" }).fill("tote");
  await expect(page).toHaveURL(/\/search\?q=tote$/);

  await page.getByRole("button", { name: "Search", exact: true }).click();
  const panelField = page.getByRole("dialog", { name: "Search" }).getByRole("searchbox", { name: "Search for" });
  await panelField.fill("leather");
  await panelField.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=leather$/);
  await expect(page.getByRole("main").getByRole("searchbox", { name: "Search for" })).toHaveValue("leather");
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/\/search\?q=leather$/);
});

test("an empty query shows the search field and popular searches", async ({ page }) => {
  await page.goto("/search", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/^Search/);
  await expect(page.getByRole("main").getByRole("searchbox", { name: "Search for" })).toBeVisible();
  for (const term of POPULAR_SEARCHES) {
    await expect(page.getByRole("main").getByRole("link", { name: term, exact: true })).toHaveAttribute("href", `/search?q=${term}`);
  }
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("a filter combination with no results offers Clear all filters", async ({ page }) => {
  // A colour no seed product has, so the combination finds nothing.
  const unused = COLOUR_FAMILIES.find((colour) => !seedProducts.some((product) => product.colourFamily === colour));
  test.skip(!unused, "every colour family is in the seed");
  await page.goto(`/search?q=leather&colour=${unused}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("No results for ‘leather’")).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear all filters", exact: true })).toBeVisible();
});

test("a search with no results offers popular searches", async ({ page }) => {
  await page.goto("/search?q=zzqxv", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("No results for ‘zzqxv’")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: POPULAR_SEARCHES[0], exact: true })).toBeVisible();
});
