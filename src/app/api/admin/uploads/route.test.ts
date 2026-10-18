import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { user as users } from "@/db/schema";
import { cookiesFrom, createTestAuth } from "@/test/auth";

// The route runs against Better Auth on PGlite; Blob's handleUpload is stood in for, calling the
// route's onBeforeGenerateToken the way the real one does and answering what it returned.
const request = vi.hoisted(() => ({ auth: undefined as unknown, headers: new Headers(), env: {} as Record<string, string | undefined> }));
vi.mock("@/lib/auth", () => ({
  get auth() {
    return request.auth;
  },
}));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("@/lib/env", () => ({
  serverEnv: () => request.env,
  uploadsConfigured: (env: { BLOB_READ_WRITE_TOKEN?: string }) => Boolean(env.BLOB_READ_WRITE_TOKEN),
}));
vi.mock("@vercel/blob/client", () => ({
  handleUpload: async ({ body, onBeforeGenerateToken }: { body: { payload: { pathname: string; multipart: boolean } }; onBeforeGenerateToken: (p: string, c: null, m: boolean) => Promise<unknown> }) => ({
    type: "blob.generate-client-token",
    options: await onBeforeGenerateToken(body.payload.pathname, null, body.payload.multipart),
  }),
}));

const { POST } = await import("./route");
let t: Awaited<ReturnType<typeof createTestAuth>>;
let next = 0;

beforeAll(async () => {
  t = await createTestAuth();
  request.auth = t.auth;
});

beforeEach(() => {
  request.headers = new Headers();
  request.env = { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test_token" };
});

async function signInAs(role: string) {
  const email = `uploads-${++next}@example.test`;
  const { user } = await t.auth.api.signUpEmail({ body: { name: "Ada", email, password: "correct-horse" } });
  await t.db.update(users).set({ role }).where(eq(users.id, user.id));
  const { headers } = await t.auth.api.signInEmail({ body: { email, password: "correct-horse" }, returnHeaders: true });
  request.headers = cookiesFrom(headers);
}

const token = (pathname: string, multipart = false) =>
  POST(
    new Request("http://localhost:3000/api/admin/uploads", {
      method: "POST",
      body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, multipart, clientPayload: null } }),
    }),
  );

describe("POST /api/admin/uploads", () => {
  it("issues tokens only to admins who may upload", async () => {
    expect((await token("products/a.jpg")).status).toBe(401);
    await signInAs("user");
    expect((await token("products/a.jpg")).status).toBe(404);
  });

  it("limits the token to JPEG, PNG and WebP of at most 4 MB under products/, with a random suffix", async () => {
    await signInAs("demo-admin");
    const response = await token("products/tote.webp");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      options: { allowedContentTypes: ["image/jpeg", "image/png", "image/webp"], maximumSizeInBytes: 4 * 1024 * 1024, addRandomSuffix: true },
    });
  });

  it("refuses other pathnames, multipart uploads and other events", async () => {
    await signInAs("admin");
    expect((await token("avatars/me.jpg")).status).toBe(400);
    expect((await token("products/x.svg")).status).toBe(400);
    expect((await token("products/big.jpg", true)).status).toBe(400);
    const completed = await POST(new Request("http://localhost:3000/api/admin/uploads", { method: "POST", body: JSON.stringify({ type: "blob.upload-completed", payload: {} }) }));
    expect(completed.status).toBe(400);
  });

  it("answers 503 until Blob is configured", async () => {
    await signInAs("admin");
    request.env = {};
    expect((await token("products/a.jpg")).status).toBe(503);
  });
});
