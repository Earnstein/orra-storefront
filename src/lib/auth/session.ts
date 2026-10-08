import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "@/lib/auth";
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

/** The signed-in user and this request's session id (to tell this device from others), or null. */
export const getCurrentSession = cache(async (): Promise<{ user: CurrentUser; sessionId: string } | null> => {
  const session = await auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { user: { id, name, email }, sessionId: session.session.id };
});

/** The signed-in user, or a redirect to sign in that comes back to `returnTo`. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(signInPath(returnTo));
  return user;
}
