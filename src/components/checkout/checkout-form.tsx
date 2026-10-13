"use client";

import { CheckoutElementsProvider, PaymentElement, ShippingAddressElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { deliveryWindow } from "@/lib/catalog/delivery";
import { formatPrice } from "@/lib/format";
import { site } from "@/lib/site";
import { stripeElementsOptions } from "./stripe-appearance";

// Loaded with React.lazy by CheckoutView, so Stripe's code is only fetched when /checkout renders
// the form, never with the route prefetches from every Checkout link.

const stripes = new Map<string, Promise<Stripe | null>>();
/** One Stripe.js instance per key for the page's life (loadStripe adds Stripe's script once). */
function stripeFor(publishableKey: string) {
  let stripe = stripes.get(publishableKey);
  if (!stripe) {
    stripe = loadStripe(publishableKey);
    stripes.set(publishableKey, stripe);
  }
  return stripe;
}

const dateFormat = new Intl.DateTimeFormat(site.locale, { weekday: "short", day: "numeric", month: "short" });
const noopSubscribe = () => () => {};

type Props = { publishableKey: string; clientSecret: string; total: number };

/** Delivery (Stripe's address fields, US only) and Payment (Stripe's Payment Element), then Pay. */
export default function CheckoutForm({ publishableKey, clientSecret, total }: Props) {
  return (
    <CheckoutElementsProvider stripe={stripeFor(publishableKey)} options={{ clientSecret, elementsOptions: stripeElementsOptions }}>
      <Fields total={total} />
    </CheckoutElementsProvider>
  );
}

function Fields({ total }: { total: number }) {
  const state = useCheckoutElements();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const delivery = hydrated ? deliveryWindow(new Date()) : null;
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);

  if (state.type === "error") {
    return (
      <p role="alert" className="text-body text-destructive">
        Payment couldn&apos;t load: {state.error.message}
      </p>
    );
  }

  async function pay() {
    if (state.type !== "success" || paying) return;
    setPaying(true);
    setError(null);
    // On success Stripe goes to the session's return URL (/checkout/success?checkout=…).
    const result = await state.checkout.confirm();
    if (result.type === "error") {
      setError(result.error.message);
      setPaying(false);
      // The message takes focus so it's read out and seen, even below the fold.
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return (
    <>
      <section aria-labelledby="delivery-heading" className="flex flex-col gap-4">
        <h2 id="delivery-heading" className="eyebrow">
          2 Delivery
        </h2>
        {state.type === "loading" ? <Skeleton className="h-64 bg-surface" /> : <ShippingAddressElement />}
        <p className="text-caption text-muted-foreground">
          Complimentary delivery
          {delivery && (
            <>
              {" "}
              — estimated {dateFormat.format(delivery.earliest)} – {dateFormat.format(delivery.latest)}
            </>
          )}
        </p>
      </section>

      <section aria-labelledby="payment-heading" className="flex flex-col gap-4">
        <h2 id="payment-heading" className="eyebrow">
          3 Payment
        </h2>
        {state.type === "loading" ? <Skeleton className="h-48 bg-surface" /> : <PaymentElement />}
      </section>

      <div className="flex flex-col gap-3">
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-body text-destructive outline-none empty:hidden">
          {error}
        </p>
        <Button type="button" className="w-full" onClick={pay} disabled={state.type !== "success" || paying}>
          {paying ? "Paying…" : `Pay ${formatPrice(total)}`}
        </Button>
      </div>
    </>
  );
}
