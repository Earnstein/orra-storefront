import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { products as seedProducts } from "../src/db/seed/catalog";
import { signUpAsAdmin } from "./admin";
import { AUTH_TIMEOUT, deleteTestUser, type TestUser } from "./auth";
import { testDatabase } from "./db";
import { gotoHydrated, hydrated } from "./hydration";

let created: TestUser | undefined;

test.afterEach(async ({ browser, baseURL }) => {
  if (!created) return;
  await deleteTestUser(browser, baseURL!, created);
  created = undefined;
});

test("@writes the products table lists products and searching narrows it", async ({ page, isMobile }) => {
  created = await signUpAsAdmin(page);
  await page.goto("/admin/products", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/^Showing 1–25 of \d+$/)).toBeVisible({ timeout: AUTH_TIMEOUT });
  const names = isMobile ? page.locator("ul a[href^='/admin/products/']") : page.getByRole("table").getByRole("link");
  await expect(names).toHaveCount(25);

  const searchBox = page.getByRole("searchbox", { name: "Search products" });
  await hydrated(searchBox);
  await searchBox.fill("tote");
  await expect(page).toHaveURL(/[?&]q=tote/);
  await expect(page.getByText(/^Showing 1–\d+ of \d+$/)).not.toHaveText(/of 4\d$/);
  const shown = await names.allTextContents();
  expect(shown.length).toBeGreaterThan(0);
  expect(shown.every((name) => /tote/i.test(name))).toBe(true);

  const { violations } = await new AxeBuilder({ page }).analyze();
  expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("@writes the table sorts by price and keeps its state in the address", async ({ page, isMobile }) => {
  test.skip(isMobile, "sorting is by the column headers, shown from md");
  created = await signUpAsAdmin(page);
  await page.goto("/admin/products", { waitUntil: "domcontentloaded" });
  const price = page.getByRole("button", { name: "Price" });
  await hydrated(price);
  await price.click();
  await expect(page).toHaveURL(/sort=price/);
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", /ascending|descending/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", /ascending|descending/, { timeout: AUTH_TIMEOUT });
});

// Editing writes real products, so each project edits its own (no other spec uses these), and each
// test puts the seed's values back afterwards.
const PRODUCTS = {
  desktop: { edit: "bomber-jacket-rust", archive: "pebbled-satchel-grey", held: "floral-pump" },
  mobile: { edit: "leather-biker-jacket", archive: "barrel-bag-burgundy", held: "top-handle-bag-teal" },
} as const;
const productsFor = (project: string) => PRODUCTS[project as keyof typeof PRODUCTS];

/**
 * Loads `url` until `shown` appears: after an admin save the first visit to a prerendered page can
 * still get its previous render while it re-renders, so the change shows from a following visit.
 */
async function showsSoon(page: Page, url: string, shown: () => Locator) {
  await expect(async () => {
    // A fresh query each time, so the browser's own HTTP cache can't answer (Next ignores it).
    await page.goto(`${url}${url.includes("?") ? "&" : "?"}e2e=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await expect(shown()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

async function restoreSeed(slug: string) {
  const seed = seedProducts.find((product) => product.slug === slug)!;
  await testDatabase()!`UPDATE products SET name = ${seed.name}, price = ${seed.price}, stock = ${seed.stock}, archived_at = NULL WHERE slug = ${slug}`;
}

test("@writes editing a product's name and price shows on the store at once", async ({ page }, info) => {
  const slug = productsFor(info.project.name).edit;
  created = await signUpAsAdmin(page);
  try {
    await gotoHydrated(page, `/admin/products/${slug}`, (p) => p.getByRole("button", { name: "Save changes" }));
    await page.getByRole("textbox", { name: "Name" }).fill("E2E renamed jacket");
    await page.getByRole("textbox", { name: "Price (USD)" }).fill("999");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Saved.", { timeout: AUTH_TIMEOUT });

    await showsSoon(page, `/products/${slug}`, () => page.getByRole("heading", { level: 1, name: "E2E renamed jacket" }));
    await expect(page.getByText("$999").first()).toBeVisible();
    await showsSoon(page, "/collections/new", () => page.getByText("E2E renamed jacket").first());
  } finally {
    await restoreSeed(slug);
  }
});

test("@writes archiving takes a product off the store and restoring puts it back", async ({ page }, info) => {
  const slug = productsFor(info.project.name).archive;
  const name = seedProducts.find((product) => product.slug === slug)!.name;
  created = await signUpAsAdmin(page);
  try {
    await gotoHydrated(page, `/admin/products/${slug}`, (p) => p.getByRole("button", { name: "Archive" }));
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByRole("status")).toHaveText(/^Archived/, { timeout: AUTH_TIMEOUT });

    await showsSoon(page, `/products/${slug}`, () => page.getByText("No longer available"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
    await expect(page.getByRole("button", { name: /^(Add to bag|Sold out)$/ })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const listing = (await (await page.request.get("/api/products?collection=new")).json()) as { products: { slug: string }[] };
    expect(listing.products.map((product) => product.slug)).not.toContain(slug);

    await gotoHydrated(page, `/admin/products/${slug}`, (p) => p.getByRole("button", { name: "Restore" }));
    await page.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("status")).toHaveText(/^Restored/, { timeout: AUTH_TIMEOUT });
    // The purchase button is back (Sold out for a product with no stock, like the mobile project's).
    await showsSoon(page, `/products/${slug}`, () => page.getByRole("button", { name: /^(Add to bag|Sold out)$/ }).first());
  } finally {
    await restoreSeed(slug);
  }
});

test("@writes a product's slug can't be edited once it exists", async ({ page }, info) => {
  const slug = productsFor(info.project.name).edit;
  created = await signUpAsAdmin(page);
  await gotoHydrated(page, `/admin/products/${slug}`, (p) => p.getByRole("button", { name: "Save changes" }));
  await expect(page.getByRole("textbox", { name: "Slug" })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("textbox", { name: "Slug" })).toHaveValue(slug);
});

test("@writes the stock field says how many units checkouts hold", async ({ page }, info) => {
  const slug = productsFor(info.project.name).held;
  created = await signUpAsAdmin(page);
  const sql = testDatabase()!;
  const [hold] = await sql`INSERT INTO checkouts (email, amount, expires_at) VALUES ('e2e-hold@example.test', 100, now() + interval '30 minutes') RETURNING id`;
  try {
    await sql`INSERT INTO checkout_items (checkout_id, product_id, name, unit_price, quantity) SELECT ${hold.id}, id, name, price, 2 FROM products WHERE slug = ${slug}`;
    await page.goto(`/admin/products/${slug}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText("2 more held in checkouts.")).toBeVisible({ timeout: AUTH_TIMEOUT });
  } finally {
    await sql`DELETE FROM checkouts WHERE id = ${hold.id}`;
  }
});
