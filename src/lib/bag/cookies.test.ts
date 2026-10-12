import { describe, expect, it } from "vitest";

import { BAG_COUNT_COOKIE, cartCookieName, cartCookieOptions, countCookieOptions, signCartId, verifyCartCookie } from "./cookies";

const SECRET = "test-secret-that-is-at-least-32-characters";
const ID = "0b8f2c1e-6d2a-4c1b-9f53-2a7d1c0e9b44";

describe("the guest bag cookie", () => {
  it("verifies a cart id it signed", () => {
    expect(verifyCartCookie(signCartId(ID, SECRET), SECRET)).toBe(ID);
  });

  it("rejects a changed id, a changed signature, another secret and junk", () => {
    const signed = signCartId(ID, SECRET);
    const [, signature] = signed.split(".");
    expect(verifyCartCookie(`1b8f2c1e-6d2a-4c1b-9f53-2a7d1c0e9b44.${signature}`, SECRET)).toBeNull();
    const changed = signature.slice(0, -1) + (signature.endsWith("A") ? "B" : "A");
    expect(verifyCartCookie(`${ID}.${changed}`, SECRET)).toBeNull();
    expect(verifyCartCookie(signCartId(ID, `${SECRET}-other`), SECRET)).toBeNull();
    for (const junk of [undefined, "", ".", ID, `${ID}.`, "not-a-uuid.abc", `${ID}.${signature}.extra`]) {
      expect(verifyCartCookie(junk, SECRET)).toBeNull();
    }
  });

  it("is HttpOnly, Lax and lasts 30 days; secure (with the __Host- name) on HTTPS", () => {
    expect(cartCookieName(true)).toBe("__Host-orra_cart");
    expect(cartCookieName(false)).toBe("orra_cart");
    expect(cartCookieOptions(true)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    expect(cartCookieOptions(false).secure).toBe(false);
  });

  it("leaves the count cookie readable by scripts", () => {
    expect(BAG_COUNT_COOKIE).toBe("orra_bag_count");
    expect(countCookieOptions(true)).toEqual({ httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  });
});
