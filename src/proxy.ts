import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { signInPath } from "@/lib/auth/return-to";

/**
 * Marks guest order pages (`/orders/…?key=…`) private and uncacheable. Then, for account and
 * admin pages: sends visitors without a session cookie to sign in before anything renders.
 * A convenience only: it checks that the cookie exists, not that the session is valid, so pages
 * and server actions still check the session themselves (src/lib/auth/session.ts). Requests
 * other than GET/HEAD (server actions post to the page's URL) pass through, so an action answers
 * "signed out" in its own result instead of receiving a redirect.
 */
export function proxy(request: NextRequest) {
  // A guest's order page carries its key in the address: never cached, never sent on as a referrer.
  const { pathname: path } = request.nextUrl;
  if (path === "/orders" || path.startsWith("/orders/")) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  return NextResponse.redirect(new URL(signInPath(`${pathname}${search}`), request.url));
}

export const config = {
  matcher: ["/account/:path*", "/admin/:path*", "/orders/:path*"],
};
