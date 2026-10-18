import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { signUpAsAdmin } from "./admin";
import { AUTH_TIMEOUT, deleteTestUser, type TestUser } from "./auth";
import { hydrated } from "./hydration";

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

test("@writes the products table lists products and searching narrows it", async ({ page, isMobile }) => {
  created = await signUpAsAdmin(page);
  await page.goto("/admin/products", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/^Showing 1–25 of \d+$/)).toBeVisible({ timeout: AUTH_TIMEOUT });
  const names = isMobile ? page.locator("ul a[href^='/admin/products/']") : page.getByRole("table").getByRole("link");
  await expect(names).toHaveCount(25);

  const searchBox = page.getByRole("searchbox", { name: "Search products" });
  await hydrated(searchBox);
  await searchBox.fill("tote");
  await expect(page).toHaveURL(/[?&]q=tote/);
  await expect(page.getByText(/^Showing 1–\d+ of \d+$/)).not.toHaveText(/of 4\d$/);
  const shown = await names.allTextContents();
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.every((name) => /tote/i.test(name))).toBe(true);

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("@writes the table sorts by price and keeps its state in the address", async ({ page, isMobile }) => {
  test.skip(isMobile, "sorting is by the column headers, shown from md");
  created = await signUpAsAdmin(page);
  await page.goto("/admin/products", { waitUntil: "domcontentloaded" });
  const price = page.getByRole("button", { name: "Price" });
  await hydrated(price);
  await price.click();
  await expect(page).toHaveURL(/sort=price/);
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", /ascending|descending/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", /ascending|descending/, { timeout: AUTH_TIMEOUT });
});
