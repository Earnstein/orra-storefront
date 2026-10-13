"use client";

import { useForm, useStore } from "@tanstack/react-form";
import Link from "next/link";
import { z } from "zod";

import { handOffEmail } from "@/components/auth/email-handoff";
import { describedBy, focusFirstInvalid, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { buttonVariants, Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { emailSchema } from "@/lib/auth/schemas";
import { signInPath } from "@/lib/auth/return-to";
import { cn } from "@/lib/utils";

const schema = z.object({ email: emailSchema });

/**
 * The step before paying, after Gucci's: the email, then "Check out as a guest" or "Sign in".
 * Signed-in shoppers only see it when they change their email, without the sign-in option.
 */
export function CheckoutGate({ initialEmail, signedIn, onContinue }: { initialEmail: string; signedIn: boolean; onContinue: (email: string) => void }) {
  const form = useForm({
    defaultValues: { email: initialEmail },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => onContinue(schema.parse(value).email),
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);
  const email = useStore(form.store, (state) => state.values.email);

  return (
    <div className="mx-auto flex w-full max-w-prose flex-col gap-block">
      <div className="flex flex-col gap-2">
        <h1 className="text-title uppercase">Checkout</h1>
        <p className="text-body text-muted-foreground">Enter your email to continue.</p>
      </div>
      <form
        noValidate
        aria-label="Email for this order"
        onSubmit={async (event) => {
          event.preventDefault();
          await form.handleSubmit();
          focusFirstInvalid([["email", "checkout-email"]], (name) => hasErrors(form.getFieldMeta(name as "email")));
        }}
        className="flex flex-col gap-block"
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => {
              const errors = shownErrors(field.state.meta, submitted);
              return (
                <Field data-invalid={errors.length > 0 || undefined}>
                  <FieldLabel htmlFor="checkout-email">Email</FieldLabel>
                  <Input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={errors.length > 0 || undefined}
                    aria-describedby={describedBy(errors.length > 0 && "checkout-email-error")}
                  />
                  <FieldError id="checkout-email-error" errors={errors} />
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>
        <div className="flex flex-col gap-2">
          <Button type="submit" className="w-full">
            {signedIn ? "Continue" : "Check out as a guest"}
          </Button>
          {!signedIn && <FieldDescription>You can create an account after your order.</FieldDescription>}
        </div>
      </form>
      {!signedIn && (
        <Link
          href={signInPath("/checkout")}
          // The email typed here carries over to sign-in (session storage, never the URL).
          onClick={() => {
            const parsed = emailSchema.safeParse(email);
            if (parsed.success) handOffEmail(parsed.data);
          }}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
