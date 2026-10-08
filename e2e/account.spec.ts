import { expect, test } from "@playwright/test";

import { deleteTestUser, newUser, openAccountMenu, signUp, type TestUser } from "./auth";
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

  await page.reload({ waitUntil: "domcontentloaded" });
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
