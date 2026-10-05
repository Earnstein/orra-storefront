import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { applyMigrations, insertLegacyCatalogue, migrationTags } from "@/test/migrations";

// Production is migrated but never seeded, so M2's migrations must fill their new columns on rows
// that already exist. These tests stop before M2's first migration, insert pre-M2 rows, then apply
// the rest, as a production deploy would.
describe("M2 migrations on a database that predates them", () => {
  it("backfills products that existed before M2", async () => {
    const client = new PGlite();
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
    for (const column of ["audience", "colour_family", "material"]) {
      await expect(client.query(`update products set ${column} = null`)).rejects.toThrow();
    }
  });
});
