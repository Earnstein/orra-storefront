"use client";

import { useForm, useStore } from "@tanstack/react-form";
import Link from "next/link";
import { useEffect, useState } from "react";

import { takeHandedOffEmail } from "@/components/auth/email-handoff";
import { describedBy, focusFirstInvalid, hasErrors, leaveSignIn, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth/errors";
import { signInSchema } from "@/lib/auth/schemas";

const FIELDS: [string, string][] = [
  ["email", "sign-in-email"],
  ["password", "sign-in-password"],
];

export function SignInForm() {
  // Stays true while the full page load after success is under way, so the button stays disabled.
  const [leaving, setLeaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "", password: "", rememberMe: true },
    validators: { onChange: signInSchema, onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const { email, password, rememberMe } = signInSchema.parse(value);
      try {
        const { error } = await authClient.signIn.email({ email, password, rememberMe });
        if (error) {
          setFormError(authErrorMessage(error));
          return;
        }
      } catch {
        setFormError(authErrorMessage(null));
        return;
      }
      setLeaving(true);
      leaveSignIn();
    },
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  // "Sign in instead" on /sign-up hands the email over: fill it in and move on to the password.
  useEffect(() => {
    const email = takeHandedOffEmail();
    if (!email) return;
    form.setFieldValue("email", email);
    document.getElementById("sign-in-password")?.focus();
  }, [form]);

  return (
    <form
      noValidate
      aria-labelledby="sign-in-heading"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        // Checked here, not in onSubmitInvalid: TanStack Form skips that when a blur has already
        // marked the form invalid.
        focusFirstInvalid(FIELDS, (name) => hasErrors(form.getFieldMeta(name as "email")));
      }}
      className="flex flex-col gap-block"
    >
      <FieldGroup>
        <form.Field name="email">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
                <Input
                  id="sign-in-email"
                  type="email"
                  autoComplete="username"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "sign-in-email-error")}
                />
                <FieldError id="sign-in-email-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="password">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
                <PasswordInput
                  id="sign-in-password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "sign-in-password-error")}
                />
                <FieldError id="sign-in-password-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <form.Field name="rememberMe">
            {(field) => (
              <Field orientation="horizontal" className="w-auto">
                <Checkbox
                  id="sign-in-remember"
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                />
                <FieldLabel htmlFor="sign-in-remember" className="font-normal text-body">
                  Stay signed in
                </FieldLabel>
              </Field>
            )}
          </form.Field>
          <Link href="/sign-in/forgot-password" className="link text-caption">
            Forgot your password?
          </Link>
        </div>
      </FieldGroup>
      <div>
        <FormError message={formError} />
        <form.Subscribe selector={(state) => state.isSubmitting || leaving}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
