import { expect, test, type Page } from "@playwright/test";

import { deleteTestUser, fillSignUp, newUser, signIn, signUp, type TestUser } from "./auth";
import { gotoHydrated } from "./hydration";

// Saved items in the browser and in the account. Tests that create accounts are tagged @writes:
// each signs up a fresh …@example.test user and deletes it at the end.

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

const TOTE = "/products/leather-tote-tan";
const SHOE = "/products/double-monk-shoe";

const saveButton = (page: Page) => page.getByRole("button", { name: /^(Save for later|Saved)$/ });

async function accountSlugs(page: Page): Promise<string[] | null> {
  const response = await page.request.get("/api/saved");
  return response.ok() ? ((await response.json()) as { slugs: string[] }).slugs : null;
}

async function browserSaved(page: Page): Promise<string[]> {
  return page.evaluate(() => (JSON.parse(localStorage.getItem("orra:bag:v1") ?? "{}") as { saved?: string[] }).saved ?? []);
}

async function saveOn(page: Page, path: string) {
  await gotoHydrated(page, path, saveButton);
  await saveButton(page).click();
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "true");
}

test("@writes items saved before signing up move into the account", async ({ page, browser, baseURL }) => {
  await saveOn(page, TOTE);
  await saveOn(page, SHOE);
  expect(await browserSaved(page)).toEqual(["leather-tote-tan", "double-monk-shoe"]);

  created = newUser();
  await page.goto(`/sign-up?returnTo=${encodeURIComponent(SHOE)}`, { waitUntil: "domcontentloaded" });
  await fillSignUp(page, created);
  await expect(page).toHaveURL((url) => url.pathname === SHOE, { timeout: 15_000 });

  await expect.poll(() => accountSlugs(page), { timeout: 15_000 }).toEqual(["double-monk-shoe", "leather-tote-tan"]);
  await expect.poll(() => browserSaved(page)).toEqual([]);
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "true");

  // Another device sees them.
  const context = await browser.newContext({ baseURL });
  try {
    const other = await context.newPage();
    await signIn(other, created);
    expect(await accountSlugs(other)).toEqual(["double-monk-shoe", "leather-tote-tan"]);
    await gotoHydrated(other, TOTE, saveButton);
    await expect(saveButton(other)).toHaveAttribute("aria-pressed", "true");
  } finally {
    await context.close();
  }
});

test("@writes rapid toggles on a slow network end where the last click left them", async ({ page }) => {
  created = newUser();
  await signUp(page, created, TOTE);
  // Wait for the page to load the account's list before clicking, so every click goes to the
  // account (clicks while the session is still loading save to this browser, merged later).
  const listLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/saved");
  await gotoHydrated(page, TOTE, saveButton);
  await listLoaded;
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "false");

  // Slow every server action and saved read by 500 ms.
  await page.route(
    (url) => url.pathname === TOTE || url.pathname === "/api/saved",
    async (route) => {
      if (route.request().method() === "POST" || route.request().url().includes("/api/saved")) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await route.continue();
    },
  );
  for (let i = 0; i < 5; i++) await saveButton(page).click();
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "true");

  await expect.poll(() => accountSlugs(page), { timeout: 15_000 }).toEqual(["leather-tote-tan"]);
  await page.waitForTimeout(1_000); // let the final re-read land
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "true");
});

test("@writes a failed save rolls back", async ({ page }) => {
  created = newUser();
  await signUp(page, created, TOTE);
  const listLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/saved");
  await gotoHydrated(page, TOTE, saveButton);
  await listLoaded;

  // The action answers slowly and then fails: the button shows Saved at once, then goes back.
  await page.route(
    (url) => url.pathname === TOTE,
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ status: 500, body: "" });
    },
  );
  await saveButton(page).click();
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "false", { timeout: 15_000 });
  expect(await accountSlugs(page)).toEqual([]);
});

test("@writes signing out leaves the account's items in the account", async ({ page }) => {
  created = newUser();
  await signUp(page, created, TOTE);
  await gotoHydrated(page, TOTE, saveButton);
  await expect.poll(() => accountSlugs(page)).toEqual([]);
  await saveButton(page).click();
  // A click before the browser has the session saves locally, and SavedSync merges it moments later.
  await expect.poll(() => accountSlugs(page), { timeout: 15_000 }).toEqual(["leather-tote-tan"]);

  const signOut = await page.request.post("/api/auth/sign-out", { data: {}, headers: { origin: new URL(page.url()).origin } });
  expect(signOut.ok()).toBe(true);
  await gotoHydrated(page, TOTE, saveButton);
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "false");
  expect(await browserSaved(page)).toEqual([]);
});

test("signed out, /saved lists this browser's items with a prompt to sign in", async ({ page }) => {
  await saveOn(page, TOTE);
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: "Saved items (1)" })).toBeVisible();
  await expect(page.getByText("Sign in to keep your saved items on every device")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute(
    "href",
    "/sign-in?returnTo=%2Fsaved",
  );
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(1);
  await expect(page).toHaveTitle(/Saved items/);
});

test("an empty /saved says so and offers New in", async ({ page }) => {
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("You haven't saved anything yet")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "New in" })).toHaveAttribute("href", "/collections/new");
});

test("removing an item updates the count", async ({ page }) => {
  await saveOn(page, TOTE);
  await saveOn(page, SHOE);
  await gotoHydrated(page, "/saved", (page) => page.getByRole("button", { name: /^Remove / }).first());
  await expect(page.getByRole("heading", { level: 1, name: "Saved items (2)" })).toBeVisible();
  // Newest first: the shoe, then the tote. Removing the shoe moves focus to the tote's Remove.
  await page.getByRole("button", { name: /^Remove Double-monk shoe/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Saved items (1)" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "removed from saved items" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Remove Leather tote/ })).toBeFocused();
  // Removing the last one moves focus to the heading.
  await page.getByRole("button", { name: /^Remove Leather tote/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("/saved offers to try again when the cards can't load", async ({ page }) => {
  await saveOn(page, TOTE);
  let fail = true;
  await page.route("**/api/products/summaries?**", (route) => (fail ? route.fulfill({ status: 500, body: "" }) : route.continue()));
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert").filter({ hasText: "We couldn't load your saved items." })).toBeVisible({ timeout: 15_000 });
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Saved items (1)" })).toBeVisible();
});

test("@writes saved items appear on another device (the milestone's exit test)", async ({ page, browser, baseURL }) => {
  // Device A signs up and saves a product.
  created = newUser();
  await signUp(page, created, TOTE);
  await gotoHydrated(page, TOTE, saveButton);
  await expect.poll(() => accountSlugs(page)).toEqual([]);
  await saveButton(page).click();
  await expect.poll(() => accountSlugs(page), { timeout: 15_000 }).toEqual(["leather-tote-tan"]);

  // The account page counts it.
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /Saved items \(1\)/ })).toHaveAttribute("href", "/saved");

  // Device B signs in: the product page shows it saved, and /saved lists it.
  const context = await browser.newContext({ baseURL });
  try {
    const other = await context.newPage();
    await signIn(other, created);
    await gotoHydrated(other, TOTE, saveButton);
    await expect(saveButton(other)).toHaveAttribute("aria-pressed", "true");
    await gotoHydrated(other, "/saved", (page) => page.getByRole("button", { name: /^Remove / }).first());
    await expect(other.getByRole("heading", { level: 1, name: "Saved items (1)" })).toBeVisible();

    // B removes it; A no longer has it after a reload.
    await other.getByRole("button", { name: /^Remove Leather tote/ }).click();
    await expect(other.getByText("You haven't saved anything yet")).toBeVisible();
    await expect.poll(() => accountSlugs(other), { timeout: 15_000 }).toEqual([]);
  } finally {
    await context.close();
  }
  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("You haven't saved anything yet")).toBeVisible({ timeout: 15_000 });
});

test("@writes a session revoked elsewhere falls back to this browser's list", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created, "/");
  // Another device signs this one out; this browser still holds the 5-minute cookie cache.
  const context = await browser.newContext({ baseURL });
  try {
    const other = await context.newPage();
    await signIn(other, created);
    const revoke = await other.request.post("/api/auth/revoke-other-sessions", {
      data: {},
      headers: { origin: new URL(other.url()).origin },
    });
    expect(revoke.ok(), await revoke.text()).toBe(true);
  } finally {
    await context.close();
  }

  await page.goto("/saved", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Sign in to keep your saved items on every device")).toBeVisible({ timeout: 15_000 });
});
