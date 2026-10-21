import { expect, test } from "@playwright/test";

import { products as seedProducts } from "../src/db/seed/catalog";
import { showsSoon } from "./admin";
import { AUTH_TIMEOUT } from "./auth";
import { testDatabase } from "./db";
import { gotoHydrated } from "./hydration";

// The nightly reset on a local build: the demo admin edits a product, the route runs with the
// secret, and the store shows the seed again. It resets the whole local catalogue, so it would race
// the specs that edit products: it runs only when asked (E2E_RESET=1), on its own, desktop only.
const SLUG = "structured-handbag-brown";

test("@writes the demo reset puts an edited product back to the seed", async ({ page, request }, info) => {
  test.skip(!process.env.E2E_RESET, "resets the local catalogue: run alone with E2E_RESET=1");
  test.skip(info.project.name !== "desktop" || !testDatabase(), "local database, desktop only");
  const seed = seedProducts.find((product) => product.slug === SLUG)!;

  await gotoHydrated(page, "/admin/try", (p) => p.getByRole("button", { name: "Start the demo" }));
  await page.getByRole("button", { name: "Start the demo" }).click();
  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: AUTH_TIMEOUT });
  await gotoHydrated(page, `/admin/products/${SLUG}`, (p) => p.getByRole("button", { name: "Save changes" }));
  await page.getByRole("textbox", { name: "Name" }).fill("Edited before the reset");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.", { timeout: AUTH_TIMEOUT });
  await showsSoon(page, `/products/${SLUG}`, () => page.getByRole("heading", { level: 1, name: "Edited before the reset" }));

  expect((await request.get("/api/cron/demo-reset")).status()).toBe(401);
  const reset = await request.get("/api/cron/demo-reset", { headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
  expect(reset.status()).toBe(200);
  // Photos are production's alone, so locally every step runs.
  expect(await reset.json()).toMatchObject({ restoredProducts: seedProducts.length, failedSteps: [] });

  await showsSoon(page, `/products/${SLUG}`, () => page.getByRole("heading", { level: 1, name: seed.name }));
});
