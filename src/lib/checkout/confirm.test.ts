import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { ensureCart } from "@/lib/bag/cart";
import { addLine } from "@/lib/bag/mutations";
import type { FulfilDeps } from "@/lib/orders/fulfil";
import { createFakeProvider, type FakeProvider } from "@/lib/payments/fake";
import { createTestDb } from "@/test/db";
import { confirmCheckoutWith } from "./confirm";
import { startCheckoutWith } from "./start";

let db: SeedDatabase;
let fake: FakeProvider;
let deps: FulfilDeps;

beforeEach(async () => {
  db = await createTestDb();
  fake = createFakeProvider();
  deps = { db, transact: (fn) => db.transaction(fn), provider: fake.provider, baseUrl: "https://orra.test", secret: "s".repeat(32), send: async () => ({ ok: true }), defer: () => {} };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

async function paid(cart: { userId: string | null; guestCartId: string | null }, lines: Record<string, number>) {
  const { id } = await ensureCart(db, cart);
  for (const [slug, quantity] of Object.entries(lines)) await addLine(db, id, slug, quantity);
  const ref = cart.userId ? cart : { userId: null, guestCartId: id };
  const result = await startCheckoutWith(
    { db, transact: (fn) => db.transaction(fn), provider: () => fake.provider, rateLimit: false, baseUrl: "https://orra.test" },
    { cart: ref, email: "shopper@example.test", ip: null },
  );
  if (!result.ok) throw new Error(result.message);
  fake.set(`fake_${fake.started}`, { status: "authorised", summary: "Visa ending 4242" });
  return { cart: ref, checkoutId: result.data.checkoutId };
}

const addUser = (id: string) => db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, 'Ada', ${`${id}@example.test`}, false, now(), now())`);

describe("confirmCheckout", () => {
  it("fulfils a guest's own checkout and answers the order, with the bag's new count", async () => {
    const { cart, checkoutId } = await paid({ userId: null, guestCartId: null }, { "leather-tote-tan": 1 });
    await addLine(db, cart.guestCartId!, "double-monk-shoe", 2);
    const { answer, count } = await confirmCheckoutWith(deps, { cart, checkoutId });
    expect(answer).toMatchObject({ status: "confirmed", signedIn: false, order: { number: "ORR-10001", email: "shopper@example.test", paymentSummary: "Visa ending 4242" } });
    // The tote was bought; the shoes added since are still in the bag.
    expect(count).toBe(2);
    expect(JSON.stringify(answer)).not.toContain(checkoutId);
    expect(JSON.stringify(answer)).not.toContain("fake_");
  });

  it("answers a signed-in shopper's own checkout as signed in", async () => {
    await addUser("u1");
    const { cart, checkoutId } = await paid({ userId: "u1", guestCartId: null }, { "leather-tote-tan": 1 });
    expect((await confirmCheckoutWith(deps, { cart, checkoutId })).answer).toMatchObject({ status: "confirmed", signedIn: true });
  });

  it("tells anyone else only that an order was received, and does nothing", async () => {
    await addUser("u1");
    await addUser("u2");
    const guest = await paid({ userId: null, guestCartId: null }, { "leather-tote-tan": 1 });
    const other = await ensureCart(db, { userId: null, guestCartId: null });
    expect(await confirmCheckoutWith(deps, { cart: { userId: null, guestCartId: other.id }, checkoutId: guest.checkoutId })).toEqual({ answer: { status: "received" }, count: null });
    expect(await confirmCheckoutWith(deps, { cart: { userId: null, guestCartId: null }, checkoutId: guest.checkoutId })).toEqual({ answer: { status: "received" }, count: null });
    // A signed-in user isn't a guest's owner, even holding that guest's cookie.
    expect((await confirmCheckoutWith(deps, { cart: { userId: "u2", guestCartId: guest.cart.guestCartId }, checkoutId: guest.checkoutId })).answer).toEqual({ status: "received" });

    const mine = await paid({ userId: "u1", guestCartId: null }, { "double-monk-shoe": 1 });
    expect((await confirmCheckoutWith(deps, { cart: { userId: "u2", guestCartId: null }, checkoutId: mine.checkoutId })).answer).toEqual({ status: "received" });
    expect((await confirmCheckoutWith(deps, { cart: { userId: null, guestCartId: null }, checkoutId: "00000000-0000-4000-8000-000000000000" })).answer).toEqual({ status: "received" });
    expect(fake.payments.get("fake_1")?.settled).toBe(0);
    expect(fake.payments.get("fake_2")?.settled).toBe(0);
  });

  it("passes on pending and sold-out answers", async () => {
    const { cart, checkoutId } = await paid({ userId: null, guestCartId: null }, { "leather-tote-tan": 1 });
    fake.set("fake_1", { status: "pending" });
    expect((await confirmCheckoutWith(deps, { cart, checkoutId })).answer).toEqual({ status: "pending" });
  });
});
