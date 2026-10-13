"use client";

import Image from "next/image";
import { useSyncExternalStore } from "react";

import { Media } from "@/components/primitives";
import { Separator } from "@/components/ui/separator";
import type { Bag } from "@/lib/bag/types";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";

const noopSubscribe = () => () => {};
const timeFormat = new Intl.DateTimeFormat(site.locale, { hour: "numeric", minute: "2-digit" });

/** "3:45 pm", in the shopper's own time zone. */
export function holdTime(expiresAt: string): string {
  return timeFormat.format(new Date(expiresAt)).replace(/\s?([AP])M$/i, (_, period: string) => ` ${period.toLowerCase()}m`);
}

/**
 * What's being bought: the lines (sold-out ones left out), subtotal, complimentary delivery and the
 * total, and, while stock is held, until when. Times use the visitor's clock, so they render after
 * hydration.
 */
export function CheckoutSummary({ bag, expiresAt }: { bag: Bag; expiresAt?: string }) {
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const lines = bag.lines.filter((line) => line.note !== "sold-out");
  return (
    <section aria-labelledby="checkout-summary-heading" className="flex flex-col gap-5 bg-surface p-6">
      <h2 id="checkout-summary-heading" className="eyebrow">
        Order summary
      </h2>
      <ul className="flex flex-col gap-4">
        {lines.map((line) => (
          <li key={line.slug} className="grid grid-cols-[4rem_1fr_auto] gap-4 text-caption">
            <Media>{line.image && <Image src={line.image.src} alt={line.image.alt} fill sizes="64px" className="object-cover" />}</Media>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="uppercase">{line.name}</p>
              <p className="text-muted-foreground">{line.colour}</p>
              <p className="text-muted-foreground">Quantity: {line.quantity}</p>
            </div>
            <p>{formatPrice(line.unitPrice * line.quantity)}</p>
          </li>
        ))}
      </ul>
      <Separator />
      <dl className="flex flex-col gap-3 text-body">
        <div className="flex justify-between gap-4">
          <dt>Subtotal</dt>
          <dd>{formatPrice(bag.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Delivery</dt>
          <dd>Complimentary</dd>
        </div>
      </dl>
      <Separator />
      <div className="flex justify-between gap-4 text-body uppercase">
        <span>Total</span>
        <span data-testid="checkout-total">{formatPrice(bag.subtotal)}</span>
      </div>
      <p className="text-caption text-muted-foreground">No taxes are charged in this demo</p>
      {expiresAt && hydrated && <p className="text-caption">We&apos;re holding your items until {holdTime(expiresAt)}</p>}
    </section>
  );
}
