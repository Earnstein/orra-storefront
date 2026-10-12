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

test("an Add to bag made while the old bag is still moving lands in the same bag", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("orra:bag:v1", JSON.stringify({ lines: [{ slug: "double-monk-shoe", quantity: 1 }], saved: [] }));
  });
  // Slow the import, so the add is clicked while it's still in flight.
  await page.route("**/api/bag", async (route) => {
    if (route.request().method() === "POST" && route.request().postData()?.includes('"import"')) await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await gotoHydrated(page, TOTE, addButton);
  await addButton(page).click();
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 2 items", { timeout: 15_000 });
  expect(await serverBag(page)).toEqual({ "double-monk-shoe": 1, "leather-tote-tan": 1 });
});

const panel = (page: Page) => page.getByRole("dialog", { name: /^(Added to bag|Already in your bag)$/ });

test("adding opens the added-to-bag panel with the item, Checkout and View bag; Escape closes it", async ({ page }) => {
  await add(page, TOTE);
  await expect(panel(page)).toBeVisible();
  await expect(panel(page).getByText("Leather tote", { exact: true })).toBeVisible();
  await expect(panel(page).getByText("Quantity in your bag: 1")).toBeVisible();
  await expect(panel(page).getByRole("link", { name: "Checkout" })).toHaveAttribute("href", "/checkout");
  await expect(panel(page).getByRole("link", { name: "View bag" })).toHaveAttribute("href", "/bag");
  // Non-modal: the header (and its updated count) stays usable.
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 1 item");
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(addButton(page)).toBeFocused();
});

test("View bag goes to the bag and closes the panel", async ({ page }) => {
  await add(page, TOTE);
  await panel(page).getByRole("link", { name: "View bag" }).click();
  await expect(page).toHaveURL(/\/bag$/);
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Shopping bag (1)" })).toBeVisible();
});

test("the panel says when the bag now holds all the stock", async ({ page }) => {
  // The shoe has 2 left in the seed.
  await add(page, SHOE);
  await page.keyboard.press("Escape");
  await addButton(page).click();
  await expect(panel(page).getByText("You have all 2 available in your bag")).toBeVisible();
  await page.keyboard.press("Escape");
  // Add to bag is disabled now, so focus goes to Save for later.
  await expect(page.getByRole("button", { name: /^(Save for later|Saved)$/ })).toBeFocused();
});

test("the panel explains when less stock was left than the page showed", async ({ page }) => {
  // The page's stock is cached; make the server's answer say only 1 was left.
  await page.route("**/api/bag", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const result = await response.json();
    if (result.ok) {
      result.data.capped = true;
      result.data.bag.lines = result.data.bag.lines.map((l: object) => ({ ...l, stock: 1, quantity: 1 }));
    }
    await route.fulfill({ response, json: result });
  });
  await add(page, TOTE);
  // Nothing more was added, so the panel doesn't claim it was.
  await expect(page.getByRole("dialog", { name: "Already in your bag" })).toBeVisible();
  await expect(panel(page).getByText("Only 1 was left — it's in your bag")).toBeVisible();
});

test("going Back and Forward never finds the panel still open", async ({ page }) => {
  await add(page, TOTE);
  await page.keyboard.press("Escape");
  // Then a client-side visit to the product page from the bag, so Back and Forward keep it mounted.
  const productLink = (p: Page) => p.getByRole("main").getByRole("link", { name: "Leather tote", exact: true });
  await gotoHydrated(page, "/bag", productLink);
  await productLink(page).click();
  await expect(page).toHaveURL(new RegExp(`${TOTE}$`));
  const visibleAdd = page.getByRole("button", { name: "Add to bag" }).locator("visible=true").first();
  await expect(visibleAdd).toBeEnabled();
  await visibleAdd.click();
  await expect(panel(page)).toBeVisible();
  await page.goBack({ waitUntil: "commit" });
  await expect(page).toHaveURL(/\/bag$/);
  await page.goForward({ waitUntil: "commit" });
  await expect(page).toHaveURL(new RegExp(`${TOTE}$`));
  await expect(page.getByRole("button", { name: /^(Added to bag|Add to bag)$/ }).locator("visible=true").first()).toBeVisible();
  await expect(panel(page)).toBeHidden();
});

test("clicking elsewhere on the page closes the panel and leaves focus there", async ({ page, isMobile }) => {
  test.skip(isMobile, "The thumbnails are shown from lg up.");
  await add(page, TOTE);
  await expect(panel(page)).toBeVisible();
  const thumbnail = page.getByRole("button", { name: /^Show image 2 of/ });
  await thumbnail.click();
  await expect(panel(page)).toBeHidden();
  // Focus would be pulled back once the panel has finished closing.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  await expect(page.locator("[data-base-ui-portal], [role=dialog]")).toHaveCount(0);
  await expect(thumbnail).toBeFocused();
});

test("the compact bar's Add to bag opens the panel too", async ({ page }) => {
  await gotoHydrated(page, TOTE, addButton);
  await page.mouse.wheel(0, 1500);
  const compact = page.getByRole("button", { name: "Add to bag" }).last();
  await expect(compact).toBeVisible();
  const answered = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bag");
  await compact.click();
  await answered;
  await expect(panel(page)).toBeVisible();
  // Back at the top the compact bar has slid away (inert), so closing returns focus to the main button.
  await page.mouse.wheel(0, -3000);
  await expect(compact).not.toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(panel(page)).toBeHidden();
  await expect(addButton(page)).toBeFocused();
});
