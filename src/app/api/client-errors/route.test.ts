import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb } from "@/test/db";

// The route's own rules, against PGlite for its rate limits; what Sentry then receives is covered
// with a real client in src/lib/monitoring/pipeline.test.ts.
const state = vi.hoisted(() => ({ db: undefined as unknown, env: {} as Record<string, string | undefined>, on: true }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  serverEnv: () => state.env,
}));
const reportClientError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/monitoring/report", () => ({ monitoringOn: () => state.on, reportClientError }));

const { POST } = await import("./route");
const { CLIENT_ERROR_LIMITS } = await import("@/lib/monitoring/client-report-schema");
state.db = await createTestDb();

const ORIGIN = "https://orra-storefront.vercel.app";
const report = { name: "TypeError", message: "x is undefined", stack: "TypeError: x is undefined", path: "/collections/women", source: "window" };
let address = 0;
const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN, "x-forwarded-for": `203.0.113.${address}` }) =>
  POST(new Request(`${ORIGIN}/api/client-errors`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  state.env = { BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: ORIGIN };
  state.on = true;
  address += 1;
  reportClientError.mockClear();
});

describe("POST /api/client-errors", () => {
  it("refuses other origins and requests without one", async () => {
    expect((await post(report, { origin: "https://elsewhere.example" })).status).toBe(403);
    expect((await post(report, {})).status).toBe(403);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("refuses bodies over the limit, by their header or their bytes, and anything that isn't a report", async () => {
    expect((await post(report, { origin: ORIGIN, "content-length": "40001" })).status).toBe(413);
    expect((await post({ ...report, stack: "x".repeat(41_000) })).status).toBe(413);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ ...report, source: "elsewhere" })).status).toBe(400);
    expect((await post({ ...report, path: "https://elsewhere.example/" })).status).toBe(400);
    expect((await post({ ...report, path: "//elsewhere.example/" })).status).toBe(400);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("accepts a report at its limits written in four-byte characters", async () => {
    const response = await post({ ...report, message: "😀".repeat(500), stack: "😀".repeat(8000) });
    expect(response.status).toBe(204);
  });

  it("forwards a report with the page's origin, and answers 204 privately", async () => {
    const response = await post(report);
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(reportClientError).toHaveBeenCalledWith(report, ORIGIN);
  });

  it("answers 204 without forwarding while monitoring is off", async () => {
    state.on = false;
    expect((await post(report)).status).toBe(204);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("on Vercel, takes at most 20 a day from one address", async () => {
    state.env = { ...state.env, VERCEL_ENV: "production" };
    const statuses = [];
    for (let n = 0; n <= CLIENT_ERROR_LIMITS.perAddress.max; n += 1) statuses.push((await post(report)).status);
    expect(statuses.filter((status) => status === 204)).toHaveLength(CLIENT_ERROR_LIMITS.perAddress.max);
    expect(statuses.at(-1)).toBe(429);
  });

  it("on Vercel, takes at most 100 a day from everyone, however many addresses send them", async () => {
    state.env = { ...state.env, VERCEL_ENV: "production" };
    const statuses = [];
    for (let n = 0; n <= CLIENT_ERROR_LIMITS.overall.max; n += 1) {
      address += 1;
      statuses.push((await post(report)).status);
    }
    expect(statuses.filter((status) => status === 204).length).toBeLessThanOrEqual(CLIENT_ERROR_LIMITS.overall.max);
    expect(statuses.at(-1)).toBe(429);
  });
});
