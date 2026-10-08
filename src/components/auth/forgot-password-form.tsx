"use client";

import { useForm, useStore } from "@tanstack/react-form";
import Link from "next/link";
import { useState } from "react";
import { z } from "zod";

import { describedBy, focusFirstInvalid, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth/errors";
import { emailSchema } from "@/lib/auth/schemas";

const schema = z.object({ email: emailSchema });

/**
 * Asks for a reset link. The answer is the same whether or not the email has an account, so the
 * form can't be used to find out who shops here; only a rate limit or a network failure shows an error.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const { error } = await authClient.requestPasswordReset({
          email: schema.parse(value).email,
          redirectTo: "/sign-in/reset-password",
        });
        if (error?.status === 429) {
          setFormError(authErrorMessage(error));
          return;
        }
        // Anything else still shows the neutral answer, but shouldn't fail silently.
        if (error) console.error("[auth] password reset request failed:", error.status, error.code);
      } catch {
        setFormError(authErrorMessage(null));
        return;
      }
      setSent(true);
    },
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  if (sent) {
    return (
      <div className="flex flex-col gap-block">
        <p role="status" className="text-body">
          If an account exists for that email, we&apos;ve sent a link. It works once and expires in 1 hour.
        </p>
        <Link href="/sign-in" className="link self-start">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      aria-labelledby="forgot-heading"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        focusFirstInvalid([["email", "forgot-email"]], (name) => hasErrors(form.getFieldMeta(name as "email")));
      }}
      className="flex flex-col gap-block"
    >
      <FieldGroup>
        <form.Field name="email">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="forgot-email">Email</FieldLabel>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "forgot-email-error")}
                />
                <FieldError id="forgot-email-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <div>
        <FormError message={formError} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Sending…" : "Continue"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
