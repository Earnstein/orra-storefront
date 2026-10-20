import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

import { OUTBOX_DIR } from "./e2e/outbox";

// Smoke tests run against a production build (`npm run build` first). Set E2E_BASE_URL to test a
// deployed URL instead of starting a local server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const ci = !!process.env.CI;
// The local server's secret for the demo reset route, made fresh for each run; the reset spec
// (e2e/demo-reset.spec.ts) reads it from the environment the workers inherit.
process.env.E2E_CRON_SECRET ??= randomBytes(32).toString("hex");

export default defineConfig({
  testDir: "e2e",
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "on-first-retry" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run start -- -p 3100",
        url: "http://localhost:3100",
        // Better Auth only accepts requests from its base URL's origin (.env.local may point at :3000),
        // emails go to files that tests read (e2e/outbox.ts) instead of being sent, and the reset
        // route takes this run's secret.
        env: { BETTER_AUTH_URL: "http://localhost:3100", EMAIL_OUTBOX_DIR: OUTBOX_DIR, CRON_SECRET: process.env.E2E_CRON_SECRET },
        reuseExistingServer: !ci,
        timeout: 120_000,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
