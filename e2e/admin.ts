import { expect, test, type Locator, type Page } from "@playwright/test";

import { products as seedProducts } from "../src/db/seed/catalog";

import { newUser, signUp, type TestUser } from "./auth";
import { testDatabase } from "./db";

/**
 * Signs up a fresh account and gives it an admin role in the local e2e database. Admin tests are
 * @writes and skip without that database (deployed runs, CI without it). The caller deletes the
 * user afterwards (deleteTestUser).
 */
export async function signUpAsAdmin(page: Page, role: "admin" | "demo-admin" = "demo-admin"): Promise<TestUser> {
  const sql = testDatabase();
  test.skip(!sql, "needs the local e2e database");
  const user = newUser();
  await signUp(page, user);
  await sql!`UPDATE "user" SET role = ${role} WHERE email = ${user.email}`;
  return user;
}

/**
 * Loads `url` until `shown` appears: after an admin save the first visit to a prerendered page can
 * still get its previous render while it re-renders, so the change shows from a following visit.
 */
export async function showsSoon(page: Page, url: string, shown: () => Locator) {
  await expect(async () => {
    // A fresh query each time, so the browser's own HTTP cache can't answer (Next ignores it).
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(shown()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Puts a product's name, price, stock and archive state back to the seed's (local test database). */
export async function restoreSeed(slug: string) {
  const seed = seedProducts.find((product) => product.slug === slug)!;
  await testDatabase()!`UPDATE products SET name = ${seed.name}, price = ${seed.price}, stock = ${seed.stock}, archived_at = NULL WHERE slug = ${slug}`;
}
