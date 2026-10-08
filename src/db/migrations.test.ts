import { describe, expect, it } from "vitest";

import { products as seedProducts } from "@/db/seed/catalog";
import { applyMigrations, insertLegacyCatalogue, migrationTags } from "@/test/migrations";
import { createPGlite } from "@/test/pglite";

// Production is migrated but never seeded, so M2's migrations must fill their new columns on rows
// that already exist. These tests stop before M2's first migration, insert pre-M2 rows, then apply
// the rest, as a production deploy would.
describe("M2 migrations on a database that predates them", () => {
  it("backfills products that existed before M2", async () => {
    const client = createPGlite();
    const tags = migrationTags();
    const firstM2 = tags.indexOf("0002_audience");
    expect(firstM2).toBeGreaterThan(0);

    await applyMigrations(client, tags.slice(0, firstM2));
    await insertLegacyCatalogue(client, ["legacy-product"]);
    await applyMigrations(client, tags.slice(firstM2));

    const { rows } = await client.query<{ slug: string; audience: string; colour_family: string; material: string }>(
      "select slug, audience, colour_family, material from products",
    );
    expect(
      Object.fromEntries(rows.map((row) => [row.slug, [row.audience, row.colour_family, row.material].join(" / ")])),
    ).toEqual({
      "top-handle-bag-teal": "women / green / leather",
      "double-monk-shoe": "men / brown / leather",
      "round-sunglasses": "unisex / gold / metal",
      "gold-hoop-earrings": "women / gold / gold",
      "leather-biker-jacket": "unisex / black / leather",
      "bomber-jacket-rust": "men / orange / nylon",
      "floral-pump": "women / blue / satin",
      "fringed-knit-poncho": "women / beige / cotton",
      "leather-tote-tan": "unisex / brown / leather",
      "legacy-product": "unisex / multicolour / mixed",
    });
    // Previews are seeded and production is only backfilled, so the two must agree.
    const backfilled = Object.fromEntries(rows.map((row) => [row.slug, [row.audience, row.colour_family, row.material]]));
    for (const product of seedProducts.slice(0, 9)) {
      expect(backfilled[product.slug], product.slug).toEqual([product.audience, product.colourFamily, product.material]);
    }
    for (const column of ["audience", "colour_family", "material"]) {
      await expect(client.query(`update products set ${column} = null`)).rejects.toThrow();
    }
  });
});

// M3 adds the search columns; production gets them from the migration's backfill, not a seed.
describe("M3 migrations on a database that predates them", () => {
  it("fills the search columns for existing products", async () => {
    const client = createPGlite();
    const tags = migrationTags();
    expect(tags).toContain("0004_product_search");
    const firstM2 = tags.indexOf("0002_audience");

    await applyMigrations(client, tags.slice(0, firstM2));
    await insertLegacyCatalogue(client, ["legacy-product"]);
    await applyMigrations(client, tags.slice(firstM2));

    const { rows } = await client.query<{ slug: string; search_text: string; matches: boolean }>(
      "select slug, search_text, search @@ to_tsquery('english', 'tote') as matches from products",
    );
    const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));
    expect(bySlug["leather-tote-tan"].search_text).toContain("leather");
    expect(bySlug["leather-tote-tan"].matches).toBe(true);
    expect(rows.every((row) => row.search_text.length > 0)).toBe(true);
    // Writing null can't stick (the trigger recomputes both columns), and the columns are NOT NULL.
    await client.query("update products set search = null, search_text = null");
    const after = await client.query<{ empty: number }>("select count(*)::int as empty from products where search_text = ''");
    expect(after.rows[0].empty).toBe(0);
    const columns = await client.query<{ column_name: string; is_nullable: string }>(
      "select column_name, is_nullable from information_schema.columns where table_name = 'products' and column_name in ('search', 'search_text')",
    );
    expect(columns.rows.map((c) => c.is_nullable)).toEqual(["NO", "NO"]);
  });
});

describe("M4 migrations", () => {
  it("add saved_items, keyed by user and product", async () => {
    const client = createPGlite();
    const tags = migrationTags();
    expect(tags).toContain("0006_saved_items");
    await applyMigrations(client, tags);
    const { rows } = await client.query<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'saved_items' order by ordinal_position",
    );
    expect(rows.map((row) => row.column_name)).toEqual(["user_id", "product_id", "created_at"]);
  });
});
