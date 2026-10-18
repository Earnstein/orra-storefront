import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { adminCheck } from "@/lib/admin/session";
import { isUploadPathname, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "@/lib/admin/products/uploads";
import { serverEnv, uploadsConfigured } from "@/lib/env";

const PRIVATE = { "Cache-Control": "private, no-store" };

/**
 * Client uploads of product photos to Vercel Blob (the browser sends the file straight to Blob;
 * this only issues the short-lived token). Only admins with `product:upload` get one, and only for
 * a JPEG, PNG or WebP of at most 4 MB under `products/`. No completion callback: the form saves
 * the photo's URL with the product. 503 until BLOB_READ_WRITE_TOKEN is set.
 */
export async function POST(request: Request): Promise<Response> {
  const admin = await adminCheck({ product: ["upload"] });
  if (admin instanceof Response) return admin;
  const env = serverEnv();
  if (!uploadsConfigured(env)) return Response.json({ error: "Uploads aren't configured." }, { status: 503, headers: PRIVATE });

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE });
  }
  if (body?.type !== "blob.generate-client-token") return Response.json({ error: "Invalid request." }, { status: 400, headers: PRIVATE });

  try {
    const result = await handleUpload({
      body,
      request,
      token: env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => {
        if (multipart || !isUploadPathname(pathname)) throw new Error("Invalid upload pathname");
        return {
          allowedContentTypes: [...UPLOAD_TYPES],
          maximumSizeInBytes: UPLOAD_MAX_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return Response.json(result, { headers: PRIVATE });
  } catch (error) {
    console.error("admin: upload token refused", error instanceof Error ? error.message : error);
    return Response.json({ error: "That photo can't be uploaded." }, { status: 400, headers: PRIVATE });
  }
}
