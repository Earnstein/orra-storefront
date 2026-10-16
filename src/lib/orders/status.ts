import type { OrderStatus } from "./queries";

/** How an order's status reads to the shopper. */
export function orderStatusLabel(status: OrderStatus): string {
  switch (status) {
    case "pending_capture":
      return "Processing";
    case "paid":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
  }
}
