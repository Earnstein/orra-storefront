"use client";

import { useState } from "react";

import { signOutToHome } from "@/components/site/use-account";

/** Signs out and loads the storefront's homepage in full, as the storefront's Sign out does. */
export function AdminSignOut() {
  const [leaving, setLeaving] = useState(false);
  return (
    <button
      type="button"
      className="eyebrow link-quiet disabled:opacity-50"
      disabled={leaving}
      onClick={async () => {
        setLeaving(true);
        // Stays disabled while the page leaves; enabled again only if signing out failed.
        if (!(await signOutToHome())) setLeaving(false);
      }}
    >
      Sign out
    </button>
  );
}
