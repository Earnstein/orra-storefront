import { describe, expect, it, vi } from "vitest";

import { analyticsBeforeSend } from "./analytics";
import { clientReportSchema } from "./client-report-schema";
import { createClientReporter, MAX_REPORTS_PER_PAGE, toClientReport } from "./client-reporter";

describe("toClientReport", () => {
  it("keeps the error's name, message and stack, trimmed to the limits the route accepts", () => {
    const error = new TypeError("x".repeat(600));
    error.stack = `TypeError: boom\n${"    at f (https://orra-storefront.vercel.app/_next/static/chunks/a.js:1:2)\n".repeat(200)}`;
    const report = toClientReport(error, "window", "/collections/women");
    expect(report).toMatchObject({ name: "TypeError", source: "window", path: "/collections/women" });
    expect(report.message).toHaveLength(500);
    expect(report.stack!.length).toBeLessThanOrEqual(8000);
    expect(clientReportSchema.safeParse(report).success).toBe(true);
  });

  it("turns anything thrown into a report", () => {
    expect(toClientReport("plain string", "rejection", "/")).toMatchObject({ name: "Error", message: "plain string" });
    expect(toClientReport(undefined, "rejection", "/")).toMatchObject({ message: "undefined" });
    expect(toClientReport({ reason: 1 }, "rejection", "/")).toMatchObject({ message: '{"reason":1}' });
  });
});

describe("createClientReporter", () => {
  it("sends each error once, and at most five a page", () => {
    const post = vi.fn();
    const report = createClientReporter(post, () => "/bag");
    report(new Error("same"), "window");
    report(new Error("same"), "window");
    for (let n = 0; n < 10; n += 1) report(new Error(`error ${n}`), "window");
    expect(post).toHaveBeenCalledTimes(MAX_REPORTS_PER_PAGE);
    expect(post.mock.calls[0]![0]).toMatchObject({ message: "same", path: "/bag" });
  });

  it("sends the path without its query, so order keys and reset tokens never leave the browser", () => {
    const post = vi.fn();
    createClientReporter(post, () => "/orders/ORR-10001?key=abc")(new Error("boom"), "boundary");
    expect(post.mock.calls[0]![0].path).toBe("/orders/ORR-10001");
  });
});

describe("analyticsBeforeSend", () => {
  it("drops order keys and reset tokens from page views", () => {
    expect(analyticsBeforeSend({ type: "pageview", url: "https://orra-storefront.vercel.app/orders/ORR-10001?key=abc" })).toEqual({
      type: "pageview",
      url: "https://orra-storefront.vercel.app/orders/ORR-10001",
    });
    expect(analyticsBeforeSend({ type: "pageview", url: "https://orra-storefront.vercel.app/collections/women?colour=black" })?.url).toBe(
      "https://orra-storefront.vercel.app/collections/women?colour=black",
    );
  });
});
