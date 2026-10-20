import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { demoSessionOver } from "@/lib/auth/demo-plugin";
import { isDemoAdmin } from "@/lib/auth/permissions";
import { signInPath } from "@/lib/auth/return-to";

export type CurrentUser = { id: string; name: string; email: string };

/**
 * The signed-in user for this request, or null. The data access layer for server-side checks:
 * only `/account` pages (under <Suspense>), server actions and route handlers call it, so cached
 * pages stay static. It skips Better Auth's 5-minute cookie cache, so a session revoked on
 * another device (or by a password change or reset) is refused at once, at the cost of one
 * database read. Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => (await getCurrentSession())?.user ?? null);

export type CurrentSession = {
  user: CurrentUser;
  /** This request's session (to tell this device from others). */
  sessionId: string;
  /** Better Auth's roles, comma-separated (src/lib/auth/permissions.ts); null for accounts made before roles. */
  role: string | null;
};

/**
 * The signed-in user, this request's session id and the user's role, or null. A demo admin's
 * session ends DEMO_SESSION_SECONDS after it was created, whatever its expiry says: Better Auth only
 * leaves it un-extended while the browser sends its `dont_remember` cookie, which a visitor could
 * drop. Such a session is deleted here, so the browser's own reads see it signed out too.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const session = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  if (!session) return null;
  const { id, name, email, role } = session.user;
  if (isDemoAdmin(role) && demoSessionOver(session.session.createdAt)) {
    await (await auth.$context).internalAdapter.deleteSession(session.session.token);
    return null;
  }
  return { user: { id, name, email }, sessionId: session.session.id, role: role ?? null };
});

/** The signed-in user, or a redirect to sign in that comes back to `returnTo`. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(returnTo));
  return user;
}
