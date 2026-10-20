import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { restoreSeed, showsSoon } from "./admin";
import { AUTH_TIMEOUT } from "./auth";
import { testDatabase } from "./db";
import { gotoHydrated } from "./hydration";

// M6's exit criterion: a visitor clicks "Try the admin", edits a product as the shared demo admin
// and sees it on the store straight away; the demo admin can't reach user management and reads
// orders masked. Each project edits its own product (no other spec uses these), put back to the
// seed's values afterwards through the local test database (the nightly reset does it on the demo).
const PRODUCT: Record<string, { slug: string; name: string }> = {
  desktop: { slug: "slouchy-hobo-black", name: "E2E demo hobo" },
  mobile: { slug: "croc-top-handle-yellow", name: "E2E demo top handle" },
};

test("@writes try the admin: edit a product as the demo admin and see it on the store", async ({ page }, info) => {
  test.skip(!testDatabase(), "needs the local e2e database to put the product back");
  const product = PRODUCT[info.project.name]!;

  // Signed out, the admin's front door offers the demo.
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/admin\/try$/);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("contentinfo").getByRole("link", { name: "Try the admin" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Try the admin" })).toBeVisible({ timeout: AUTH_TIMEOUT });
  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);

  await gotoHydrated(page, "/admin/try", (p) => p.getByRole("button", { name: "Start the demo" }));
  await page.getByRole("button", { name: "Start the demo" }).click();
  await expect(page).toHaveURL(/\/admin\/products$/, { timeout: AUTH_TIMEOUT });
  await expect(page.getByText("Demo admin — changes reset nightly")).toBeVisible();

  try {
    await gotoHydrated(page, `/admin/products/${product.slug}`, (p) => p.getByRole("button", { name: "Save changes" }));
    await page.getByRole("textbox", { name: "Name" }).fill(product.name);
    await page.getByRole("textbox", { name: "Price (USD)" }).fill("777");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.", { timeout: AUTH_TIMEOUT });

    await showsSoon(page, `/products/${product.slug}`, () => page.getByRole("heading", { level: 1, name: product.name }));
    await expect(page.getByText("$777").first()).toBeVisible();

    // User management is the owner's alone: the plugin's endpoint refuses the demo session.
    expect((await page.request.get("/api/auth/admin/list-users")).status()).toBe(403);

    // Orders are readable, masked, with nothing to act on.
    await page.goto("/admin/orders", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Customer names, emails and addresses are hidden in the demo.")).toBeVisible({ timeout: AUTH_TIMEOUT });
    // No full email in the table (the header shows the demo account's own).
    await expect(page.getByRole("main").getByText(/^[^•\s][^@\s]*@[^\s]+$/)).toHaveCount(0);
    const firstOrder = page.getByRole("link", { name: /^ORR-\d+$/ }).filter({ visible: true }).first();
    if (await firstOrder.count()) {
      await firstOrder.click();
      await expect(page.getByRole("heading", { level: 1, name: /^Order ORR-\d+$/ })).toBeVisible({ timeout: AUTH_TIMEOUT });
      await expect(page.getByRole("button", { name: /Mark as fulfilled|Cancel order/ })).toHaveCount(0);
    }
  } finally {
    await restoreSeed(product.slug);
  }
});
