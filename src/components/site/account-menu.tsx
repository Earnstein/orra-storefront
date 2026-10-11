"use client";

import { UserIcon } from "lucide-react";
import { lazy, startTransition, Suspense, useEffect, useState, type ComponentType } from "react";

import { buttonVariants } from "@/components/ui/button";
import { useReloadAfterSignOut } from "./use-account";

const loadPopup = () => import("./account-menu-popup");

/**
 * If the menu's code can't load (offline, or a deploy since this page loaded removed it), go to the
 * account page in full instead: it signs in when needed, and a full load fetches the current code.
 * Throwing here would take down the whole layout.
 */
function GoToAccount() {
  useEffect(() => window.location.replace("/account"), []);
  return null;
}

type PopupProps = { className?: string; defaultOpen?: boolean };

const AccountMenuPopup = lazy<ComponentType<PopupProps>>(() =>
  loadPopup()
    .then((module) => ({ default: module.AccountMenuPopup }))
    .catch(() => ({ default: GoToAccount })),
);

/**
 * The header's account icon. The menu (Base UI's Menu and its positioning) loads only when wanted:
 * pointing at or focusing the icon starts the download, and the first click swaps in the real menu,
 * already open. Until then this is a plain button that looks the same, so pages don't load the
 * menu's code before their main image. The swap is a transition inside a boundary that already
 * shows the button, so the button (and its focus) stays until the menu is ready. The icon is the
 * same signed in or out, so nothing shifts while the session loads.
 */
export function AccountMenu({ className }: { className?: string }) {
  useReloadAfterSignOut();
  const [opened, setOpened] = useState(false);
  const preload = () => void loadPopup().catch(() => undefined);

  const button = (
    <button
      type="button"
      className={buttonVariants({ variant: "ghost", size: "icon", className })}
      aria-label="Account"
      aria-haspopup="menu"
      aria-expanded={false}
      onPointerEnter={preload}
      onFocus={preload}
      onClick={() => startTransition(() => setOpened(true))}
    >
      <UserIcon />
    </button>
  );

  return <Suspense fallback={button}>{opened ? <AccountMenuPopup className={className} defaultOpen /> : button}</Suspense>;
}
