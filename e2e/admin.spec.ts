import { expect, test } from "@playwright/test";

import { AUTH_TIMEOUT, deleteTestUser, newUser, signUp, type TestUser } from "./auth";
import { testDatabase } from "./db";

// Tests that create accounts are tagged @writes (see account.spec.ts). Giving an account an admin
// role needs the database, so that test runs only locally (testDatabase) and skips elsewhere.

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

test("signed out, the admin goes to sign in and comes back", async ({ page }) => {
  await page.goto("/admin/products", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in" && url.search === "?returnTo=%2Fadmin%2Fproducts");
});

test("@writes a shopper gets the not-found page, so the admin isn't advertised", async ({ page }) => {
  created = newUser();
  await signUp(page, created);
  for (const path of ["/admin", "/admin/products", "/admin/orders"]) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible({ timeout: AUTH_TIMEOUT });
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
  }
});

test("@writes the demo admin sees the admin's own header and the demo band", async ({ page }) => {
  const sql = testDatabase();
  test.skip(!sql, "needs the local e2e database");
  created = newUser();
  await signUp(page, created);
  await sql!`UPDATE "user" SET role = 'demo-admin' WHERE email = ${created.email}`;

  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL((url) => url.pathname === "/admin/products");
  await expect(page.getByRole("heading", { level: 1, name: "Products" })).toBeVisible({ timeout: AUTH_TIMEOUT });
  await expect(page.getByText("Demo admin — changes reset nightly")).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "View store" })).toHaveAttribute("href", "/");
  // The storefront's header isn't shown in the admin.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
