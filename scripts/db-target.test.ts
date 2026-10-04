import { describe, expect, it } from "vitest";

import { databaseTarget, seedGuardError } from "./db-target";

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

describe("seedGuardError", () => {
  it("refuses the production database unless --production is passed", () => {
    expect(seedGuardError({ databaseUrl: url(prod), productionDbHost: prod, allowProduction: false })).toMatch(/--production/);
    expect(seedGuardError({ databaseUrl: url(prod), productionDbHost: prod, allowProduction: true })).toBeUndefined();
  });

  it("allows other databases, and CI where PRODUCTION_DB_HOST is unset", () => {
    expect(seedGuardError({ databaseUrl: url(dev), productionDbHost: prod, allowProduction: false })).toBeUndefined();
    expect(seedGuardError({ databaseUrl: url(prod), productionDbHost: undefined, allowProduction: false })).toBeUndefined();
  });
});
