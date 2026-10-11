"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { leaveSignIn } from "@/components/auth/field-errors";
import { recheckSession, useBrowserSession } from "@/lib/auth/browser-session";

/**
 * Sends a signed-in visitor on from /sign-in and /sign-up (to `?returnTo`, else /account). The pages
 * stay static, so the session is read here, in the browser.
 *
 * Before leaving, the session is confirmed without Better Auth's 5-minute cookie cache: a session
 * revoked elsewhere (a reset, "sign out other devices") still reads as signed in from the cache,
 * while /account (which skips it) sends the visitor here, and the two would bounce for minutes.
 * The uncached read also clears the stale cookies, and corrects the header when it says signed out.
 */
export function LeaveWhenSignedIn() {
  const queryClient = useQueryClient();
  const { user } = useBrowserSession();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void recheckSession(queryClient).then((confirmed) => {
      if (confirmed && !cancelled) leaveSignIn();
    });
    return () => {
      cancelled = true;
    };
  }, [user, queryClient]);

  return null;
}
