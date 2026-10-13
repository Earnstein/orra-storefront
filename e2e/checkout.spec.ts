import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";
import { fillAddress, fillCard, stripeConfigured, TEST_CARDS } from "./stripe";

// /checkout: the gate, the page, holds and paying with Stripe test cards. Tests that start a
// checkout hold real stock on the test database, so they use products no other spec uses (Derby
// shoe, Zip pouch), are tagged @writes, and give the stock back afterwards.

const DERBY = "derby-shoe-tan";
const POUCH = "zip-pouch-black";
const EMAIL = "guest@example.test";

const configured = stripeConfigured();

async function addToBag(page: Page, slug: string, quantity = 1) {
  // Through the bag's own endpoint (same origin, so the page's cookies carry the guest bag).
  await page.goto("/bag", { waitUntil: "domcontentloaded" });
  const answer = await page.evaluate(
    async ({ slug, quantity }) => (await fetch("/api/bag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "add", slug, quantity }) })).json(),
    { slug, quantity },
  );
  expect(answer.ok).toBe(true);
}

const gate = (page: Page) => page.getByRole("form", { name: "Email for this order" });

async function continueAsGuest(page: Page, email = EMAIL) {
  await gotoHydrated(page, "/checkout", (p) => p.getByRole("button", { name: "Check out as a guest" }));
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Check out as a guest" }).click();
}

/** Empties this browser's bag and opens /checkout, which releases the bag's hold. */
async function giveBack(page: Page) {
  await page.goto("/bag", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    const bag = await (await fetch("/api/bag")).json();
    for (const line of bag.lines) {
      await fetch("/api/bag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "remove", slug: line.slug }) });
    }
  });
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/bag$/, { timeout: 15_000 });
}

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).exclude('iframe[name^="__privateStripe"]').analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test.describe("the gate", () => {
  test("asks for an email, offers sign in, and checks the email", async ({ page }) => {
    await gotoHydrated(page, "/checkout", (p) => p.getByRole("button", { name: "Check out as a guest" }));
    await expect(page.getByRole("heading", { level: 1, name: "Checkout" })).toBeVisible();
    await expect(page.getByText("You can create an account after your order.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true }).last()).toHaveAttribute("href", "/sign-in?returnTo=%2Fcheckout");
    await page.getByRole("button", { name: "Check out as a guest" }).click();
    await expect(page.getByRole("textbox", { name: "Email" })).toBeFocused();
    await expect(gate(page).getByText("Enter a valid email address.")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("an empty bag goes back to the bag", async ({ page }) => {
    await continueAsGuest(page);
    await expect(page).toHaveURL(/\/bag$/, { timeout: 15_000 });
  });

  test("without Stripe keys, checkout says it isn't available", async ({ page }) => {
    test.skip(configured, "Stripe is configured here.");
    await addToBag(page, POUCH);
    await continueAsGuest(page);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Checkout isn't available right now.");
  });
});

test.describe("@writes paying", () => {
  test.skip(!configured, "Needs Stripe test keys (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).");
  test.afterEach(async ({ page }) => giveBack(page));

  test("shows the demo note, the contact, Stripe's fields and the summary with the hold's time", async ({ page, context, browserName }) => {
    await addToBag(page, POUCH, 2);
    await continueAsGuest(page);
    await expect(page.getByText("Demo store — pay with the test card")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(EMAIL)).toBeVisible();
    await expect(page.getByText(/We're holding your items until \d{1,2}:\d{2} [ap]m/).first()).toBeAttached();
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible();
    if (browserName === "chromium") {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "Copy card number" }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(TEST_CARDS.visa);
    }
    // A reload keeps the same hold and the guest's email.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(EMAIL)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("a declined card shows its error inline, takes focus and keeps the form", async ({ page }) => {
    await addToBag(page, POUCH);
    await continueAsGuest(page);
    await fillAddress(page);
    await fillCard(page, TEST_CARDS.declined);
    await page.getByRole("button", { name: /^Pay \$/ }).click();
    const error = page.getByRole("main").getByRole("alert").filter({ hasText: /declined/i });
    await expect(error).toBeVisible({ timeout: 30_000 });
    await expect(error).toBeFocused();
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeEnabled();
  });

  test("when another shopper holds the stock first, the bag is lowered and the page says so", async ({ page, browser }) => {
    // Two shoppers each put 10 of the 14 Derby shoes in their bags; the first to check out holds 10.
    const other = await (await browser.newContext()).newPage();
    try {
      await addToBag(other, DERBY, 10);
      await addToBag(page, DERBY, 10);
      await continueAsGuest(other, "first@example.test");
      await expect(other.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 20_000 });

      await continueAsGuest(page);
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(/^Only \d+ Derby shoe (was|were) left — your bag has been updated$/, { timeout: 20_000 });
      await page.getByRole("button", { name: "Continue to payment" }).click();
      await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 20_000 });
    } finally {
      await giveBack(other);
      await other.context().close();
    }
  });
});
