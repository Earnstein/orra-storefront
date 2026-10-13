import "server-only";

import { sql } from "drizzle-orm";
import { createAuthMiddleware } from "better-auth/api";

import type { SeedDatabase } from "@/db/seed";
import { ensureCart, findCart } from "./cart";
import { BAG_COUNT_COOKIE, cartCookieName, cartCookieOptions, countCookieOptions, verifyCartCookie } from "./cookies";
import { BAG_LINE_LIMIT, MAX_QUANTITY } from "./limits";
import { readBag } from "./queries";
import { availableTo } from "./stock";
import { releaseGuestHolds } from "@/lib/checkout/holds";

/** `onHoldsReleased` gets the payment references of the guest's released holds, to undo them. */
export type MergeOptions = { onHoldsReleased?: (references: string[]) => void };

/**
 * Moves a guest bag into a user's bag in one statement, then deletes the guest cart. Lines for the
 * same product are summed (capped at stock and MAX_QUANTITY); new lines are added newest first while
 * the bag has room for them (BAG_LINE_LIMIT); sold-out ones are dropped. Only a guest cart (no
 * user) is merged, so a cookie naming someone's account cart moves nothing. The guest cart is
 * deleted first and its lines read from the statement's snapshot: a second sign-in at the same
 * moment waits on that row, then finds it gone and merges nothing, so lines are never added twice.
 */
export async function mergeGuestCart(
  db: SeedDatabase,
  { guestCartId, userId }: { guestCartId: string; userId: string },
  { onHoldsReleased }: MergeOptions = {},
): Promise<{ cartId: string }> {
  const target = await ensureCart(db, { userId, guestCartId: null });
  // The guest's own hold (checkout started, then signed in) would otherwise keep its stock until
  // it expires, capping the very lines being merged. Its payments are handed back to be undone;
  // one finished anyway is a lapsed hold for fulfilment.
  const released = await releaseGuestHolds(db, guestCartId);
  if (released.length > 0) onHoldsReleased?.(released);
  const available = availableTo(target.id, sql.raw("p"));
  await db.execute(sql`
    with guest as (delete from carts where id = ${guestCartId} and user_id is null returning id),
    candidates as (
      select gi.product_id, least(gi.quantity, ${available}, ${MAX_QUANTITY}) as quantity, gi.added_at,
        exists (select 1 from cart_items ui where ui.cart_id = ${target.id} and ui.product_id = gi.product_id) as existing
      from cart_items gi join products p on p.id = gi.product_id
      where gi.cart_id = (select id from guest) and ${available} > 0
    ),
    ranked as (select *, row_number() over (partition by existing order by added_at desc) as rank from candidates),
    merged as (
      insert into cart_items (cart_id, product_id, quantity, added_at)
      select ${target.id}, product_id, quantity, added_at from ranked
      where existing or rank <= ${BAG_LINE_LIMIT} - (select count(*) from cart_items where cart_id = ${target.id})
      on conflict (cart_id, product_id) do update
        set quantity = least(cart_items.quantity + excluded.quantity, (select ${available} from products p where p.id = excluded.product_id), ${MAX_QUANTITY})
      returning product_id
    )
    select (select count(*) from merged) as merged`);
  return { cartId: target.id };
}

/** The user's bag count, merging the guest bag first when the request carries a valid guest cookie. */
async function countAfterSignIn(db: SeedDatabase, userId: string, guestCartId: string | null, options: MergeOptions): Promise<number> {
  const cartId = guestCartId ? (await mergeGuestCart(db, { guestCartId, userId }, options)).cartId : (await findCart(db, { userId, guestCartId: null }))?.id;
  return cartId ? (await readBag(db, cartId)).count : 0;
}

/**
 * A Better Auth after-hook for sign-in and sign-up: merges the guest bag named by the signed cookie
 * into the new session's user, clears the guest cookie and sets the count cookie, so the full page
 * load that follows shows the right bag. Set in auth.ts (server-only), never in the shared options,
 * so the CLI config never imports the database.
 */
export function bagMergeHook(db: SeedDatabase, { secure, secret, ...options }: { secure: boolean; secret: string } & MergeOptions) {
  return createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-up/email") return;
    const userId = ctx.context.newSession?.user.id;
    if (!userId) return;
    const name = cartCookieName(secure);
    const guestCartId = verifyCartCookie(ctx.getCookie(name) ?? undefined, secret);
    try {
      const count = await countAfterSignIn(db, userId, guestCartId, options);
      if (ctx.getCookie(name)) ctx.setCookie(name, "", { ...cartCookieOptions(secure), maxAge: 0 });
      ctx.setCookie(BAG_COUNT_COOKIE, String(Math.min(count, 999)), countCookieOptions(secure));
    } catch (error) {
      // Signing in must never fail because of the bag; the guest bag stays for the next sign-in.
      console.error("[bag] merge on sign-in failed:", error);
    }
  });
}
