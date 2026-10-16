import { expect, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";
import { fillAddress, fillCard, pay } from "./stripe";

// Shopping steps shared by the checkout and order specs.

/** Adds a product through the bag's own endpoint (same origin, so the page's cookies carry the bag). */
export async function addToBag(page: Page, slug: string, quantity = 1) {
  await page.goto("/bag", { waitUntil: "domcontentloaded" });
  const answer = await page.evaluate(
    async ({ slug, quantity }) => (await fetch("/api/bag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "add", slug, quantity }) })).json(),
    { slug, quantity },
  );
  expect(answer.ok).toBe(true);
}

export const gate = (page: Page) => page.getByRole("form", { name: "Email for this order" });

export async function continueAsGuest(page: Page, email: string) {
  await gotoHydrated(page, "/checkout", (p) => p.getByRole("button", { name: "Check out as a guest" }));
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Check out as a guest" }).click();
}

/** Empties this browser's bag and opens /checkout, which releases the bag's hold. */
export async function giveBack(page: Page) {
  await page.goto("/bag", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const bag = await (await fetch("/api/bag")).json();
    for (const line of bag.lines) {
      await fetch("/api/bag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "remove", slug: line.slug }) });
    }
  });
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/bag$/, { timeout: 20_000 });
}

/**
 * Pays for what's on /checkout (already open, past the gate) with the test card and waits for the
 * confirmation; answers the order number.
 */
export async function payAndConfirm(page: Page): Promise<string> {
  await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 30_000 });
  await fillAddress(page);
  await fillCard(page, "4242424242424242");
  await pay(page);
  const heading = page.getByRole("heading", { level: 1, name: /^Thank you — order ORR-\d+ is confirmed$/ });
  await expect(heading).toBeVisible({ timeout: 60_000 });
  return (await heading.textContent())!.match(/ORR-\d+/)![0];
}
