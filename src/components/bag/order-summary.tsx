"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Bag } from "@/lib/bag/types";
import { deliveryWindow } from "@/lib/catalog/delivery";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat(site.locale, { weekday: "short", day: "numeric", month: "short" });
const noopSubscribe = () => () => {};

/** Checkout, as a link when something can be bought and a disabled button when nothing can. */
export function CheckoutButton({ bag, label = "Checkout", className }: { bag: Bag; label?: string; className?: string }) {
  if (bag.count === 0) {
    return (
      <Button type="button" disabled className={cn("w-full", className)}>
        {label}
      </Button>
    );
  }
  return (
    <Link href="/checkout" className={cn(buttonVariants(), "w-full", className)}>
      {label}
    </Link>
  );
}

/**
 * The order summary beside the lines: subtotal, complimentary delivery with its estimated window
 * (the dates use the visitor's clock, so they render after hydration), total, Checkout and the demo
 * notes. Sold-out lines are already out of the subtotal.
 */
export function OrderSummary({ bag }: { bag: Bag }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const delivery = hydrated ? deliveryWindow(new Date()) : null;
  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-5 bg-surface p-6">
      <h2 id="summary-heading" className="eyebrow">
        Order summary
      </h2>
      <dl className="flex flex-col gap-3 text-body">
        <div className="flex justify-between gap-4">
          <dt>Subtotal</dt>
          <dd data-testid="subtotal">{formatPrice(bag.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Delivery</dt>
          <dd>Complimentary</dd>
        </div>
        {delivery && (
          <div className="flex justify-between gap-4 text-caption text-muted-foreground">
            <dt className="sr-only">Estimated delivery</dt>
            <dd>
              Estimated {dateFormat.format(delivery.earliest)} – {dateFormat.format(delivery.latest)}
            </dd>
          </div>
        )}
      </dl>
      <Separator />
      <div className="flex justify-between gap-4 text-body uppercase">
        <span>Total</span>
        <span data-testid="total">{formatPrice(bag.subtotal)}</span>
      </div>
      <p className="text-caption text-muted-foreground">No taxes are charged in this demo</p>
      <CheckoutButton bag={bag} />
      <p className="text-caption text-muted-foreground">Payments run in Stripe test mode — no real money</p>
    </section>
  );
}
