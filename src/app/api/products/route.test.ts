import { describe, expect, it, vi } from "vitest";

import { products as seedProducts } from "@/db/seed/catalog";
import type { Results } from "@/lib/catalog/results";
import { GET } from "./route";

// Real migrations and the real seed, in an in-memory Postgres.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const get = (search: string) => GET(new Request(`http://localhost/api/products${search}`));
const seed = (slug: string) => seedProducts.find((product) => product.slug === slug)!;

describe("GET /api/products", () => {
  it("returns a collection's filtered results with cache and timing headers", async () => {
    const res = await get("?collection=bags&colour=black");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(res.headers.get("server-timing")).toMatch(/^db;dur=\d+(\.\d+)?$/);
    const results: Results = await res.json();
    expect(results.total).toBeGreaterThan(0);
    for (const product of results.products) {
      expect(seed(product.slug)).toMatchObject({ category: "bags", colourFamily: "black" });
    }
  });

  it("narrows a tabbed collection to its tab", async () => {
    const results: Results = await (await get("?collection=women&tab=shoes")).json();
    expect(results.total).toBeGreaterThan(0);
    for (const product of results.products) {
      expect(seed(product.slug).category).toBe("shoes");
      expect(["women", "unisex"]).toContain(seed(product.slug).audience);
    }
  });

  it("searches when there's no collection", async () => {
    const results: Results = await (await get("?q=tote")).json();
    expect(results.products.map((product) => product.slug)).toContain("leather-tote-tan");
  });

  it("404s an unknown collection, an unknown tab, and a tab under a collection without tabs", async () => {
    for (const search of ["?collection=nope", "?collection=new&tab=nope", "?collection=bags&tab=shoes"]) {
      const res = await get(search);
      expect(res.status, search).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    }
  });

  it("answers hostile search text and hand-edited params with results, never an error", async () => {
    for (const search of ["?q=%27%3B%20drop", "?q=%26%7C!", `?q=${"x".repeat(500)}`, "?q=", "?q=%F0%9F%91%9C"]) {
      expect((await get(search)).status, search).toBe(200);
    }
    const res = await get("?collection=bags&page=-3&sort=relevance&colour=nope&colour=black");
    expect(res.status).toBe(200);
    const results: Results = await res.json();
    expect(results.page).toBe(1);
    expect(results.products.every((product) => seed(product.slug).colourFamily === "black")).toBe(true);
  });
});
