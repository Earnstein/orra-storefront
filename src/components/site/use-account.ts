"use client";

import { usePathname } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { signInPath } from "@/lib/auth/return-to";

/**
 * The header's view of the account: who is signed in (read in the browser, so pages stay static;
 * signed-out until the session arrives) and where Sign in should come back to.
 */
export function useAccount() {
  const { data } = authClient.useSession();
  const pathname = usePathname();
  const signInHref = pathname.startsWith("/sign-in") ? "/sign-in" : signInPath(pathname);
  return { user: data?.user ?? null, signInHref };
}

/**
 * Signs out, then loads the homepage in full (not a client navigation): the client router may hold
 * pages rendered for the signed-in user, such as a prefetched /account, which mustn't outlive the
 * session on a shared computer. Replace, so Back doesn't return to a signed-in page.
 */
export async function signOutToHome() {
  await authClient.signOut().catch(() => undefined);
  window.location.replace("/");
}
