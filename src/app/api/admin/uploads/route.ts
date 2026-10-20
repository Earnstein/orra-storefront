import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";

import { db } from "@/db";
import { allowDemoWrite, DEMO_DAILY_LIMITS } from "@/lib/admin/demo";
import { adminCheck } from "@/lib/admin/session";
import { isDemoAdmin } from "@/lib/auth/permissions";
import { isUploadPathname, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/admin/products/uploads";
import { serverEnv, uploadsConfigured } from "@/lib/env";
import { clientIp, rateLimitsOn } from "@/lib/rate-limit";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Presigned client uploads of product photos to Vercel Blob: the browser sends the file straight
 * to Blob, to a short-lived URL this route signs. Authenticated with Vercel's rotating OIDC token
 * and BLOB_STORE_ID (no long-lived secret). Only admins with `product:upload` get one, and only
 * for a JPEG, PNG or WebP of at most 4 MB under `products/`, with a random suffix. No completion
 * callback: the form saves the photo's URL with the product. 503 until the store is connected.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await adminCheck({ product: ["upload"] });
  if (admin instanceof Response) return admin;
  const env = serverEnv();
  if (!uploadsConfigured(env)) return Response.json({ error: "Uploads aren't configured." }, { status: 503, headers: PRIVATE });

  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE });
  }
  if (body?.type !== "blob.generate-presigned-url") return Response.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE });
  // The public demo admin: a daily cap per network, so the Blob store can't be filled.
  const ip = clientIp(request.headers);
  if (isDemoAdmin(admin.role) && rateLimitsOn(env) && ip && !(await allowDemoWrite(db, "upload", ip))) {
    return Response.json({ error: `The demo allows ${DEMO_DAILY_LIMITS.upload} photo uploads a day. Try again tomorrow.` }, { status: 429, headers: PRIVATE });
  }

  try {
    const result = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: env.BLOB_WEBHOOK_PUBLIC_KEY,
      getSignedToken: async (pathname, _clientPayload, multipart) => {
        if (multipart || !isUploadPathname(pathname)) throw new Error("Invalid upload pathname");
        const limits = { allowedContentTypes: [...UPLOAD_TYPES], maximumSizeInBytes: UPLOAD_MAX_BYTES, validUntil: Date.now() + 10 * 60_000 };
        const token = await issueSignedToken({ pathname, operations: ["put"], ...limits });
        return { token, urlOptions: { ...limits, addRandomSuffix: true } };
      },
    });
    return Response.json(result, { headers: PRIVATE });
  } catch (error) {
    console.error("admin: upload refused", error instanceof Error ? error.message : error);
    return Response.json({ error: "That photo can't be uploaded." }, { status: 400, headers: PRIVATE });
  }
}
