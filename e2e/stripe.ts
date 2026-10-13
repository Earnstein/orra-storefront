import { expect, type Frame, type Page } from "@playwright/test";

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
 * The Stripe frame holding a field. Several of Stripe's frames share a title (Link and Stripe's own
 * tools add hidden ones), so this looks for the frame that has the field, waiting until it loads.
 */
async function frameWith(page: Page, label: string | RegExp): Promise<Frame> {
  let found: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (!frame.url().includes("stripe.com")) continue;
          if (await frame.getByLabel(label).count().catch(() => 0)) {
            found = frame;
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  return found!;
}

/** Fills Stripe's address fields with a US address, and the phone number. */
export async function fillAddress(page: Page) {
  const frame = await frameWith(page, "Full name");
  await frame.getByLabel("Full name").fill("Ada Lovelace");
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
  const frame = await frameWith(page, "Card number");
  await frame.getByLabel("Card number").fill(number);
  await frame.getByLabel(/^Expiration/).fill("12 / 34");
  await frame.getByLabel("Security code").fill("123");
}

export const TEST_CARDS = { visa: "4242424242424242", declined: "4000000000000002" } as const;
