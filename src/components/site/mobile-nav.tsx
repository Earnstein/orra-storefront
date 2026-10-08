"use client";

import Link from "next/link";
import { MenuIcon } from "lucide-react";
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavLink } from "@/lib/site";
import { signOutToHome, useAccount } from "./use-account";

type Props = { links: NavLink[]; secondary: NavLink[] };

const quietLink = "text-muted-foreground link-quiet hover:text-foreground";

/**
 * Below lg: the primary nav moves into a left-hand sheet, with the account links from the session.
 * Links are plain links that close the sheet when followed (a SheetClose rendered as a link would
 * be announced as a button).
 */
export function MobileNav({ links, secondary }: Props) {
  const [open, setOpen] = useState(false);
  const { user, signInHref } = useAccount();
  const accountLinks: NavLink[] = user
    ? [
        { label: "My account", href: "/account" },
        { label: "Saved items", href: "/saved" },
      ]
    : [
        { label: "Sign in", href: signInHref },
        { label: "Saved items", href: "/saved" },
      ];
  const close = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Open menu">
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-full max-w-sm gap-0 p-0">
        <SheetTitle className="flex h-header items-center px-gutter eyebrow">Menu</SheetTitle>
        <Separator />
        <nav aria-label="Main" className="flex flex-col gap-1 px-gutter py-block">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={close} className="py-2 text-title">
              {link.label}
            </Link>
          ))}
        </nav>
        <Separator />
        <nav aria-label="Account" className="flex flex-col gap-3 px-gutter py-block">
          {user && <p className="truncate text-caption text-muted-foreground">Hello, {user.name}</p>}
          {[...accountLinks, ...secondary].map((link) => (
            <Link key={link.label} href={link.href} onClick={close} className={quietLink}>
              {link.label}
            </Link>
          ))}
          {user && (
            <button type="button" className={`${quietLink} self-start`} onClick={() => void signOutToHome()}>
              Sign out
            </button>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
