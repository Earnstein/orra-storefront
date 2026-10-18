import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { grantAdmin } from "@/db/grant-admin";
import { user } from "@/db/schema";
import { createTestAuth } from "@/test/auth";
import { productionGuardError } from "./db-target";

const PRODUCTION = "ep-prod-123.us-east-2.aws.neon.tech";

describe("admin:grant", () => {
  it("refuses production unless --production is passed, and then only production", () => {
    const guard = (host: string, production: "refuse" | "require") =>
      productionGuardError({ databaseUrl: `postgres://u:p@${host}/db`, productionDbHost: PRODUCTION, production, action: "update roles in" });
    expect(guard(PRODUCTION, "refuse")).toMatch(/Refusing to update roles in it; pass --production/);
    expect(guard(PRODUCTION, "require")).toBeUndefined();
    expect(guard("ep-dev-456.us-east-2.aws.neon.tech", "refuse")).toBeUndefined();
    expect(guard("ep-dev-456.us-east-2.aws.neon.tech", "require")).toMatch(/isn't the production database/);
  });

  it("makes an existing account the owner, matching the email however it's typed", async () => {
    const { auth, db } = await createTestAuth();
    const { user: owner } = await auth.api.signUpEmail({ body: { name: "Owner", email: "owner@example.test", password: "correct-horse" } });
    const { user: shopper } = await auth.api.signUpEmail({ body: { name: "Shopper", email: "shopper@example.test", password: "correct-horse" } });

    expect(await grantAdmin(db, "  Owner@Example.TEST ")).toBe("granted");
    const roles = await db.select({ id: user.id, role: user.role }).from(user);
    expect(roles.find((row) => row.id === owner.id)?.role).toBe("admin");
    expect(roles.find((row) => row.id === shopper.id)?.role).toBe("user");
  });

  it("refuses an unknown email and creates nothing", async () => {
    const { db } = await createTestAuth();
    expect(await grantAdmin(db, "nobody@example.test")).toBe("unknown-email");
    expect(await db.select().from(user).where(eq(user.email, "nobody@example.test"))).toEqual([]);
  });
});
