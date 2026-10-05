import { expect, test, type Page } from "@playwright/test";

import { categories as seedCategories, products as seedProducts } from "../src/db/seed/catalog";
import { primaryNav } from "../src/lib/site";

// Expected product lists come from the seed, so growing the catalogue doesn't break these.
const productLinks = (page: Page) => page.getByRole("main").locator('a[href^="/products/"]');

for (const link of primaryNav) {
  test(`nav: ${link.label} opens a page with products`, async ({ page }) => {
    expect((await page.goto(link.href))?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(productLinks(page).first()).toBeVisible();
  });
}

test("product breadcrumbs link to a working category page", async ({ page }) => {
  await page.goto("/products/double-monk-shoe");
  await page.getByRole("navigation", { name: "breadcrumb" }).getByRole("link", { name: "Shoes", exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/shoes$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shoes");
});

test("Women and Men include unisex products", async ({ page }) => {
  for (const path of ["/collections/women", "/collections/men"]) {
    await page.goto(path);
    await expect(page.getByRole("main").locator('a[href="/products/round-sunglasses"]'), path).toBeVisible();
  }
});

test("a tab narrows the listing", async ({ page }) => {
  await page.goto("/collections/women");
  await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Bags", exact: true }).click();
  await expect(page).toHaveURL(/\/collections\/women\/bags$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bags");

  const expected = seedProducts
    .filter((product) => product.category === "bags" && product.audience !== "men")
    .map((product) => `/products/${product.slug}`);
  await expect(productLinks(page)).toHaveCount(expected.length); // waits for the new page
  const hrefs = await productLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(hrefs.sort()).toEqual(expected.sort());
});

test("unknown collection paths 404", async ({ page }) => {
  for (const path of ["/collections/does-not-exist", "/collections/women/does-not-exist", "/collections/bags/shoes"]) {
    expect((await page.goto(path))?.status(), path).toBe(404);
  }
});

test("a known category with no products in a collection shows the empty state", async ({ page }) => {
  // From the seed: a Women or Men tab whose category has none of that audience's (or unisex) products.
  const empty = (["women", "men"] as const).flatMap((audience) =>
    seedCategories
      .filter((category) => !seedProducts.some((p) => p.category === category.slug && (p.audience === audience || p.audience === "unisex")))
      .map((category) => ({ audience, category })),
  )[0];
  test.skip(!empty, "every category has products for both audiences");

  const response = await page.goto(`/collections/${empty.audience}/${empty.category.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(empty.category.name);
  await expect(page.getByText(`Nothing in ${empty.category.name.toLowerCase()} here right now.`)).toBeVisible();
});

test("collection pages don't scroll sideways", async ({ page }) => {
  // The project's own viewport, then the narrowest phone we support (the mobile project is 412 wide).
  for (const width of [page.viewportSize()!.width, 375]) {
    await page.setViewportSize({ width, height: 812 });
    for (const path of ["/collections/women", "/collections/women/bags", "/collections/bags", "/collections/men/jewellery"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBe(0);
    }
  }
});

test("homepage featured collections resolve", async ({ page, request }) => {
  await page.goto("/");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Shop the collections" }) });
  const hrefs = await section.locator("a").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(hrefs).toEqual(["/collections/women/ready-to-wear", "/collections/men/ready-to-wear", "/collections/shoes"]);
  for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);
});
