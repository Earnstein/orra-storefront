import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { signUpAsAdmin } from "./admin";
import { deleteTestUser, newUser, signUp } from "./auth";
import { testDatabase } from "./db";
import { addToBag, giveBack, payAndConfirm } from "./shop";
import { stripeConfigured } from "./stripe";

// The owner fulfils one paid order and cancels (refunds) another; the shopper's order pages
// follow, and the demo admin sees both masked, with no actions. Each project buys its own two
// products no other spec uses; the cancelled one's stock comes back by itself, the fulfilled one's
// is given back through the test database.

type Products = { fulfil: { slug: string; name: string }; cancel: { slug: string; name: string } };
const PRODUCTS: Record<string, Products> = {
  desktop: { fulfil: { slug: "suede-belt-olive", name: "Suede belt" }, cancel: { slug: "butterfly-brooch", name: "Butterfly brooch" } },
  mobile: { fulfil: { slug: "pave-crossover-ring", name: "Pavé crossover ring" }, cancel: { slug: "coin-charm-necklace", name: "Coin charm necklace" } },
};

async function seriousViolations(page: Page) {
  // Measured mid-fade, a dialog's text reads as low contrast.
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"));
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

async function buy(page: Page, slug: string): Promise<string> {
  await addToBag(page, slug);
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
  return payAndConfirm(page);
}

async function openOrder(page: Page, number: string) {
  await page.goto(`/admin/orders/${number}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1, name: `Order ${number}` })).toBeVisible({ timeout: 15_000 });
}

test.describe("@writes admin orders", () => {
  test.skip(!stripeConfigured(), "Needs Stripe test keys (STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).");
  test.describe.configure({ timeout: 240_000 });

  test("the owner fulfils one order and cancels another; the demo admin sees them masked", async ({ page, browser, baseURL }, testInfo) => {
    const products = PRODUCTS[testInfo.project.name]!;
    const shopper = newUser();
    const ownerPage = await (await browser.newContext()).newPage();
    const demoPage = await (await browser.newContext()).newPage();
    const owner = await signUpAsAdmin(ownerPage, "admin");
    const demo = await signUpAsAdmin(demoPage, "demo-admin");
    const sql = testDatabase()!;
    const stockOf = async (slug: string) => Number((await sql`select stock from products where slug = ${slug}`)[0]!.stock);
    let fulfilled = false;
    let toRestock: string | null = null;
    try {
      await signUp(page, shopper);
      const cancelStock = await stockOf(products.cancel.slug);
      const toFulfil = await buy(page, products.fulfil.slug);
      fulfilled = true;
      const toCancel = await buy(page, products.cancel.slug);
      toRestock = products.cancel.slug;
      expect(await stockOf(products.cancel.slug)).toBe(cancelStock - 1);

      // The owner finds the first order by number and fulfils it.
      await ownerPage.goto(`/admin/orders?q=${toFulfil}`, { waitUntil: "domcontentloaded" });
      const row = ownerPage.getByRole("link", { name: toFulfil });
      await expect(row).toBeVisible({ timeout: 15_000 });
      // Rows render twice (a table from md, stacked below it): look at the one showing.
      await expect(ownerPage.getByText(shopper.email).filter({ visible: true })).toBeVisible();
      expect(await seriousViolations(ownerPage)).toEqual([]);
      await row.click();
      await expect(ownerPage.getByRole("heading", { level: 1, name: `Order ${toFulfil}` })).toBeVisible({ timeout: 15_000 });
      await expect(ownerPage.getByText("1 Main Street")).toBeVisible();
      expect(await seriousViolations(ownerPage)).toEqual([]);
      await ownerPage.getByRole("button", { name: "Mark as fulfilled" }).click();
      await expect(ownerPage.getByRole("status")).toHaveText(`${toFulfil} is fulfilled.`, { timeout: 15_000 });
      await expect(ownerPage.getByText(/^Fulfilled ·/)).toBeVisible({ timeout: 15_000 });
      await expect(ownerPage.getByRole("button", { name: "Mark as fulfilled" })).toHaveCount(0);

      await page.goto(`/account/orders/${toFulfil}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Placed on .+ · Fulfilled/)).toBeVisible({ timeout: 15_000 });

      // The owner cancels the second: refunded, and its stock is back.
      await openOrder(ownerPage, toCancel);
      await ownerPage.getByRole("button", { name: "Cancel order" }).click();
      const dialog = ownerPage.getByRole("alertdialog", { name: `Cancel order ${toCancel}?` });
      await expect(dialog).toBeVisible();
      expect(await seriousViolations(ownerPage)).toEqual([]);
      await dialog.getByRole("button", { name: "Cancel and refund" }).click();
      await expect(ownerPage.getByRole("status")).toHaveText(`${toCancel} is cancelled and refunded.`, { timeout: 30_000 });
      await expect(ownerPage.getByText(/^Cancelled and refunded ·/)).toBeVisible({ timeout: 15_000 });
      expect(await stockOf(products.cancel.slug)).toBe(cancelStock);
      toRestock = null;

      await page.goto(`/account/orders/${toCancel}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByText(/Placed on .+ · Cancelled/)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("This order was cancelled and refunded to your card.")).toBeVisible();

      // The demo admin: masked, and nothing to press.
      await demoPage.goto(`/admin/orders?q=${toFulfil}`, { waitUntil: "domcontentloaded" });
      await expect(demoPage.getByRole("link", { name: toFulfil })).toBeVisible({ timeout: 15_000 });
      await expect(demoPage.getByText("•••@example.test").filter({ visible: true })).toBeVisible();
      await expect(demoPage.getByText(shopper.email)).toHaveCount(0);
      expect(await seriousViolations(demoPage)).toEqual([]);
      await openOrder(demoPage, toFulfil);
      await expect(demoPage.getByText("A. L.")).toBeVisible();
      await expect(demoPage.getByText("Brooklyn, NY")).toBeVisible();
      await expect(demoPage.getByText("1 Main Street")).toHaveCount(0);
      await expect(demoPage.getByText("Ada Lovelace")).toHaveCount(0);
      await openOrder(demoPage, toCancel);
      await expect(demoPage.getByRole("button", { name: /Mark as fulfilled|Cancel order/ })).toHaveCount(0);
      expect(await seriousViolations(demoPage)).toEqual([]);
    } finally {
      await giveBack(page).catch(() => {});
      if (fulfilled) await sql`update products set stock = stock + 1 where slug = ${products.fulfil.slug}`;
      // Bought but not cancelled (the test failed first): give its unit back too.
      if (toRestock) await sql`update products set stock = stock + 1 where slug = ${toRestock}`;
      await ownerPage.context().close();
      await demoPage.context().close();
      for (const user of [shopper, owner, demo]) await deleteTestUser(browser, baseURL!, user);
    }
  });
});
