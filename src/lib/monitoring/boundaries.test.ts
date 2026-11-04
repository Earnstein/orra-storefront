import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BOUNDARY_ERROR_EVENT } from "./client-report";

// The error boundaries tell <Monitoring /> about an error by dispatching its event by name rather
// than importing anything (the root boundary may only import React: src/app/root-error.test.ts).
describe("the error boundaries", () => {
  it.each(["../../app/error.tsx", "../../app/(store)/error.tsx", "../../app/admin/error.tsx"])("%s reports browser errors", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    expect(source).toContain(`new CustomEvent("${BOUNDARY_ERROR_EVENT}", { detail: error })`);
    expect(source).toContain("if (!error.digest)");
  });
});

// <Monitoring /> loads on every page, so what it imports must stay small: Zod alone added about
// 90 KB of browser JavaScript when the reporter imported the route's schema module.
describe("the browser side of monitoring", () => {
  it.each(["../../components/monitoring.tsx", "./client-reporter.ts", "./client-report.ts", "./analytics.ts", "./scrub.ts"])("%s imports neither Zod nor Sentry's runtime", (path) => {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import (type )?.* from "([^"]+)";$/gm)].filter((match) => !match[1]).map((match) => match[2]);
    expect(imports.filter((name) => name === "zod" || name.startsWith("@sentry/") || name.endsWith("client-report-schema"))).toEqual([]);
  });
});
