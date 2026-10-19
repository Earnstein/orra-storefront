import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { deliveryWindow } from "@/lib/catalog/delivery";
import type { Order } from "@/lib/orders/queries";
import { orderStatusLabel } from "@/lib/orders/status";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";
import { OrderFacts, OrderSummary } from "./order-detail";

// Server-rendered, so dates use one zone (UTC, as the confirmation email does) rather than the
// server's or the visitor's.
const placedFormat = new Intl.DateTimeFormat(site.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const DAY = 24 * 60 * 60 * 1000;
const deliveryFormat = new Intl.DateTimeFormat(site.locale, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/**
 * One order in full: number, date and status, then the address, delivery, payment and items. The
 * estimated delivery shows only until its last day has passed (`now`, read by the page).
 */
export function OrderPage({ order, now, back }: { order: Order; now: Date; back?: { href: string; label: string } }) {
  const estimate = order.status === "cancelled" ? null : deliveryWindow(order.createdAt);
  const delivery = estimate && estimate.latest.getTime() + DAY >= now.getTime() ? estimate : null;
  return (
    <div className="flex flex-col gap-block">
      <header className="flex flex-col gap-3">
        {back && (
          <Link href={back.href} className="eyebrow link-quiet self-start text-muted-foreground">
            {back.label}
          </Link>
        )}
        <h1 className="text-title uppercase">
          Order <span className="whitespace-nowrap">{order.number}</span>
        </h1>
        <p className="text-body">
          Placed on {placedFormat.format(order.createdAt)} · {orderStatusLabel(order.status)}
        </p>
        {order.status === "cancelled" && (
          <p className="text-body text-muted-foreground">
            {order.refundedAt ? "This order was cancelled and refunded to your card." : "This order was cancelled and your card was not charged."}
          </p>
        )}
      </header>

      <div className="grid items-start gap-block lg:grid-cols-3">
        <div className="flex flex-col gap-block lg:col-span-2">
          <OrderFacts
            shipping={order.shipping}
            delivery={delivery && `${deliveryFormat.format(delivery.earliest)} – ${deliveryFormat.format(delivery.latest)}`}
            paymentSummary={order.paymentSummary}
          />
          <Separator />
          <div className="flex flex-wrap gap-3">
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Continue shopping
            </Link>
          </div>
        </div>
        {/* Only the lines and total: the summary is shared with a client component. */}
        <OrderSummary order={{ items: order.items.map(({ name, unitPrice, quantity, image }) => ({ name, unitPrice, quantity, image })), subtotal: order.subtotal }} />
      </div>
    </div>
  );
}
