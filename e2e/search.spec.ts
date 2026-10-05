import { expect, test, type Page } from "@playwright/test";

import { POPULAR_SEARCHES } from "../src/content/search";
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
