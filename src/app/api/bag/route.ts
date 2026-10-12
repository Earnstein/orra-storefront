import { db } from "@/db";
import { findCart } from "@/lib/bag/cart";
import { readBag } from "@/lib/bag/queries";
import { readCartRef, writeBagCookies } from "@/lib/bag/request";
import { EMPTY_BAG } from "@/lib/bag/types";

/** The shopper's bag with live stock (`private, no-store`). Reading it also corrects the count cookie. */
export async function GET() {
  const started = performance.now();
  const cart = await findCart(db, await readCartRef());
  const bag = cart ? await readBag(db, cart.id) : EMPTY_BAG;
  await writeBagCookies({ count: bag.count });
  return Response.json(bag, {
    headers: { "Cache-Control": "private, no-store", "Server-Timing": `db;dur=${Math.round(performance.now() - started)}` },
  });
}
