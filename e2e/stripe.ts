import { expect, type Page } from "@playwright/test";

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

/** Stripe's frames (one per Element). */
const addressFrame = (page: Page) => page.frameLocator('iframe[title*="address" i]').first();
const paymentFrame = (page: Page) => page.frameLocator('iframe[title*="payment" i]').first();

/** Fills Stripe's address fields with a US address. */
export async function fillAddress(page: Page) {
  const frame = addressFrame(page);
  await frame.getByLabel(/full name/i).fill("Ada Lovelace");
  await frame.getByLabel(/address line 1|^address$/i).first().fill("1 Main Street");
  await frame.getByLabel(/city/i).fill("Brooklyn");
  await frame.getByLabel(/zip/i).fill("11201");
  await frame.getByLabel(/state/i).selectOption("NY");
}

/** Types a card into Stripe's Payment Element (any future date, any CVC). */
export async function fillCard(page: Page, number: string) {
  const frame = paymentFrame(page);
  await expect(frame.getByLabel(/card number/i)).toBeVisible({ timeout: 30_000 });
  await frame.getByLabel(/card number/i).fill(number);
  await frame.getByLabel(/expiration/i).fill("12 / 34");
  await frame.getByLabel(/security code|cvc/i).fill("123");
  const zip = frame.getByLabel(/zip/i);
  if (await zip.isVisible().catch(() => false)) await zip.fill("11201");
}

export const TEST_CARDS = { visa: "4242424242424242", declined: "4000000000000002" } as const;
