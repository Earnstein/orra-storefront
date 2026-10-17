import type { Page } from "@playwright/test";

/**
 * Whether checkout can run: Stripe's test keys are set. CI gets them as secrets; locally they're in
 * .env.local, which the test runner doesn't read on its own (only that file: .env holds
 * production's database URL). Values are never printed.
 */
export function stripeConfigured(): boolean {
  if (!process.env.E2E_BASE_URL) {
    try {
      process.loadEnvFile(".env.local");
    } catch {
      // No .env.local: rely on the environment.
    }
  }
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

/**
 * Stripe's card frame. Link and Stripe's own tools add hidden frames with the same
 * titles, so these take the visible one; locators inside then wait for Stripe to load (which can
 * take 20 s with several tests at once on a slow connection).
 */
const paymentFrame = (page: Page) => page.locator('iframe[title="Secure payment input frame"]').visible().first().contentFrame();
const STRIPE_LOAD = { timeout: 60_000 };

/** Fills the delivery fields (the site's own, beside Stripe's card fields) with a US address and phone. */
export async function fillAddress(page: Page) {
  const form = page.getByRole("form", { name: "Delivery and payment" });
  await form.getByRole("textbox", { name: "Full name" }).fill("Ada Lovelace");
  await form.getByRole("textbox", { name: "Address", exact: true }).fill("1 Main Street");
  await form.getByRole("textbox", { name: "City" }).fill("Brooklyn");
  // The State list filters as you type; choosing the option sets it.
  await form.getByRole("combobox", { name: "State" }).fill("New Y");
  await page.getByRole("option", { name: "New York" }).click();
  await form.getByRole("textbox", { name: "ZIP code" }).fill("11201");
  await form.getByRole("textbox", { name: "Phone number" }).fill("(201) 555-0123");
}

/** Types a card into Stripe's Payment Element (any future date, any CVC). */
export async function fillCard(page: Page, number: string) {
  const frame = paymentFrame(page);
  await frame.getByLabel("Card number").fill(number, STRIPE_LOAD);
  await frame.getByLabel(/^Expiration/).fill("12 / 34");
  await frame.getByLabel("Security code").fill("123");
}

export const TEST_CARDS = { visa: "4242424242424242", declined: "4000000000000002" } as const;

/**
 * Presses Pay. From the keyboard, not a click: Stripe's card frame keeps growing for a moment after
 * the last field is typed, which can move the button between Playwright's scroll and its click.
 */
export async function pay(page: Page) {
  await page.getByRole("button", { name: /^Pay \$/ }).press("Enter");
}
