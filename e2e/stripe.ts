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
 * Stripe's frames, one per Element. Link and Stripe's own tools add hidden frames with the same
 * titles, so these take the visible one; locators inside then wait for Stripe to load (which can
 * take 20 s with several tests at once on a slow connection).
 */
const addressFrame = (page: Page) => page.locator('iframe[title="Secure address input frame"]').visible().first().contentFrame();
const paymentFrame = (page: Page) => page.locator('iframe[title="Secure payment input frame"]').visible().first().contentFrame();
const STRIPE_LOAD = { timeout: 60_000 };

/** Fills Stripe's address fields with a US address, and the phone number. */
export async function fillAddress(page: Page) {
  const frame = addressFrame(page);
  await frame.getByLabel("Full name").fill("Ada Lovelace", STRIPE_LOAD);
  // One "Address" field that expands into line 1, line 2, city, state and ZIP once typed in; its
  // suggestions list is closed with Escape.
  const line1 = frame.getByLabel(/^Address( line 1)?$/);
  await line1.fill("1 Main Street");
  await line1.press("Escape");
  await frame.getByLabel("City").fill("Brooklyn");
  await frame.getByLabel("State").selectOption("NY");
  await frame.getByLabel("ZIP code").fill("11201");
  // The phone number is the site's own field, beside Stripe's.
  await page.getByRole("textbox", { name: "Phone number" }).fill("(201) 555-0123");
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
