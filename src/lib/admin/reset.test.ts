import { eq, inArray, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { carts, checkouts, orderItems, orders, products, savedItems, session as sessions, user as users } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { products as seedProducts } from "@/db/seed/catalog";
import { ensureCart } from "@/lib/bag/cart";
import { addLine } from "@/lib/bag/mutations";
import { startCheckoutWith } from "@/lib/checkout/start";
import { createFakeProvider, type FakeProvider } from "@/lib/payments/fake";
import { createTestDb } from "@/test/db";
import { placeOrder } from "@/test/orders";
import { createProduct } from "./products/mutations";
import { resetDemo, type ResetDeps } from "./reset";

let db: SeedDatabase;
let fake: FakeProvider;
let deleted: string[][];
let images: { url: string; uploadedAt: Date }[];
let emailed: string[];

const NOW = new Date();
const DAY = 24 * 60 * 60_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);
const BLOB = "https://abc123.public.blob.vercel-storage.com/products";

beforeEach(async () => {
  db = await createTestDb();
  fake = createFakeProvider();
  deleted = [];
  images = [];
  emailed = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function deps(change: Partial<ResetDeps> = {}): ResetDeps {
  return {
    db,
    now: NOW,
    listImages: async () => images,
    deleteImages: async (urls) => {
      deleted.push(urls);
    },
    sendEmails: async (orderIds) => {
      emailed.push(...orderIds);
      if (orderIds.length > 0) await db.update(orders).set({ emailSentAt: new Date() }).where(inArray(orders.id, orderIds));
    },
    ...change,
  };
}

const product = async (slug: string) => (await db.select().from(products).where(eq(products.slug, slug)))[0];
const seed = (slug: string) => seedProducts.find((p) => p.slug === slug)!;

/** A bag holding `quantity` of `slug` in an open checkout (a shopper paying now). */
async function openHold(slug: string, quantity: number) {
  const { id: cartId } = await ensureCart(db, { userId: null, guestCartId: null });
  await addLine(db, cartId, slug, quantity);
  const started = await startCheckoutWith(
    { db, transact: (fn) => db.transaction(fn), provider: () => fake.provider, rateLimit: false, baseUrl: "https://orra.test" },
    { cart: { userId: null, guestCartId: cartId }, email: "shopper@example.test", ip: null },
  );
  if (!started.ok) throw new Error(started.message);
  return { cartId, checkoutId: started.data.checkoutId };
}

/** A product made in the admin (not in the seed). */
async function adminProduct(slug: string, image = "https://images.unsplash.com/photo-1") {
  const base = seed("leather-tote-tan");
  const result = await createProduct(db, {
    name: `Admin ${slug}`,
    slug,
    categorySlug: base.category,
    audience: base.audience,
    colour: base.colour,
    colourFamily: base.colourFamily,
    material: base.material,
    price: 1000,
    stock: 5,
    description: "Made in the demo.",
    details: [],
    images: [{ src: image, alt: "A photo" }],
  });
  if (!result.ok) throw new Error(result.message);
  return result.data;
}

describe("resetDemo", () => {
  it("clears carts, finished checkouts and orders older than 30 days, and keeps recent ones", async () => {
    const old = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const recent = await placeOrder(db, fake, { "double-monk-shoe": 1 });
    const [oldOrder] = await db.select().from(orders).where(eq(orders.id, old.orderId));
    await db.update(orders).set({ createdAt: daysAgo(31) }).where(eq(orders.id, old.orderId));
    await db.update(checkouts).set({ createdAt: daysAgo(31) }).where(eq(checkouts.id, oldOrder!.checkoutId));
    const { id: oldCart } = await ensureCart(db, { userId: null, guestCartId: null });
    await db.update(carts).set({ updatedAt: daysAgo(31) }).where(eq(carts.id, oldCart));
    const { id: recentCart } = await ensureCart(db, { userId: null, guestCartId: null });

    const summary = await resetDemo(deps());

    expect(summary).toMatchObject({ deletedOrders: 1, deletedCheckouts: 1, failedSteps: [] });
    expect(summary.deletedCarts).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(orders).where(eq(orders.id, old.orderId))).toEqual([]);
    expect(await db.select().from(orderItems).where(eq(orderItems.orderId, old.orderId))).toEqual([]);
    expect(await db.select().from(orders).where(eq(orders.id, recent.orderId))).toHaveLength(1);
    expect(await db.select().from(carts).where(eq(carts.id, oldCart))).toEqual([]);
    expect(await db.select().from(carts).where(eq(carts.id, recentCart))).toHaveLength(1);
  });

  it("keeps an old cart while an open checkout is paying from it", async () => {
    const { cartId } = await openHold("leather-tote-tan", 1);
    await db.update(carts).set({ updatedAt: daysAgo(31) }).where(eq(carts.id, cartId));
    await resetDemo(deps());
    expect(await db.select().from(carts).where(eq(carts.id, cartId))).toHaveLength(1);
  });

  it("puts edited seed products back as the seed has them, archived ones included", async () => {
    await db.update(products).set({ name: "Vandalised", price: 50, stock: 0, archivedAt: new Date() }).where(eq(products.slug, "leather-tote-tan"));
    const summary = await resetDemo(deps());
    expect(summary.restoredProducts).toBe(seedProducts.length);
    expect(await product("leather-tote-tan")).toMatchObject({ name: seed("leather-tote-tan").name, price: seed("leather-tote-tan").price, stock: seed("leather-tote-tan").stock, archivedAt: null });
  });

  it("restores a held product's stock less what open checkouts hold, never below 0", async () => {
    const slug = "leather-tote-tan";
    await openHold(slug, 2);
    await db.update(products).set({ stock: 0 }).where(eq(products.slug, slug));
    await resetDemo(deps());
    expect((await product(slug))!.stock).toBe(seed(slug).stock - 2);
  });

  it("leaves the stock at exactly the seed's once that hold is released", async () => {
    const slug = "leather-tote-tan";
    const { checkoutId } = await openHold(slug, 2);
    await resetDemo(deps());
    const { releaseHold } = await import("@/lib/checkout/holds");
    expect(await releaseHold(db, checkoutId)).toBe(true);
    expect((await product(slug))!.stock).toBe(seed(slug).stock);
  });

  it("deletes products made in the demo, and archives one a recent checkout still holds", async () => {
    const loose = await adminProduct("demo-made-loose");
    const held = await adminProduct("demo-made-held");
    await openHold(held.slug, 1);

    const summary = await resetDemo(deps());

    expect(summary).toMatchObject({ deletedProducts: 1, archivedProducts: 1 });
    expect(await product(loose.slug)).toBeUndefined();
    expect((await product(held.slug))!.archivedAt).toBeInstanceOf(Date);
  });

  it("deletes uploaded photos nothing uses, keeping those on products, on orders and those just uploaded", async () => {
    const onProduct = `${BLOB}/on-product-a1.jpg`;
    const onOrder = `${BLOB}/on-order-b2.jpg`;
    const unused = `${BLOB}/unused-c3.jpg`;
    const justUploaded = `${BLOB}/just-uploaded-d4.jpg`;
    // The reset puts the seed's photos back on seed products, so the kept one is on an admin product
    // a checkout still holds (archived, not deleted).
    await adminProduct("demo-photo-held", onProduct);
    await openHold("demo-photo-held", 1);
    const order = await placeOrder(db, fake, { "double-monk-shoe": 1 });
    await db.update(orderItems).set({ image: { src: onOrder, alt: "Bought" } }).where(eq(orderItems.orderId, order.orderId));
    const withQuery = `${BLOB}/with-query-e5.jpg`;
    await adminProduct("demo-photo-query", `${withQuery}?v=2`);
    await openHold("demo-photo-query", 1);
    images = [
      { url: withQuery, uploadedAt: daysAgo(2) },
      { url: onProduct, uploadedAt: daysAgo(2) },
      { url: onOrder, uploadedAt: daysAgo(2) },
      { url: unused, uploadedAt: daysAgo(2) },
      { url: justUploaded, uploadedAt: new Date(NOW.getTime() - 10 * 60_000) },
    ];

    const summary = await resetDemo(deps());

    expect(deleted).toEqual([[unused]]);
    expect(summary.deletedImages).toBe(1);
  });

  it("sends confirmation emails that never went out, for paid and fulfilled orders of the last 2 days only", async () => {
    const unsent = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const sent = await placeOrder(db, fake, { "double-monk-shoe": 1 });
    const cancelled = await placeOrder(db, fake, { "round-sunglasses": 1 });
    // Older than 2 days: its shopper's address is past saving until M7's domain.
    const stale = await placeOrder(db, fake, { "floral-pump": 1 });
    await db.update(orders).set({ createdAt: daysAgo(3) }).where(eq(orders.id, stale.orderId));
    await db.update(orders).set({ emailSentAt: new Date() }).where(eq(orders.id, sent.orderId));
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, cancelled.orderId));

    const summary = await resetDemo(deps());

    expect(emailed).toEqual([unsent.orderId]);
    expect(summary.emailsSent).toBe(1);
  });

  it("lists a step that fails and still runs the steps after it", async () => {
    const unsent = await placeOrder(db, fake, { "leather-tote-tan": 1 });
    const summary = await resetDemo(
      deps({
        listImages: async () => {
          throw new Error("blob unreachable");
        },
      }),
    );
    expect(summary.failedSteps).toEqual(["images"]);
    expect(emailed).toEqual([unsent.orderId]);
  });

  it("changes nothing when run again", async () => {
    await db.update(products).set({ name: "Vandalised" }).where(eq(products.slug, "leather-tote-tan"));
    await adminProduct("demo-made-twice");
    await resetDemo(deps());
    const before = await db.select({ slug: products.slug, name: products.name, price: products.price, stock: products.stock, archivedAt: products.archivedAt, createdAt: products.createdAt }).from(products).orderBy(products.slug);

    const again = await resetDemo(deps());

    expect(again).toMatchObject({ releasedHolds: 0, deletedCarts: 0, deletedCheckouts: 0, deletedOrders: 0, deletedProducts: 0, archivedProducts: 0, deletedImages: 0, emailsSent: 0, failedSteps: [] });
    expect(await db.select({ slug: products.slug, name: products.name, price: products.price, stock: products.stock, archivedAt: products.archivedAt, createdAt: products.createdAt }).from(products).orderBy(products.slug)).toEqual(before);
  });

  it("never touches accounts, sessions, roles or saved items of seed products", async () => {
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified, role, created_at, updated_at)
      values ('owner_1', 'Owner', 'owner@example.test', true, 'admin', now() - interval '90 days', now() - interval '90 days')`);
    await db.execute(sql`
      insert into session (id, token, user_id, expires_at, created_at, updated_at)
      values ('session_1', 'token_1', 'owner_1', now() + interval '20 days', now() - interval '40 days', now() - interval '40 days')`);
    const tote = (await product("leather-tote-tan"))!;
    await db.insert(savedItems).values({ userId: "owner_1", productId: tote.id, createdAt: daysAgo(60) });

    await resetDemo(deps());

    expect(await db.select({ role: users.role }).from(users).where(eq(users.id, "owner_1"))).toEqual([{ role: "admin" }]);
    expect(await db.select().from(sessions).where(eq(sessions.id, "session_1"))).toHaveLength(1);
    expect(await db.select().from(savedItems).where(eq(savedItems.userId, "owner_1"))).toHaveLength(1);
  });
});
