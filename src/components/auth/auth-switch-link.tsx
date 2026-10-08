"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { safeReturnTo } from "@/lib/auth/return-to";

type Props = { to: "/sign-in" | "/sign-up"; children: React.ReactNode };

/**
 * The full-width outlined link between /sign-in and /sign-up. It keeps a valid `?returnTo`, so the
 * visitor still comes back to where they started. Until the URL is read (the page is prerendered),
 * it links without it.
 */
export function AuthSwitchLink(props: Props) {
  return (
    <Suspense fallback={<SwitchButton href={props.to}>{props.children}</SwitchButton>}>
      <WithReturnTo {...props} />
    </Suspense>
  );
}

function WithReturnTo({ to, children }: Props) {
  const returnTo = safeReturnTo(useSearchParams().get("returnTo"), "");
  const href = returnTo ? `${to}?returnTo=${encodeURIComponent(returnTo)}` : to;
  return <SwitchButton href={href}>{children}</SwitchButton>;
}

// A link styled as a button, not a Base UI Button rendered as a link (that adds role="button").
// cn() merges the variant's border colour over the base's border-transparent (cva doesn't).
function SwitchButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
      {children}
    </Link>
  );
}
