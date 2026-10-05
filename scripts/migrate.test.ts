import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tsx = fileURLToPath(new URL("../node_modules/.bin/tsx", import.meta.url));
const script = fileURLToPath(new URL("./migrate.ts", import.meta.url));
// .invalid never resolves, so nothing here can reach a real database.
const prod = "ep-prod.invalid";

/** Runs `npm run db:migrate`'s script in a scratch directory whose only env file is `envFile`. */
function runMigrate(envFile: string, args: string[] = []) {
  const cwd = mkdtempSync(join(tmpdir(), "migrate-guard-"));
  writeFileSync(join(cwd, ".env"), envFile);
  const env = { PATH: process.env.PATH ?? "", NODE_ENV: "test" } as const; // nothing inherited from this shell
  return spawnSync(tsx, [script, ...args], { cwd, env, encoding: "utf8", timeout: 30_000 });
}

describe("scripts/migrate.ts", () => {
  it("refuses production, and VERCEL_ENV in an env file can't switch the guard off", () => {
    const result = runMigrate(`DATABASE_URL=postgresql://u:p@${prod}/db\nPRODUCTION_DB_HOST=${prod}\nVERCEL_ENV=production\n`);
    expect(result.stderr).toMatch(/Refusing to migrate/);
    expect(result.status).toBe(1);
  });

  it("with --production, refuses a database that isn't production", () => {
    const result = runMigrate(`DATABASE_URL=postgresql://u:p@ep-dev.invalid/db\nPRODUCTION_DB_HOST=${prod}\n`, ["--production"]);
    expect(result.stderr).toMatch(/--production was passed, but DATABASE_URL isn't the production database/);
    expect(result.status).toBe(1);
  });
});
