import { defineConfig, devices } from "@playwright/test";

import { OUTBOX_DIR } from "./e2e/outbox";

// Smoke tests run against a production build (`npm run build` first). Set E2E_BASE_URL to test a
// deployed URL instead of starting a local server.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const ci = !!process.env.CI;

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
        // and emails go to files that tests read (e2e/outbox.ts) instead of being sent.
        env: { BETTER_AUTH_URL: "http://localhost:3100", EMAIL_OUTBOX_DIR: OUTBOX_DIR },
        reuseExistingServer: !ci,
        timeout: 120_000,
      },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
