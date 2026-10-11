import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { products, savedItems, user } from "@/db/schema";
import { getProductSummaries, getSavedSlugs } from "@/lib/saved/queries";
import { createTestAuth } from "@/test/auth";

// Real migrations and the real seed, in an in-memory Postgres shared with a test Better Auth.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

let auth: Awaited<ReturnType<typeof createTestAuth>>["auth"];
let next = 0;

beforeAll(async () => {
  ({ auth } = await createTestAuth(db));
});

async function newUser(): Promise<string> {
  const { user } = await auth.api.signUpEmail({ body: { name: "Ada", email: `ada-${++next}@example.test`, password: "correct-horse" } });
  return user.id;
}

async function productId(slug: string): Promise<number> {
  const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug));
  return row.id;
}

async function save(userId: string, slug: string, minutesAgo: number) {
  await db.insert(savedItems).values({ userId, productId: await productId(slug), createdAt: new Date(Date.now() - minutesAgo * 60_000) });
}

describe("getSavedSlugs", () => {
  it("lists a user's saved slugs, newest first", async () => {
    const userId = await newUser();
    await save(userId, "leather-tote-tan", 10);
    await save(userId, "double-monk-shoe", 1);
    await save(await newUser(), "gold-hoop-earrings", 5);
    expect(await getSavedSlugs(userId)).toEqual(["double-monk-shoe", "leather-tote-tan"]);
  });

  it("is empty for a user who saved nothing", async () => {
    expect(await getSavedSlugs(await newUser())).toEqual([]);
  });

  it("loses a user's rows when the user is deleted", async () => {
    const userId = await newUser();
    await save(userId, "leather-tote-tan", 1);
    await db.delete(user).where(eq(user.id, userId));
    expect(await db.select().from(savedItems).where(eq(savedItems.userId, userId))).toEqual([]);
  });

  it("loses a product's rows when the product is deleted", async () => {
    const userId = await newUser();
    await save(userId, "gold-hoop-earrings", 2);
    await save(userId, "leather-tote-tan", 1);
    await db.delete(products).where(eq(products.slug, "gold-hoop-earrings"));
    expect(await getSavedSlugs(userId)).toEqual(["leather-tote-tan"]);
  });

  it("keeps one row per user and product", async () => {
    const userId = await newUser();
    await save(userId, "leather-tote-tan", 2);
    await expect(save(userId, "leather-tote-tan", 1)).rejects.toThrow();
  });
});

describe("getProductSummaries", () => {
  it("returns cards in the order asked, dropping unknown slugs", async () => {
    const cards = await getProductSummaries(["double-monk-shoe", "nope", "leather-tote-tan"]);
    expect(cards.map((card) => card.slug)).toEqual(["double-monk-shoe", "leather-tote-tan"]);
    expect(Object.keys(cards[0]).sort()).toEqual(["images", "name", "price", "slug", "stock"]);
    expect(cards[0].images).toHaveLength(1);
  });

  it("returns nothing for no slugs", async () => {
    expect(await getProductSummaries([])).toEqual([]);
  });
});
