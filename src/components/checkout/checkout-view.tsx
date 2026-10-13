"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useBrowserSession } from "@/lib/auth/browser-session";
import { notifyBagCount } from "@/lib/bag/use-bag-count";
import { startCheckout, type CheckoutStart } from "@/lib/checkout/actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckoutGate } from "./checkout-gate";
import { CheckoutSummary } from "./checkout-summary";
import { DemoBanner } from "./demo-banner";

const CheckoutForm = lazy(() => import("./checkout-form"));

const EMAIL_KEY = "orra:checkout-email";

function rememberedEmail(): string | null {
  try {
    return sessionStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

function rememberEmail(email: string | null) {
  try {
    if (email) sessionStorage.setItem(EMAIL_KEY, email);
    else sessionStorage.removeItem(EMAIL_KEY);
  } catch {
    // Without storage a reload asks for the email again.
  }
}

/**
 * /checkout: the gate (email, as a guest or signed in), then one page (contact, delivery, payment)
 * beside the summary. Starting holds the bag's stock for 31 minutes; it runs again when the
 * shopper comes back to the tab (a bag changed in another tab gets a new hold; an unchanged one
 * keeps its hold and payment) and when the hold runs out.
 */
export function CheckoutView() {
  const session = useBrowserSession();
  const [chosen, setChosen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // A guest's email for this tab survives a reload; a signed-in shopper uses their account's.
  const [remembered] = useState(rememberedEmail);
  const email = chosen ?? remembered ?? session.user?.email ?? null;
  const signedIn = Boolean(session.user);

  if (session.isPending && !chosen && !remembered) return <CheckoutSkeleton />;
  if (!email || editing) {
    return (
      <CheckoutGate
        initialEmail={email ?? ""}
        signedIn={signedIn}
        onContinue={(value) => {
          rememberEmail(value);
          setChosen(value);
          setEditing(false);
        }}
      />
    );
  }
  return <CheckoutPage email={email} onChangeEmail={() => setEditing(true)} />;
}

function CheckoutPage({ email, onChangeEmail }: { email: string; onChangeEmail: () => void }) {
  const router = useRouter();
  const start = useQuery({
    queryKey: ["checkout", email],
    queryFn: () => startCheckout({ email }),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: "always",
  });
  const answer: CheckoutStart | undefined = start.data;

  // The bag may have been lowered while starting: the header count catches up.
  useEffect(() => {
    if (answer) notifyBagCount();
    if (answer && !answer.ok && answer.error === "invalid" && answer.reason === "empty") router.replace("/bag");
  }, [answer, router]);

  // When the hold runs out on this page, start again (a new hold, if the stock is still there).
  const expiresAt = answer?.ok ? answer.data.expiresAt : null;
  const { refetch } = start;
  useEffect(() => {
    if (!expiresAt) return;
    const timeout = window.setTimeout(() => void refetch(), Math.max(new Date(expiresAt).getTime() - Date.now(), 0) + 1000);
    return () => window.clearTimeout(timeout);
  }, [expiresAt, refetch]);

  if (start.isPending) return <CheckoutSkeleton />;
  if (start.isError || !answer) return <Problem message="Something went wrong. Try again." onRetry={() => void refetch()} />;
  if (!answer.ok) {
    if (answer.error === "invalid" && answer.reason === "short") {
      return (
        <div className="grid items-start gap-block lg:grid-cols-3">
          <div className="flex flex-col items-start gap-4 lg:col-span-2">
            <h1 className="text-title uppercase">Checkout</h1>
            <p role="alert" className="text-body">
              {answer.message}
            </p>
            <div className="flex flex-wrap gap-3">
              {answer.bag.count > 0 && (
                <Button type="button" onClick={() => void refetch()}>
                  Continue to payment
                </Button>
              )}
              <Link href="/bag" className={cn(buttonVariants({ variant: "outline" }))}>
                Back to bag
              </Link>
            </div>
          </div>
          {answer.bag.count > 0 && <CheckoutSummary bag={answer.bag} />}
        </div>
      );
    }
    if (answer.error === "invalid" && answer.reason === "empty") return <CheckoutSkeleton />;
    if (answer.error === "invalid" && answer.reason === "email") return <Problem message={answer.message} onRetry={onChangeEmail} retryLabel="Change email" />;
    if (answer.error === "invalid" && answer.reason === "unavailable") return <Problem message={answer.message} />;
    return <Problem message={answer.message} onRetry={() => void refetch()} />;
  }

  const { summary, clientSecret, publishableKey } = answer.data;
  return (
    <div className="flex flex-col gap-block">
      <h1 className="text-title uppercase">Checkout</h1>
      <DemoBanner />
      <div className="grid items-start gap-block lg:grid-cols-3">
        {/* On phones the summary sits first, folded to its total. */}
        <details className="group lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border-y border-border py-4 text-body [&::-webkit-details-marker]:hidden">
            <span className="eyebrow">
              <span className="group-open:hidden">Show order summary</span>
              <span className="hidden group-open:inline">Hide order summary</span>
            </span>
            <span>{formatPrice(summary.subtotal)}</span>
          </summary>
          <div className="pt-4">
            <CheckoutSummary bag={summary} expiresAt={answer.data.expiresAt} />
          </div>
        </details>

        <div className="flex flex-col gap-section lg:col-span-2">
          <section aria-labelledby="contact-heading" className="flex flex-col gap-4">
            <h2 id="contact-heading" className="eyebrow">
              1 Contact
            </h2>
            <div className="flex flex-wrap items-center justify-between gap-4 text-body">
              <span className="break-all">{email}</span>
              <Button type="button" variant="link" size="xs" className="px-0" onClick={onChangeEmail} aria-label={`Change email, ${email}`}>
                Change
              </Button>
            </div>
          </section>
          <Suspense fallback={<Skeleton className="h-96 bg-surface" />}>
            {/* A new hold means a new payment: remount Stripe's fields for it. */}
            <CheckoutForm key={clientSecret} publishableKey={publishableKey} clientSecret={clientSecret} total={summary.subtotal} />
          </Suspense>
          <p className="text-caption text-muted-foreground">Payments run in Stripe test mode — no real money</p>
        </div>

        <div className="hidden lg:sticky lg:top-[calc(var(--spacing-header)+1rem)] lg:block">
          <CheckoutSummary bag={summary} expiresAt={answer.data.expiresAt} />
        </div>
      </div>
    </div>
  );
}

function Problem({ message, onRetry, retryLabel = "Try again" }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-title uppercase">Checkout</h1>
      <p role="alert" className="text-body">
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        {onRetry && (
          <Button type="button" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
        <Link href="/bag" className={cn(buttonVariants({ variant: "outline" }))}>
          Back to bag
        </Link>
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="flex flex-col gap-block" aria-busy>
      <h1 className="text-title uppercase">Checkout</h1>
      <div className="grid gap-block lg:grid-cols-3">
        <Skeleton className="h-96 bg-surface lg:col-span-2" />
        <Skeleton className="h-72 bg-surface" />
      </div>
    </div>
  );
}
