"use client";

import { useEffect } from "react";

import { leaveSignIn } from "@/components/auth/field-errors";
import { authClient } from "@/lib/auth-client";

/**
 * Sends a signed-in visitor on from /sign-in and /sign-up (to `?returnTo`, else /account). The pages
 * stay static, so the session is read here, in the browser.
 *
 * Before leaving, the session is confirmed without Better Auth's 5-minute cookie cache: a session
 * revoked elsewhere (a reset, "sign out other devices") still reads as signed in from the cache,
 * while /account (which skips it) sends the visitor here, and the two would bounce for minutes.
 * The uncached read also clears the stale cookies.
 */
export function LeaveWhenSignedIn() {
  const { data: session } = authClient.useSession();

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void authClient
      .getSession({ query: { disableCookieCache: true } })
      .then(({ data }) => {
        if (data && !cancelled) leaveSignIn();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session]);

  return null;
}
