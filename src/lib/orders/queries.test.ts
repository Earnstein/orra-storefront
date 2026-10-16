import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import type { SeedDatabase } from "@/db/seed";
import { rowsOf } from "@/lib/bag/queries";
import { createTestDb } from "@/test/db";
import { guestOrderKey, hashGuestKey } from "./guest-key";
import { countOrdersForUser, getOrderForGuestKey, getOrderForUser, getOrdersForUser } from "./queries";

let db: SeedDatabase;
const SECRET = "s".repeat(32);

beforeEach(async () => {
  db = await createTestDb();
  for (const id of ["u1", "u2"]) {
    await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at) values (${id}, ${id}, ${`${id}@example.test`}, false, now(), now())`);
  }
});

const IMAGE = { src: "https://images.unsplash.com/photo-1", alt: "A tote" };

/** An order as fulfil records it (straight into the tables), placed `minutesAgo` minutes ago. */
async function order({ userId = null as string | null, minutesAgo = 0, lines = 1 } = {}) {
  const checkoutId = randomUUID();
  const orderId = randomUUID();
  await db.execute(sql`insert into checkouts (id, email, status, amount, expires_at, payment_reference) values (${checkoutId}, 'a@example.test', 'fulfilled', 1000, now(), ${`ref_${checkoutId}`})`);
  await db.execute(sql`
    insert into orders (id, checkout_id, user_id, email, status, subtotal, currency, payment_provider, payment_reference, guest_key_hash, created_at)
    values (${orderId}, ${checkoutId}, ${userId}, 'a@example.test', 'paid', ${lines * 1000}, 'USD', 'fake', ${`ref_${checkoutId}`},
      ${userId ? null : hashGuestKey(guestOrderKey(SECRET, orderId))}, now() - make_interval(mins => ${minutesAgo}))`);
  for (let line = 0; line < lines; line++) {
    await db.execute(sql`insert into order_items (order_id, name, unit_price, quantity, image) values (${orderId}, ${`Item ${line}`}, 1000, 2, ${JSON.stringify(IMAGE)}::jsonb)`);
  }
  const [row] = rowsOf<{ number: number }>(await db.execute(sql`select number from orders where id = ${orderId}`));
  return { id: orderId, number: Number(row!.number), key: guestOrderKey(SECRET, orderId) };
}

describe("order queries", () => {
  it("list a user's orders newest first, with item counts and up to four photos, and never another user's", async () => {
    const older = await order({ userId: "u1", minutesAgo: 60, lines: 6 });
    const newer = await order({ userId: "u1", minutesAgo: 1 });
    await order({ userId: "u2" });
    await order();

    const list = await getOrdersForUser(db, "u1");
    expect(list.map((o) => o.number)).toEqual([`ORR-${newer.number}`, `ORR-${older.number}`]);
    expect(list[1]).toMatchObject({ status: "paid", subtotal: 6000, itemCount: 12 });
    expect(list[1]!.images).toHaveLength(4);
    expect(list[1]!.images[0]).toEqual(IMAGE);
    expect(await countOrdersForUser(db, "u1")).toBe(2);
    expect(await countOrdersForUser(db, "u2")).toBe(1);
    expect(await getOrdersForUser(db, "nobody")).toEqual([]);
  });

  it("find a user's own order by number, and nothing for another user's", async () => {
    const mine = await order({ userId: "u1" });
    expect(await getOrderForUser(db, "u1", mine.number)).toMatchObject({ number: `ORR-${mine.number}`, userId: "u1" });
    expect(await getOrderForUser(db, "u2", mine.number)).toBeNull();
    expect(await getOrderForUser(db, "u1", 99999)).toBeNull();
  });

  it("find a guest's order only with its key: not with a wrong, altered or missing key, and never a signed-in user's", async () => {
    const guest = await order();
    expect(await getOrderForGuestKey(db, guest.number, guest.key)).toMatchObject({ number: `ORR-${guest.number}`, userId: null });
    const altered = `${guest.key.slice(0, -1)}${guest.key.endsWith("A") ? "B" : "A"}`;
    expect(await getOrderForGuestKey(db, guest.number, altered)).toBeNull();
    expect(await getOrderForGuestKey(db, guest.number, "")).toBeNull();
    expect(await getOrderForGuestKey(db, guest.number, null)).toBeNull();

    // Another guest's key doesn't open this order.
    const other = await order();
    expect(await getOrderForGuestKey(db, guest.number, other.key)).toBeNull();

    const signedIn = await order({ userId: "u1" });
    expect(await getOrderForGuestKey(db, signedIn.number, signedIn.key)).toBeNull();
  });
});
