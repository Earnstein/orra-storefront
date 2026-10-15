import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * The key in a guest's order link (`/orders/ORR-10001?key=…`), derived from the order id and the
 * server secret, so a retried confirmation email can rebuild the same link. Only its SHA-256 is
 * stored (`orders.guest_key_hash`), and links are checked against that.
 */
export function guestOrderKey(secret: string, orderId: string): string {
  return createHmac("sha256", secret).update(`orra:order:v1:${orderId}`).digest("base64url");
}

export function hashGuestKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Compares in constant time, so a wrong key reveals nothing about the right one. */
export function guestKeyMatches(key: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const given = Buffer.from(hashGuestKey(key), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return given.length === stored.length && timingSafeEqual(given, stored);
}
