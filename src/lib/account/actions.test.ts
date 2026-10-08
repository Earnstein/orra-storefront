import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cookiesFrom, createTestAuth } from "@/test/auth";

// The actions run for real against Better Auth on PGlite; only Next's request scope is stood in
// for: `headers()` returns the test's cookies, and `@/lib/auth` is the test instance.
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const { updateName } = await import("@/lib/account/actions");

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;
let t: TestAuth;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
});

async function signUp() {
  const email = `ada-${++next}@example.test`;
  const { headers } = await t.auth.api.signUpEmail({
    body: { name: "Ada", email, password: "correct-horse" },
    returnHeaders: true,
  });
  return { cookies: cookiesFrom(headers), email };
}

beforeEach(() => {
  request.headers = new Headers();
});

describe("updateName", () => {
  it("answers signed-out without a session", async () => {
    expect(await updateName("Grace")).toMatchObject({ ok: false, error: "signed-out" });
  });

  it("refuses a blank or too-long name", async () => {
    request.headers = (await signUp()).cookies;
    expect(await updateName("   ")).toEqual({ ok: false, error: "invalid", message: "Enter your name." });
    expect(await updateName("x".repeat(81))).toEqual({ ok: false, error: "invalid", message: "Use at most 80 characters." });
  });

  it("saves the trimmed name", async () => {
    const { cookies } = await signUp();
    request.headers = cookies;
    expect(await updateName("  Grace Hopper ")).toEqual({ ok: true, data: { name: "Grace Hopper" } });
    const session = await t.auth.api.getSession({ headers: cookies, query: { disableCookieCache: true } });
    expect(session?.user.name).toBe("Grace Hopper");
  });

  it("answers signed-out once the session has been revoked, even with its cache cookie", async () => {
    const { cookies } = await signUp();
    const { token } = (await t.auth.api.getSession({ headers: cookies }))!.session;
    await t.auth.api.revokeSession({ body: { token }, headers: cookies });
    request.headers = cookies;
    expect(await updateName("Grace")).toMatchObject({ ok: false, error: "signed-out" });
  });
});
