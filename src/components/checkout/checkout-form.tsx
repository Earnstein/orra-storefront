"use client";

import { CheckoutElementsProvider, PaymentElement, ShippingAddressElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";

import { describedBy, focusFirstInvalid, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { deliveryWindow } from "@/lib/catalog/delivery";
import { phoneSchema, usPhone } from "@/lib/checkout/phone";
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

// Link's optional "save my information" sign-up sits inside the card form, pre-filled with the
// session's email; confirming with it left half-filled fails the whole payment (Stripe answers
// "error_details_unknown" for billing_details[phone]). Cards only; Apple Pay and Google Pay stay.
const paymentOptions = { wallets: { link: "never" } } as const;

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

const phoneForm = z.object({ phone: phoneSchema });

function Fields({ total }: { total: number }) {
  const state = useCheckoutElements();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const delivery = hydrated ? deliveryWindow(new Date()) : null;
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Pay submits the phone number (ours) with Stripe's fields; Stripe validates its own.
  const form = useForm({
    defaultValues: { phone: "" },
    validators: { onChange: phoneForm, onSubmit: phoneForm },
    onSubmit: async ({ value }) => {
      if (state.type !== "success") return;
      setError(null);
      // On success Stripe goes to the session's return URL (/checkout/success?checkout=…).
      const result = await state.checkout.confirm({ phoneNumber: usPhone(value.phone) ?? undefined });
      if (result.type === "error") {
        console.error("checkout: payment not confirmed", result.error.code, result.error.message);
        // Stripe's messages are written for shoppers ("Your card was declined."), except the odd code.
        setError(/\s/.test(result.error.message) ? result.error.message : "Your payment didn't go through. Check your details and try again.");
        // The message takes focus so it's read out and seen, even below the fold.
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    },
  });
  const submitted = useStore(form.store, (s) => s.submissionAttempts > 0);

  if (state.type === "error") return <LoadError message={state.error.message} />;

  return (
    <form
      noValidate
      aria-label="Delivery and payment"
      className="flex flex-col gap-block"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        focusFirstInvalid([["phone", "checkout-phone"]], (name) => hasErrors(form.getFieldMeta(name as "phone")));
      }}
    >
      <section aria-labelledby="delivery-heading" className="flex flex-col gap-4">
        <h2 id="delivery-heading" className="eyebrow">
          2 Delivery
        </h2>
        {state.type === "loading" ? <Skeleton className="h-64 bg-surface" /> : <ShippingAddressElement />}
        <form.Field name="phone">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="checkout-phone">Phone number</FieldLabel>
                <Input
                  id="checkout-phone"
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="tel"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy("checkout-phone-hint", errors.length > 0 && "checkout-phone-error")}
                />
                <FieldDescription id="checkout-phone-hint">For the courier, in case they need to reach you.</FieldDescription>
                <FieldError id="checkout-phone-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
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
        {state.type === "loading" ? <Skeleton className="h-48 bg-surface" /> : <PaymentElement options={paymentOptions} />}
      </section>

      <div className="flex flex-col gap-3">
        <p ref={errorRef} tabIndex={-1} role="alert" className="text-body text-destructive outline-none empty:hidden">
          {error}
        </p>
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={state.type !== "success" || isSubmitting}>
              {isSubmitting ? "Paying…" : `Pay ${formatPrice(total)}`}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

/** Stripe's fields didn't load. Its message can name the key, so shoppers get a plain one. */
function LoadError({ message }: { message: string }) {
  useEffect(() => console.error("checkout: Stripe didn't load:", message), [message]);
  return (
    <div className="flex flex-col items-start gap-3">
      <p role="alert" className="text-body text-destructive">
        Payment couldn&apos;t load. Reload the page to try again.
      </p>
      <Button type="button" variant="outline" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}
