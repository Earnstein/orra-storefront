import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";

// Browser errors reach POST /api/client-errors (relayed to Sentry from the server) with the page's
// path and without its query. The route is answered here, so nothing is sent anywhere.
const searchButton = (page: Page) => page.getByRole("button", { name: "Search", exact: true });

test("a browser error is reported once, without the page's query", async ({ page }) => {
  const reports: { message?: string }[] = [];
  await page.route("**/api/client-errors", async (route) => {
    reports.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await gotoHydrated(page, "/collections/women?colour=black", searchButton);
  // The same error twice, then another: two reports arrive, in that order, so the repeat was dropped.
  await page.evaluate(() => {
    const raise = (message: string) => setTimeout(() => { throw new TypeError(message); });
    raise("e2e: thrown in the browser");
    raise("e2e: thrown in the browser");
    setTimeout(() => raise("e2e: another one"), 50);
  });
  await expect.poll(() => reports.length).toBe(2);
  expect(reports.map((report) => report.message)).toEqual(["e2e: thrown in the browser", "e2e: another one"]);
  expect(reports[0]).toMatchObject({ name: "TypeError", path: "/collections/women", source: "window" });
});

test("no Sentry code reaches the browser on any page type", async ({ page }) => {
  const scripts: string[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() === "script") scripts.push(await response.text().catch(() => ""));
  });
  for (const path of ["/", "/collections/women", "/products/leather-tote-tan", "/bag", "/checkout", "/sign-in"]) {
    await gotoHydrated(page, path, searchButton);
  }
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((source) => /sentry/i.test(source))).toEqual([]);
});
