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
 * Writes the count cookie and, for a guest whose cart was just created, the signed cart cookie.
 * Only server actions and route handlers may call this (Next refuses cookie writes while rendering).
 */
export async function writeBagCookies({ newGuestCartId, count }: { newGuestCartId?: string; count: number }) {
  const { secure, secret } = cookieConfig();
  const jar = await cookies();
  if (newGuestCartId) {
    jar.set(cartCookieName(secure), signCartId(newGuestCartId, secret), cartCookieOptions(secure));
  }
  jar.set(BAG_COUNT_COOKIE, String(Math.min(Math.max(count, 0), 999)), countCookieOptions(secure));
}
