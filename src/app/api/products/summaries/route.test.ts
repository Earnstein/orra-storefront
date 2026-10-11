import { describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/products/summaries/route";

vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));

const get = (query: string) => GET(new Request(`https://orra.test/api/products/summaries?${query}`));

describe("GET /api/products/summaries", () => {
  it("returns cards in the order asked, dropping unknown and malformed slugs", async () => {
    const response = await get("slug=double-monk-shoe&slug=leather-tote-tan&slug=bad%20slug&slug=nope");
    expect(response.status).toBe(200);
    const { products } = (await response.json()) as { products: { slug: string }[] };
    expect(products.map((product) => product.slug)).toEqual(["double-monk-shoe", "leather-tote-tan"]);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=300, stale-while-revalidate=600");
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=\d+/);
  });

  it("refuses more than 200 slugs", async () => {
    const query = Array.from({ length: 201 }, (_, i) => `slug=p-${i}`).join("&");
    expect((await get(query)).status).toBe(400);
  });

  it("answers an empty list with no slugs", async () => {
    expect(await (await get("")).json()).toEqual({ products: [] });
  });
});
