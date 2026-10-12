"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useBagCount } from "@/lib/bag/use-bag-count";
import { cn } from "@/lib/utils";

/** The header's bag link. The count comes from a cookie the server keeps current, so no request. */
export function BagLink() {
  const count = useBagCount();
  return (
    <Link
      href="/bag"
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      aria-label={count ? `Bag, ${count} ${count === 1 ? "item" : "items"}` : "Bag"}
    >
      <ShoppingBagIcon />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute top-1 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-label tracking-normal text-background"
        >
          {count}
        </span>
      )}
    </Link>
  );
}
