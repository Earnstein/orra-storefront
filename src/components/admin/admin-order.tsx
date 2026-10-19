import { OrderSummary } from "@/components/orders/order-detail";
import { Separator } from "@/components/ui/separator";
import type { AdminOrder } from "@/lib/admin/orders/types";
import { site } from "@/lib/site";
import { AdminPage } from "./admin-page";
import { OrderActions } from "./order-actions";
import { OrderStatusBadge } from "./order-status-badge";

// Server-rendered in one zone (UTC, as the order emails and the shopper's order page).
const timeFormat = new Intl.DateTimeFormat(site.locale, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const formatTime = (iso: string) => `${timeFormat.format(new Date(iso))} UTC`;

/**
 * One order for the admin: its status and actions, the customer (masked for the demo admin),
 * where it goes, how it was paid, what happened when, and the items.
 */
export function AdminOrderView({ order, canFulfil, canCancel, back }: { order: AdminOrder; canFulfil: boolean; canCancel: boolean; back: React.ReactNode }) {
  const actionable = order.status === "paid" && !order.cancelling;
  const history = [
    { label: "Placed", at: order.createdAt },
    order.fulfilledAt && { label: "Fulfilled", at: order.fulfilledAt },
    order.cancelledAt && { label: order.refunded ? "Cancelled and refunded" : "Cancelled (the payment wasn't taken)", at: order.cancelledAt },
  ].filter((event): event is { label: string; at: string } => Boolean(event));

  return (
    <AdminPage title={`Order ${order.number}`} action={back}>
      <div className="grid items-start gap-block lg:grid-cols-3">
        <div className="flex flex-col gap-block lg:col-span-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="sr-only">Status:</span>
              <OrderStatusBadge status={order.status} />
            </div>
            {order.status === "pending_capture" && <p className="text-body text-muted-foreground">The payment is still being taken.</p>}
            {order.status === "paid" && order.cancelling && <p className="text-body text-muted-foreground">This order is being cancelled. Reload in a minute.</p>}
            {/* Mounted whenever the role can act, so its outcome message survives the refresh that removes the buttons. */}
            {(canFulfil || canCancel) && (
              <OrderActions orderId={order.id} number={order.number} total={order.subtotal} canFulfil={canFulfil && actionable} canCancel={canCancel && actionable} />
            )}
          </div>

          <dl className="grid gap-block text-body sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <dt className="eyebrow">Customer</dt>
              <dd className="flex flex-col">
                {order.shipping && <span>{order.shipping.name}</span>}
                <span className="break-all">{order.email}</span>
                <span className="text-muted-foreground">{order.account ? "Has an account" : "Guest checkout"}</span>
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="eyebrow">Delivering to</dt>
              <dd>
                {!order.shipping ? (
                  <span className="text-muted-foreground">No address recorded</span>
                ) : order.masked ? (
                  <address className="not-italic">
                    {order.shipping.city}, {order.shipping.state}
                  </address>
                ) : (
                  <address className="not-italic">
                    {order.shipping.line1}
                    {order.shipping.line2 && (
                      <>
                        <br />
                        {order.shipping.line2}
                      </>
                    )}
                    <br />
                    {order.shipping.city}, {order.shipping.state} {order.shipping.postalCode}
                    <br />
                    {order.shipping.country === "US" ? "United States" : order.shipping.country}
                  </address>
                )}
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="eyebrow">Payment</dt>
              <dd>{order.paymentSummary ?? <span className="text-muted-foreground">Not recorded</span>}</dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="eyebrow">History</dt>
              <dd>
                <ol className="flex flex-col gap-1">
                  {history.map((event) => (
                    <li key={event.label}>
                      {event.label} <span className="text-muted-foreground">· {formatTime(event.at)}</span>
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          </dl>
          {order.masked && (
            <>
              <Separator />
              <p className="text-caption text-muted-foreground">
                In the demo, customers&apos; names, emails and street addresses are hidden, and orders can&apos;t be fulfilled or cancelled.
              </p>
            </>
          )}
        </div>
        <OrderSummary order={{ items: order.items.map(({ name, unitPrice, quantity, image }) => ({ name, unitPrice, quantity, image })), subtotal: order.subtotal }} />
      </div>
    </AdminPage>
  );
}
