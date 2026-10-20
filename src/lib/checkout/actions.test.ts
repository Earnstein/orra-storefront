import { beforeAll, describe, expect, it, vi } from "vitest";

import { cookiesFrom, createTestAuth } from "@/test/auth";

// startCheckout's own checks before a hold is made; the rest is startCheckoutWith (start.test.ts).
const request = vi.hoisted(() => ({ auth: undefined as unknown, db: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("@/db", () => ({
  get db() {
    return request.db;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers, cookies: async () => ({ get: () => undefined }) }));

const { startCheckout } = await import("./actions");
const { ensureDemoAdmin } = await import("@/lib/admin/demo");
let t: Awaited<ReturnType<typeof createTestAuth>>;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
  request.db = t.db;
});

describe("startCheckout", () => {
  it("refuses the shared demo admin: its orders and bag would be every demo visitor's", async () => {
    const { id } = await ensureDemoAdmin(t.db);
    const { headers } = await t.auth.api.signInAsDemoAdmin({ body: { userId: id }, headers: new Headers(), returnHeaders: true });
    request.headers = cookiesFrom(headers);
    expect(await startCheckout({ email: "demo-admin@orra.invalid" })).toEqual({
      ok: false,
      error: "invalid",
      reason: "unavailable",
      message: "Checkout isn't part of the admin demo. Sign out of the demo to shop as yourself.",
    });
  });
});
