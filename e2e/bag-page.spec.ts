import { expect, test, type Page } from "@playwright/test";

import { gotoHydrated } from "./hydration";

// /bag: lines, quantities, Remove with Undo, Move to saved items, stock notes, the order summary
// and the empty bag. Guests only (no accounts are created).

const TOTE = "/products/leather-tote-tan";
const SHOE = "/products/double-monk-shoe";

const addButton = (page: Page) => page.getByRole("button", { name: /^(Add to bag|Added to bag|Adding…|All available in your bag)$/ }).first();
const bagLink = (page: Page) => page.getByRole("link", { name: /^Bag(, \d+ items?)?$/ }).first();
const lines = (page: Page) => page.getByRole("list", { name: "Items in your bag" }).getByRole("listitem");
const line = (page: Page, name: string) => lines(page).filter({ has: page.getByRole("link", { name, exact: true }) });

async function add(page: Page, path: string) {
  await gotoHydrated(page, path, addButton);
  const answered = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bag");
  await addButton(page).click();
  await answered;
}

async function openBag(page: Page) {
  await gotoHydrated(page, "/bag", (p) => p.getByRole("heading", { level: 1 }));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Shopping bag \(\d+\)$/);
}

const money = (text: string | null) => Number((text ?? "").replace(/[^0-9.]/g, ""));

test("lists each line with its photo, name, colour, price and quantity, and totals them", async ({ page }) => {
  await add(page, TOTE);
  await add(page, SHOE);
  await openBag(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shopping bag (2)");
  await expect(lines(page)).toHaveCount(2);

  const tote = line(page, "Leather tote");
  await expect(tote.getByRole("img")).toBeVisible();
  await expect(tote.getByText("Tan")).toBeVisible();
  await expect(tote.getByRole("combobox", { name: "Quantity" })).toHaveValue("1");

  const prices = await lines(page).getByTestId("line-total").allTextContents();
  const subtotal = money(await page.getByTestId("subtotal").textContent());
  expect(subtotal).toBe(prices.map(money).reduce((a, b) => a + b, 0));
  expect(money(await page.getByTestId("total").textContent())).toBe(subtotal);
  await expect(page.getByText("Complimentary").first()).toBeVisible();
  await expect(page.getByText("No taxes are charged in this demo")).toBeVisible();
  await expect(page.getByText("Payments run in Stripe test mode — no real money")).toBeVisible();
});

test("changing a quantity updates the totals and the header count", async ({ page }) => {
  await add(page, TOTE);
  await openBag(page);
  const unit = money(await page.getByTestId("subtotal").textContent());
  const answered = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bag");
  await line(page, "Leather tote").getByRole("combobox", { name: "Quantity" }).selectOption("3");
  await answered;
  await expect(page.getByTestId("subtotal")).toHaveText(new RegExp(`${(unit * 3).toLocaleString("en-US")}`));
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 3 items");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shopping bag (3)");
});

test("Remove leaves an Undo that puts the line back", async ({ page }) => {
  await add(page, TOTE);
  await add(page, SHOE);
  await openBag(page);
  await line(page, "Leather tote").getByRole("button", { name: "Remove" }).click();
  const undo = page.getByRole("button", { name: "Undo" });
  await expect(page.getByText("Leather tote removed.")).toBeVisible();
  await expect(undo).toBeFocused();
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 1 item");

  await undo.click();
  await expect(line(page, "Leather tote")).toBeVisible();
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 2 items");
});

test("Move to saved items takes the line out and saves the product", async ({ page }) => {
  await add(page, TOTE);
  await openBag(page);
  await line(page, "Leather tote").getByRole("button", { name: "Move to saved items" }).click();
  await expect(page.getByText("Your bag is empty")).toBeVisible();
  await expect(page.getByRole("link", { name: /You have 1 saved item/ })).toBeVisible();
  await gotoHydrated(page, TOTE, (p) => p.getByRole("button", { name: /^(Saved|Save for later)$/ }));
  await expect(page.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
});

test("explains a line lowered to the stock left, and keeps a sold-out line out of the total", async ({ page }) => {
  await add(page, TOTE);
  await add(page, SHOE);
  // The stock notes come from the server's live stock; rewrite its answer to show both at once.
  await page.route("**/api/bag", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const bag = await response.json();
    bag.lines = bag.lines.map((l: { slug: string; note: string | null; stock: number }) =>
      l.slug === "leather-tote-tan" ? { ...l, note: "reduced", stock: 1 } : { ...l, note: "sold-out", stock: 0 },
    );
    const tote = bag.lines.find((l: { slug: string }) => l.slug === "leather-tote-tan");
    bag.count = tote.quantity;
    bag.subtotal = tote.quantity * tote.unitPrice;
    await route.fulfill({ response, json: bag });
  });
  await openBag(page);
  await expect(line(page, "Leather tote").getByText("Only 1 left — we've updated your bag")).toBeVisible();
  const shoe = line(page, "Double-monk shoe");
  await expect(shoe.getByText("Sold out")).toBeVisible();
  await expect(shoe.getByRole("button", { name: "Move to saved items" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Shopping bag (1)");
});

test("Checkout is disabled when nothing in the bag can be bought", async ({ page }) => {
  await add(page, TOTE);
  await page.route("**/api/bag", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const bag = await response.json();
    bag.lines = bag.lines.map((l: object) => ({ ...l, note: "sold-out", stock: 0 }));
    bag.count = 0;
    bag.subtotal = 0;
    await route.fulfill({ response, json: bag });
  });
  await openBag(page);
  for (const checkout of await page.getByRole("button", { name: /^Checkout/ }).all()) await expect(checkout).toBeDisabled();
});

test("an empty bag says so and offers New in, Women and Men", async ({ page }) => {
  await gotoHydrated(page, "/bag", (p) => p.getByRole("heading", { level: 1 }));
  await expect(page.getByText("Your bag is empty")).toBeVisible();
  const main = page.getByRole("main");
  for (const [name, href] of [
    ["New in", "/collections/new"],
    ["Women", "/collections/women"],
    ["Men", "/collections/men"],
  ]) {
    await expect(main.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
  }
});

test("after Undo has had focus, a later change keeps focus where the shopper is", async ({ page }) => {
  await add(page, TOTE);
  await add(page, SHOE);
  await openBag(page);
  await line(page, "Leather tote").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
  const quantity = line(page, "Double-monk shoe").getByRole("combobox", { name: "Quantity" });
  // The shopper moves on to another line (selectOption alone doesn't move focus).
  await quantity.focus();
  const answered = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/bag");
  await quantity.selectOption("2");
  await answered;
  await expect(bagLink(page)).toHaveAccessibleName("Bag, 2 items");
  await expect(quantity).toBeFocused();
});

test("a failed change keeps the bag on screen and says what went wrong", async ({ page }) => {
  await add(page, TOTE);
  await openBag(page);
  // The change fails, and so does the re-read that follows it.
  await page.route("**/api/bag", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 500, json: { ok: false, error: "failed", message: "Something went wrong. Try again." } })
      : route.fulfill({ status: 500, body: "" }),
  );
  const reread = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === "/api/bag");
  await line(page, "Leather tote").getByRole("combobox", { name: "Quantity" }).selectOption("2");
  await reread;
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Something went wrong. Try again.");
  await expect(line(page, "Leather tote").getByRole("combobox", { name: "Quantity" })).toHaveValue("1");
  await expect(page.getByText("We couldn't load your bag.")).toHaveCount(0);
});

test("a failed remove puts the line back and returns focus to it", async ({ page }) => {
  await add(page, TOTE);
  await openBag(page);
  await page.route("**/api/bag", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 500, json: { ok: false, error: "failed", message: "Something went wrong. Try again." } }) : route.continue(),
  );
  await line(page, "Leather tote").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Something went wrong. Try again.");
  await expect(line(page, "Leather tote").getByRole("combobox", { name: "Quantity" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
});

test("Undo of an item that sold out meanwhile says so instead of announcing it back", async ({ page }) => {
  await add(page, TOTE);
  await add(page, SHOE);
  await openBag(page);
  await line(page, "Leather tote").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeFocused();
  // The server answers as if none were left.
  await page.route("**/api/bag", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    const result = await response.json();
    if (result.ok) result.data.bag.lines = result.data.bag.lines.filter((l: { slug: string }) => l.slug !== "leather-tote-tan");
    await route.fulfill({ response, json: result });
  });
  await page.getByRole("button", { name: "Undo" }).click();
  const note = page.getByText("Leather tote is sold out, so it couldn't go back in your bag.");
  await expect(note).toBeVisible();
  await expect(note).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Leather tote is sold out.");
});

test("each line's controls name its product", async ({ page }) => {
  await add(page, TOTE);
  await openBag(page);
  const tote = line(page, "Leather tote");
  await expect(tote.getByRole("combobox")).toHaveAccessibleName("Quantity, Leather tote");
  await expect(tote.getByRole("button", { name: /^Remove/ })).toHaveAccessibleName("Remove Leather tote");
  await expect(tote.getByRole("button", { name: /^Move/ })).toHaveAccessibleName("Move to saved items: Leather tote");
});
