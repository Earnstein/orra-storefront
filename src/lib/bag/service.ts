import "server-only";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { carts } from "@/db/schema";
import type { ActionResult } from "@/lib/account/actions";
import { isSlug } from "@/lib/saved/limits";
import { saveSlugs } from "@/lib/saved/mutations";
import { ensureCart, findCart, type CartRef } from "./cart";
import { BAG_LINE_LIMIT, MAX_QUANTITY } from "./limits";
import { addLine, BagError, removeLine, setLineQuantity, type BagChange } from "./mutations";
import { readBag } from "./queries";
import { readCartRef, writeBagCookies } from "./request";
import { EMPTY_BAG, type Bag } from "./types";

// Bag changes for guests and signed-in shoppers, served by POST /api/bag. A route handler, not
// server actions: Next treats any cookie a server action sets as a reason to drop the client's
// router and prefetch caches and refetch the page, which would cost every Add to bag a page
// reload's worth of requests. Each change finds the shopper's cart on the server (session, else the
// signed guest cookie), validates its input, changes the bag in one statement and returns the bag;
// prices never come from the client.

const slug = z.string().refine(isSlug, "That's not a product.");
const quantity = z.number().int().min(1).max(MAX_QUANTITY);

export const bagRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), slug, quantity: quantity.default(1) }),
  z.object({ kind: z.literal("set"), slug, quantity }),
  z.object({ kind: z.literal("remove"), slug }),
  z.object({ kind: z.literal("move"), slug }),
  z.object({ kind: z.literal("import"), lines: z.array(z.object({ slug, quantity })).max(BAG_LINE_LIMIT) }),
]);

export type BagRequest = z.input<typeof bagRequestSchema>;
export type BagResult = ActionResult<{ bag: Bag; capped: boolean; saveLocally?: string }>;

const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;

type Parsed = z.output<typeof bagRequestSchema>;

async function apply(request: Parsed, cartId: string, ref: CartRef): Promise<BagChange & { saveLocally?: string }> {
  switch (request.kind) {
    case "add":
      return addLine(db, cartId, request.slug, request.quantity);
    case "set":
      return setLineQuantity(db, cartId, request.slug, request.quantity);
    case "remove":
      return removeLine(db, cartId, request.slug);
    case "move":
      // Save first, so a failed save leaves the line in the bag rather than losing the item.
      if (ref.userId) {
        await saveSlugs(ref.userId, [request.slug]);
        return removeLine(db, cartId, request.slug);
      }
      return { ...(await removeLine(db, cartId, request.slug)), saveLocally: request.slug };
    case "import":
      // Old browser bags: keep the larger quantity, so a second import (two tabs) can't double it.
      for (const line of request.lines) {
        try {
          await addLine(db, cartId, line.slug, line.quantity, { mode: "max" });
        } catch (error) {
          if (!(error instanceof BagError)) throw error;
          if (error.code === "full") break;
        }
      }
      return { bag: await readBag(db, cartId), capped: false };
  }
}

/** Applies one bag change and writes the bag cookies (the guest cookie slides on every write). */
export async function changeBag(input: unknown): Promise<BagResult> {
  const parsed = bagRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: parsed.error.issues[0].message };
  const request = parsed.data;
  const creates = request.kind === "add" || request.kind === "import";
  let created: string | undefined;
  try {
    const ref = await readCartRef();
    const cart = creates ? await ensureCart(db, ref) : await findCart(db, ref);
    if (!cart) {
      await writeBagCookies({ count: 0 });
      return { ok: true, data: { bag: EMPTY_BAG, capped: false } };
    }
    if ("created" in cart && cart.created) created = cart.id;
    const result = await apply(request, cart.id, ref);
    await writeBagCookies({ guestCartId: ref.userId ? undefined : cart.id, count: result.bag.count });
    return { ok: true, data: result };
  } catch (error) {
    // A cart created for a change that then failed (an unknown product) would be unreachable.
    if (created) await db.delete(carts).where(eq(carts.id, created)).catch(() => undefined);
    if (error instanceof BagError) return { ok: false, error: "invalid", message: error.message };
    console.error("[bag] change failed:", error);
    return FAILED;
  }
}
