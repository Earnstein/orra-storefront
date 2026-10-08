import { randomUUID } from "node:crypto";

import { expect, type Browser, type Locator, type Page } from "@playwright/test";

import { hydrated } from "./hydration";

/** `oldPasswords` keeps any password a test changed away from, so clean-up can still sign in. */
export type TestUser = { name: string; email: string; password: string; oldPasswords?: string[] };

const AUTH_TIMEOUT = 15_000;

/** A fresh user. Tests that create accounts are tagged @writes and delete them at the end. */
export function newUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return { name: `Ada ${id}`, email: `e2e-${id}@example.test`, password: `correct-horse-${id}` };
}

/** Creates an account through /sign-up and waits to land on `returnTo`. */
export async function signUp(page: Page, user: TestUser, returnTo = "/account") {
  await page.goto(`/sign-up?returnTo=${encodeURIComponent(returnTo)}`, { waitUntil: "domcontentloaded" });
  await fillSignUp(page, user);
  // Signing up makes several database round trips (1–2 s against Neon from a laptop, more when
  // tests run in parallel), then a full page load.
  await expect(page).toHaveURL((url) => url.pathname === returnTo, { timeout: AUTH_TIMEOUT });
}

/**
 * Fills and submits the /sign-up form on the current page. Fields are looked up inside the form
 * (found by role, which skips the hidden page a client-side navigation leaves mounted).
 */
export async function fillSignUp(page: Page, user: Pick<TestUser, "name" | "email" | "password">) {
  const form = page.getByRole("form", { name: "Create an account" });
  await hydrated(form.getByRole("button", { name: "Create account" }));
  await form.getByRole("textbox", { name: "Name" }).fill(user.name);
  await form.getByRole("textbox", { name: "Email" }).fill(user.email);
  await form.getByLabel("Password", { exact: true }).fill(user.password);
  await form.getByRole("button", { name: "Create account" }).click();
}

/** Signs in through /sign-in and waits to leave it. */
export async function signIn(page: Page, user: TestUser, { stay = true } = {}) {
  await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
  const form = page.getByRole("form", { name: "Sign in" });
  await hydrated(form.getByRole("button", { name: "Sign in" }));
  await form.getByLabel("Email").fill(user.email);
  await form.getByLabel("Password", { exact: true }).fill(user.password);
  if (!stay) await form.getByRole("checkbox", { name: "Stay signed in" }).uncheck();
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/, { timeout: AUTH_TIMEOUT });
}

/** The signed-in user's name for this page's browser context, or null. */
export async function sessionName(page: Page): Promise<string | null> {
  const response = await page.request.get("/api/auth/get-session?disableCookieCache=true");
  const body = (await response.json()) as { user?: { name: string } } | null;
  return body?.user?.name ?? null;
}

/**
 * Deletes a test user through Better Auth's API in a throwaway context, trying each password the
 * test used. Never throws: clean-up mustn't hide the test's own failure, and an account that was
 * never created (the test failed before signing up) is fine.
 */
export async function deleteTestUser(browser: Browser, baseURL: string, user: TestUser) {
  const context = await browser.newContext({ baseURL });
  const headers = { origin: new URL(baseURL).origin };
  try {
    for (const password of [user.password, ...(user.oldPasswords ?? [])]) {
      const signIn = await context.request.post("/api/auth/sign-in/email", { data: { email: user.email, password }, headers });
      if (!signIn.ok()) continue;
      await context.request.post("/api/auth/delete-user", { data: { password }, headers });
      return;
    }
  } catch (error) {
    console.warn(`[e2e] couldn't delete ${user.email}:`, error);
  } finally {
    await context.close();
  }
}

/**
 * Opens the account links: the header's Account menu on desktop, the phone menu's Account section
 * on mobile. Returns the container to look for links in.
 */
export async function openAccountMenu(page: Page, isMobile: boolean): Promise<Locator> {
  if (isMobile) {
    const button = page.getByRole("button", { name: "Open menu" });
    await hydrated(button);
    await button.click();
    return page.getByRole("dialog", { name: "Menu" }).getByRole("navigation", { name: "Account" });
  }
  const button = page.getByRole("button", { name: "Account", exact: true });
  await hydrated(button);
  await button.click();
  return page.getByRole("menu");
}

/** A link in the account menu: a menu item on desktop, a plain link in the phone menu. */
export function accountLink(menu: Locator, name: string, isMobile: boolean): Locator {
  return menu.getByRole(isMobile ? "link" : "menuitem", { name, exact: true });
}
