import type { OrderShipping } from "@/db/schema/orders";
import { ensureCart } from "@/lib/bag/cart";
import { addLine } from "@/lib/bag/mutations";
import { startCheckoutWith } from "@/lib/checkout/start";
import type { SeedDatabase } from "@/db/seed";
import { fulfil } from "@/lib/orders/fulfil";
import type { FakeProvider } from "@/lib/payments/fake";

export const TEST_SHIPPING: OrderShipping = { name: "Ada Lovelace", line1: "1 Main St", line2: "Apt 4", city: "Springfield", state: "IL", postalCode: "62701", country: "US" };

/**
 * A paid order, made the way the store makes one: a bag, a hold, the payment authorised (fake
 * provider), then fulfilment captures it.
 */
export async function placeOrder(
  db: SeedDatabase,
  fake: FakeProvider,
  lines: Record<string, number>,
  { userId = null as string | null, email = "shopper@example.test", shipping = TEST_SHIPPING } = {},
): Promise<{ orderId: string; number: string; reference: string }> {
  const { id: cartId } = await ensureCart(db, { userId, guestCartId: null });
  for (const [slug, quantity] of Object.entries(lines)) await addLine(db, cartId, slug, quantity);
  const transact: Parameters<typeof startCheckoutWith>[0]["transact"] = (fn) => db.transaction(fn);
  const started = await startCheckoutWith(
    { db, transact, provider: () => fake.provider, rateLimit: false, baseUrl: "https://orra.test" },
    { cart: { userId, guestCartId: userId ? null : cartId }, email, ip: null },
  );
  if (!started.ok) throw new Error(started.message);
  const reference = `fake_${fake.started}`;
  fake.set(reference, { status: "authorised", summary: "Visa ending 4242", shipping });
  const result = await fulfil(
    { db, transact, provider: fake.provider, baseUrl: "https://orra.test", secret: "s".repeat(32), send: async () => ({ ok: true }), defer: () => {} },
    started.data.checkoutId,
  );
  if (result.status !== "confirmed") throw new Error(`placeOrder: ${result.status}`);
  return { orderId: result.order.id, number: result.order.number, reference };
}
