import "server-only";

import { sql } from "drizzle-orm";

import type { SeedDatabase } from "@/db/seed";
import { seedCatalog } from "@/db/seed";
import { products as seedProducts } from "@/db/seed/catalog";
import { rowsOf } from "@/lib/bag/queries";
import { releaseExpiredHolds } from "@/lib/checkout/holds";

/** Carts untouched, and finished checkouts and orders placed, longer ago than this are cleared. */
export const DEMO_DATA_DAYS = 30;
/** Photos uploaded more recently than this are kept: the product they're for may not be saved yet. */
const PHOTO_GRACE_MS = 60 * 60_000;
/** Unsent confirmation emails retried per night (newest first); the M7 domain is what fixes delivery. */
const EMAILS_PER_RUN = 25;

export type ResetDeps = {
  db: SeedDatabase;
  /** Uploaded photos under `products/` in the Blob store, with their upload times ([] when uploads aren't configured). */
  listImages(): Promise<{ url: string; uploadedAt: Date }[]>;
  deleteImages(urls: string[]): Promise<void>;
  /** Sends these orders' confirmations (M5's claim, send and record). */
  sendEmails(orderIds: string[]): Promise<void>;
  now?: Date;
};

export type ResetSummary = {
  releasedHolds: number;
  deletedCarts: number;
  deletedCheckouts: number;
  deletedOrders: number;
  restoredProducts: number;
  deletedProducts: number;
  archivedProducts: number;
  deletedImages: number;
  emailsSent: number;
  /** The steps that threw (logged); the steps after them still ran. */
  failedSteps: string[];
};

const count = async (db: SeedDatabase, query: ReturnType<typeof sql>) => Number(rowsOf<{ n: number }>(await db.execute(query))[0]?.n ?? 0);

/**
 * Puts the public demo back to its seed every night (the spec's steps, in order). Each step is one
 * statement or one idempotent call, so a step cut off is finished by the next run; a step that
 * throws is logged and listed in `failedSteps`, and the steps after it still run. Accounts,
 * sessions and roles are never touched; saved items and bag lines go only with a deleted product.
 */
export async function resetDemo(deps: ResetDeps): Promise<ResetSummary> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const cutoff = new Date(now.getTime() - DEMO_DATA_DAYS * 24 * 60 * 60_000);
  const seedSlugs = seedProducts.map((product) => product.slug);
  const summary: ResetSummary = {
    releasedHolds: 0,
    deletedCarts: 0,
    deletedCheckouts: 0,
    deletedOrders: 0,
    restoredProducts: 0,
    deletedProducts: 0,
    archivedProducts: 0,
    deletedImages: 0,
    emailsSent: 0,
    failedSteps: [],
  };

  async function step(name: string, run: () => Promise<void>) {
    try {
      await run();
    } catch (error) {
      console.error(`demo reset: step "${name}" failed`, error instanceof Error ? error.message : error);
      summary.failedSteps.push(name);
    }
  }

  // 1. Holds that ran out give their stock back (before the seed's stock is worked out).
  await step("holds", async () => {
    summary.releasedHolds = await releaseExpiredHolds(db);
  });

  // 2. Old data: orders first (they point at their checkouts), then finished checkouts nothing
  //    points at, then carts nobody has touched.
  await step("old-data", async () => {
    summary.deletedOrders = await count(db, sql`with gone as (delete from orders where created_at < ${cutoff} returning 1) select count(*)::int as n from gone`);
    summary.deletedCheckouts = await count(
      db,
      sql`with gone as (
        delete from checkouts c where c.status <> 'open' and c.created_at < ${cutoff}
          and not exists (select 1 from orders o where o.checkout_id = c.id)
        returning 1) select count(*)::int as n from gone`,
    );
    summary.deletedCarts = await count(db, sql`with gone as (delete from carts where updated_at < ${cutoff} returning 1) select count(*)::int as n from gone`);
  });

  // 3. The seed's catalogue: content, stock (less open holds) and on sale again.
  await step("seed", async () => {
    summary.restoredProducts = (await seedCatalog(db, now)).products;
  });

  // 4. Products made in the demo: deleted, or archived while a checkout or order still points at
  //    them (holds can't lose their product; a later night deletes them once those have gone).
  await step("products", async () => {
    const notSeed = sql`p.slug not in (${sql.join(
      seedSlugs.map((slug) => sql`${slug}`),
      sql`, `,
    )})`;
    const referenced = sql`(exists (select 1 from checkout_items i where i.product_id = p.id) or exists (select 1 from order_items oi where oi.product_id = p.id))`;
    summary.deletedProducts = await count(db, sql`with gone as (delete from products p where ${notSeed} and not ${referenced} returning 1) select count(*)::int as n from gone`);
    summary.archivedProducts = await count(
      db,
      sql`with hidden as (update products p set archived_at = now() where ${notSeed} and p.archived_at is null and ${referenced} returning 1) select count(*)::int as n from hidden`,
    );
  });

  // 5. Uploaded photos nothing shows any more: not on a product, not on an order line.
  await step("images", async () => {
    const uploaded = (await deps.listImages()).filter((image) => image.uploadedAt.getTime() < now.getTime() - PHOTO_GRACE_MS);
    if (uploaded.length === 0) return;
    const inUse = new Set(
      rowsOf<{ src: string }>(
        await db.execute(sql`
          select image ->> 'src' as src from products p, jsonb_array_elements(p.images) as image
          union select image ->> 'src' from order_items where image is not null`),
      ).map((row) => row.src),
    );
    const unused = uploaded.map((image) => image.url).filter((url) => !inUse.has(url));
    if (unused.length === 0) return;
    await deps.deleteImages(unused);
    summary.deletedImages = unused.length;
  });

  // 6. Confirmation emails that never went out (a send that failed, a function cut off).
  await step("emails", async () => {
    const unsent = rowsOf<{ id: string }>(
      await db.execute(sql`
        select id from orders where status in ('paid', 'fulfilled') and email_sent_at is null
        order by created_at desc limit ${EMAILS_PER_RUN}`),
    ).map((row) => row.id);
    if (unsent.length === 0) return;
    await deps.sendEmails(unsent);
    summary.emailsSent = await count(
      db,
      sql`select count(*)::int as n from orders where email_sent_at is not null and id in (${sql.join(
        unsent.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  });

  return summary;
}
