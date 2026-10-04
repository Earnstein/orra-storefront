import { describe, expect, it } from "vitest";

import { buildSteps, previewGuardError } from "./vercel-build-steps";

describe("buildSteps", () => {
  it("migrates and seeds previews before building", () => {
    expect(buildSteps("preview")).toEqual(["db:migrate", "db:seed", "build"]);
  });

  it("migrates production before building", () => {
    expect(buildSteps("production")).toEqual(["db:migrate", "build"]);
  });

  it("never seeds production", () => {
    expect(buildSteps("production")).not.toContain("db:seed");
  });

  it.each([undefined, "development"])("only builds when VERCEL_ENV is %p", (env) => {
    expect(buildSteps(env)).toEqual(["build"]);
  });
});

describe("previewGuardError", () => {
  const production = "ep-cool-name-123.us-east-2.aws.neon.tech";
  const url = (host: string) => `postgresql://user:pass@${host}/neondb?sslmode=require`;

  it("allows a preview on its own Neon branch", () => {
    expect(previewGuardError({ databaseUrl: url("ep-other-name-456-pooler.us-east-2.aws.neon.tech"), productionDbHost: production })).toBeUndefined();
  });

  it("refuses a preview pointed at the production database, pooled or direct", () => {
    expect(previewGuardError({ databaseUrl: url("ep-cool-name-123-pooler.us-east-2.aws.neon.tech"), productionDbHost: production })).toMatch(/production database/);
    expect(previewGuardError({ databaseUrl: url(production), productionDbHost: "ep-cool-name-123-pooler.us-east-2.aws.neon.tech" })).toMatch(/production database/);
  });

  it("treats different spellings of the production host as production", () => {
    const blocked = /production database/;
    // A terminal dot is the same host (URL.hostname keeps it).
    expect(previewGuardError({ databaseUrl: url(`${production}.`), productionDbHost: production })).toMatch(blocked);
    expect(previewGuardError({ databaseUrl: url(production), productionDbHost: `${production}.` })).toMatch(blocked);
    // Case, surrounding whitespace, a port, or a whole connection string pasted as PRODUCTION_DB_HOST.
    expect(previewGuardError({ databaseUrl: url(production.toUpperCase()), productionDbHost: production })).toMatch(blocked);
    expect(previewGuardError({ databaseUrl: url(production), productionDbHost: `  ${production}\n` })).toMatch(blocked);
    expect(previewGuardError({ databaseUrl: url(production), productionDbHost: `${production}:5432` })).toMatch(blocked);
    expect(previewGuardError({ databaseUrl: url(production), productionDbHost: url("ep-cool-name-123-pooler.us-east-2.aws.neon.tech.") })).toMatch(blocked);
  });

  it("refuses when it can't tell", () => {
    expect(previewGuardError({ databaseUrl: url("ep-other-name-456.us-east-2.aws.neon.tech"), productionDbHost: undefined })).toMatch(/PRODUCTION_DB_HOST/);
    expect(previewGuardError({ databaseUrl: url("ep-other-name-456.us-east-2.aws.neon.tech"), productionDbHost: "  " })).toMatch(/PRODUCTION_DB_HOST/);
    expect(previewGuardError({ databaseUrl: undefined, productionDbHost: production })).toMatch(/DATABASE_URL/);
    expect(previewGuardError({ databaseUrl: "not a url", productionDbHost: production })).toMatch(/DATABASE_URL/);
  });
});
