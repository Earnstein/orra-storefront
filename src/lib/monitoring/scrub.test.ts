import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import { scrubEvent, scrubText, scrubUrl } from "./scrub";

const event = (overrides: Partial<ErrorEvent>): ErrorEvent => ({ type: undefined, ...overrides });

describe("scrubUrl", () => {
  it("drops the guest order key and the reset token, and keeps other parameters", () => {
    expect(scrubUrl("/orders/ORR-10001?key=abc&x=1")).toBe("/orders/ORR-10001?x=1");
    expect(scrubUrl("/sign-in/reset-password?token=abc")).toBe("/sign-in/reset-password");
    expect(scrubUrl("https://orra-storefront.vercel.app/collections/women?colour=black#top")).toBe(
      "https://orra-storefront.vercel.app/collections/women?colour=black#top",
    );
  });

  it("drops them inside a path Better Auth puts the token in, and leaves anything unparseable alone", () => {
    expect(scrubUrl("/api/auth/reset-password/abc123?callbackURL=%2Fsign-in")).toBe("/api/auth/reset-password/[token]?callbackURL=%2Fsign-in");
    expect(scrubUrl("not a url")).toBe("not a url");
  });
});

describe("scrubText", () => {
  it("replaces email addresses and keys or tokens in links", () => {
    expect(scrubText("No account for ada.lovelace+shop@example.test, sorry")).toBe("No account for [email], sorry");
    expect(scrubText("fetch failed: /orders/ORR-10001?key=abc")).toBe("fetch failed: /orders/ORR-10001");
  });
});

describe("scrubEvent", () => {
  it("removes cookies, headers, bodies, query strings and the IP address", () => {
    const scrubbed = scrubEvent(
      event({
        request: {
          url: "https://orra-storefront.vercel.app/orders/ORR-10001?key=abc",
          method: "GET",
          cookies: { session: "x" },
          headers: { cookie: "x", "user-agent": "y" },
          data: { email: "ada@example.test" },
          query_string: "key=abc",
          env: { REMOTE_ADDR: "1.2.3.4" },
        },
        user: { id: "user_1", email: "ada@example.test", ip_address: "1.2.3.4" },
      }),
    );
    expect(scrubbed?.request).toEqual({ url: "https://orra-storefront.vercel.app/orders/ORR-10001", method: "GET" });
    expect(scrubbed?.user).toBeUndefined();
  });

  it("scrubs messages, exception values and breadcrumbs", () => {
    const scrubbed = scrubEvent(
      event({
        message: "Couldn't email ada@example.test",
        exception: { values: [{ type: "Error", value: "User ada@example.test not found" }] },
        breadcrumbs: [{ category: "fetch", message: "GET /orders/ORR-1?key=abc", data: { url: "/orders/ORR-1?key=abc" } }],
      }),
    );
    expect(scrubbed?.message).toBe("Couldn't email [email]");
    expect(scrubbed?.exception?.values?.[0]?.value).toBe("User [email] not found");
    expect(scrubbed?.breadcrumbs?.[0]).toMatchObject({ message: "GET /orders/ORR-1", data: { url: "/orders/ORR-1" } });
  });

  it("drops known noise", () => {
    expect(scrubEvent(event({ exception: { values: [{ type: "AbortError", value: "The operation was aborted." }] } }))).toBeNull();
    expect(scrubEvent(event({ message: "ResizeObserver loop completed with undelivered notifications." }))).toBeNull();
    const fromExtension = event({
      exception: { values: [{ type: "TypeError", value: "x is undefined", stacktrace: { frames: [{ filename: "chrome-extension://abc/content.js" }] } }] },
    });
    expect(scrubEvent(fromExtension)).toBeNull();
  });
});
