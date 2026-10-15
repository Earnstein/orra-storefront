"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { handOffEmail } from "@/components/auth/email-handoff";
import { Media } from "@/components/primitives";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { bagQueryKey } from "@/lib/bag/bag-query";
import { notifyBagCount } from "@/lib/bag/use-bag-count";
import { deliveryWindow } from "@/lib/catalog/delivery";
import type { ConfirmAnswer, ConfirmedOrder } from "@/lib/checkout/confirm";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/** How long the page keeps re-checking a payment that's still processing. */
const CHECK_EVERY_MS = 2000;
const CHECK_FOR_MS = 30_000;

const dateFormat = new Intl.DateTimeFormat(site.locale, { weekday: "short", day: "numeric", month: "short" });

async function confirm(checkout: string): Promise<ConfirmAnswer> {
  try {
    const response = await fetch("/api/checkout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout }),
    });
    return (await response.json()) as ConfirmAnswer;
  } catch {
    // Offline for a moment: keep checking.
    return { status: "pending" };
  }
}

/** "the Leather tote", "the Leather tote and the Silk scarf", or "some items in your bag". */
export function soldOutMessage(items: string[]): string {
  const names = items.length === 0 || items.length > 2 ? "some items in your bag" : items.map((name) => `the ${name}`).join(" and ");
  return `Sorry — ${names} sold out while you were paying. Your card was not charged.`;
}

/**
 * /checkout/success?checkout=<id>: confirms the payment (the call fulfils it if the webhook hasn't
 * yet), then shows the order, "Confirming your payment…" while it's processing (re-checked every 2
 * seconds for 30 seconds), or why there's no order. Anyone but the shopper sees "Order received".
 */
export function SuccessView() {
  const checkout = useSearchParams().get("checkout");
  if (!checkout) return <Received />;
  return <Confirmation checkout={checkout} />;
}

function Confirmation({ checkout }: { checkout: string }) {
  const queryClient = useQueryClient();
  const [startedAt] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const result = useQuery({
    queryKey: ["checkout-confirm", checkout],
    queryFn: () => confirm(checkout),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data?.status === "pending" && Date.now() - startedAt < CHECK_FOR_MS ? CHECK_EVERY_MS : false),
  });
  const answer = result.data;

  useEffect(() => {
    if (answer?.status !== "pending") return;
    const timeout = window.setTimeout(() => setGaveUp(true), Math.max(startedAt + CHECK_FOR_MS - Date.now(), 0));
    return () => window.clearTimeout(timeout);
  }, [answer?.status, startedAt]);

  // The bought lines left the bag: the header count (its cookie was just set) and the bag catch up.
  useEffect(() => {
    if (answer?.status !== "confirmed") return;
    notifyBagCount();
    void queryClient.invalidateQueries({ queryKey: bagQueryKey });
  }, [answer?.status, queryClient]);

  if (!answer || (answer.status === "pending" && !gaveUp)) {
    return (
      <div className="flex flex-col gap-block" aria-busy>
        <h1 className="text-title uppercase">Confirming your payment…</h1>
        <Skeleton className="h-72 bg-surface" />
      </div>
    );
  }
  switch (answer.status) {
    case "confirmed":
      return <Confirmed order={answer.order} signedIn={answer.signedIn} />;
    case "pending":
      return (
        <Notice title="Payment received" message="Your payment is still being confirmed. We'll email you when it's confirmed." />
      );
    case "sold-out":
      return <Notice title="Your order didn't go through" message={soldOutMessage(answer.items)} backToBag />;
    case "failed":
      return <Notice title="Your order didn't go through" message="Your payment didn't go through. Your card was not charged." backToBag />;
    case "received":
      return <Received />;
  }
}

function Received() {
  return <Notice title="Order received" message="If this was your order, you'll find the details in your confirmation email." />;
}

function Notice({ title, message, backToBag = false }: { title: string; message: string; backToBag?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-title uppercase">{title}</h1>
      <p role={backToBag ? "alert" : "status"} className="text-body">
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        {backToBag && (
          <Link href="/bag" className={cn(buttonVariants())}>
            Back to bag
          </Link>
        )}
        <Link href="/" className={cn(buttonVariants({ variant: backToBag ? "outline" : "default" }))}>
          Continue shopping
        </Link>
      </div>
    </div>
  );
}

function Confirmed({ order, signedIn }: { order: ConfirmedOrder; signedIn: boolean }) {
  const delivery = deliveryWindow(new Date(order.createdAt));
  const { shipping } = order;
  return (
    <div className="flex flex-col gap-block">
      <div className="flex flex-col gap-3">
        <p className="eyebrow">Order confirmed</p>
        <h1 className="text-title uppercase">Thank you — order {order.number} is confirmed</h1>
        <p className="text-body">
          We&apos;ve emailed a confirmation to <span className="break-all">{order.email}</span>.
        </p>
        <p className="text-caption text-muted-foreground">In this demo, emails only reach the store owner until launch.</p>
      </div>

      <div className="grid items-start gap-block lg:grid-cols-3">
        <div className="flex flex-col gap-block lg:col-span-2">
          <dl className="grid gap-block text-body sm:grid-cols-2">
            {shipping && (
              <div className="flex flex-col gap-2">
                <dt className="eyebrow">Delivering to</dt>
                <dd>
                  <address className="not-italic">
                    {shipping.name}
                    <br />
                    {shipping.line1}
                    {shipping.line2 && (
                      <>
                        <br />
                        {shipping.line2}
                      </>
                    )}
                    <br />
                    {shipping.city}, {shipping.state} {shipping.postalCode}
                    <br />
                    {shipping.country === "US" ? "United States" : shipping.country}
                  </address>
                </dd>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <dt className="eyebrow">Estimated delivery</dt>
              <dd>
                {dateFormat.format(delivery.earliest)} – {dateFormat.format(delivery.latest)}
                <br />
                <span className="text-muted-foreground">Complimentary delivery</span>
              </dd>
            </div>
            {order.paymentSummary && (
              <div className="flex flex-col gap-2">
                <dt className="eyebrow">Payment</dt>
                <dd>{order.paymentSummary}</dd>
              </div>
            )}
          </dl>

          <Separator />
          {signedIn ? (
            <div className="flex flex-wrap gap-3">
              <Link href="/account/orders" className={cn(buttonVariants())}>
                View your orders
              </Link>
              <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
                Continue shopping
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-4">
              <p className="text-body">Create an account for faster checkout next time.</p>
              <div className="flex flex-wrap gap-3">
                {/* The order's email carries over to sign-up (session storage, never the URL). */}
                <Link href="/sign-up" onClick={() => handOffEmail(order.email)} className={cn(buttonVariants())}>
                  Create an account
                </Link>
                <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
                  Continue shopping
                </Link>
              </div>
            </div>
          )}
        </div>

        <OrderSummary order={order} />
      </div>
    </div>
  );
}

function OrderSummary({ order }: { order: ConfirmedOrder }) {
  return (
    <section aria-labelledby="order-summary-heading" className="flex flex-col gap-5 bg-surface p-6">
      <h2 id="order-summary-heading" className="eyebrow">
        Order summary
      </h2>
      <ul className="flex flex-col gap-4">
        {order.items.map((item) => (
          <li key={item.name} className="grid grid-cols-[4rem_1fr_auto] gap-4 text-caption">
            <Media>{item.image && <Image src={item.image.src} alt={item.image.alt} fill sizes="64px" className="object-cover" />}</Media>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="uppercase">{item.name}</p>
              <p className="text-muted-foreground">Quantity: {item.quantity}</p>
            </div>
            <p>{formatPrice(item.unitPrice * item.quantity)}</p>
          </li>
        ))}
      </ul>
      <Separator />
      <dl className="flex flex-col gap-3 text-body">
        <div className="flex justify-between gap-4">
          <dt>Subtotal</dt>
          <dd>{formatPrice(order.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Delivery</dt>
          <dd>Complimentary</dd>
        </div>
      </dl>
      <Separator />
      <div className="flex justify-between gap-4 text-body uppercase">
        <span>Total</span>
        <span>{formatPrice(order.subtotal)}</span>
      </div>
    </section>
  );
}
