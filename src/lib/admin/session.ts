import "server-only";

import { notFound, redirect } from "next/navigation";

import { adminRoleOf, roleCan, type AdminRole, type Permission } from "@/lib/auth/permissions";
import { signInPath } from "@/lib/auth/return-to";
import { getCurrentSession, type CurrentUser } from "@/lib/auth/session";

export type AdminUser = CurrentUser & { role: AdminRole };

/** A signed-in admin whose role lacks the permission asked for. Route handlers and actions answer 403. */
export class AdminPermissionError extends Error {
  constructor(readonly permission: Permission) {
    super(`Missing admin permission: ${JSON.stringify(permission)}`);
    this.name = "AdminPermissionError";
  }
}

type AdminCheck =
  | { ok: true; admin: AdminUser }
  | { ok: false; reason: "signed-out" | "not-admin" | "forbidden" };

/**
 * Who this request's admin is, read from the uncached session (as getCurrentUser does), so a
 * role taken away or a session ended elsewhere stops working at once.
 */
async function checkAdmin(permission?: Permission): Promise<AdminCheck> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, reason: "signed-out" };
  const role = adminRoleOf(session.role);
  if (!role) return { ok: false, reason: "not-admin" };
  if (permission && !roleCan(session.role, permission)) return { ok: false, reason: "forbidden" };
  return { ok: true, admin: { ...session.user, role } };
}

/**
 * The admin for an admin page (called under <Suspense>): a signed-out visitor is sent to sign in
 * and back to `returnTo`; anyone without an admin role gets the not-found page, so the admin
 * isn't advertised; a role without `permission` throws AdminPermissionError.
 */
export async function requireAdmin(permission?: Permission, returnTo = "/admin"): Promise<AdminUser> {
  const check = await checkAdmin(permission);
  if (check.ok) return check.admin;
  if (check.reason === "signed-out") redirect(signInPath(returnTo));
  if (check.reason === "not-admin") notFound();
  throw new AdminPermissionError(permission ?? {});
}

const PRIVATE = { "Cache-Control": "private, no-store" };
const REFUSALS = {
  "signed-out": { status: 401, error: "signed-out" },
  "not-admin": { status: 404, error: "not-found" },
  forbidden: { status: 403, error: "forbidden" },
} as const;

/**
 * The admin for a route handler, or the response to send instead: 401 signed out, 404 without an
 * admin role, 403 when the role lacks `permission`. Every admin route calls it first.
 */
export async function adminCheck(permission: Permission): Promise<AdminUser | Response> {
  const check = await checkAdmin(permission);
  if (check.ok) return check.admin;
  const { status, error } = REFUSALS[check.reason];
  return Response.json({ error }, { status, headers: PRIVATE });
}
