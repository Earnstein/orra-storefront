import { expect, test } from "@playwright/test";

import { deleteTestUser, newUser, openAccountMenu, signIn, signUp, type TestUser } from "./auth";
import { hydrated } from "./hydration";

// Tests that create accounts are tagged @writes: each signs up a fresh …@example.test user and
// deletes it at the end. The production exit check skips them.

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

test("signed out, /account goes to sign in and comes back", async ({ page }) => {
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.search === "?returnTo=%2Faccount");
});

test("@writes the account page greets you and shows your details", async ({ page }) => {
  created = newUser();
  await signUp(page, created);
  await expect(page.getByRole("heading", { level: 1, name: `Hello, ${created.name}` })).toBeVisible();
  await expect(page.getByText("Your orders will appear here.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Saved items/ }).first()).toHaveAttribute("href", "/saved");
  await expect(page.getByText(created.email)).toBeVisible();
  await expect(page).toHaveTitle(/My account/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("@writes renaming updates the page and the menu", async ({ page, isMobile }) => {
  created = newUser();
  await signUp(page, created);
  const profile = page.getByRole("region", { name: "Profile" });
  const edit = profile.getByRole("button", { name: "Edit your name" });
  await hydrated(edit);
  await edit.click();

  const newName = `${created.name} Lovelace`;
  const field = profile.getByRole("textbox", { name: "Name" });
  await expect(field).toBeFocused();
  await field.fill(newName);
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(profile.getByRole("status")).toHaveText("Name updated.");
  await expect(profile.getByText(newName, { exact: true })).toBeVisible();
  await expect(edit).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: `Hello, ${newName}` })).toBeVisible();
  created = { ...created, name: newName };

  // The header follows without a reload.
  const menu = await openAccountMenu(page, isMobile);
  await expect(menu.getByText(`Hello, ${newName}`)).toBeVisible();
});

test("@writes a blank name is refused in place", async ({ page }) => {
  created = newUser();
  await signUp(page, created);
  const profile = page.getByRole("region", { name: "Profile" });
  const edit = profile.getByRole("button", { name: "Edit your name" });
  await hydrated(edit);
  await edit.click();
  await profile.getByRole("textbox", { name: "Name" }).fill("   ");
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(profile.getByText("Enter your name.")).toBeVisible();
  await profile.getByRole("button", { name: "Cancel" }).click();
  await expect(profile.getByText(created.name, { exact: true })).toBeVisible();
});

test("@writes when the session ends elsewhere, saving goes to sign in", async ({ page, context }) => {
  created = newUser();
  await signUp(page, created);
  const profile = page.getByRole("region", { name: "Profile" });
  const edit = profile.getByRole("button", { name: "Edit your name" });
  await hydrated(edit);
  await edit.click();
  await profile.getByRole("textbox", { name: "Name" }).fill("Someone");

  // Sign out in a second tab of the same browser.
  const other = await context.newPage();
  await other.goto("/", { waitUntil: "domcontentloaded" });
  const signOut = await other.request.post("/api/auth/sign-out", { data: {}, headers: { origin: new URL(other.url()).origin } });
  expect(signOut.ok(), await signOut.text()).toBe(true);

  await profile.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.search === "?returnTo=%2Faccount", {
    timeout: 15_000,
  });
});

/** Signs the same user in from a second, separate browser (another device). */
async function signInElsewhere(browser: import("@playwright/test").Browser, baseURL: string, user: TestUser) {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, user);
  return { context, page };
}

/**
 * Whether that browser can still open /account: the account greeting or the sign-in page,
 * whichever appears (server checks skip the 5-minute cookie cache, so a revoked session is sent
 * to sign in at once).
 */
async function canOpenAccount(page: import("@playwright/test").Page) {
  await page.goto("/account", { waitUntil: "domcontentloaded" });
  const greeting = page.getByRole("heading", { level: 1, name: /^Hello, / });
  const signInHeading = page.getByRole("heading", { level: 1, name: "Sign in" });
  await expect(greeting.or(signInHeading)).toBeVisible({ timeout: 15_000 });
  return greeting.isVisible();
}

test("@writes a wrong current password is refused", async ({ page }) => {
  created = newUser();
  await signUp(page, created);
  const form = page.getByRole("form", { name: "Change your password" });
  await hydrated(form.getByRole("button", { name: "Change password" }));
  await form.getByLabel("Current password", { exact: true }).fill("not-my-password");
  await form.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await form.getByRole("button", { name: "Change password" }).click();
  await expect(form.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That password isn't right.");
});

test("@writes changing the password signs out other devices", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created);
  const other = await signInElsewhere(browser, baseURL!, created);
  try {
    const form = page.getByRole("form", { name: "Change your password" });
    await hydrated(form.getByRole("button", { name: "Change password" }));
    const newPassword = `${created.password}-new`;
    created = { ...created, password: newPassword, oldPasswords: [created.password] };
    await form.getByLabel("Current password", { exact: true }).fill(created.oldPasswords![0]);
    await form.getByLabel("New password", { exact: true }).fill(newPassword);
    await expect(form.getByRole("checkbox", { name: "Sign out of other devices" })).toBeChecked();
    await form.getByRole("button", { name: "Change password" }).click();
    await expect(form.getByRole("status")).toHaveText("Password changed. Your other devices have been signed out.");

    expect(await canOpenAccount(page)).toBe(true);
    expect(await canOpenAccount(other.page)).toBe(false);
  } finally {
    await other.context.close();
  }
});

test("@writes the devices list signs another device out", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created);
  const other = await signInElsewhere(browser, baseURL!, created);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const devices = page.getByRole("region", { name: "Signed-in devices" });
    const items = devices.getByRole("listitem");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toContainText("This device");
    const signOut = devices.getByRole("button", { name: /^Sign out .+, active/ });
    await hydrated(signOut);
    await signOut.click();
    await expect(devices.getByRole("status")).toHaveText("Device signed out.");
    await expect(items).toHaveCount(1);
    await expect(devices.getByRole("button", { name: "Sign out of all other devices" })).toHaveCount(0);

    expect(await canOpenAccount(other.page)).toBe(false);
  } finally {
    await other.context.close();
  }
});

test("@writes the devices list signs out all other devices at once", async ({ page, browser, baseURL }) => {
  created = newUser();
  await signUp(page, created);
  const first = await signInElsewhere(browser, baseURL!, created);
  const second = await signInElsewhere(browser, baseURL!, created);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    const devices = page.getByRole("region", { name: "Signed-in devices" });
    await expect(devices.getByRole("listitem")).toHaveCount(3);
    const all = devices.getByRole("button", { name: "Sign out of all other devices" });
    await hydrated(all);
    await all.click();
    await expect(devices.getByRole("status")).toHaveText("All other devices signed out.");
    await expect(devices.getByRole("listitem")).toHaveCount(1);
    expect(await canOpenAccount(first.page)).toBe(false);
    expect(await canOpenAccount(second.page)).toBe(false);
    expect(await canOpenAccount(page)).toBe(true);
  } finally {
    await first.context.close();
    await second.context.close();
  }
});

async function openDeleteDialog(page: import("@playwright/test").Page) {
  const trigger = page.getByRole("region", { name: "Delete account" }).getByRole("button", { name: "Delete account" });
  await hydrated(trigger);
  await trigger.click();
  return page.getByRole("alertdialog", { name: "Delete your account?" });
}

test("@writes deleting with the wrong password keeps the account", async ({ page }) => {
  created = newUser();
  await signUp(page, created);
  const dialog = await openDeleteDialog(page);
  await expect(dialog.getByLabel("Password", { exact: true })).toBeFocused();
  await dialog.getByLabel("Password", { exact: true }).fill("not-my-password");
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await expect(dialog.getByRole("alert").filter({ hasText: /\S/ })).toHaveText("That password isn't right.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await canOpenAccount(page)).toBe(true);
});

test("@writes deleting the account signs out, says so, and the account is gone", async ({ page }) => {
  created = newUser();
  const user = created;
  await signUp(page, user);
  const dialog = await openDeleteDialog(page);
  await dialog.getByLabel("Password", { exact: true }).fill(user.password);
  await dialog.getByRole("button", { name: "Delete account" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Your account has been deleted." })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL((url) => url.pathname === "/" && url.search === "");
  created = undefined; // nothing left to clean up

  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: user.email, password: user.password },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(response.status()).toBe(401);
});
