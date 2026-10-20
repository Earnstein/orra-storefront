import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user as users } from "@/db/schema";
import { cookiesFrom, createTestAuth } from "@/test/auth";

// The route runs against Better Auth on PGlite. Blob's helpers are stood in for:
// handleUploadPresigned calls the route's getSignedToken the way the real one does, and
// issueSignedToken records the scope it was asked for.
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers(), env: {} as Record<string, string | undefined> }));
const issued = vi.hoisted(() => [] as unknown[]);
const testDb = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("@/db", () => ({
  get db() {
    return testDb.db;
  },
}));
vi.mock("@/lib/env", () => ({
  serverEnv: () => request.env,
  uploadsConfigured: (env: { BLOB_STORE_ID?: string; BLOB_WEBHOOK_PUBLIC_KEY?: string }) => Boolean(env.BLOB_STORE_ID && env.BLOB_WEBHOOK_PUBLIC_KEY),
}));
vi.mock("@vercel/blob", () => ({
  issueSignedToken: async (options: unknown) => {
    issued.push(options);
    return { delegationToken: "delegation", clientSigningToken: "signing", validUntil: 0 };
  },
}));
vi.mock("@vercel/blob/client", () => ({
  handleUploadPresigned: async ({
    body,
    getSignedToken,
  }: {
    body: { payload: { pathname: string; multipart: boolean } };
    getSignedToken: (p: string, c: null, m: boolean) => Promise<{ urlOptions?: unknown }>;
  }) => ({
    type: "blob.generate-presigned-url",
    urlOptions: (await getSignedToken(body.payload.pathname, null, body.payload.multipart)).urlOptions,
  }),
}));

const { POST } = await import("./route");
let t: Awaited<ReturnType<typeof createTestAuth>>;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
  testDb.db = t.db;
});

beforeEach(() => {
  request.headers = new Headers();
  request.env = { BLOB_STORE_ID: "store_abc123", BLOB_WEBHOOK_PUBLIC_KEY: "public-key" };
  issued.length = 0;
});

async function signInAs(role: string) {
  const email = `uploads-${++next}@example.test`;
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" } });
  await t.db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password: "correct-horse" }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
}

const presign = (pathname: string, multipart = false, ip?: string) =>
  POST(
    new Request("http://localhost:3000/api/admin/uploads", {
      method: "POST",
      headers: ip ? { "x-forwarded-for": ip } : {},
      body: JSON.stringify({ type: "blob.generate-presigned-url", payload: { pathname, multipart, clientPayload: null } }),
    }),
  );

const LIMITS = { allowedContentTypes: ["image/jpeg", "image/png", "image/webp"], maximumSizeInBytes: 4 * 1024 * 1024 };

describe("POST /api/admin/uploads", () => {
  it("signs uploads only for admins who may upload", async () => {
    expect((await presign("products/a.jpg")).status).toBe(401);
    await signInAs("user");
    expect((await presign("products/a.jpg")).status).toBe(404);
    expect(issued).toEqual([]);
  });

  it("scopes the signed upload to one products/ pathname, JPEG, PNG or WebP of at most 4 MB, with a random suffix", async () => {
    await signInAs("demo-admin");
    const response = await presign("products/tote.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(issued).toEqual([expect.objectContaining({ pathname: "products/tote.webp", operations: ["put"], ...LIMITS })]);
    expect(await response.json()).toMatchObject({ urlOptions: { ...LIMITS, addRandomSuffix: true } });
  });

  it("refuses other pathnames, multipart uploads and other events", async () => {
    await signInAs("admin");
    expect((await presign("avatars/me.jpg")).status).toBe(400);
    expect((await presign("products/x.svg")).status).toBe(400);
    expect((await presign("products/big.jpg", true)).status).toBe(400);
    expect(issued).toEqual([]);
    const completed = await POST(new Request("http://localhost:3000/api/admin/uploads", { method: "POST", body: JSON.stringify({ type: "blob.upload-completed", payload: {} }) }));
    expect(completed.status).toBe(400);
  });

  it("answers 503 until the Blob store is connected", async () => {
    await signInAs("admin");
    request.env = {};
    expect((await presign("products/a.jpg")).status).toBe(503);
  });

  it("on Vercel, caps the demo admin's uploads per network per day; the owner has no cap", async () => {
    const { DEMO_DAILY_LIMITS } = await import("@/lib/admin/demo");
    request.env = { ...request.env, VERCEL_ENV: "production" };
    await signInAs("demo-admin");
    for (let i = 0; i < DEMO_DAILY_LIMITS.upload; i++) expect((await presign(`products/p${i}.jpg`, false, "198.51.100.9")).status).toBe(200);
    const refused = await presign("products/one-more.jpg", false, "198.51.100.9");
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: "The demo allows 30 photo uploads a day. Try again tomorrow." });
    await signInAs("admin");
    expect((await presign("products/owner.jpg", false, "198.51.100.9")).status).toBe(200);
  });
});
