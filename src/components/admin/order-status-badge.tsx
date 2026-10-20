import { Badge } from "@/components/ui/badge";
import { ADMIN_ORDER_STATUS_LABELS } from "@/lib/admin/orders/labels";
import type { OrderStatus } from "@/lib/orders/queries";

/** Paid orders (the ones to act on) stand out; fulfilled and cancelled ones are done. */
export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const variant = status === "paid" ? "default" : status === "pending_capture" ? "outline" : "secondary";
  return <Badge variant={variant}>{ADMIN_ORDER_STATUS_LABELS[status]}</Badge>;
}
