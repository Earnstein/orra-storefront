import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// No serious or critical axe violations on a listing, with and without the filter sheet open.

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test("a listing", async ({ page }) => {
  await page.goto("/collections/women?colour=black");
  await expect(page.getByRole("button", { name: "Remove filter: Black" })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("the open filter sheet", async ({ page }) => {
  await page.goto("/collections/women");
  await page.getByRole("button", { name: /^Filter and sort/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filter and sort" });
  for (const section of ["Sort by", "Colour", "Material", "Price"]) await sheet.getByRole("button", { name: section }).click();
  await expect(sheet.getByRole("checkbox").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
