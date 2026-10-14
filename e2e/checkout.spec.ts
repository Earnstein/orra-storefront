import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { deleteTestUser, newUser, signUp } from "./auth";
import { gotoHydrated } from "./hydration";
import { fillAddress, fillCard, stripeConfigured, TEST_CARDS } from "./stripe";

// /checkout: the gate, the page, holds and paying with Stripe test cards. Tests that start a
// checkout hold real stock on the test database, so they use products no other spec uses (Derby
// shoe, Wool beret, Zip pouch), are tagged @writes, and give the stock back afterwards.

// Desktop and mobile run at the same time, so each races for its own product (14 and 16 in stock).
const RACED = { desktop: { slug: "derby-shoe-tan", name: "Derby shoe" }, mobile: { slug: "wool-beret-red", name: "Wool beret" } } as const;
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
  await expect(page).toHaveURL(/\/bag$/, { timeout: 20_000 });
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

  test("hydrates without a mismatch after another page has read the session", async ({ page }) => {
    // The header can read the session before the page's own part hydrates (a warm connection).
    await gotoHydrated(page, "/bag", (p) => p.getByRole("heading", { level: 1 }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (let i = 0; i < 3; i++) {
      // Each load reads the session; wait for it, as a shopper would before acting.
      const sessionRead = page.waitForResponse((response) => response.url().includes("/api/auth/get-session"), { timeout: 15_000 }).catch(() => undefined);
      await gotoHydrated(page, "/checkout", (p) => p.getByRole("button", { name: "Check out as a guest" }));
      await sessionRead;
    }
    expect(errors).toEqual([]);
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
  // Stripe's fields can take 20 s to load with several tests at once.
  test.describe.configure({ timeout: 120_000 });
  // A test that gives its stock back itself (before deleting its account) sets this.
  let givenBack = false;
  test.afterEach(async ({ page }) => {
    if (!givenBack) await giveBack(page);
    givenBack = false;
  });

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
    await expect(error).toBeVisible({ timeout: 60_000 });
    await expect(error).toBeFocused();
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeEnabled();
  });

  test("paying with the test card goes to the success page for this checkout", async ({ page }) => {
    await addToBag(page, POUCH);
    await continueAsGuest(page);
    await fillAddress(page);
    await fillCard(page, TEST_CARDS.visa);
    await page.getByRole("button", { name: /^Pay \$/ }).click();
    // The page itself arrives with orders (module 5); Stripe has authorised the payment by now.
    await expect(page).toHaveURL(/\/checkout\/success\?checkout=[0-9a-f-]{36}/, { timeout: 60_000 });
  });

  test("signed in, the gate is skipped and the account's email is used", async ({ page, browser, baseURL }) => {
    const user = newUser();
    try {
      await signUp(page, user);
      await addToBag(page, POUCH);
      await page.goto("/checkout", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Check out as a guest" })).toHaveCount(0);
      await expect(page.getByText(user.email, { exact: true })).toBeVisible();
    } finally {
      givenBack = true;
      try {
        // While still signed in, so /checkout knows the email and releases the hold.
        await giveBack(page);
      } finally {
        await deleteTestUser(browser, baseURL!, user);
      }
    }
  });

  test("when another shopper holds the stock first, the bag is lowered and the page says so", async ({ page, browser }, testInfo) => {
    const product = RACED[testInfo.project.name as keyof typeof RACED];
    // Two shoppers each put 10 in their bags; the first to check out holds 10, leaving fewer.
    const other = await (await browser.newContext()).newPage();
    try {
      await addToBag(other, product.slug, 10);
      await addToBag(page, product.slug, 10);
      await continueAsGuest(other, "first@example.test");
      await expect(other.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 20_000 });

      await continueAsGuest(page);
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(new RegExp(`^Only \\d+ ${product.name} (was|were) left — your bag has been updated$`), { timeout: 20_000 });
      await page.getByRole("button", { name: "Continue to payment" }).click();
      await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 20_000 });
    } finally {
      await giveBack(other);
      await other.context().close();
    }
  });
});
