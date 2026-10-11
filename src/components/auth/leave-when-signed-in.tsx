"use client";

import { useEffect } from "react";

import { leaveSignIn } from "@/components/auth/field-errors";
import { fetchSessionUser, useBrowserSession } from "@/lib/auth/browser-session";

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
  const { user } = useBrowserSession();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void fetchSessionUser({ uncached: true })
      .then((confirmed) => {
        if (confirmed && !cancelled) leaveSignIn();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  return null;
}
