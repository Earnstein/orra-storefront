"use client";

import { UserIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { useReloadAfterSignOut } from "./use-account";

const loadPopup = () => import("./account-menu-popup");
const AccountMenuPopup = lazy(() => loadPopup().then((module) => ({ default: module.AccountMenuPopup })));

/**
 * The header's account icon. The menu (Base UI's Menu and its positioning) loads only when wanted:
 * pointing at or focusing the icon starts the download, and the first click swaps in the real menu,
 * already open. Until then this is a plain button that looks the same, so pages don't load the
 * menu's code before their main image. The icon is the same signed in or out, so nothing shifts
 * while the session loads.
 */
export function AccountMenu({ className }: { className?: string }) {
  useReloadAfterSignOut();
  const [opened, setOpened] = useState(false);

  const button = (
    <button
      type="button"
      className={buttonVariants({ variant: "ghost", size: "icon", className })}
      aria-label="Account"
      aria-haspopup="menu"
      aria-expanded={false}
      onPointerEnter={() => void loadPopup()}
      onFocus={() => void loadPopup()}
      onClick={() => setOpened(true)}
    >
      <UserIcon />
    </button>
  );

  if (!opened) return button;
  return (
    <Suspense fallback={button}>
      <AccountMenuPopup className={className} defaultOpen />
    </Suspense>
  );
}
