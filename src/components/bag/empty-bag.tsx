import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SHOP = [
  { label: "New in", href: "/collections/new" },
  { label: "Women", href: "/collections/women" },
  { label: "Men", href: "/collections/men" },
];

/** The empty bag: where to shop next, and the saved items when there are any. */
export function EmptyBag({ savedCount }: { savedCount: number }) {
  return (
    <div className="flex flex-col items-start gap-6 py-block">
      <p className="text-body">Your bag is empty</p>
      <div className="flex flex-wrap gap-3">
        {SHOP.map((link) => (
          <Link key={link.href} href={link.href} className={cn(buttonVariants({ variant: "outline" }))}>
            {link.label}
          </Link>
        ))}
      </div>
      {savedCount > 0 && (
        <Link href="/saved" className="link text-body">
          You have {savedCount} saved {savedCount === 1 ? "item" : "items"}
        </Link>
      )}
    </div>
  );
}
