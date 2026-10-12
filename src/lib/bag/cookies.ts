import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// The bag's two cookies. They're written only by server actions and route handlers, never while
// rendering, so pages stay prerendered.
// - The guest bag cookie holds a guest cart's id plus an HMAC, so a forged or altered id is
//   rejected without reading the database. Lax, not Strict: Strict would drop it on the return
//   from Stripe's checkout.
// - The count cookie is readable by scripts, so the header shows the bag's count with no request.

const LABEL = "orra:cart:v1:";
const THIRTY_DAYS = 60 * 60 * 24 * 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const BAG_COUNT_COOKIE = "orra_bag_count";

/** `__Host-` needs `Secure`, so the prefix is only used on HTTPS (as Better Auth does). */
export function cartCookieName(secure: boolean): string {
  return secure ? "__Host-orra_cart" : "orra_cart";
}

export function cartCookieOptions(secure: boolean) {
  return { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: THIRTY_DAYS } as const;
}

export function countCookieOptions(secure: boolean) {
  return { httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: THIRTY_DAYS } as const;
}

function signature(id: string, secret: string): string {
  return createHmac("sha256", secret).update(LABEL + id).digest("base64url");
}

export function signCartId(id: string, secret: string): string {
  return `${id}.${signature(id, secret)}`;
}

/** The cart id from a cookie value, or null when it's missing, malformed or not signed by us. */
export function verifyCartCookie(value: string | undefined, secret: string): string | null {
  const parts = value?.split(".");
  if (!parts || parts.length !== 2 || !UUID.test(parts[0])) return null;
  const [id, given] = parts;
  const expected = Buffer.from(signature(id, secret));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? id : null;
}
