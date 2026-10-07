import { describe, expect, it } from "vitest";

import { clearAccountsGuardError, databaseTarget, productionGuardError } from "./db-target";

const url = (host: string) => `postgresql://u:p@${host}/neondb?sslmode=require`;
const prod = "ep-prod-123.us-east-2.aws.neon.tech";
const dev = "ep-dev-456.us-east-2.aws.neon.tech";

describe("databaseTarget", () => {
  it("recognises the production endpoint, pooled or direct, however PRODUCTION_DB_HOST is written", () => {
    expect(databaseTarget({ databaseUrl: url(prod), productionDbHost: prod })).toBe("production");
    expect(databaseTarget({ databaseUrl: url("ep-prod-123-pooler.us-east-2.aws.neon.tech"), productionDbHost: `${prod}.` })).toBe(
      "production",
    );
  });

  it("reports any other endpoint as other", () => {
    expect(databaseTarget({ databaseUrl: url(dev), productionDbHost: prod })).toBe("other");
  });

  it("can't tell without PRODUCTION_DB_HOST or a valid DATABASE_URL", () => {
    expect(databaseTarget({ databaseUrl: url(prod), productionDbHost: " " })).toBe("unknown");
    expect(databaseTarget({ databaseUrl: url(prod), productionDbHost: undefined })).toBe("unknown");
    expect(databaseTarget({ databaseUrl: "not a url", productionDbHost: prod })).toBe("unknown");
    expect(databaseTarget({ databaseUrl: undefined, productionDbHost: prod })).toBe("unknown");
  });
});

describe("productionGuardError", () => {
  const guard = (databaseUrl: string, productionDbHost: string | undefined, production: "refuse" | "require" | "allow", action: "seed" | "migrate" = "seed") =>
    productionGuardError({ databaseUrl, productionDbHost, production, action });

  it("refuses the production database by default", () => {
    expect(guard(url(prod), prod, "refuse")).toMatch(/Refusing to seed.*--production/);
    expect(guard(url(prod), prod, "refuse", "migrate")).toMatch(/Refusing to migrate.*--production/);
  });

  it("lets other databases through by default, and CI where PRODUCTION_DB_HOST is unset", () => {
    expect(guard(url(dev), prod, "refuse")).toBeUndefined();
    expect(guard(url(prod), undefined, "refuse", "migrate")).toBeUndefined();
  });

  it("with --production, requires the production database, so a release can't quietly hit another one", () => {
    expect(guard(url(prod), prod, "require")).toBeUndefined();
    expect(guard(url(dev), prod, "require")).toMatch(/--production was passed, but DATABASE_URL isn't the production database/);
    expect(guard(url(prod), undefined, "require", "migrate")).toMatch(/--production was passed, but .* can't be confirmed/);
  });

  it("never stops a Vercel production build", () => {
    expect(guard(url(prod), prod, "allow", "migrate")).toBeUndefined();
    expect(guard(url(prod), undefined, "allow", "migrate")).toBeUndefined();
  });
});

describe("clearAccountsGuardError", () => {
  const production = "ep-cool-name-123.us-east-2.aws.neon.tech";
  const url = (host: string) => `postgresql://user:pass@${host}/neondb?sslmode=require`;

  it("allows a database confirmed as not production", () => {
    expect(clearAccountsGuardError({ databaseUrl: url("ep-other-456.us-east-2.aws.neon.tech"), productionDbHost: production }))
      .toBeUndefined();
  });

  it("always refuses production, pooled or not, with no override", () => {
    for (const host of [production, "ep-cool-name-123-pooler.us-east-2.aws.neon.tech"]) {
      expect(clearAccountsGuardError({ databaseUrl: url(host), productionDbHost: production })).toMatch(/production/);
    }
  });

  it("refuses when it can't tell (no PRODUCTION_DB_HOST or no DATABASE_URL)", () => {
    expect(clearAccountsGuardError({ databaseUrl: url("ep-other-456.us-east-2.aws.neon.tech"), productionDbHost: undefined }))
      .toMatch(/PRODUCTION_DB_HOST/);
    expect(clearAccountsGuardError({ databaseUrl: undefined, productionDbHost: production })).toMatch(/DATABASE_URL/);
  });
});
