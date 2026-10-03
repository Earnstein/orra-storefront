"use client";

import Link from "next/link";
import { ShoppingBagIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { bagCount } from "@/lib/bag/rules";
import { useBag } from "@/lib/bag/store";
import { cn } from "@/lib/utils";

export function BagLink() {
  const count = bagCount(useBag());
  return (
    <Link
      href="/bag"
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      aria-label={`Shopping bag, ${count} ${count === 1 ? "item" : "items"}`}
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
