import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user as users } from "@/db/schema";
import { cookiesFrom, createTestAuth } from "@/test/auth";

// Better Auth runs for real on PGlite; Next's request scope is stood in for, as in
// src/lib/account/actions.test.ts, and redirect/notFound throw something the tests can read.
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers() }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("redirect"), { to });
  },
  notFound: () => {
    throw Object.assign(new Error("not found"), { notFound: true });
  },
}));

const { AdminPermissionError, adminCheck, requireAdmin } = await import("@/lib/admin/session");

let t: Awaited<ReturnType<typeof createTestAuth>>;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
});

beforeEach(() => {
  request.headers = new Headers();
});

/** Signs up and signs in as a user with `role` (null: an account made before roles existed). */
async function signInAs(role: string | null) {
  const email = `admin-${++next}@example.test`;
  const password = "correct-horse";
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password } });
  await t.db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
  return { id: user.id, email };
}

async function thrown(call: Promise<unknown>) {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
}

describe("requireAdmin", () => {
  it("sends a signed-out visitor to sign in, coming back to the page", async () => {
    expect(await thrown(requireAdmin(undefined, "/admin/products"))).toMatchObject({ to: "/sign-in?returnTo=%2Fadmin%2Fproducts" });
    expect(await thrown(requireAdmin())).toMatchObject({ to: "/sign-in?returnTo=%2Fadmin" });
  });

  it("shows shoppers the not-found page, so the admin isn't advertised", async () => {
    await signInAs("user");
    expect(await thrown(requireAdmin())).toMatchObject({ notFound: true });
    await signInAs(null);
    expect(await thrown(requireAdmin())).toMatchObject({ notFound: true });
  });

  it("returns the owner and the demo admin with their roles", async () => {
    const owner = await signInAs("admin");
    expect(await requireAdmin({ order: ["cancel"] })).toEqual({ id: owner.id, name: "Ada", email: owner.email, role: "admin" });
    const demo = await signInAs("demo-admin");
    expect(await requireAdmin({ product: ["update"] })).toMatchObject({ id: demo.id, role: "demo-admin" });
  });

  it("throws when the role lacks the permission", async () => {
    await signInAs("demo-admin");
    expect(await thrown(requireAdmin({ order: ["read-details"] }))).toBeInstanceOf(AdminPermissionError);
  });

  it("stops accepting an owner whose role was taken away, without waiting for the cookie cache", async () => {
    const owner = await signInAs("admin");
    await requireAdmin();
    await t.db.update(users).set({ role: "user" }).where(eq(users.id, owner.id));
    expect(await thrown(requireAdmin())).toMatchObject({ notFound: true });
  });
});

describe("adminCheck", () => {
  it("answers 401 signed out, 404 to shoppers and 403 for a missing permission, never cached", async () => {
    const signedOut = (await adminCheck({ order: ["read"] })) as Response;
    expect(signedOut.status).toBe(401);
    expect(signedOut.headers.get("cache-control")).toBe("private, no-store");

    await signInAs("user");
    expect(((await adminCheck({ order: ["read"] })) as Response).status).toBe(404);

    await signInAs("demo-admin");
    const forbidden = (await adminCheck({ order: ["cancel"] })) as Response;
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toEqual({ error: "forbidden" });
  });

  it("returns the admin when the role allows it", async () => {
    const demo = await signInAs("demo-admin");
    expect(await adminCheck({ order: ["read"] })).toMatchObject({ id: demo.id, role: "demo-admin" });
  });
});
