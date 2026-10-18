import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { products, user as users } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { products as seedProducts } from "@/db/seed/catalog";
import { ensureCart } from "@/lib/bag/cart";
import { addLine } from "@/lib/bag/mutations";
import { createHold } from "@/lib/checkout/holds";
import { cookiesFrom, createTestAuth } from "@/test/auth";
import type { ProductInput } from "./schema";

// The actions run for real against Better Auth and the catalogue on one PGlite; Next's request
// scope is stood in for (as in src/lib/account/actions.test.ts) and updateTag is a spy.
const request = vi.hoisted(() => ({ auth: undefined as unknown, db: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("@/db", () => ({
  get db() {
    return request.db;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
const updateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ updateTag, cacheTag: () => {}, cacheLife: () => {} }));

const { archiveProduct, restoreProduct, saveProduct } = await import("./actions");
const { editorialSlugs, heldUnits } = await import("./mutations");
const { getProduct } = await import("@/lib/catalog/queries");

let t: Awaited<ReturnType<typeof createTestAuth>>;
let db: SeedDatabase;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  db = t.db;
  request.auth = t.auth;
  request.db = db;
});

beforeEach(() => {
  request.headers = new Headers();
  updateTag.mockClear();
});

async function signInAs(role: string) {
  const email = `products-${++next}@example.test`;
  const password = "correct-horse";
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password } });
  await db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
}

/** A seed product as the form would load it. */
async function loaded(slug: string): Promise<ProductInput & { id: number; expectedStock: number }> {
  const [row] = await db.select().from(products).where(eq(products.slug, slug));
  const category = seedProducts.find((p) => p.slug === slug)!.category;
  return {
    id: row.id,
    expectedStock: row.stock,
    name: row.name,
    slug: row.slug,
    categorySlug: category,
    audience: row.audience,
    colour: row.colour,
    colourFamily: row.colourFamily,
    material: row.material,
    price: row.price,
    stock: row.stock,
    description: row.description,
    details: row.details,
    images: row.images,
  };
}

/** A loaded form as a new product's (no id or expected stock). */
function asNew(form: ProductInput & { id?: number; expectedStock?: number }): ProductInput {
  const copy = { ...form };
  delete copy.id;
  delete copy.expectedStock;
  return copy;
}

const plain = seedProducts.find((p) => !editorialSlugs.has(p.slug))!;
const editorial = [...editorialSlugs][0];

describe("saveProduct", () => {
  it("creates a product the storefront then shows, and refreshes the catalogue", async () => {
    await signInAs("demo-admin");
    const result = await saveProduct({ ...asNew(await loaded(plain.slug)), name: "Canvas tote", slug: "canvas-tote-new" });
    expect(result).toMatchObject({ ok: true, data: { slug: "canvas-tote-new" } });
    expect((await getProduct("canvas-tote-new"))?.name).toBe("Canvas tote");
    expect(updateTag).toHaveBeenCalledWith("catalog");
  });

  it("edits the name and price", async () => {
    await signInAs("admin");
    const form = await loaded(plain.slug);
    expect(await saveProduct({ ...form, name: "Renamed", price: 4_200 })).toMatchObject({ ok: true });
    expect(await getProduct(plain.slug)).toMatchObject({ name: "Renamed", price: 4_200 });
  });

  it("refuses a slug another product uses, on the slug field", async () => {
    await signInAs("admin");
    const form = await loaded(plain.slug);
    const other = seedProducts.find((p) => p.slug !== plain.slug)!.slug;
    expect(await saveProduct({ ...form, slug: other })).toMatchObject({ ok: false, error: "invalid", field: "slug" });
    expect(await saveProduct({ ...asNew(form), slug: other })).toMatchObject({ ok: false, error: "invalid", field: "slug" });
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("won't change the slug of a product a story or landing page uses", async () => {
    await signInAs("admin");
    const form = await loaded(editorial);
    expect(await saveProduct({ ...form, slug: `${editorial}-2` })).toEqual({
      ok: false,
      error: "invalid",
      field: "slug",
      message: "Used by a story or landing page, so the slug can't change.",
    });
    expect(await saveProduct({ ...form, name: "Still editable" })).toMatchObject({ ok: true });
  });

  it("refuses a stock change when a sale moved the stock since the form loaded, but keeps other edits saving", async () => {
    await signInAs("admin");
    const form = await loaded(plain.slug);
    await db.update(products).set({ stock: form.expectedStock + 3 }).where(eq(products.id, form.id));
    expect(await saveProduct({ ...form, stock: form.expectedStock + 10 })).toEqual({
      ok: false,
      error: "invalid",
      field: "stock",
      message: "Stock changed while you were editing — reload to see it.",
    });
    expect(await saveProduct({ ...form, name: "Stock untouched" })).toMatchObject({ ok: true });
    expect((await loaded(plain.slug)).stock).toBe(form.expectedStock + 3);
    const fresh = await loaded(plain.slug);
    expect(await saveProduct({ ...fresh, stock: 7 })).toMatchObject({ ok: true });
    expect((await loaded(plain.slug)).stock).toBe(7);
  });

  it("parses what it's sent: bad fields, ids and unknown categories are invalid", async () => {
    await signInAs("admin");
    const form = await loaded(plain.slug);
    expect(await saveProduct({ ...form, price: -5 })).toMatchObject({ ok: false, error: "invalid", field: "price" });
    expect(await saveProduct({ ...form, id: -1 })).toMatchObject({ ok: false, error: "invalid" });
    expect(await saveProduct({ ...form, categorySlug: "no-such-category" })).toMatchObject({ ok: false, field: "categorySlug" });
    expect(await saveProduct({ ...form, id: 999_999 })).toMatchObject({ ok: false, error: "not-found" });
  });

  it("refuses shoppers and signed-out visitors", async () => {
    const form = await loaded(plain.slug);
    expect(await saveProduct({ ...form, name: "Nope" })).toMatchObject({ ok: false, error: "signed-out" });
    await signInAs("user");
    expect(await saveProduct({ ...form, name: "Nope" })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await archiveProduct(form.id)).toMatchObject({ ok: false, error: "forbidden" });
    expect((await getProduct(plain.slug))?.name).not.toBe("Nope");
  });
});

describe("archiveProduct and restoreProduct", () => {
  it("take a product off the storefront and put it back", async () => {
    await signInAs("demo-admin");
    const { id } = await loaded(plain.slug);
    expect(await archiveProduct(id)).toEqual({ ok: true, data: null });
    expect(await getProduct(plain.slug)).toBeUndefined();
    expect(await restoreProduct(id)).toEqual({ ok: true, data: null });
    expect(await getProduct(plain.slug)).toBeDefined();
    expect(updateTag).toHaveBeenCalledTimes(2);
    expect(await archiveProduct(999_999)).toMatchObject({ ok: false, error: "not-found" });
  });
});

describe("heldUnits", () => {
  it("counts what open checkouts hold", async () => {
    const { id } = await loaded(plain.slug);
    expect(await heldUnits(db, id)).toBe(0);
    const cart = await ensureCart(db, { userId: null, guestCartId: null });
    await db.update(products).set({ stock: 5 }).where(eq(products.id, id));
    await addLine(db, cart.id, plain.slug, 2);
    await createHold(db, { cartId: cart.id, userId: null, email: "a@example.test", expiresAt: new Date(Date.now() + 60_000), lines: [{ productId: id, name: "x", unitPrice: 1, quantity: 2 }] });
    expect(await heldUnits(db, id)).toBe(2);
  });
});
