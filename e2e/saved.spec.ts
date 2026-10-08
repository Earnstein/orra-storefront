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
  await gotoHydrated(page, TOTE, saveButton);
  await expect(saveButton(page)).toHaveAttribute("aria-pressed", "false");
  // Wait for the account's list before clicking, so every click goes to the account.
  await expect.poll(() => accountSlugs(page)).toEqual([]);

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
  await gotoHydrated(page, TOTE, saveButton);
  await expect.poll(() => accountSlugs(page)).toEqual([]);

  await page.route(
    (url) => url.pathname === TOTE,
    (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, body: "" }) : route.continue()),
  );
  await saveButton(page).click();
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
