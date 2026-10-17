import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { deleteTestUser, newUser, signUp } from "./auth";
import { testDatabase } from "./db";
import { gotoHydrated } from "./hydration";
import { readEmails } from "./outbox";
import { addToBag, continueAsGuest as continueWith, gate, giveBack } from "./shop";
import { fillAddress, fillCard, pay, stripeConfigured, TEST_CARDS } from "./stripe";

// /checkout and /checkout/success: the gate, the page, holds, paying with Stripe test cards and
// the order. Tests that start a checkout hold real stock on the test database, so they use
// products no other spec uses (Derby shoe, Wool beret, Zip pouch, and the earrings and rings
// below), are tagged @writes, and give the stock back afterwards. A purchase lowers stock for good
// (until M6's reset); locally the test database gives it back.

type ProjectProducts = Record<string, { slug: string; name: string }>;
// Desktop and mobile run at the same time, so each races for its own product (14 and 16 in stock).
const RACED: ProjectProducts = { desktop: { slug: "derby-shoe-tan", name: "Derby shoe" }, mobile: { slug: "wool-beret-red", name: "Wool beret" } };
// Each project buys its own product, so the stock it checks moves only with its own purchase.
const BOUGHT: ProjectProducts = { desktop: { slug: "half-moon-earrings", name: "Half-moon earrings" }, mobile: { slug: "heart-drop-earrings-blue", name: "Heart drop earrings" } };
// And sells out its own (set to 0 while it pays, then put back).
const SOLD: ProjectProducts = { desktop: { slug: "pearl-stud-earrings", name: "Pearl studs" }, mobile: { slug: "steel-band-ring", name: "Brushed band ring" } };
const POUCH = "zip-pouch-black";
const EMAIL = "guest@example.test";

const configured = stripeConfigured();

const continueAsGuest = (page: Page, email = EMAIL) => continueWith(page, email);

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

  test("the delivery form checks the address before paying: missing fields, a non-US ZIP, a State picked from the list", async ({ page }) => {
    await addToBag(page, POUCH);
    await continueAsGuest(page);
    const form = page.getByRole("form", { name: "Delivery and payment" });
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeEnabled({ timeout: 60_000 });
    // Every field but the apartment is required, and says so to assistive tech as well as on screen.
    await expect(form.getByText("All fields are required unless marked optional.")).toBeVisible();
    for (const name of ["Full name", "Address", "City", "ZIP code", "Phone number"]) {
      await expect(form.getByRole("textbox", { name, exact: true })).toHaveAttribute("aria-required", "true");
    }
    await expect(form.getByRole("combobox", { name: "State" })).toHaveAttribute("aria-required", "true");
    await expect(form.getByRole("textbox", { name: "Apartment, suite, etc. (optional)" })).not.toHaveAttribute("aria-required");
    await pay(page);
    await expect(form.getByRole("textbox", { name: "Full name" })).toBeFocused();
    await expect(form.getByText("Enter your full name.")).toBeVisible();
    await expect(form.getByText("Choose your state.")).toBeVisible();

    await fillAddress(page);
    await form.getByRole("textbox", { name: "ZIP code" }).fill("340221");
    await pay(page);
    await expect(form.getByRole("textbox", { name: "ZIP code" })).toBeFocused();
    await expect(form.getByText("Enter a 5-digit US ZIP code, e.g. 11201.")).toBeVisible();
    // The State list is ours (a combobox showing the name), not a native select.
    await expect(form.getByRole("combobox", { name: "State" })).toHaveValue("New York");
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("a declined card shows its error inline, takes focus and keeps the form", async ({ page }) => {
    await addToBag(page, POUCH);
    await continueAsGuest(page);
    await fillAddress(page);
    await fillCard(page, TEST_CARDS.declined);
    await pay(page);
    const error = page.getByRole("main").getByRole("alert").filter({ hasText: /declined/i });
    await expect(error).toBeVisible({ timeout: 60_000 });
    await expect(error).toBeFocused();
    await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeEnabled();
  });

  test("a guest pays with the test card and sees the order; the bag empties, the stock drops, one email goes out", async ({ page }, testInfo) => {
    const product = BOUGHT[testInfo.project.name]!;
    const sql = testDatabase();
    const stock = async () => Number((await sql!`select stock from products where slug = ${product.slug}`)[0]!.stock);
    const before = sql ? await stock() : 0;
    await addToBag(page, product.slug);
    await continueAsGuest(page);
    await fillAddress(page);
    await fillCard(page, TEST_CARDS.visa);
    await pay(page);

    await expect(page).toHaveURL(/\/checkout\/success\?checkout=[0-9a-f-]{36}/, { timeout: 60_000 });
    const heading = page.getByRole("heading", { level: 1, name: /^Thank you — order ORR-\d+ is confirmed$/ });
    await expect(heading).toBeVisible({ timeout: 30_000 });
    const number = (await heading.textContent())!.match(/ORR-\d+/)![0];
    const main = page.getByRole("main");
    await expect(main.getByText(`We've emailed a confirmation to ${EMAIL}.`)).toBeVisible();
    await expect(main.getByText(product.name, { exact: true })).toBeVisible();
    await expect(main.getByText("1 Main Street")).toBeVisible();
    await expect(main.getByText("Visa ending 4242")).toBeVisible();
    await expect(page.getByRole("link", { name: "Bag", exact: true })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    if (sql) {
      expect(await stock()).toBe(before - 1);
      // Put it back, so local runs don't sell the test database out.
      await sql`update products set stock = stock + 1 where slug = ${product.slug}`;
    }
    if (!process.env.E2E_BASE_URL) await expect.poll(async () => (await readEmails(EMAIL, number)).length, { timeout: 15_000 }).toBe(1);

    // A guest is offered an account, with the order's email carried over.
    await expect(main.getByText("Create an account for faster checkout next time.")).toBeVisible();
    await main.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    await expect(page.getByRole("textbox", { name: "Email" })).toHaveValue(EMAIL);
    if (!process.env.E2E_BASE_URL) expect((await readEmails(EMAIL, number)).length).toBe(1);
  });

  test("when the hold runs out and the stock sells while paying, there's no order and the card isn't charged", async ({ page }, testInfo) => {
    const sql = testDatabase();
    test.skip(!sql, "Needs the local test database to make the hold run out.");
    const product = SOLD[testInfo.project.name]!;
    const [{ stock }] = (await sql!`select stock from products where slug = ${product.slug}`) as [{ stock: number }];
    try {
      await addToBag(page, product.slug);
      await continueAsGuest(page);
      await fillAddress(page);
      await fillCard(page, TEST_CARDS.visa);
      // The hold ran out and was swept, and someone else bought the last one.
      const released = await sql!`
        update checkouts c set status = 'expired', expires_at = now() - interval '10 minutes'
        from checkout_items i join products p on p.id = i.product_id
        where i.checkout_id = c.id and p.slug = ${product.slug} and c.status = 'open'
        returning c.id`;
      expect(released).toHaveLength(1);
      await sql!`update products set stock = 0 where slug = ${product.slug}`;
      await pay(page);

      await expect(page).toHaveURL(/\/checkout\/success\?checkout=[0-9a-f-]{36}/, { timeout: 60_000 });
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(`Sorry — the ${product.name} sold out while you were paying. Your card was not charged.`, { timeout: 30_000 });
      await expect(page.getByRole("main").getByRole("link", { name: "Back to bag" })).toBeVisible();
      expect(await sql!`select o.id from orders o where o.checkout_id = ${released[0]!.id}`).toHaveLength(0);
      expect((await sql!`select status from checkouts where id = ${released[0]!.id}`)[0]?.status).toBe("cancelled");
    } finally {
      await sql!`update products set stock = ${stock} where slug = ${product.slug}`;
    }
  });

  test("signed in, the gate is skipped, the account's email is used, and the order offers the account's orders", async ({ page, browser, baseURL }) => {
    const user = newUser();
    try {
      await signUp(page, user);
      await addToBag(page, POUCH);
      await page.goto("/checkout", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: /^Pay \$/ })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("button", { name: "Check out as a guest" })).toHaveCount(0);
      await expect(page.getByText(user.email, { exact: true })).toBeVisible();

      await fillAddress(page);
      await fillCard(page, TEST_CARDS.visa);
      await pay(page);
      await expect(page.getByRole("heading", { level: 1, name: /^Thank you — order ORR-\d+ is confirmed$/ })).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("main").getByRole("link", { name: "View your orders" })).toHaveAttribute("href", "/account/orders");
      await expect(page.getByText("Create an account for faster checkout next time.")).toHaveCount(0);
      const sql = testDatabase();
      if (sql) await sql`update products set stock = stock + 1 where slug = ${POUCH}`;
    } finally {
      givenBack = true;
      try {
        // While still signed in, so /checkout knows the email and releases any hold.
        await giveBack(page);
      } finally {
        await deleteTestUser(browser, baseURL!, user);
      }
    }
  });

  test("when another shopper holds the stock first, the bag is lowered and the page says so", async ({ page, browser }, testInfo) => {
    const product = RACED[testInfo.project.name]!;
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
