import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

import { hydrated } from "./hydration";

export type TestUser = { name: string; email: string; password: string };

const AUTH_TIMEOUT = 15_000;

/** A fresh user. Tests that create accounts are tagged @writes and delete them at the end. */
export function newUser(): TestUser {
  const id = randomUUID().slice(0, 8);
  return { name: `Ada ${id}`, email: `e2e-${id}@example.test`, password: `correct-horse-${id}` };
}

/** Creates an account through /sign-in and waits to land on `returnTo`. */
export async function signUp(page: Page, user: TestUser, returnTo = "/account") {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`, { waitUntil: "domcontentloaded" });
  const create = page.getByRole("form", { name: "Create an account" });
  await hydrated(create.getByRole("button", { name: "Continue" }));
  await create.getByLabel("Email").fill(user.email);
  await create.getByRole("button", { name: "Continue" }).click();
  await create.getByLabel("Name").fill(user.name);
  await create.getByLabel("Password", { exact: true }).fill(user.password);
  await create.getByRole("button", { name: "Create account" }).click();
  // Signing up makes several database round trips (1–2 s against Neon from a laptop, more when
  // tests run in parallel), then a full page load.
  await expect(page).toHaveURL((url) => url.pathname === returnTo, { timeout: AUTH_TIMEOUT });
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

/** Deletes the account signed in in this page's browser context (Better Auth's endpoint, with its cookies). */
export async function deleteAccount(page: Page, password: string) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post("/api/auth/delete-user", { data: { password }, headers: { origin } });
  expect(response.ok(), await response.text()).toBe(true);
}
