"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavLink } from "@/lib/site";

type Props = { links: NavLink[]; secondary: NavLink[] };

/** Below lg: the primary nav moves into a left-hand sheet. */
export function MobileNav({ links, secondary }: Props) {
  return (
    <Sheet>
      <SheetTrigger className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Open menu">
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-sm gap-0 p-0">
        <SheetTitle className="flex h-header items-center px-gutter eyebrow">Menu</SheetTitle>
        <Separator />
        <nav aria-label="Main" className="flex flex-col gap-1 px-gutter py-block">
          {links.map((link) => (
            <SheetClose key={link.href} nativeButton={false}
              render={<Link href={link.href} />} className="py-2 text-title">
              {link.label}
            </SheetClose>
          ))}
        </nav>
        <Separator />
        <nav aria-label="Account" className="flex flex-col gap-3 px-gutter py-block">
          {secondary.map((link) => (
            <SheetClose
              key={link.href}
              nativeButton={false}
              render={<Link href={link.href} />}
              className="text-muted-foreground link-quiet hover:text-foreground"
            >
              {link.label}
            </SheetClose>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
