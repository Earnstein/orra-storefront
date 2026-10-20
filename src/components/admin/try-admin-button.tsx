"use client";

import { useState } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { announceSessionChange } from "@/lib/auth/browser-session";

type Answer = { ok: true; redirect: string } | { ok: false; message: string };

/**
 * Starts the demo: POST /api/demo-admin signs this browser in as the demo admin, then the admin
 * loads in full (as sign-in leaves), so nothing rendered for the previous visitor stays in memory.
 * Other tabs re-read who is signed in.
 */
export function TryAdminButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const answer = (await fetch("/api/demo-admin", { method: "POST" })
      .then((response) => response.json())
      .catch(() => null)) as Answer | null;
    if (!answer?.ok) {
      setBusy(false);
      return setError(answer?.message ?? "We couldn't start the demo. Check your connection and try again.");
    }
    announceSessionChange();
    window.location.assign(answer.redirect);
  }

  return (
    <div className="flex flex-col gap-3">
      <Button disabled={busy} onClick={() => void start()} className="self-start max-sm:w-full">
        {busy ? "Starting…" : "Start the demo"}
      </Button>
      <FormError message={error} className="mb-0" />
    </div>
  );
}
