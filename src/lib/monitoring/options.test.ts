import { describe, expect, it } from "vitest";

import { monitoringOptions } from "./options";

// Built from parts, so it reads as the placeholder it is.
const DSN = ["https://", "public", "@", "o0.ingest.sentry.io", "/0"].join("");

describe("monitoringOptions", () => {
  it("is off without a DSN, or with one that isn't a URL", () => {
    expect(monitoringOptions({})).toBeNull();
    expect(monitoringOptions({ SENTRY_DSN: "  " })).toBeNull();
    expect(monitoringOptions({ SENTRY_DSN: "not a dsn" })).toBeNull();
  });

  it("collects nothing optional, traces nothing, captures logged errors and scrubs every event", () => {
    const options = monitoringOptions({ SENTRY_DSN: ` ${DSN} `, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_SHA: "abc123" });
    expect(options).toMatchObject({
      dsn: DSN,
      environment: "production",
      release: "abc123",
      tracePropagationTargets: [],
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        graphQL: { document: false, variables: false },
      },
    });
    expect(options?.beforeSend).toBeTypeOf("function");
    expect(options?.beforeBreadcrumb).toBeTypeOf("function");
    expect(options).not.toHaveProperty("tracesSampleRate");
    const integrations = (options?.integrations as (defaults: { name: string }[]) => { name: string }[])([]);
    expect(integrations.map((integration) => integration.name)).toEqual(["CaptureConsole"]);
  });

  it("names local runs as such", () => {
    expect(monitoringOptions({ SENTRY_DSN: DSN })).toMatchObject({ environment: "development", release: undefined });
  });
});
