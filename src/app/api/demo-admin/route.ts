import { db } from "@/db";
import { allowDemoSignIn, ensureDemoAdmin } from "@/lib/admin/demo";
import { auth } from "@/lib/auth";
import { findCart } from "@/lib/bag/cart";
import { readBag } from "@/lib/bag/queries";
import { writeBagCookies } from "@/lib/bag/request";
import { serverEnv } from "@/lib/env";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * "Try the admin" (`/admin/try`): signs this browser in as the shared demo admin and answers where
 * to go. Same origin only, with an Origin header required (a form posted from elsewhere can't sign
 * a visitor in). On Vercel, 5 per IP per 10 minutes. Ends the visitor's own session; Better Auth's
 * nextCookies plugin writes the demo session's cookies. A route handler, not a server action, since
 * it sets cookies (a cookie set in a server action makes Next refetch the page).
 */
export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ ok: false, error: "forbidden", message: "Wrong origin." }, { status: 403, headers: PRIVATE });
  }
  const env = serverEnv();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if ((env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") && ip && !(await allowDemoSignIn(db, ip))) {
    return Response.json(
      { ok: false, error: "rate-limited", message: "Too many demo sign-ins from your network. Try again in 10 minutes." },
      { status: 429, headers: PRIVATE },
    );
  }
  try {
    const { id } = await ensureDemoAdmin(db);
    await auth.api.signInAsDemoAdmin({ body: { userId: id }, headers: request.headers });
    // The header's bag count follows whoever is signed in: now the demo account's bag.
    const cart = await findCart(db, { userId: id, guestCartId: null });
    await writeBagCookies({ count: cart ? (await readBag(db, cart.id)).count : 0 });
    return Response.json({ ok: true, redirect: "/admin/products" }, { headers: PRIVATE });
  } catch (error) {
    console.error("demo-admin: sign-in failed", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "failed", message: "Something went wrong. Try again." }, { status: 500, headers: PRIVATE });
  }
}
