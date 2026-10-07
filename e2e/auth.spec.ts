import { expect, test } from "@playwright/test";

import { deleteAccount, newUser, sessionName, signIn, signUp, type TestUser } from "./auth";
import { gotoHydrated, hydrated } from "./hydration";
import { readResetLink } from "./outbox";

// Tests that create accounts are tagged @writes: each signs up a fresh …@example.test user and
// deletes it at the end. The production exit check skips them.

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, created);
  await deleteAccount(page, created.password);
  await context.close();
  created = undefined;
});

test("@writes create an account and come back to where you were", async ({ page }) => {
  created = newUser();
  await signUp(page, created, "/products/leather-tote-tan");
  expect(await sessionName(page)).toBe(created.name);
});

test("@writes sign in without staying signed in uses a browser-session cookie", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created);

  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await signIn(other, created, { stay: false });
  await expect(other).toHaveURL((url) => url.pathname === "/account");
  const sessionCookie = (await context.cookies()).find((cookie) => cookie.name.endsWith("session_token"));
  expect(sessionCookie?.expires).toBe(-1);
  await context.close();
});

test("a wrong email or password says so", async ({ page }) => {
  await gotoHydrated(page, "/sign-in", (page) => page.getByRole("button", { name: "Sign in", exact: true }));
  const form = page.getByRole("form", { name: "Sign in" });
  await form.getByLabel("Email").fill("nobody@example.test");
  await form.getByLabel("Password", { exact: true }).fill("not-the-password");
  await form.getByRole("button", { name: "Sign in" }).click();
  await expect(form.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That email and password don't match.");
});

test("fields explain what's wrong and take focus", async ({ page }) => {
  await gotoHydrated(page, "/sign-in", (page) => page.getByRole("button", { name: "Continue" }));
  const create = page.getByRole("form", { name: "Create an account" });
  await create.getByLabel("Email").fill("a@b");
  await create.getByRole("button", { name: "Continue" }).click();
  await expect(create.getByText("Enter a valid email address.")).toBeVisible();
  await expect(create.getByLabel("Email")).toBeFocused();

  await create.getByLabel("Email").fill("ada@example.test");
  await create.getByRole("button", { name: "Continue" }).click();
  await expect(create.getByLabel("Name")).toBeFocused();
  await expect(create.getByText("At least 8 characters")).toBeVisible();
});

test("@writes an email that already has an account offers to sign in with it", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created);

  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await gotoHydrated(other, "/sign-in", (page) => page.getByRole("button", { name: "Continue" }));
  const create = other.getByRole("form", { name: "Create an account" });
  await create.getByLabel("Email").fill(created.email);
  await create.getByRole("button", { name: "Continue" }).click();
  await create.getByLabel("Name").fill("Someone else");
  await create.getByLabel("Password", { exact: true }).fill("another-password");
  await create.getByRole("button", { name: "Create account" }).click();
  await expect(create.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("An account with this email already exists.");

  await create.getByRole("button", { name: "Sign in with this email" }).click();
  const signInForm = other.getByRole("form", { name: "Sign in" });
  await expect(signInForm.getByLabel("Email")).toHaveValue(created.email);
  await expect(signInForm.getByLabel("Password", { exact: true })).toBeFocused();
  await context.close();
});

test("@writes a signed-in visitor opening /sign-in goes straight on", async ({ page }) => {
  created = newUser();
  await signUp(page, created, "/");
  await page.goto("/sign-in?returnTo=/stories", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === "/stories");
});

test("a hostile returnTo stays on this site", async ({ page }) => {
  // Checked without an account: the link a form follows is built by safeReturnTo (unit-tested);
  // here the page itself must not navigate anywhere on load.
  await page.goto("/sign-in?returnTo=//evil.com", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
});

test.describe("password reset", () => {
  test.skip(!!process.env.E2E_BASE_URL, "reads reset links from the local server's email outbox");

  test("@writes reset a forgotten password with the emailed link", async ({ page, browser, baseURL }) => {
    created = newUser();
    await signUp(page, created);

    const context = await browser.newContext({ baseURL });
    const visitor = await context.newPage();
    await gotoHydrated(visitor, "/sign-in", (page) => page.getByRole("link", { name: "Forgot your password?" }));
    await visitor.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(visitor.getByRole("heading", { name: "Forgot your password?" })).toBeVisible();
    await hydratedButton(visitor, "Continue");
    // The sign-in page stays mounted but hidden after the client-side navigation, so look fields
    // up by role (which skips hidden elements), not by label.
    await visitor.getByRole("textbox", { name: "Email" }).fill(created.email);
    await visitor.getByRole("button", { name: "Continue" }).click();
    await expect(visitor.getByText("If an account exists for that email, we've sent a link.")).toBeVisible();

    await visitor.goto(await readResetLink(created.email), { waitUntil: "domcontentloaded" });
    await expect(visitor).toHaveURL(/\/sign-in\/reset-password\?token=/);
    await hydratedButton(visitor, "Change password");
    const newPassword = `${created.password}-new`;
    await visitor.getByRole("textbox", { name: "New password" }).fill(newPassword);
    await visitor.getByRole("button", { name: "Change password" }).click();
    await expect(visitor.getByText("Your password has been changed. Sign in with your new password.")).toBeVisible();
    await context.close();

    // The reset signed out every device, the old password fails and the new one works.
    expect(await sessionName(page)).toBeNull();
    await gotoHydrated(page, "/sign-in", (page) => page.getByRole("button", { name: "Sign in", exact: true }));
    const form = page.getByRole("form", { name: "Sign in" });
    await form.getByLabel("Email").fill(created.email);
    await form.getByLabel("Password", { exact: true }).fill(created.password);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That email and password don't match.");
    created.password = newPassword;
    await signIn(page, created);
  });

  test("a tampered link says it has expired and offers a new one", async ({ page }) => {
    await page.goto("/api/auth/reset-password/not-a-real-token?callbackURL=%2Fsign-in%2Freset-password", {
      waitUntil: "domcontentloaded",
    });
    await expect(page).toHaveURL(/\/sign-in\/reset-password\?error=INVALID_TOKEN/);
    await expect(page.getByText("This link has expired or was already used.")).toBeVisible();
    await page.getByRole("link", { name: "Request a new link" }).click();
    await expect(page).toHaveURL(/\/sign-in\/forgot-password$/);
  });

  test("an unknown email gets the same answer", async ({ page }) => {
    await gotoHydrated(page, "/sign-in/forgot-password", (page) => page.getByRole("button", { name: "Continue" }));
    await page.getByLabel("Email").fill("nobody-at-all@example.test");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("If an account exists for that email, we've sent a link.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  });
});

async function hydratedButton(page: import("@playwright/test").Page, name: string) {
  await hydrated(page.getByRole("button", { name, exact: true }));
}
