import { db } from "@/db";
import { findCart } from "@/lib/bag/cart";
import { readBag } from "@/lib/bag/queries";
import { readCartRef, writeBagCookies } from "@/lib/bag/request";
import { changeBag } from "@/lib/bag/service";
import { EMPTY_BAG } from "@/lib/bag/types";

const PRIVATE = { "Cache-Control": "private, no-store" };

/** The shopper's bag with live stock. Reading it also corrects the count cookie. */
export async function GET() {
  const started = performance.now();
  const cart = await findCart(db, await readCartRef());
  const bag = cart ? await readBag(db, cart.id) : EMPTY_BAG;
  await writeBagCookies({ count: bag.count });
  return Response.json(bag, { headers: { ...PRIVATE, "Server-Timing": `db;dur=${Math.round(performance.now() - started)}` } });
}

/**
 * One bag change (`{ kind: "add" | "set" | "remove" | "move" | "import", … }`), answered with the
 * same result shape as the app's server actions. Same-origin only: server actions check the Origin
 * for us, a route handler doesn't (the Lax cookies already stay off cross-site requests).
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ ok: false, error: "invalid", message: "Wrong origin." }, { status: 403, headers: PRIVATE });
  const body = await request.json().catch(() => null);
  const result = await changeBag(body);
  return Response.json(result, { status: result.ok ? 200 : result.error === "invalid" ? 400 : 500, headers: PRIVATE });
}
