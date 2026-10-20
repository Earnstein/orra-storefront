import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { products } from "@/db/schema";
import type { SeedDatabase } from "@/db/seed";
import { products as seedProducts } from "@/db/seed/catalog";
import { createTestDb } from "@/test/db";

// The route runs the reset against PGlite; the environment, Next's cache and Blob are stood in for.
const state = vi.hoisted(() => ({ db: undefined as unknown, env: {} as Record<string, string | undefined> }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  serverEnv: () => state.env,
}));
const revalidateTag = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag, cacheTag: () => {}, cacheLife: () => {} }));
const blob = vi.hoisted(() => ({ list: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

const { GET } = await import("./route");
let db: SeedDatabase;
// Built from parts, so it reads as the test value it is.
const SECRET = ["test", "cron", "value", "for", "the", "route"].join("-");

beforeAll(async () => {
  db = await createTestDb();
  state.db = db;
});

beforeEach(() => {
  state.env = { BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: "http://localhost:3000", CRON_SECRET: SECRET };
  revalidateTag.mockClear();
  blob.list.mockReset();
  blob.del.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const call = (authorization?: string) => GET(new Request("http://localhost:3000/api/cron/demo-reset", { headers: authorization ? { authorization } : {} }));
const tote = () => db.select({ name: products.name }).from(products).where(eq(products.slug, "leather-tote-tan")).then(([row]) => row!.name);

describe("GET /api/cron/demo-reset", () => {
  it("answers 401 without the secret, or with a wrong one, and changes nothing", async () => {
    await db.update(products).set({ name: "Edited in the demo" }).where(eq(products.slug, "leather-tote-tan"));
    for (const authorization of [undefined, "Bearer wrong", `Basic ${SECRET}`, SECRET]) {
      const response = await call(authorization);
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(await tote()).toBe("Edited in the demo");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("answers 503 while no secret, or too short a one, is configured, and says so in the log", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    state.env = { ...state.env, CRON_SECRET: undefined };
    expect((await call(`Bearer ${SECRET}`)).status).toBe(503);
    state.env = { ...state.env, CRON_SECRET: "short" };
    expect((await call("Bearer short")).status).toBe(503);
    expect(logged).toHaveBeenCalledTimes(2);
  });

  it("refuses, outside production, to reset production's database", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("PRODUCTION_DB_HOST", "ep-prod.example.test");
    try {
      await db.update(products).set({ name: "Edited in the demo" }).where(eq(products.slug, "leather-tote-tan"));
      state.env = { ...state.env, VERCEL_ENV: "preview", DATABASE_URL: "postgresql://app@ep-prod-pooler.example.test/orra" };
      expect((await call(`Bearer ${SECRET}`)).status).toBe(409);
      expect(await tote()).toBe("Edited in the demo");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("with the secret, resets the demo, answers its summary and expires the cached catalogue", async () => {
    await db.update(products).set({ name: "Edited in the demo" }).where(eq(products.slug, "leather-tote-tan"));
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ restoredProducts: seedProducts.length, failedSteps: [] });
    expect(await tote()).toBe(seedProducts.find((p) => p.slug === "leather-tote-tan")!.name);
    expect(revalidateTag).toHaveBeenCalledWith("catalog", { expire: 0 });
    // Uploads aren't configured here, so Blob isn't asked.
    expect(blob.list).not.toHaveBeenCalled();
  });

  it("leaves photos alone outside production: one Blob store can serve every environment", async () => {
    state.env = { ...state.env, VERCEL_ENV: "preview", VERCEL_URL: "orra-preview.vercel.app", BLOB_STORE_ID: "store_abc123", BLOB_WEBHOOK_PUBLIC_KEY: "public-key" };
    expect((await call(`Bearer ${SECRET}`)).status).toBe(200);
    expect(blob.list).not.toHaveBeenCalled();
  });

  it("on production, lists and deletes unused uploads under products/ once Blob is connected", async () => {
    state.env = { ...state.env, VERCEL_ENV: "production", BLOB_STORE_ID: "store_abc123", BLOB_WEBHOOK_PUBLIC_KEY: "public-key" };
    const old = new Date(Date.now() - 2 * 24 * 60 * 60_000);
    blob.list
      .mockResolvedValueOnce({ blobs: [{ url: "https://abc123.public.blob.vercel-storage.com/products/a.jpg", uploadedAt: old }], hasMore: true, cursor: "next" })
      .mockResolvedValueOnce({ blobs: [{ url: "https://abc123.public.blob.vercel-storage.com/products/b.jpg", uploadedAt: old }], hasMore: false });
    const body = (await (await call(`Bearer ${SECRET}`)).json()) as { deletedImages: number };
    expect(blob.list).toHaveBeenNthCalledWith(1, expect.objectContaining({ prefix: "products/" }));
    expect(blob.list).toHaveBeenNthCalledWith(2, expect.objectContaining({ prefix: "products/", cursor: "next" }));
    expect(blob.del).toHaveBeenCalledWith(["https://abc123.public.blob.vercel-storage.com/products/a.jpg", "https://abc123.public.blob.vercel-storage.com/products/b.jpg"]);
    expect(body.deletedImages).toBe(2);
  });
});
