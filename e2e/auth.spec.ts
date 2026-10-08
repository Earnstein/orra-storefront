import { expect, test } from "@playwright/test";

import { accountLink, deleteTestUser, fillSignUp, newUser, openAccountMenu, sessionName, signIn, signUp, type TestUser } from "./auth";
import { gotoHydrated, hydrated } from "./hydration";
import { readResetLink } from "./outbox";

// Tests that create accounts are tagged @writes: each signs up a fresh …@example.test user and
// deletes it at the end. The production exit check skips them.

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

test("@writes sign in from the account menu, create an account and come back to where you were", async ({ page, isMobile }) => {
  created = newUser();
  await page.goto("/products/leather-tote-tan", { waitUntil: "domcontentloaded" });
  const menu = await openAccountMenu(page, isMobile);
  const signInLink = accountLink(menu, "Sign in", isMobile);
  await expect(signInLink).toHaveAttribute("href", "/sign-in?returnTo=%2Fproducts%2Fleather-tote-tan");
  await expect(accountLink(menu, "Saved items", isMobile)).toHaveAttribute("href", "/saved");
  await signInLink.click();

  await expect(page).toHaveURL(/\/sign-in\?returnTo=/);
  // /sign-in links to /sign-up, keeping where to come back to.
  const createLink = page.getByRole("link", { name: "Create an account" });
  await expect(createLink).toHaveAttribute("href", "/sign-up?returnTo=%2Fproducts%2Fleather-tote-tan");
  await createLink.click();
  await expect(page).toHaveURL(/\/sign-up\?returnTo=/);
  await fillSignUp(page, created);
  await expect(page).toHaveURL((url) => url.pathname === "/products/leather-tote-tan", { timeout: 15_000 });

  const signedIn = await openAccountMenu(page, isMobile);
  await expect(signedIn.getByText(`Hello, ${created.name}`)).toBeVisible();
});

test("@writes the account menu signs out to the homepage, and signing in again works", async ({ page, isMobile }) => {
  created = newUser();
  await signUp(page, created, "/stories");
  const menu = await openAccountMenu(page, isMobile);
  await expect(accountLink(menu, "My account", isMobile)).toHaveAttribute("href", "/account");
  await expect(accountLink(menu, "Saved items", isMobile)).toHaveAttribute("href", "/saved");
  await menu.getByRole(isMobile ? "button" : "menuitem", { name: "Sign out" }).click();

  await expect(page).toHaveURL((url) => url.pathname === "/");
  expect(await sessionName(page)).toBeNull();
  const signedOut = await openAccountMenu(page, isMobile);
  await expect(accountLink(signedOut, "Sign in", isMobile)).toHaveAttribute("href", "/sign-in?returnTo=%2F");

  await signIn(page, created);
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
  await gotoHydrated(page, "/sign-up", (page) => page.getByRole("button", { name: "Create account" }));
  const form = page.getByRole("form", { name: "Create an account" });
  await expect(form.getByText("At least 8 characters")).toBeVisible();
  // No errors before the first submit.
  await form.getByRole("textbox", { name: "Email" }).fill("a@b");
  await form.getByRole("textbox", { name: "Name" }).focus();
  await expect(form.getByText("Enter a valid email address.")).toHaveCount(0);

  await form.getByRole("button", { name: "Create account" }).click();
  await expect(form.getByText("Enter your name.")).toBeVisible();
  await expect(form.getByText("Enter a valid email address.")).toBeVisible();
  await expect(form.getByText("Use at least 8 characters.")).toBeVisible();
  await expect(form.getByRole("textbox", { name: "Name" })).toBeFocused();

  // Then they follow typing.
  await form.getByRole("textbox", { name: "Name" }).fill("Ada");
  await expect(form.getByText("Enter your name.")).toHaveCount(0);
});

test("sign in and sign up link to each other, keeping where to come back to", async ({ page }) => {
  await gotoHydrated(page, "/sign-up?returnTo=%2Fstories", (page) => page.getByRole("link", { name: "Sign in", exact: true }).last());
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in?returnTo=%2Fstories");
  await page.goto("/sign-in?returnTo=//evil.com", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
});

test("@writes an email that already has an account offers to sign in with it", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created);

  const context = await browser.newContext({ baseURL });
  const other = await context.newPage();
  await other.goto("/sign-up?returnTo=%2Fstories", { waitUntil: "domcontentloaded" });
  await fillSignUp(other, { name: "Someone else", email: created.email, password: "another-password" });
  const create = other.getByRole("form", { name: "Create an account" });
  await expect(create.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("An account with this email already exists.");

  // "Sign in instead" carries the email over (not in the URL) and keeps returnTo.
  await create.getByRole("button", { name: "Sign in instead" }).click();
  await expect(other).toHaveURL((url) => url.pathname === "/sign-in" && url.search === "?returnTo=%2Fstories");
  const signInForm = other.getByRole("form", { name: "Sign in" });
  await expect(signInForm.getByRole("textbox", { name: "Email" })).toHaveValue(created.email);
  await expect(signInForm.getByRole("textbox", { name: "Password" })).toBeFocused();
  await context.close();
});

test("@writes a signed-in visitor opening /sign-in goes straight on", async ({ page, baseURL }) => {
  created = newUser();
  await signUp(page, created, "/");
  await page.goto("/sign-in?returnTo=/stories", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === "/stories", { timeout: 15_000 });

  // A hostile returnTo falls back to /account on this site.
  await page.goto("/sign-in?returnTo=//evil.com", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new URL("/account", baseURL).href, { timeout: 15_000 });
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
    const oldPassword = created.password;
    // Recorded before submitting, so clean-up can sign in whichever password is current.
    created = { ...created, password: newPassword, oldPasswords: [oldPassword] };
    await visitor.getByRole("textbox", { name: "New password" }).fill(newPassword);
    await visitor.getByRole("button", { name: "Change password" }).click();
    await expect(visitor.getByText("Your password has been changed. Sign in with your new password.")).toBeVisible();
    await context.close();

    // The reset revoked every session, but this browser still holds the 5-minute cookie cache.
    // /sign-in must confirm the session without the cache (clearing the stale cookies) and stay,
    // not bounce to /account and back.
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => (await page.context().cookies()).some((cookie) => cookie.name.endsWith("session_token")), {
        timeout: 15_000,
      })
      .toBe(false);
    await expect(page).toHaveURL((url) => url.pathname === "/sign-in");

    // Signed out everywhere: the old password fails and the new one works.
    expect(await sessionName(page)).toBeNull();
    await gotoHydrated(page, "/sign-in", (page) => page.getByRole("button", { name: "Sign in", exact: true }));
    const form = page.getByRole("form", { name: "Sign in" });
    await form.getByLabel("Email").fill(created.email);
    await form.getByLabel("Password", { exact: true }).fill(oldPassword);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That email and password don't match.");
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
