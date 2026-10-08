"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { isAuthPage, safeReturnTo, signInPath } from "@/lib/auth/return-to";

type Props = { children: (href: string) => React.ReactNode };

/**
 * Renders the header's Sign in link with an href that comes back to this page, query included
 * (`/search?q=bags`, a filtered listing), through the same validation as every return path.
 * Reading the query needs useSearchParams, which must sit under <Suspense> to keep pages static;
 * until it's read (only during prerender: the menus mount this when opened), the link comes back
 * to the path alone.
 */
export function SignInHref({ children }: Props) {
  const pathname = usePathname();
  return (
    <Suspense fallback={children(signInHref(pathname))}>
      <WithQuery>{children}</WithQuery>
    </Suspense>
  );
}

function WithQuery({ children }: Props) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  return children(signInHref(query ? `${pathname}?${query}` : pathname));
}

/** /sign-in coming back to `current` when it's a valid return path (never the auth pages themselves). */
function signInHref(current: string): string {
  if (isAuthPage(new URL(current, "https://x.invalid").pathname)) return "/sign-in";
  const returnTo = safeReturnTo(current, "");
  return returnTo ? signInPath(returnTo) : "/sign-in";
}
