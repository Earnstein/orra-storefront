import { expect, test, type Page } from "@playwright/test";

import { deleteTestUser, newUser, openAccountMenu, signUp, type TestUser } from "./auth";
import { gotoHydrated } from "./hydration";

// The server-side bag: Add to bag, the header count from the count cookie, the merge on sign-in,
// and the one-time move of bags kept in the browser before M5. Tests that create accounts are
// tagged @writes and delete them at the end.

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

const TOTE = "/products/leather-tote-tan";
const SHOE = "/products/double-monk-shoe";

const addButton = (page: Page) => page.getByRole("button", { name: /^(Add to bag|Added to bag|Adding…|All available in your bag)$/ }).first();
const bagLink = (page: Page) => page.getByRole("link", { name: /^Bag(, \d+ items?)?$/ }).first();

async function add(page: Page, path: string) {
  await gotoHydrated(page, path, addButton);
  const answered = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bag");
  await addButton(page).click();
  await answered;
}

async function serverBag(page: Page): Promise<Record<string, number>> {
  const bag = (await (await page.request.get("/api/bag")).json()) as { lines: { slug: string; quantity: number }[] };
  return Object.fromEntries(bag.lines.map((line) => [line.slug, line.quantity]));
}

test("Add to bag puts the item in the server bag and the header count follows, with no bag request on later pages", async ({ page }) => {
  // Adding mustn't make the page refetch itself (a cookie set in a server action would).
  const refetches: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["rsc"] === "1" || new URL(request.url()).searchParams.has("_rsc")) refetches.push(request.url());
  });
  await add(page, TOTE);
  await page.waitForTimeout(500);
  expect(refetches.filter((url) => new URL(url).pathname === TOTE)).toEqual([]);
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 1 item");
  expect(await serverBag(page)).toEqual({ "leather-tote-tan": 1 });

  const bagRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/bag") bagRequests.push(request.url());
  });
  await page.goto("/stories", { waitUntil: "domcontentloaded" });
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 1 item");
  expect(bagRequests).toEqual([]);
});

test("adding past the stock left says so", async ({ page }) => {
  // The shoe has 2 left in the seed.
  await add(page, SHOE);
  await add(page, SHOE);
  await expect(page.getByRole("button", { name: "All available in your bag" }).first()).toBeVisible();
  expect(await serverBag(page)).toEqual({ "double-monk-shoe": 2 });
});

test("@writes a guest bag moves into the new account on sign-up", async ({ page }) => {
  await add(page, TOTE);
  await add(page, SHOE);
  created = newUser();
  await signUp(page, created, "/stories");
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 2 items");
  expect(await serverBag(page)).toEqual({ "leather-tote-tan": 1, "double-monk-shoe": 1 });
  // The guest cookie is gone: signing out leaves an empty guest bag.
  expect((await page.context().cookies()).some((cookie) => cookie.name.endsWith("orra_cart"))).toBe(false);
});

test("@writes signing out shows an empty bag; the account keeps its bag", async ({ page, isMobile }) => {
  created = newUser();
  await signUp(page, created, TOTE);
  await add(page, TOTE);
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 1 item");
  const menu = await openAccountMenu(page, isMobile);
  await menu.getByRole(isMobile ? "button" : "menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(bagLink(page)).toHaveAccessibleName("Bag");
  expect(await serverBag(page)).toEqual({});
});

test("a bag kept in this browser before M5 moves to the server once", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("orra:bag:v1", JSON.stringify({ lines: [{ slug: "leather-tote-tan", quantity: 1 }, { slug: "no-such-product", quantity: 1 }], saved: ["double-monk-shoe"] }));
  });
  await page.goto("/stories", { waitUntil: "domcontentloaded" });
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 1 item");
  expect(await serverBag(page)).toEqual({ "leather-tote-tan": 1 });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("orra:bag:v1") ?? "{}"));
  expect(stored).toEqual({ lines: [], saved: ["double-monk-shoe"] });
});
