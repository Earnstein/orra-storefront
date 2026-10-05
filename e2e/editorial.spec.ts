import { expect, test } from "@playwright/test";

test("the stories index lists both stories", async ({ page }) => {
  await page.goto("/stories");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stories");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: /Knitwear, made slowly/ })).toHaveAttribute("href", "/stories/knitwear");
  await expect(main.getByRole("link", { name: /The leather workshop/ })).toHaveAttribute("href", "/stories/leather-workshop");
});

test("a story shows its products and links on to the other story", async ({ page, request }) => {
  await page.goto("/stories/knitwear");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Knitwear, made slowly");

  const shop = page.locator("section", { has: page.getByRole("heading", { name: "Shop the story" }) });
  const products = await shop.locator('a[href^="/products/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  expect(products.length).toBeGreaterThan(0);
  // Every link in the section works: the products and the "Shop …" link beside the heading.
  const hrefs = await shop.locator("a").evaluateAll((links) => links.map((a) => a.getAttribute("href")!));
  for (const href of hrefs) expect((await request.get(href)).status(), href).toBe(200);

  await expect(page.getByRole("main").locator('a[href="/stories/leather-workshop"]')).toBeVisible();
});

test("unknown stories return 404", async ({ page }) => {
  expect((await page.goto("/stories/does-not-exist"))?.status()).toBe(404);
});

test("the homepage story band and the footer link to working story pages", async ({ page, request }) => {
  await page.goto("/");
  const read = page.getByRole("link", { name: "Read the story" });
  await expect(read).toHaveAttribute("href", "/stories/knitwear");
  expect((await request.get("/stories/knitwear")).status()).toBe(200);

  const stories = page.getByRole("contentinfo").getByRole("link", { name: "Stories", exact: true });
  expect(await stories.getAttribute("href")).toBe("/stories");
  expect((await request.get("/stories")).status()).toBe(200);
});
