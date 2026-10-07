import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { clearAccounts } from "@/db/clear-accounts";
import { account, categories, products, rateLimit, session, user, verification } from "@/db/schema";
import { createTestAuth } from "@/test/auth";

describe("clearAccounts", () => {
  it("removes every auth row and leaves the catalogue", async () => {
    const { auth, db } = await createTestAuth();
    await auth.api.signUpEmail({ body: { name: "Ada", email: "ada@example.test", password: "correct-horse" } });
    await auth.api.signUpEmail({ body: { name: "Grace", email: "grace@example.test", password: "correct-horse" } });
    await auth.api.requestPasswordReset({ body: { email: "ada@example.test" } });
    await db.insert(rateLimit).values({ id: "rl_1", key: "127.0.0.1|/sign-in/email", count: 1, lastRequest: Date.now() });

    const total = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0].n;
    const catalogueBefore = [await total(products), await total(categories)];
    for (const table of [user, session, account, verification, rateLimit]) expect(await total(table)).toBeGreaterThan(0);

    expect(await clearAccounts(db)).toEqual({ users: 2 });

    for (const table of [user, session, account, verification, rateLimit]) expect(await total(table)).toBe(0);
    expect([await total(products), await total(categories)]).toEqual(catalogueBefore);
  });

  it("is a no-op on a database without accounts", async () => {
    const { db } = await createTestAuth();
    expect(await clearAccounts(db)).toEqual({ users: 0 });
  });
});
