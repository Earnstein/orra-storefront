import { test, type Page } from "@playwright/test";

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
