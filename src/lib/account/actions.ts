"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { nameSchema } from "@/lib/auth/schemas";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * What every account action returns: data, or a typed reason the form can show inline. Actions
 * never throw for expected failures. "signed-out" means the session ended (signed out elsewhere,
 * revoked, expired); the form then sends the visitor to sign in, coming back to /account.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: "signed-out" | "invalid" | "failed"; message: string };

const SIGNED_OUT = { ok: false, error: "signed-out", message: "You've been signed out." } as const;
const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;

/** Renames the signed-in user. Better Auth refreshes the session cookie, so the header follows. */
export async function updateName(name: string): Promise<ActionResult<{ name: string }>> {
  if (!(await getCurrentUser())) return SIGNED_OUT;
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid", message: parsed.error.issues[0].message };
  try {
    await auth.api.updateUser({ body: { name: parsed.data }, headers: await headers() });
  } catch (error) {
    console.error("[account] updateName failed:", error);
    return FAILED;
  }
  refresh();
  return { ok: true, data: { name: parsed.data } };
}
