"use server";

import { z } from "zod";

import { db } from "@/db";
import type { ActionResult } from "@/lib/account/actions";
import { isSlug } from "@/lib/saved/limits";
import { saveSlugs } from "@/lib/saved/mutations";
import { ensureCart, findCart, type CartRef } from "./cart";
import { MAX_QUANTITY } from "./limits";
import { addLine, BagError, removeLine, setLineQuantity, type BagChange } from "./mutations";
import { EMPTY_BAG, type Bag } from "./types";
import { readCartRef, writeBagCookies } from "./request";

// The bag's server actions, for guests and signed-in shoppers alike. Each finds the shopper's cart
// on the server (session, else the signed guest cookie), validates its input, changes the bag in
// one statement, and returns the updated bag; prices never come from the client. Each also sets
// the count cookie, so the header is right on the next page.

const slugSchema = z.string().refine(isSlug, "That's not a product.");
const quantitySchema = z.number().int().min(1).max(MAX_QUANTITY);

const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;

export type BagResult = ActionResult<{ bag: Bag; capped: boolean; saveLocally?: string }>;

async function change(
  input: unknown,
  schema: z.ZodType,
  { create }: { create: boolean },
  write: (cartId: string, ref: CartRef) => Promise<BagChange & { saveLocally?: string }>,
): Promise<BagResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: parsed.error.issues[0].message };
  try {
    const ref = await readCartRef();
    const cart = create ? await ensureCart(db, ref) : await findCart(db, ref);
    if (!cart) {
      await writeBagCookies({ count: 0 });
      return { ok: true, data: { bag: EMPTY_BAG, capped: false } };
    }
    const result = await write(cart.id, ref);
    const created = "created" in cart && cart.created && !ref.userId;
    await writeBagCookies({ newGuestCartId: created ? cart.id : undefined, count: result.bag.count });
    return { ok: true, data: result };
  } catch (error) {
    if (error instanceof BagError) return { ok: false, error: "invalid", message: error.message };
    console.error("[bag] action failed:", error);
    return FAILED;
  }
}

export async function addToBag(slug: string, quantity = 1): Promise<BagResult> {
  return change({ slug, quantity }, z.object({ slug: slugSchema, quantity: quantitySchema }), { create: true }, (cartId) =>
    addLine(db, cartId, slug, quantity),
  );
}

export async function setQuantity(slug: string, quantity: number): Promise<BagResult> {
  return change({ slug, quantity }, z.object({ slug: slugSchema, quantity: quantitySchema }), { create: false }, (cartId) =>
    setLineQuantity(db, cartId, slug, quantity),
  );
}

export async function removeFromBag(slug: string): Promise<BagResult> {
  return change(slug, slugSchema, { create: false }, (cartId) => removeLine(db, cartId, slug));
}

/**
 * Removes the line and saves the item: to the account when signed in; signed out, the answer's
 * `saveLocally` tells the client to add it to this browser's saved items.
 */
export async function moveToSaved(slug: string): Promise<BagResult> {
  return change(slug, slugSchema, { create: false }, async (cartId, ref) => {
    const result = await removeLine(db, cartId, slug);
    if (ref.userId) {
      await saveSlugs(ref.userId, [slug]);
      return result;
    }
    return { ...result, saveLocally: slug };
  });
}
