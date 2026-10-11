"use server";

import { z } from "zod";

import type { ActionResult } from "@/lib/account/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { isSlug, SAVED_LIMIT } from "@/lib/saved/limits";
import { mergeSlugs, saveSlugs, unsaveSlug } from "@/lib/saved/mutations";

// Saved items for the signed-in user. Each action checks the session itself (the client can't be
// trusted to), validates its input, and returns a typed result instead of throwing.

const slugSchema = z.string().refine(isSlug, "Not a product.");
const slugsSchema = z.array(slugSchema).max(SAVED_LIMIT, `At most ${SAVED_LIMIT} items.`);

const SIGNED_OUT = { ok: false, error: "signed-out", message: "You've been signed out." } as const;
const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;

/** Checks the session, validates `input`, runs `write` and wraps its result (or the failure). */
async function run<T, R>(input: unknown, schema: z.ZodType<T>, write: (userId: string, value: T) => Promise<R>): Promise<ActionResult<R>> {
  const user = await getCurrentUser();
  if (!user) return SIGNED_OUT;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid", message: parsed.error.issues[0].message };
  try {
    return { ok: true, data: await write(user.id, parsed.data) };
  } catch (error) {
    console.error("[saved] action failed:", error);
    return FAILED;
  }
}

export async function saveItem(slug: string): Promise<ActionResult<{ slugs: string[] }>> {
  return run(slug, slugSchema, async (userId, value) => ({ slugs: await saveSlugs(userId, [value]) }));
}

export async function unsaveItem(slug: string): Promise<ActionResult<{ slugs: string[] }>> {
  return run(slug, slugSchema, async (userId, value) => ({ slugs: await unsaveSlug(userId, value) }));
}

/**
 * Merges this browser's saved items into the account on sign-in. Takes `mergeBatch(local)` (at
 * most SAVED_LIMIT valid slugs), so an oversized browser list is merged in part, never refused.
 */
export async function mergeSaved(slugs: string[]): Promise<ActionResult<{ slugs: string[]; unmerged: string[] }>> {
  return run(slugs, slugsSchema, (userId, value) => mergeSlugs(userId, value));
}
