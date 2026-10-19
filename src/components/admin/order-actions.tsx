"use client";

import { useRef, useState } from "react";

import { FormError } from "@/components/auth/form-error";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cancelAdminOrder, fulfilAdminOrder } from "@/lib/admin/orders/actions";
import type { OrderResult } from "@/lib/admin/orders/types";
import { signInPath } from "@/lib/auth/return-to";
import { formatPrice } from "@/lib/format";

/**
 * Fulfil and Cancel for a paid order (the owner only; the page leaves them out otherwise). Cancel
 * asks first, since it refunds the customer. Each action refreshes the page, which then shows the
 * new status; the outcome is announced here and takes focus, as the buttons go away.
 */
export function OrderActions({ orderId, number, total, canFulfil, canCancel }: { orderId: string; number: string; total: number; canFulfil: boolean; canCancel: boolean }) {
  const [busy, setBusy] = useState<"fulfil" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);

  async function run(kind: "fulfil" | "cancel") {
    setBusy(kind);
    setError(null);
    const result: OrderResult | null = await (kind === "fulfil" ? fulfilAdminOrder(orderId) : cancelAdminOrder(orderId)).catch(() => null);
    setBusy(null);
    if (result && !result.ok && result.error === "signed-out") return window.location.assign(signInPath(window.location.pathname));
    // A failed cancel keeps its dialog open, with the reason in it.
    if (!result?.ok) return setError(result?.message ?? "Something went wrong. Try again.");
    setConfirming(false);
    setDone(kind === "fulfil" ? `${number} is fulfilled.` : `${number} is cancelled and refunded.`);
    requestAnimationFrame(() => statusRef.current?.focus());
  }

  return (
    <div className="flex flex-col gap-3">
      <p ref={statusRef} tabIndex={-1} role="status" className="text-body outline-none empty:hidden">
        {done}
      </p>
      {(canFulfil || canCancel) && !done && (
        <div className="flex flex-wrap gap-3">
          {canFulfil && (
            <Button disabled={busy !== null} onClick={() => void run("fulfil")} className="max-sm:w-full">
              {busy === "fulfil" ? "Fulfilling…" : "Mark as fulfilled"}
            </Button>
          )}
          {canCancel && (
            <AlertDialog
              open={confirming}
              onOpenChange={(next) => {
                if (busy !== null) return;
                setConfirming(next);
                setError(null);
              }}
            >
              <AlertDialogTrigger render={<Button variant="outline" disabled={busy !== null} className="max-sm:w-full" />}>Cancel order</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel order {number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The customer is refunded {formatPrice(total)} and the items go back into stock. No email is sent. This can&apos;t be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <FormError message={confirming ? error : null} className="mb-0 empty:hidden" />
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={busy !== null}>Keep order</AlertDialogCancel>
                  {/* Black like every primary action: red is for errors and sale prices only. */}
                  <Button disabled={busy !== null} onClick={() => void run("cancel")}>
                    {busy === "cancel" ? "Cancelling…" : "Cancel and refund"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      )}
      <FormError message={confirming ? null : error} className="mb-0" />
    </div>
  );
}
