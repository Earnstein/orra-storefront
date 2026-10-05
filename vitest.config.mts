import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": src,
      // The real package throws outside React Server Components; see src/test/server-only.ts.
      "server-only": `${src}/test/server-only.ts`,
      // cacheTag/cacheLife throw outside a Next.js render; see src/test/next-cache.ts.
      "next/cache": `${src}/test/next-cache.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
