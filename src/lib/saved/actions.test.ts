import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/db";
import { cookiesFrom, createTestAuth } from "@/test/auth";

// The actions and GET /api/saved run for real on PGlite with a test Better Auth; only Next's
// request scope is stood in for (`headers()` returns the test's cookies).
vi.mock("@/db", async () => ({ db: await (await import("@/test/db")).createTestDb() }));
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));

const { mergeSaved, saveItem, unsaveItem } = await import("@/lib/saved/actions");
const { GET } = await import("@/app/api/saved/route");

let next = 0;

beforeAll(async () => {
  request.auth = (await createTestAuth(db)).auth;
});

beforeEach(() => {
  request.headers = new Headers();
});

async function signIn() {
  const auth = request.auth as Awaited<ReturnType<typeof createTestAuth>>["auth"];
  const { headers } = await auth.api.signUpEmail({
    body: { name: "Ada", email: `ada-${++next}@example.test`, password: "correct-horse" },
    returnHeaders: true,
  });
  request.headers = cookiesFrom(headers);
}

describe("saved items actions", () => {
  it("answer signed-out without a session", async () => {
    expect(await saveItem("leather-tote-tan")).toMatchObject({ ok: false, error: "signed-out" });
    expect(await unsaveItem("leather-tote-tan")).toMatchObject({ ok: false, error: "signed-out" });
    expect(await mergeSaved(["leather-tote-tan"])).toMatchObject({ ok: false, error: "signed-out" });
  });

  it("refuse input that isn't a slug or is too long", async () => {
    await signIn();
    expect(await saveItem("Bad Slug")).toMatchObject({ ok: false, error: "invalid" });
    expect(await unsaveItem("x".repeat(101))).toMatchObject({ ok: false, error: "invalid" });
    expect(await mergeSaved(Array.from({ length: 201 }, (_, i) => `p-${i}`))).toMatchObject({ ok: false, error: "invalid" });
    expect(await mergeSaved(["ok", 42 as unknown as string])).toMatchObject({ ok: false, error: "invalid" });
  });

  it("save, unsave and merge, returning the list", async () => {
    await signIn();
    expect(await saveItem("leather-tote-tan")).toEqual({ ok: true, data: { slugs: ["leather-tote-tan"] } });
    expect(await mergeSaved(["double-monk-shoe", "nope"])).toEqual({
      ok: true,
      data: { slugs: ["double-monk-shoe", "leather-tote-tan"], unmerged: [] },
    });
    expect(await unsaveItem("leather-tote-tan")).toEqual({ ok: true, data: { slugs: ["double-monk-shoe"] } });
  });
});

describe("GET /api/saved", () => {
  it("answers 401 without a session", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signed-out" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lists the user's slugs, privately", async () => {
    await signIn();
    await saveItem("leather-tote-tan");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ slugs: ["leather-tote-tan"] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
