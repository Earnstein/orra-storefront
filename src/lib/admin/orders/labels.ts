import type { OrderStatus } from "@/lib/orders/queries";

/** How the admin names each status (the shopper sees "Confirmed" for paid: src/lib/orders/status.ts). */
export const ADMIN_ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_capture: "Processing",
  paid: "Paid",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};
