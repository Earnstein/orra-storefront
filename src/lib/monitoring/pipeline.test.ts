import type { ErrorEvent } from "@sentry/nextjs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// What Sentry would actually send: a real client with our options, its own integrations (request
// data, context lines, console capture and breadcrumbs) running, and `beforeSend` recording the
// scrubbed event instead of sending it.
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "log").mockImplementation(() => {});
const Sentry = await import("@sentry/nextjs");
const { monitoringOptions } = await import("./options");
const { reportClientError, reportError } = await import("./report");

const DSN = ["https://", "public", "@", "o0.ingest.sentry.io", "/0"].join("");
const ORIGIN = "https://orra-storefront.vercel.app";
const sent: ErrorEvent[] = [];

beforeAll(() => {
  const options = monitoringOptions({ SENTRY_DSN: DSN })!;
  Sentry.init({
    ...options,
    beforeSend: (event, hint) => {
      const scrubbed = options.beforeSend!(event, hint) as ErrorEvent | null;
      if (scrubbed) sent.push(scrubbed);
      return null;
    },
  });
});
beforeEach(() => {
  sent.length = 0;
});

/** Runs `send` as if inside a request to the client-error route, then waits for Sentry. */
async function duringRequest(send: () => void) {
  await Sentry.withIsolationScope(async (scope) => {
    scope.setSDKProcessingMetadata({ normalizedRequest: { url: `${ORIGIN}/api/client-errors`, method: "POST" } });
    send();
    await Sentry.flush(1000);
  });
}
const json = () => JSON.stringify(sent);

describe("events as Sentry would send them", () => {
  it("a relayed browser error carries its page, not the relay route", async () => {
    await duringRequest(() =>
      reportClientError({ name: "TypeError", message: "x is undefined", stack: `TypeError: x\n    at f (${ORIGIN}/_next/static/chunks/a.js:1:2)`, path: "/collections/women", source: "window" }, ORIGIN),
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.request).toEqual({ url: `${ORIGIN}/collections/women`, method: "GET" });
    expect(sent[0]!.transaction).toBe("/collections/women");
    expect(sent[0]!.tags).toMatchObject({ runtime: "browser", source: "window" });
  });

  it("keeps only frames from our own origin, so a posted stack can't make the server read its files", async () => {
    const stack = [
      "TypeError: x",
      "    at a (/var/task/.next/server/chunks/ssr/secret.js:2:1)",
      `    at b (https://elsewhere.example/script.js?key=abc:3:4)`,
      `    at c (${ORIGIN}/_next/static/chunks/a.js?v=1:1:2)`,
    ].join("\n");
    await duringRequest(() => reportClientError({ name: "TypeError", message: "x", stack, path: "/", source: "window" }, ORIGIN));
    const frames = sent[0]!.exception!.values![0]!.stacktrace!.frames!;
    expect(frames).toEqual([expect.objectContaining({ filename: `${ORIGIN}/_next/static/chunks/a.js`, function: "c" })]);
    expect(frames[0]).not.toHaveProperty("context_line");
  });

  it("scrubs a stack kept as text", async () => {
    const stack = `f@${ORIGIN}/orders/ORR-1?key=abc:1:2\nmailed ada@example.test`;
    await duringRequest(() => reportClientError({ name: "Error", message: "x", stack, path: "/", source: "window" }, ORIGIN));
    expect(sent[0]!.extra).toEqual({ stack: `f@${ORIGIN}/orders/ORR-1\nmailed [email]` });
  });

  it("drops a database error's bound values, wherever the error ends up", async () => {
    // Built at run time: Sentry quotes source lines around each frame, so a literal would show up there.
    const bound = ["session", "value", String(Date.now())].join("-");
    const cause = new Error(`Failed query: select * from session where token = $1\nparams: ${bound}`);
    await duringRequest(() => reportError(new Error("Couldn't read the session", { cause })));
    expect(json()).toContain("Failed query: select * from session where token = $1");
    expect(json()).not.toContain(bound);
  });

  it("reports errors the app logs, scrubbed, but not the email failures expected without a domain", async () => {
    await duringRequest(() => {
      console.error("[email] failed to send to=ada@example.test subject=Your order: You can only send testing emails to your own address");
      console.error("payments: webhook handling failed", "evt_1", "ada@example.test isn't a customer");
    });
    expect(sent).toHaveLength(1);
    expect(json()).toContain("payments: webhook handling failed");
    expect(json()).not.toContain("ada@example.test");
  });

  it("keeps emails out of breadcrumbs, including console arguments", async () => {
    await duringRequest(() => {
      console.log("[email] sent to=ada@example.test");
      reportError(new Error("boom"));
    });
    expect(json()).not.toContain("ada@example.test");
  });
});
