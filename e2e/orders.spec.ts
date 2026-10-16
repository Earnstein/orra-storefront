import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { deleteTestUser, newUser, signUp } from "./auth";
import { testDatabase } from "./db";
import { readEmails } from "./outbox";
import { addToBag, continueAsGuest, giveBack, payAndConfirm } from "./shop";
import { stripeConfigured } from "./stripe";

// Order history: the account's orders and a guest's order link. Each test buys one unit of a
// product no other spec uses (one per project, as they run at once); locally the test database
// gives it back.

type ProjectProducts = Record<string, { slug: string; name: string }>;
const ACCOUNT: ProjectProducts = { desktop: { slug: "hair-claw-gold", name: "Hair claw" }, mobile: { slug: "tortoiseshell-hair-claw", name: "Tortoiseshell hair claw" } };
const GUEST: ProjectProducts = { desktop: { slug: "browline-sunglasses-black", name: "Browline sunglasses" }, mobile: { slug: "braided-belt-brown", name: "Braided belt" } };
const GUEST_EMAIL = "orders-guest@example.test";

async function seriousViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

async function restock(slug: string) {
  const sql = testDatabase();
  if (sql) await sql`update products set stock = stock + 1 where slug = ${slug}`;
}

test.describe("@writes order history", () => {
  test.skip(!stripeConfigured(), "Needs Stripe test keys (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).");
  test.describe.configure({ timeout: 150_000 });

  test("a shopper's order shows in their account, in full; another account can't open it", async ({ page, browser, baseURL }, testInfo) => {
    const product = ACCOUNT[testInfo.project.name]!;
    const user = newUser();
    const other = newUser();
    const otherPage = await (await browser.newContext()).newPage();
    try {
      await signUp(page, user);
      await addToBag(page, product.slug);
      await page.goto("/checkout", { waitUntil: "domcontentloaded" });
      const number = await payAndConfirm(page);
      await restock(product.slug);

      await page.goto("/account", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("link", { name: /Orders \(1\)/ })).toBeVisible({ timeout: 15_000 });

      await page.goto("/account/orders", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: "Orders (1)" })).toBeVisible({ timeout: 15_000 });
      const row = page.getByRole("link", { name: new RegExp(number) });
      await expect(row).toContainText("Confirmed");
      await expect(row).toContainText("1 item");
      expect(await seriousViolations(page)).toEqual([]);

      await row.click();
      await expect(page).toHaveURL(new RegExp(`/account/orders/${number}$`));
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible({ timeout: 15_000 });
      await expect(main.getByText(/Placed on .+ · Confirmed/)).toBeVisible();
      await expect(main.getByText(product.name, { exact: true })).toBeVisible();
      await expect(main.getByText("1 Main Street")).toBeVisible();
      await expect(main.getByText("Visa ending 4242")).toBeVisible();
      await expect(main.getByText("Total", { exact: true })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      // Another account gets the not-found page for the same number.
      await signUp(otherPage, other);
      await otherPage.goto(`/account/orders/${number}`, { waitUntil: "domcontentloaded" });
      await expect(otherPage.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible({ timeout: 15_000 });
      await expect(otherPage.getByText(product.name, { exact: true })).toHaveCount(0);
    } finally {
      await giveBack(page).catch(() => {});
      await otherPage.context().close();
      await deleteTestUser(browser, baseURL!, user);
      await deleteTestUser(browser, baseURL!, other);
    }
  });

  test("a guest's emailed link opens their order; a changed key doesn't", async ({ page }, testInfo) => {
    test.skip(Boolean(process.env.E2E_BASE_URL), "Reads the email from the local outbox.");
    const product = GUEST[testInfo.project.name]!;
    try {
      await addToBag(page, product.slug);
      await continueAsGuest(page, GUEST_EMAIL);
      const number = await payAndConfirm(page);
      await restock(product.slug);

      let link = "";
      await expect
        .poll(async () => {
          const [email] = await readEmails(GUEST_EMAIL, number);
          link = email?.text.match(/https?:\/\/\S+\/orders\/ORR-\d+\?key=[A-Za-z0-9_-]+/)?.[0] ?? "";
          return link;
        }, { timeout: 15_000 })
        .toMatch(new RegExp(`/orders/${number}\\?key=`));

      const response = await page.goto(link, { waitUntil: "domcontentloaded" });
      expect(response?.headers()["cache-control"]).toBe("private, no-store");
      expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute("content", "no-referrer");
      const main = page.getByRole("main");
      await expect(main.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible({ timeout: 15_000 });
      await expect(main.getByText(product.name, { exact: true })).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);

      const key = new URL(link).searchParams.get("key")!;
      const changed = `${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`;
      await page.goto(`/orders/${number}?key=${changed}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(product.name, { exact: true })).toHaveCount(0);
      await page.goto(`/orders/${number}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible({ timeout: 15_000 });
    } finally {
      await giveBack(page);
    }
  });
});
