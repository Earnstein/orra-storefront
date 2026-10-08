import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { session as sessionTable } from "@/db/schema";
import { cookiesFrom, createTestAuth } from "@/test/auth";

// Runs the devices route and actions for real against Better Auth on PGlite; only Next's request
// scope is stood in for (`headers()` returns the test's cookies, `@/lib/auth` is the test instance).
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const { GET } = await import("@/app/api/account/devices/route");
const { signOutDevice, signOutOtherDevices } = await import("@/lib/account/actions");

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;
let t: TestAuth;
let next = 0;

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
});

beforeEach(() => {
  request.headers = new Headers();
});

/** One user signed in on two devices: returns each device's cookies. */
async function twoDevices() {
  const user = { name: "Ada", email: `ada-${++next}@example.test`, password: "correct-horse" };
  const up = await t.auth.api.signUpEmail({ body: user, returnHeaders: true, headers: new Headers({ "user-agent": CHROME_MAC }) });
  const other = await t.auth.api.signInEmail({
    body: { email: user.email, password: user.password },
    returnHeaders: true,
    headers: new Headers({ "user-agent": SAFARI_IPHONE }),
  });
  return { here: cookiesFrom(up.headers), there: cookiesFrom(other.headers), userId: up.response.user.id };
}

async function devices() {
  const response = await GET();
  return { status: response.status, cacheControl: response.headers.get("cache-control"), body: await response.json() };
}

describe("GET /api/account/devices", () => {
  it("answers 401 without a session", async () => {
    expect((await devices()).status).toBe(401);
  });

  it("lists this device first, labelled, without tokens, and privately", async () => {
    const { here } = await twoDevices();
    request.headers = here;
    const { status, cacheControl, body } = await devices();
    expect(status).toBe(200);
    expect(cacheControl).toBe("private, no-store");
    expect(body.devices.map((d: { label: string; current: boolean }) => [d.label, d.current])).toEqual([
      ["Chrome on macOS", true],
      ["Safari on iPhone", false],
    ]);
    expect(JSON.stringify(body)).not.toMatch(/token/i);
  });

  it("still works when the session is more than a day old", async () => {
    const { here, userId } = await twoDevices();
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
    await t.db.update(sessionTable).set({ createdAt: twoDaysAgo }).where(eq(sessionTable.userId, userId));
    request.headers = here;
    const { status, body } = await devices();
    expect(status).toBe(200);
    expect(body.devices).toHaveLength(2);
  });
});

describe("signing devices out", () => {
  it("signs out another device, which is then refused", async () => {
    const { here, there } = await twoDevices();
    request.headers = here;
    const other = (await devices()).body.devices.find((d: { current: boolean }) => !d.current);
    expect(await signOutDevice(other.id)).toEqual({ ok: true, data: undefined });
    expect(await t.auth.api.getSession({ headers: there, query: { disableCookieCache: true } })).toBeNull();
    expect((await devices()).body.devices).toHaveLength(1);
  });

  it("won't sign out this device, or another user's", async () => {
    const mine = await twoDevices();
    const theirs = await twoDevices();
    request.headers = theirs.here;
    const theirDevice = (await devices()).body.devices.find((d: { current: boolean }) => !d.current);

    request.headers = mine.here;
    const thisDevice = (await devices()).body.devices.find((d: { current: boolean }) => d.current);
    expect(await signOutDevice(thisDevice.id)).toMatchObject({ ok: false, error: "invalid" });
    expect(await signOutDevice(theirDevice.id)).toMatchObject({ ok: false, error: "invalid" });
    expect(await t.auth.api.getSession({ headers: theirs.there, query: { disableCookieCache: true } })).not.toBeNull();
  });

  it("signs out every other device and keeps this one", async () => {
    const { here, there } = await twoDevices();
    request.headers = here;
    expect(await signOutOtherDevices()).toEqual({ ok: true, data: undefined });
    expect(await t.auth.api.getSession({ headers: there, query: { disableCookieCache: true } })).toBeNull();
    expect(await t.auth.api.getSession({ headers: here, query: { disableCookieCache: true } })).not.toBeNull();
  });

  it("answers signed-out without a session", async () => {
    expect(await signOutDevice("anything")).toMatchObject({ ok: false, error: "signed-out" });
    expect(await signOutOtherDevices()).toMatchObject({ ok: false, error: "signed-out" });
  });
});
