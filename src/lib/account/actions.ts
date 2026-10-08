"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { nameSchema } from "@/lib/auth/schemas";
import { endOtherSessions, endSession } from "@/lib/account/devices";
import { getCurrentSession, getCurrentUser } from "@/lib/auth/session";

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
const INVALID_DEVICE = { ok: false, error: "invalid", message: "That device is already signed out." } as const;

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

/** Signs out one of the user's other devices (by session id; never this one, never someone else's). */
export async function signOutDevice(sessionId: string): Promise<ActionResult> {
  const current = await getCurrentSession();
  if (!current) return SIGNED_OUT;
  if (typeof sessionId !== "string" || sessionId === current.sessionId) return INVALID_DEVICE;
  try {
    if (!(await endSession(current.user.id, sessionId))) return INVALID_DEVICE;
  } catch (error) {
    console.error("[account] signOutDevice failed:", error);
    return FAILED;
  }
  return { ok: true, data: undefined };
}

/** Signs out every device but this one. */
export async function signOutOtherDevices(): Promise<ActionResult> {
  const current = await getCurrentSession();
  if (!current) return SIGNED_OUT;
  try {
    await endOtherSessions(current.user.id, current.sessionId);
  } catch (error) {
    console.error("[account] signOutOtherDevices failed:", error);
    return FAILED;
  }
  return { ok: true, data: undefined };
}
