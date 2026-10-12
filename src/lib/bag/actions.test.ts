import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { products } from "@/db/schema";
import { cookiesFrom, createTestAuth } from "@/test/auth";

// The bag actions and GET /api/bag run for real on PGlite with a test Better Auth; only Next's
// request scope is stood in for: `headers()` returns the test's session cookies, and `cookies()`
// is a jar the test can read.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
const request = vi.hoisted(() => ({
  auth: undefined as unknown,
  headers: new Headers(),
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
}));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({
    get: (name: string) => (request.jar.has(name) ? { name, value: request.jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void request.jar.set(name, { value, options }),
  }),
}));

vi.stubEnv("DATABASE_URL", "postgres://test@localhost/test");
vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-32-characters");
vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");

const { addToBag, importLines, moveToSaved, removeFromBag, setQuantity } = await import("@/lib/bag/actions");
const { GET } = await import("@/app/api/bag/route");
const { getSavedSlugs } = await import("@/lib/saved/queries");

let next = 0;

beforeAll(async () => {
  request.auth = (await createTestAuth(db)).auth;
});

beforeEach(async () => {
  request.headers = new Headers();
  request.jar = new Map();
  await db.update(products).set({ stock: 5 }).where(eq(products.slug, "leather-tote-tan"));
  await db.update(products).set({ stock: 5 }).where(eq(products.slug, "double-monk-shoe"));
});

async function signIn(): Promise<string> {
  const auth = request.auth as Awaited<ReturnType<typeof createTestAuth>>["auth"];
  const { headers, response } = await auth.api.signUpEmail({
    body: { name: "Ada", email: `bag-${++next}@example.test`, password: "correct-horse" },
    returnHeaders: true,
  });
  request.headers = cookiesFrom(headers);
  return response.user.id;
}

describe("as a guest", () => {
  it("creates a signed cart cookie on the first add and keeps using it", async () => {
    const first = await addToBag("leather-tote-tan");
    expect(first).toMatchObject({ ok: true, data: { capped: false } });
    const cookie = request.jar.get("orra_cart");
    expect(cookie?.value).toMatch(/^[0-9a-f-]{36}\.[\w-]+$/);
    expect(cookie?.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(request.jar.get("orra_bag_count")?.value).toBe("1");

    const second = await addToBag("double-monk-shoe", 2);
    expect(request.jar.get("orra_cart")?.value).toBe(cookie?.value);
    expect(second.ok && second.data.bag.count).toBe(3);
    expect(request.jar.get("orra_bag_count")?.value).toBe("3");
  });

  it("ignores a forged cart cookie and starts a fresh bag", async () => {
    await addToBag("leather-tote-tan");
    const real = request.jar.get("orra_cart")!.value;
    request.jar = new Map([["orra_cart", { value: `${real.slice(0, 36)}.forged` }]]);
    const result = await addToBag("double-monk-shoe");
    expect(result.ok && result.data.bag.lines.map((line) => line.slug)).toEqual(["double-monk-shoe"]);
    expect(request.jar.get("orra_cart")?.value).not.toContain("forged");
  });

  it("changes quantities, removes, and moves to saved in this browser", async () => {
    await addToBag("leather-tote-tan");
    const set = await setQuantity("leather-tote-tan", 3);
    expect(set.ok && set.data.bag.lines[0].quantity).toBe(3);
    const moved = await moveToSaved("leather-tote-tan");
    expect(moved).toMatchObject({ ok: true, data: { saveLocally: "leather-tote-tan" } });
    expect(moved.ok && moved.data.bag.lines).toEqual([]);
    expect(request.jar.get("orra_bag_count")?.value).toBe("0");
    await addToBag("double-monk-shoe");
    const removed = await removeFromBag("double-monk-shoe");
    expect(removed.ok && removed.data.bag.count).toBe(0);
  });

  it("answers an empty bag (and creates nothing) when there's no cart yet", async () => {
    const result = await removeFromBag("leather-tote-tan");
    expect(result).toEqual({ ok: true, data: { bag: { lines: [], count: 0, subtotal: 0, currency: "USD" }, capped: false } });
    expect(request.jar.has("orra_cart")).toBe(false);
  });
});

describe("importLines", () => {
  it("moves an old browser bag to the server, capping quantities and skipping unknown products", async () => {
    await db.update(products).set({ stock: 2 }).where(eq(products.slug, "double-monk-shoe"));
    const result = await importLines([
      { slug: "leather-tote-tan", quantity: 1 },
      { slug: "no-such-product", quantity: 1 },
      { slug: "double-monk-shoe", quantity: 5 },
    ]);
    expect(result.ok && Object.fromEntries(result.data.bag.lines.map((line) => [line.slug, line.quantity]))).toEqual({
      "leather-tote-tan": 1,
      "double-monk-shoe": 2,
    });
    expect(request.jar.get("orra_bag_count")?.value).toBe("3");
    expect(request.jar.get("orra_cart")).toBeDefined();
  });

  it("refuses more lines than a bag holds", async () => {
    const lines = Array.from({ length: 51 }, () => ({ slug: "leather-tote-tan", quantity: 1 }));
    expect(await importLines(lines)).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("validation", () => {
  it("refuses bad slugs and quantities, and unknown products", async () => {
    expect(await addToBag("Not A Slug")).toMatchObject({ ok: false, error: "invalid" });
    expect(await addToBag("leather-tote-tan", 0)).toMatchObject({ ok: false, error: "invalid" });
    expect(await addToBag("leather-tote-tan", 11)).toMatchObject({ ok: false, error: "invalid" });
    expect(await addToBag("leather-tote-tan", 1.5)).toMatchObject({ ok: false, error: "invalid" });
    expect(await addToBag("no-such-product")).toMatchObject({ ok: false, error: "invalid", message: "That's not a product." });
  });
});

describe("signed in", () => {
  it("uses the account's cart, never a guest cookie, and saves to the account", async () => {
    const userId = await signIn();
    await addToBag("leather-tote-tan");
    expect(request.jar.has("orra_cart")).toBe(false);
    expect(request.jar.get("orra_bag_count")?.value).toBe("1");
    const moved = await moveToSaved("leather-tote-tan");
    expect(moved.ok && moved.data.saveLocally).toBeUndefined();
    expect(await getSavedSlugs(userId)).toEqual(["leather-tote-tan"]);
  });
});

describe("GET /api/bag", () => {
  it("returns the bag, private and uncached, and corrects the count cookie", async () => {
    await addToBag("leather-tote-tan", 2);
    request.jar.set("orra_bag_count", { value: "7" });
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=\d+$/);
    const bag = await response.json();
    expect(bag.count).toBe(2);
    expect(request.jar.get("orra_bag_count")?.value).toBe("2");
  });

  it("returns an empty bag without a cookie, and with a forged one", async () => {
    expect((await (await GET()).json()).lines).toEqual([]);
    request.jar.set("orra_cart", { value: "0b8f2c1e-6d2a-4c1b-9f53-2a7d1c0e9b44.forged" });
    expect((await (await GET()).json()).lines).toEqual([]);
  });
});
