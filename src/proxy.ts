import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { signInPath } from "@/lib/auth/return-to";

/**
 * Sends visitors without a session cookie from account pages to sign in before anything renders.
 * A convenience only: it checks that the cookie exists, not that the session is valid, so pages
 * and server actions still check the session themselves (src/lib/auth/session.ts). Requests
 * other than GET/HEAD (server actions post to the page's URL) pass through, so an action answers
 * "signed out" in its own result instead of receiving a redirect.
 */
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(signInPath(`${pathname}${search}`), request.url));
}

export const config = {
  matcher: ["/account/:path*"],
};
