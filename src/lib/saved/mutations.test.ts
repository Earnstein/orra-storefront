import { count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { products, savedItems } from "@/db/schema";
import { mergeBatch, SAVED_LIMIT } from "@/lib/saved/limits";
import { mergeSlugs, saveSlugs, unsaveSlug } from "@/lib/saved/mutations";
import { getSavedSlugs } from "@/lib/saved/queries";
import { createTestAuth } from "@/test/auth";

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

/** Adds `count` products (copies of a seed product with new slugs) and returns their slugs. */
async function extraProducts(prefix: string, count: number): Promise<string[]> {
  const [template] = await db.select().from(products).limit(1);
  // A copy without the generated id or the trigger-maintained search columns.
  const copy: Partial<typeof template> = { ...template };
  delete copy.id;
  delete copy.search;
  delete copy.searchText;
  const slugs = Array.from({ length: count }, (_, i) => `${prefix}-${++next}-${i}`);
  await db.insert(products).values(slugs.map((slug) => ({ ...(copy as typeof products.$inferInsert), slug })));
  return slugs;
}

/** Saves `count` rows for the user, oldest first, one second apart, ending a minute ago. */
async function fill(userId: string, count: number) {
  const slugs = await extraProducts("filler", count);
  const rows = await db.select({ id: products.id, slug: products.slug }).from(products);
  const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));
  const start = Date.now() - 60_000 - count * 1000;
  await db
    .insert(savedItems)
    .values(slugs.map((slug, i) => ({ userId, productId: idBySlug.get(slug)!, createdAt: new Date(start + i * 1000) })));
}

describe("saveSlugs", () => {
  it("saves known slugs once and drops unknown ones", async () => {
    const userId = await newUser();
    expect(await saveSlugs(userId, ["leather-tote-tan", "leather-tote-tan", "nope"])).toEqual(["leather-tote-tan"]);
    expect(await saveSlugs(userId, ["leather-tote-tan"])).toEqual(["leather-tote-tan"]);
    expect(await db.select().from(savedItems).where(eq(savedItems.userId, userId))).toHaveLength(1);
  });

  it("keeps the newest 200 when the cap is passed, dropping the oldest, without throwing", async () => {
    const userId = await newUser();
    await fill(userId, SAVED_LIMIT - 1);
    const before = await getSavedSlugs(userId);
    const fresh = await extraProducts("fresh", 5);
    for (const slug of fresh) await saveSlugs(userId, [slug]);
    const after = await getSavedSlugs(userId);
    expect(after).toHaveLength(SAVED_LIMIT);
    expect(after.slice(0, 5)).toEqual([...fresh].reverse());
    expect(after.slice(5)).toEqual(before.slice(0, SAVED_LIMIT - 5));
  });
});

describe("unsaveSlug", () => {
  it("removes one slug and ignores unknown ones", async () => {
    const userId = await newUser();
    await saveSlugs(userId, ["leather-tote-tan"]);
    await saveSlugs(userId, ["double-monk-shoe"]);
    expect(await unsaveSlug(userId, "leather-tote-tan")).toEqual(["double-monk-shoe"]);
    expect(await unsaveSlug(userId, "nope")).toEqual(["double-monk-shoe"]);
  });
});

describe("mergeSlugs", () => {
  it("merges in order, skips unknown slugs and counts already-saved ones as merged", async () => {
    const userId = await newUser();
    await saveSlugs(userId, ["double-monk-shoe"]);
    const result = await mergeSlugs(userId, ["leather-tote-tan", "nope", "double-monk-shoe", "gold-hoop-earrings"]);
    expect(result.unmerged).toEqual([]);
    // Merged items are newer than the account's, the browser's newest (last) first.
    expect(result.slugs).toEqual(["gold-hoop-earrings", "leather-tote-tan", "double-monk-shoe"]);
  });

  it("is idempotent: the same merge twice adds nothing", async () => {
    const userId = await newUser();
    const first = await mergeSlugs(userId, ["leather-tote-tan", "double-monk-shoe"]);
    const second = await mergeSlugs(userId, ["leather-tote-tan", "double-monk-shoe"]);
    expect(second).toEqual(first);
  });

  it("adds only what fits a nearly full account and never removes its items", async () => {
    const userId = await newUser();
    await fill(userId, SAVED_LIMIT - 1);
    const before = await getSavedSlugs(userId);
    const [a, b, c, d, e] = await extraProducts("merge", 5);

    const result = await mergeSlugs(userId, [a, b, c, d, e]);
    expect(result.unmerged).toEqual([b, c, d, e]);
    expect(result.slugs).toHaveLength(SAVED_LIMIT);
    expect(result.slugs).toEqual([a, ...before]);
  });
});

describe("mergeBatch", () => {
  it("keeps the browser's newest 200 distinct valid slugs, oldest first", () => {
    const local = Array.from({ length: 250 }, (_, i) => `product-${i}`);
    const batch = mergeBatch(local);
    expect(batch).toHaveLength(SAVED_LIMIT);
    expect(batch[0]).toBe("product-50");
    expect(batch.at(-1)).toBe("product-249");
  });

  it("drops duplicates (keeping the newest) and slugs that aren't slugs", () => {
    expect(mergeBatch(["a", "Bad Slug", "b", "a", "x".repeat(101), "c"])).toEqual(["b", "a", "c"]);
  });
});

describe("concurrent writes", () => {
  it("two merges at once (two tabs at sign-in) add each item once", async () => {
    const userId = await newUser();
    const slugs = ["leather-tote-tan", "double-monk-shoe"];
    await Promise.all([mergeSlugs(userId, slugs), mergeSlugs(userId, slugs)]);
    expect(await getSavedSlugs(userId)).toHaveLength(2);
  });

  it("a save during a merge never shows more than SAVED_LIMIT", async () => {
    const userId = await newUser();
    await fill(userId, SAVED_LIMIT - 1);
    const [merging] = await extraProducts("race-merge", 1);
    const [saving] = await extraProducts("race-save", 1);
    const [merged] = await Promise.all([mergeSlugs(userId, [merging]), saveSlugs(userId, [saving])]);
    expect(merged.slugs.length).toBeLessThanOrEqual(SAVED_LIMIT);
    expect((await getSavedSlugs(userId)).length).toBeLessThanOrEqual(SAVED_LIMIT);
    // The next save trims anything a race left over.
    await saveSlugs(userId, [saving]);
    const [{ total }] = await db.select({ total: count() }).from(savedItems).where(eq(savedItems.userId, userId));
    expect(total).toBeLessThanOrEqual(SAVED_LIMIT);
  });
});
