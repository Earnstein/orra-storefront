import "server-only";

import { and, asc, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";

import { categories, products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { ADMIN_PAGE_SIZE, sortDirection, type AdminProductParams } from "@/lib/admin/table-params";
import type { CatalogImage } from "@/lib/catalog/types";

export type AdminProductRow = {
  id: number;
  slug: string;
  name: string;
  category: string;
  audience: string;
  /** Cents. */
  price: number;
  stock: number;
  /** Units open checkouts hold (already out of `stock`). */
  held: number;
  archived: boolean;
  image: CatalogImage | null;
};

/** `%` and `_` typed into the search match themselves, not any text. */
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (character) => `\\${character}`);

/**
 * One page (ADMIN_PAGE_SIZE) of the admin's products, archived or not, searched by name or slug,
 * with the total. Uncached: the admin always sees the database. Pages past the end are clamped.
 */
export async function listAdminProducts(db: SeedDatabase, params: AdminProductParams): Promise<{ rows: AdminProductRow[]; total: number; page: number }> {
  const q = params.q.trim().slice(0, 100);
  const where: SQL[] = [params.status === "archived" ? isNotNull(products.archivedAt) : isNull(products.archivedAt)];
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    where.push(or(ilike(products.name, pattern), ilike(products.slug, pattern))!);
  }
  const direction = sortDirection(params) === "asc" ? asc : desc;
  const order = {
    newest: [direction(products.createdAt)],
    name: [direction(sql`lower(${products.name})`)],
    price: [direction(products.price)],
    stock: [direction(products.stock)],
  }[params.sort];

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(products).where(and(...where));
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(Math.max(1, params.page), pages);
  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      category: categories.name,
      audience: products.audience,
      price: products.price,
      stock: products.stock,
      held: sql<number>`(select coalesce(sum(h.quantity), 0)::int from checkout_items h join checkouts c on c.id = h.checkout_id
        where c.status = 'open' and h.product_id = ${products.id})`,
      archived: sql<boolean>`${products.archivedAt} is not null`,
      image: sql<CatalogImage | null>`${products.images} -> 0`,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...where))
    .orderBy(...order, asc(products.id))
    .limit(ADMIN_PAGE_SIZE)
    .offset((page - 1) * ADMIN_PAGE_SIZE);
  return {
    // JSON comes back parsed from PGlite and Neon, as text from some drivers.
    rows: rows.map((row) => ({ ...row, held: Number(row.held), image: typeof row.image === "string" ? (JSON.parse(row.image) as CatalogImage) : row.image })),
    total,
    page,
  };
}
