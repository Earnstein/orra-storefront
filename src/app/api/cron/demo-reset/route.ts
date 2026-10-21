import { timingSafeEqual } from "node:crypto";

import { del, list } from "@vercel/blob";
import { revalidateTag } from "next/cache";

import { db } from "@/db";
import { resetDemo } from "@/lib/admin/reset";
import { sendEmail } from "@/lib/email/send";
import { authBaseUrl, serverEnv, uploadsConfigured, type ServerEnv } from "@/lib/env";
import { sendOrderConfirmation } from "@/lib/orders/fulfil";
import { databaseTarget } from "../../../../../scripts/db-target";

const PRIVATE = { "Cache-Control": "private, no-store" };
// Up to 25 emails are sent one by one; well within a minute, but not within some defaults.
export const maxDuration = 60;
const MIN_SECRET_LENGTH = 16;

/** Whether the request carries `Authorization: Bearer <CRON_SECRET>` (compared in constant time). */
function authorised(request: Request, secret: string): boolean {
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Blob photos under `products/`, every page of them. Production only: one Blob store can serve
 * every environment, and another environment's database doesn't know production's photos, so it
 * would delete them. [] until the store is connected.
 */
async function listImages(env: ServerEnv): Promise<{ url: string; uploadedAt: Date }[]> {
  if (env.VERCEL_ENV !== "production" || !uploadsConfigured(env)) return [];
  const images: { url: string; uploadedAt: Date }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "products/", limit: 1000, cursor });
    images.push(...page.blobs.map((blob) => ({ url: blob.url, uploadedAt: new Date(blob.uploadedAt) })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return images;
}

/**
 * The nightly demo reset (vercel.json: 03:00 UTC). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; anything else answers 401 (503 until the secret is set).
 * Runs `resetDemo` against this deployment's own database, then expires the cached catalogue, and
 * answers and logs the summary. On a preview or locally it can be called by hand with the secret
 * (photos are left alone there), never against production's database.
 */
export async function GET(request: Request): Promise<Response> {
  const env = serverEnv();
  if (!env.CRON_SECRET || env.CRON_SECRET.length < MIN_SECRET_LENGTH) {
    console.error(`demo reset: CRON_SECRET isn't set (or is under ${MIN_SECRET_LENGTH} characters), so the reset can't run`);
    return Response.json({ error: "not-configured" }, { status: 503, headers: PRIVATE });
  }
  if (!authorised(request, env.CRON_SECRET)) return Response.json({ error: "unauthorised" }, { status: 401, headers: PRIVATE });
  // Only production's own deployment resets production: a local server or preview pointed at
  // production's database (PRODUCTION_DB_HOST names it) refuses.
  if (env.VERCEL_ENV !== "production" && databaseTarget({ databaseUrl: env.DATABASE_URL, productionDbHost: process.env.PRODUCTION_DB_HOST }) === "production") {
    console.error("demo reset: refused, this deployment isn't production but its database is");
    return Response.json({ error: "production-database" }, { status: 409, headers: PRIVATE });
  }

  const emailDeps = { db, baseUrl: authBaseUrl(env), secret: env.BETTER_AUTH_SECRET, send: sendEmail };
  const summary = await resetDemo({
    db,
    listImages: () => listImages(env),
    deleteImages: async (urls) => {
      for (let start = 0; start < urls.length; start += 100) await del(urls.slice(start, start + 100));
    },
    sendEmails: async (orderIds) => {
      for (const id of orderIds) await sendOrderConfirmation(emailDeps, id);
    },
  });
  // Every cached catalogue read (and, on Vercel, the CDN's copies tagged `catalog`) is stale now.
  revalidateTag("catalog", { expire: 0 });
  console.log("demo reset", JSON.stringify(summary));
  return Response.json(summary, { headers: PRIVATE });
}
