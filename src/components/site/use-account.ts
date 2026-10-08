"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * The header's view of the account: who is signed in (read in the browser, so pages stay static;
 * signed-out until the session arrives). Where Sign in comes back to is `SignInHref`.
 */
export function useAccount() {
  const { data } = authClient.useSession();
  return { user: data?.user ?? null };
}

const SIGNED_OUT_AT = "orra:signed-out-at";

/**
 * Signs out, then loads the homepage in full (not a client navigation): the client router may hold
 * pages rendered for the signed-in user, such as a prefetched /account, which mustn't outlive the
 * session on a shared computer. If signing out fails, says so and stays, so nobody walks away from
 * a computer believing they're signed out when they aren't.
 */
export async function signOutToHome() {
  const { error } = await authClient.signOut().catch(() => ({ error: true }));
  if (error) {
    window.alert("We couldn't sign you out. Check your connection and try again.");
    return;
  }
  try {
    localStorage.setItem(SIGNED_OUT_AT, String(Date.now()));
  } catch {
    // Private mode or blocked storage: the back/forward cache check below just won't fire.
  }
  window.location.replace("/");
}

/**
 * Pages restored from the browser's back/forward cache keep the UI they had when left. After a
 * sign-out, one left while signed in would come back showing the account, so reload it instead.
 * Mounted once, in the header.
 */
export function useReloadAfterSignOut() {
  useEffect(() => {
    const loadedAt = Date.now();
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      let signedOutAt = 0;
      try {
        signedOutAt = Number(localStorage.getItem(SIGNED_OUT_AT)) || 0;
      } catch {
        return;
      }
      if (signedOutAt > loadedAt) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);
}
