import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";

// Browser errors reach POST /api/client-errors (relayed to Sentry from the server) with the page's
// path and without its query. The route is answered here, so nothing is sent anywhere.
const searchButton = (page: Page) => page.getByRole("button", { name: "Search", exact: true });

test("a browser error is reported once, without the page's query", async ({ page }) => {
  const reports: unknown[] = [];
  await page.route("**/api/client-errors", async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await gotoHydrated(page, "/collections/women?colour=black", searchButton);
  await page.evaluate(() => {
    for (let n = 0; n < 2; n += 1) setTimeout(() => { throw new TypeError("e2e: thrown in the browser"); });
  });
  await expect.poll(() => reports.length).toBe(1);
  expect(reports[0]).toMatchObject({ name: "TypeError", message: "e2e: thrown in the browser", path: "/collections/women", source: "window" });
});

test("no Sentry code reaches the browser", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script") scripts.push(await response.text().catch(() => ""));
  });
  await gotoHydrated(page, "/", searchButton);
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((source) => /sentry/i.test(source))).toEqual([]);
});
