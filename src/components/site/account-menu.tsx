"use client";

import { UserIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutToHome, useAccount, useReloadAfterSignOut } from "./use-account";

const item = "rounded-none px-4 py-2.5 text-body";

/**
 * The header's account icon opens a small menu, as on Gucci: Sign in and Saved items when signed
 * out; a greeting, My account, Saved items and Sign out when signed in. The icon is the same in
 * both states, so nothing shifts while the session loads.
 */
export function AccountMenu({ className }: { className?: string }) {
  const { user, signInHref } = useAccount();
  useReloadAfterSignOut();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={buttonVariants({ variant: "ghost", size: "icon", className })} aria-label="Account">
        <UserIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-auto min-w-56 rounded-none p-0 py-2 shadow-sm ring-border">
        {user ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate px-4 py-2.5 text-caption text-muted-foreground">Hello, {user.name}</DropdownMenuLabel>
              <DropdownMenuItem className={item} render={<Link href="/account" />}>
                My account
              </DropdownMenuItem>
              <DropdownMenuItem className={item} render={<Link href="/saved" />}>
                Saved items
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="my-2" />
            <DropdownMenuItem className={item} onClick={() => void signOutToHome()}>
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuGroup>
            <DropdownMenuItem className={item} render={<Link href={signInHref} />}>
              Sign in
            </DropdownMenuItem>
            <DropdownMenuItem className={item} render={<Link href="/saved" />}>
              Saved items
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
