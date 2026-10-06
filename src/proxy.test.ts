import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "@/proxy";

const request = (path: string, init: { cookie?: string; method?: string } = {}) =>
  new NextRequest(`https://orra.test${path}`, {
    method: init.method ?? "GET",
    headers: init.cookie ? { cookie: init.cookie } : {},
  });

describe("proxy", () => {
  it("sends a visitor without a session cookie to sign in, coming back to the same page", () => {
    const response = proxy(request("/account/x?tab=1"));
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response)).toBe("https://orra.test/sign-in?returnTo=%2Faccount%2Fx%3Ftab%3D1");
  });

  it.each(["better-auth.session_token=abc", "__Secure-better-auth.session_token=abc"])("lets %s through", (cookie) => {
    const response = proxy(request("/account", { cookie }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets server actions through, so they answer signed-out themselves", () => {
    const response = proxy(request("/account", { method: "POST" }));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("runs only on account pages", () => {
    const matches = (url: string) => unstable_doesMiddlewareMatch({ config, url });
    expect(matches("/account")).toBe(true);
    expect(matches("/account/settings")).toBe(true);
    expect(matches("/")).toBe(false);
    expect(matches("/products/leather-tote-tan")).toBe(false);
    expect(matches("/accounts")).toBe(false);
  });
});
