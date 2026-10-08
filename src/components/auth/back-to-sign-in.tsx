import { ChevronLeftIcon } from "lucide-react";
import Link from "next/link";

/** The Back link at the top of the password pages, as on Gucci. */
export function BackToSignIn() {
  return (
    <Link href="/sign-in" className="eyebrow inline-flex items-center gap-1 self-start link-quiet">
      <ChevronLeftIcon aria-hidden className="size-4" />
      Back
    </Link>
  );
}
