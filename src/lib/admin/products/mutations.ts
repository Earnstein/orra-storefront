import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { categories, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import type { ProductInput, ProductResult } from "./schema";

// The admin's product writes. Callers (actions.ts) check the admin's permission and parse the
// input with productInput first; these only answer what the database says about it.

const SLUG_TAKEN = { ok: false, error: "invalid", field: "slug", message: "Another product already uses this slug." } as const;
const UNKNOWN_CATEGORY = { ok: false, error: "invalid", field: "categorySlug", message: "Choose a category." } as const;
const SLUG_LOCKED = { ok: false, error: "invalid", field: "slug", message: "A product's slug can't change once it's created." } as const;
const NOT_FOUND = { ok: false, error: "not-found", message: "This product no longer exists." } as const;

/** Units of a product open checkouts are holding right now (out of its stock until they end). */
export async function heldUnits(db: SeedDatabase, productId: number): Promise<number> {
  const result = await db.execute(sql`
    select coalesce(sum(h.quantity), 0)::int as held from checkout_items h join checkouts c on c.id = h.checkout_id
    where c.status = 'open' and h.product_id = ${productId}`);
  return Number((result as unknown as { rows: { held: number }[] }).rows[0]?.held ?? 0);
}

function columns(input: ProductInput, categoryId: number) {
  const fields: Omit<ProductInput, "categorySlug"> & { categorySlug?: string } = { ...input };
  delete fields.categorySlug;
  return { ...fields, categoryId };
}

async function categoryId(db: SeedDatabase, slug: string): Promise<number | undefined> {
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  return row?.id;
}

export async function createProduct(db: SeedDatabase, input: ProductInput): Promise<ProductResult<{ id: number; slug: string }>> {
  const category = await categoryId(db, input.categorySlug);
  if (category === undefined) return UNKNOWN_CATEGORY;
  const [row] = await db
    .insert(products)
    .values(columns(input, category))
    .onConflictDoNothing({ target: products.slug })
    .returning({ id: products.id, slug: products.slug });
  return row ? { ok: true, data: row } : SLUG_TAKEN;
}

/**
 * Saves an edit. The slug can't change once a product exists: bags and saved items in browsers,
 * shared links and the stories and landing pages refer to products by slug, and a renamed page's
 * old address would keep serving its last render. Stock is written only when the admin changed it,
 * and only if it still holds `expectedStock` (what the form loaded): a sale or a hold since then
 * refuses the save instead of overwriting it. Without a stock change, a sale meanwhile is kept.
 */
export async function updateProduct(db: SeedDatabase, id: number, input: ProductInput, expectedStock: number): Promise<ProductResult<{ id: number; slug: string }>> {
  const [[current], category] = await Promise.all([
    db.select({ slug: products.slug }).from(products).where(eq(products.id, id)),
    categoryId(db, input.categorySlug),
  ]);
  if (!current) return NOT_FOUND;
  if (current.slug !== input.slug) return SLUG_LOCKED;
  if (category === undefined) return UNKNOWN_CATEGORY;

  const changesStock = input.stock !== expectedStock;
  const { stock, ...fields } = columns(input, category);
  const [row] = await db
    .update(products)
    .set(changesStock ? { ...fields, stock } : fields)
    .where(and(eq(products.id, id), changesStock ? eq(products.stock, expectedStock) : undefined))
    .returning({ id: products.id, slug: products.slug });
  if (row) return { ok: true, data: row };
  return { ok: false, error: "invalid", field: "stock", message: "Stock changed while you were editing — reload to see it." };
}

/** Archives (hides from the storefront) or restores a product. */
export async function setArchived(db: SeedDatabase, id: number, archived: boolean): Promise<ProductResult<{ slug: string }>> {
  const [row] = await db
    .update(products)
    .set({ archivedAt: archived ? sql`now()` : null })
    .where(eq(products.id, id))
    .returning({ slug: products.slug });
  return row ? { ok: true, data: row } : NOT_FOUND;
}
