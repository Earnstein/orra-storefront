import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const { scripts } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

// drizzle-kit loads .env (production, locally) on startup, before drizzle.config.ts runs, and dotenv
// never overrides a value that is already set; so without these, `.env.local` loses to `.env`.
describe("database npm scripts", () => {
  it("migrates through the guarded wrapper", () => {
    expect(scripts["db:migrate"]).toBe("tsx scripts/migrate.ts");
  });

  it("seeds through the guarded seed script", () => {
    expect(scripts["db:seed"]).toBe("tsx scripts/seed-catalog.ts");
  });

  it("makes every direct drizzle-kit command read .env.local before .env", () => {
    const direct = Object.entries(scripts).filter(([, command]) => /\bdrizzle-kit\b/.test(command));
    expect(direct.map(([name]) => name).sort()).toEqual(["db:generate", "db:push", "db:studio"]);
    for (const [name, command] of direct) expect(command, name).toMatch(/^DOTENV_CONFIG_PATH=\.env\.local drizzle-kit /);
  });
});
