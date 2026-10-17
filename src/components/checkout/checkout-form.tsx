"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckoutElementsProvider, PaymentElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { z } from "zod";

import { describedBy, focusFirstInvalid, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { deliveryWindow } from "@/lib/catalog/delivery";
import { addressSchema, toStripeShipping, US_STATES } from "@/lib/checkout/address";
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

type Props = { publishableKey: string; clientSecret: string; total: number; onPaying: (paying: boolean) => void };

/** Delivery (our own address and phone fields, US only) and Payment (Stripe's Payment Element), then Pay. */
export default function CheckoutForm({ publishableKey, clientSecret, total, onPaying }: Props) {
  return (
    <CheckoutElementsProvider stripe={stripeFor(publishableKey)} options={{ clientSecret, elementsOptions: stripeElementsOptions }}>
      <Fields total={total} onPaying={onPaying} />
    </CheckoutElementsProvider>
  );
}

// Delivery is our own form (the site's fields and a filterable State list); Stripe gets the address
// when the shopper pays. Only the card fields are Stripe's, as card details must never reach us.
const deliveryForm = addressSchema.extend({ phone: phoneSchema });
type DeliveryValues = z.input<typeof deliveryForm>;

// The State list stores the two-letter code and filters and shows by name.
type StateCode = (typeof US_STATES)[number]["code"];
const stateItems = ComboboxPrimitive.createItems([...US_STATES], { getValue: (state) => state.code, getLabel: (state) => state.name });

// Field ids in page order, for focusing the first invalid one on Pay.
const FIELD_IDS: [keyof DeliveryValues, string][] = [
  ["name", "checkout-name"],
  ["line1", "checkout-line1"],
  ["line2", "checkout-line2"],
  ["city", "checkout-city"],
  ["state", "checkout-state"],
  ["postalCode", "checkout-postal-code"],
  ["phone", "checkout-phone"],
];

function Fields({ total, onPaying }: Pick<Props, "total" | "onPaying">) {
  const state = useCheckoutElements();
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const delivery = hydrated ? deliveryWindow(new Date()) : null;
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Pay submits our delivery fields with Stripe's card fields; Stripe validates its own.
  const form = useForm({
    defaultValues: { name: "", line1: "", line2: "", city: "", state: "", postalCode: "", phone: "" } as DeliveryValues,
    validators: { onChange: deliveryForm, onSubmit: deliveryForm },
    onSubmit: async ({ value }) => {
      if (state.type !== "success") return;
      setError(null);
      onPaying(true);
      // On success Stripe goes to the session's return URL (/checkout/success?checkout=…).
      let failure: string | null = null;
      try {
        const result = await state.checkout.confirm({ phoneNumber: usPhone(value.phone) ?? undefined, shippingAddress: toStripeShipping(value) });
        if (result.type === "error") {
          console.error("checkout: payment not confirmed", result.error.code, result.error.message);
          // Stripe's messages are written for shoppers ("Your card was declined."), except the odd code.
          failure = /\s/.test(result.error.message) ? result.error.message : "Your payment didn't go through. Check your details and try again.";
        }
      } catch (thrown) {
        console.error("checkout: confirm failed", thrown instanceof Error ? thrown.message : thrown);
        failure = "Your payment didn't go through. Check your connection and try again.";
      }
      if (failure) {
        onPaying(false);
        setError(failure);
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
        focusFirstInvalid(FIELD_IDS, (name) => hasErrors(form.getFieldMeta(name as keyof DeliveryValues)));
      }}
    >
      <section aria-labelledby="delivery-heading" className="flex flex-col gap-4">
        <h2 id="delivery-heading" className="eyebrow">
          2 Delivery
        </h2>
        {/* Said once for every field; each required control also carries aria-required. */}
        <p className="text-caption text-muted-foreground">All fields are required unless marked optional.</p>
        <FieldGroup>
          {(
            [
              { name: "name", label: "Full name", autoComplete: "name", required: true },
              { name: "line1", label: "Address", autoComplete: "address-line1", required: true },
              { name: "line2", label: "Apartment, suite, etc. (optional)", autoComplete: "address-line2", required: false },
              { name: "city", label: "City", autoComplete: "address-level2", required: true },
            ] as const
          ).map(({ name, label, autoComplete, required }) => (
            <form.Field key={name} name={name}>
              {(field) => {
                const errors = shownErrors(field.state.meta, submitted);
                const id = FIELD_IDS.find(([key]) => key === name)![1];
                return (
                  <Field data-invalid={errors.length > 0 || undefined}>
                    <FieldLabel htmlFor={id}>{label}</FieldLabel>
                    <Input
                      id={id}
                      autoComplete={`shipping ${autoComplete}`}
                      aria-required={required || undefined}
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={errors.length > 0 || undefined}
                      aria-describedby={describedBy(errors.length > 0 && `${id}-error`)}
                    />
                    <FieldError id={`${id}-error`} errors={errors} />
                  </Field>
                );
              }}
            </form.Field>
          ))}
          <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
            <form.Field name="state">
              {(field) => {
                const errors = shownErrors(field.state.meta, submitted);
                return (
                  <Field data-invalid={errors.length > 0 || undefined}>
                    <FieldLabel htmlFor="checkout-state">State</FieldLabel>
                    <Combobox
                      items={stateItems}
                      value={(field.state.value || null) as StateCode | null}
                      onValueChange={(code) => field.handleChange(code ?? "")}
                      autoHighlight
                    >
                      <ComboboxInput
                        id="checkout-state"
                        placeholder="Select a state"
                        autoComplete="shipping address-level1"
                        aria-required
                        onBlur={field.handleBlur}
                        aria-invalid={errors.length > 0 || undefined}
                        aria-describedby={describedBy(errors.length > 0 && "checkout-state-error")}
                        className="w-full"
                      />
                      <ComboboxContent>
                        <ComboboxEmpty>No state matches.</ComboboxEmpty>
                        <ComboboxList aria-label="States">
                          {(item: (typeof US_STATES)[number]) => (
                            <ComboboxItem key={item.code} value={item.code}>
                              {item.name}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <FieldError id="checkout-state-error" errors={errors} />
                  </Field>
                );
              }}
            </form.Field>
            <form.Field name="postalCode">
              {(field) => {
                const errors = shownErrors(field.state.meta, submitted);
                return (
                  <Field data-invalid={errors.length > 0 || undefined}>
                    <FieldLabel htmlFor="checkout-postal-code">ZIP code</FieldLabel>
                    <Input
                      id="checkout-postal-code"
                      autoComplete="shipping postal-code"
                      aria-required
                      inputMode="numeric"
                      value={field.state.value}
                      onChange={(event) => field.handleChange(event.target.value)}
                      onBlur={field.handleBlur}
                      aria-invalid={errors.length > 0 || undefined}
                      aria-describedby={describedBy(errors.length > 0 && "checkout-postal-code-error")}
                    />
                    <FieldError id="checkout-postal-code-error" errors={errors} />
                  </Field>
                );
              }}
            </form.Field>
          </div>
          <form.Field name="phone">
            {(field) => {
              const errors = shownErrors(field.state.meta, submitted);
              return (
                <Field data-invalid={errors.length > 0 || undefined}>
                  <FieldLabel htmlFor="checkout-phone">Phone number</FieldLabel>
                  <Input
                    id="checkout-phone"
                    type="tel"
                    autoComplete="shipping tel-national"
                    aria-required
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
        </FieldGroup>
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
