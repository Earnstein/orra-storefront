import { describe, expect, it, vi } from "vitest";

import type { Suggestions } from "@/lib/catalog/suggest";
import { GET } from "./route";

// Real migrations and the real seed, in an in-memory Postgres.
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const get = (search: string) => GET(new Request(`http://localhost/api/search/suggest${search}`));

describe("GET /api/search/suggest", () => {
  it("returns suggestions with cache and timing headers", async () => {
    const res = await get("?q=tote");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(res.headers.get("server-timing")).toMatch(/^db;dur=\d+(\.\d+)?$/);
    const suggestions: Suggestions = await res.json();
    expect(suggestions.products.map((product) => product.slug)).toContain("leather-tote-tan");
  });

  it("answers hostile or missing text with empty suggestions, never an error", async () => {
    for (const search of ["", "?q=", `?q=${"x".repeat(500)}`, "?q=%27%3B%20drop", "?q=%26%7C!", "?q=%F0%9F%91%9C"]) {
      const res = await get(search);
      expect(res.status, search).toBe(200);
      expect(await res.json(), search).toHaveProperty("products");
    }
    expect(await (await get("?q=%26%7C!")).json()).toEqual({ products: [], categories: [], total: 0 });
  });
});
