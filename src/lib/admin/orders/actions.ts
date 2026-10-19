"use server";

import { refresh, updateTag } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { adminForAction } from "@/lib/admin/session";
import { paymentProvider } from "@/lib/payments";
import { PaymentsUnavailableError } from "@/lib/payments/types";
import { cancelOrder, fulfilOrder } from "./mutations";
import type { OrderResult } from "./types";

// The owner's order actions (the demo admin has neither permission). Each checks the admin first
// (uncached session), then refreshes the page so its status and history update.

const FAILED = { ok: false, error: "failed", message: "Something went wrong. Try again." } as const;
const NOT_FOUND = { ok: false, error: "not-found", message: "This order no longer exists." } as const;
const orderId = z.uuid();

/** Marks a paid order as sent. */
export async function fulfilAdminOrder(id: string): Promise<OrderResult> {
  const check = await adminForAction({ order: ["fulfil"] });
  if (!check.ok) return check;
  if (!orderId.safeParse(id).success) return NOT_FOUND;
  try {
    const result = await fulfilOrder({ db }, id);
    if (result.ok) refresh();
    return result;
  } catch (error) {
    console.error("admin: fulfilling failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
}

/** Cancels a paid order: refunds it and puts its stock back (the catalogue refreshes). */
export async function cancelAdminOrder(id: string): Promise<OrderResult> {
  const check = await adminForAction({ order: ["cancel"] });
  if (!check.ok) return check;
  if (!orderId.safeParse(id).success) return NOT_FOUND;
  try {
    const result = await cancelOrder({ db, provider: paymentProvider() }, id);
    if (result.ok) {
      // The stock went back: expire the cached catalogue (and its CDN copies).
      updateTag("catalog");
      refresh();
    }
    return result;
  } catch (error) {
    if (error instanceof PaymentsUnavailableError) return { ok: false, error: "failed", message: "Payments aren't set up, so the order can't be refunded." };
    console.error("admin: cancelling failed", error instanceof Error ? error.message : error);
    return FAILED;
  }
}
