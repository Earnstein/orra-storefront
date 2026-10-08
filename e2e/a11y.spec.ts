import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";

// No serious or critical axe violations on a listing, with and without the filter sheet open, and
// with the search panel open.

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test("a listing", async ({ page }) => {
  await page.goto("/collections/women?colour=black", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Remove filter: Black" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the open filter sheet", async ({ page }) => {
  await gotoHydrated(page, "/collections/women", (page) => page.getByRole("button", { name: /^Filter and sort/ }));
  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter and sort" });
  for (const section of ["Sort by", "Colour", "Material", "Price"]) await sheet.getByRole("button", { name: section }).click();
  await expect(sheet.getByRole("checkbox").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the open search panel", async ({ page }) => {
  const searchButton = (page: Page) => page.getByRole("button", { name: "Search", exact: true });
  await gotoHydrated(page, "/", searchButton);
  await searchButton(page).click();
  await page.getByRole("searchbox", { name: "Search for" }).fill("leather");
  await expect(page.getByRole("dialog", { name: "Search" }).locator('a[href^="/products/"]').first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("sign in", async ({ page }) => {
  await gotoHydrated(page, "/sign-in", (page) => page.getByRole("button", { name: "Sign in", exact: true }));
  expect(await seriousViolations(page)).toEqual([]);
});

test("sign up, with its errors shown", async ({ page }) => {
  await gotoHydrated(page, "/sign-up", (page) => page.getByRole("button", { name: "Create account" }));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Enter your name.")).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
