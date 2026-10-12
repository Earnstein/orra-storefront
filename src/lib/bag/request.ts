import "server-only";

import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/session";
import { authBaseUrl, serverEnv } from "@/lib/env";
import type { CartRef } from "./cart";
import { BAG_COUNT_COOKIE, cartCookieName, cartCookieOptions, countCookieOptions, signCartId, verifyCartCookie } from "./cookies";

/** Secure cookies (and the `__Host-` name) whenever the site runs on HTTPS, as Better Auth decides. */
function cookieConfig() {
  const env = serverEnv();
  return { secure: authBaseUrl(env).startsWith("https://"), secret: env.BETTER_AUTH_SECRET };
}

/** Whose bag this request is about: the signed-in user (uncached session check) or the cookie's guest cart. */
export async function readCartRef(): Promise<CartRef> {
  const user = await getCurrentUser();
  if (user) return { userId: user.id, guestCartId: null };
  const { secure, secret } = cookieConfig();
  const value = (await cookies()).get(cartCookieName(secure))?.value;
  return { userId: null, guestCartId: verifyCartCookie(value, secret) };
}

/**
 * Writes the count cookie and, for a guest, the signed cart cookie (re-set on every write, so it
 * expires 30 days after the bag was last changed). Only route handlers (and the sign-in hook) call
 * this: a cookie set in a server action makes Next refetch the page.
 */
export async function writeBagCookies({ guestCartId, count }: { guestCartId?: string; count: number }) {
  const { secure, secret } = cookieConfig();
  const jar = await cookies();
  if (guestCartId) jar.set(cartCookieName(secure), signCartId(guestCartId, secret), cartCookieOptions(secure));
  jar.set(BAG_COUNT_COOKIE, String(Math.min(Math.max(count, 0), 999)), countCookieOptions(secure));
}
