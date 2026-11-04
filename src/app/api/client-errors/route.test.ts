import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb } from "@/test/db";

// The route against PGlite (for its rate limit), with Sentry and the environment stood in for.
const state = vi.hoisted(() => ({ db: undefined as unknown, env: {} as Record<string, string | undefined> }));
vi.mock("@/db", () => ({
  get db() {
    return state.db;
  },
}));
vi.mock("@/lib/env", async (original) => ({
  ...(await original<typeof import("@/lib/env")>()),
  serverEnv: () => state.env,
}));
const sentry = vi.hoisted(() => ({ isInitialized: vi.fn(() => true), captureEvent: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock("@sentry/nextjs", async (original) => ({ ...(await original<typeof import("@sentry/nextjs")>()), ...sentry }));
vi.mock("next/server", () => ({ after: () => {} }));

const { POST } = await import("./route");
state.db = await createTestDb();

const ORIGIN = "https://orra-storefront.vercel.app";
const report = {
  name: "TypeError",
  message: "x is undefined",
  stack: `TypeError: x is undefined\n    at onClick (${ORIGIN}/_next/static/chunks/abc.js:1:2345)`,
  path: "/collections/women",
  source: "window",
};
const post = (body: unknown, headers: Record<string, string> = { origin: ORIGIN, "x-forwarded-for": "203.0.113.7" }) =>
  POST(new Request(`${ORIGIN}/api/client-errors`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  state.env = { BETTER_AUTH_SECRET: "s".repeat(32), BETTER_AUTH_URL: ORIGIN };
  sentry.captureEvent.mockClear();
  sentry.isInitialized.mockReturnValue(true);
});

describe("POST /api/client-errors", () => {
  it("refuses other origins and requests without one", async () => {
    expect((await post(report, { origin: "https://elsewhere.example" })).status).toBe(403);
    expect((await post(report, {})).status).toBe(403);
    expect(sentry.captureEvent).not.toHaveBeenCalled();
  });

  it("refuses bodies over 16 KB and anything that isn't a report", async () => {
    expect((await post({ ...report, stack: "x".repeat(17_000) })).status).toBe(413);
    expect((await post("not json")).status).toBe(400);
    expect((await post({ ...report, source: "elsewhere" })).status).toBe(400);
    expect((await post({ ...report, path: "https://elsewhere.example/" })).status).toBe(400);
    expect(sentry.captureEvent).not.toHaveBeenCalled();
  });

  it("forwards a report to Sentry with its stack as frames and the path without a query", async () => {
    const response = await post({ ...report, path: "/orders/ORR-10001?key=abc" });
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const event = sentry.captureEvent.mock.calls[0]![0];
    expect(event).toMatchObject({
      level: "error",
      platform: "javascript",
      request: { url: "/orders/ORR-10001" },
      tags: { runtime: "browser", source: "window" },
      exception: { values: [{ type: "TypeError", value: "x is undefined" }] },
    });
    expect(event.exception.values[0].stacktrace.frames).toEqual([
      expect.objectContaining({ filename: `${ORIGIN}/_next/static/chunks/abc.js`, function: "onClick", lineno: 1, colno: 2345 }),
    ]);
  });

  it("keeps a stack it can't parse as text", async () => {
    await post({ ...report, stack: `onClick@${ORIGIN}/_next/static/chunks/abc.js:1:2345` });
    const event = sentry.captureEvent.mock.calls[0]![0];
    expect(event.exception.values[0].stacktrace).toBeUndefined();
    expect(event.extra).toEqual({ stack: `onClick@${ORIGIN}/_next/static/chunks/abc.js:1:2345` });
  });

  it("answers 204 without sending while monitoring is off", async () => {
    sentry.isInitialized.mockReturnValue(false);
    expect((await post(report)).status).toBe(204);
    expect(sentry.captureEvent).not.toHaveBeenCalled();
  });

  it("on Vercel, takes at most 10 reports a minute from one address", async () => {
    state.env = { ...state.env, VERCEL_ENV: "production" };
    const statuses = [];
    for (let n = 0; n < 11; n += 1) statuses.push((await post(report)).status);
    expect(statuses.slice(0, 10).every((status) => status === 204)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(sentry.captureEvent).toHaveBeenCalledTimes(10);
  });
});
