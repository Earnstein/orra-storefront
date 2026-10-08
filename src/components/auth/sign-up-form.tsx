"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { handOffEmail } from "@/components/auth/email-handoff";
import { describedBy, focusFirstInvalid, hasErrors, leaveSignIn, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth/errors";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { emailSchema, signUpSchema } from "@/lib/auth/schemas";

const FIELDS: [string, string][] = [
  ["name", "sign-up-name"],
  ["email", "sign-up-email"],
  ["password", "sign-up-password"],
];

/**
 * Create an account in one step: name, email and password. If the email already has an account,
 * it says so and offers to sign in with it instead (the email is carried over without a URL).
 */
export function SignUpForm() {
  const router = useRouter();
  // Stays true while the full page load after success is under way, so the button stays disabled.
  const [leaving, setLeaving] = useState(false);
  const [formError, setFormError] = useState<{ message: string; exists: boolean } | null>(null);

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onChange: signUpSchema, onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const { email, name, password } = signUpSchema.parse(value);
      try {
        const { error } = await authClient.signUp.email({ email, name, password });
        if (error) {
          const exists = error.code?.startsWith("USER_ALREADY_EXISTS") ?? false;
          setFormError({ message: authErrorMessage(error), exists });
          return;
        }
      } catch {
        setFormError({ message: authErrorMessage(null), exists: false });
        return;
      }
      setLeaving(true);
      leaveSignIn();
    },
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  function signInInstead() {
    handOffEmail(emailSchema.safeParse(form.getFieldValue("email")).data ?? "");
    // Keeps ?returnTo, the only thing this page's URL carries.
    router.push(`/sign-in${window.location.search}`);
  }

  return (
    <form
      noValidate
      aria-labelledby="sign-up-heading"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        // Checked here, not in onSubmitInvalid: TanStack Form skips that when a previous
        // validation has already marked the form invalid.
        focusFirstInvalid(FIELDS, (name) => hasErrors(form.getFieldMeta(name as "email")));
      }}
      className="flex flex-col gap-block"
    >
      <FieldGroup>
        <form.Field name="name">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="sign-up-name">Name</FieldLabel>
                <Input
                  id="sign-up-name"
                  autoComplete="name"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "sign-up-name-error")}
                />
                <FieldError id="sign-up-name-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="email">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
                <Input
                  id="sign-up-email"
                  type="email"
                  autoComplete="email"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "sign-up-email-error")}
                />
                <FieldError id="sign-up-email-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="password">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="sign-up-password">Password</FieldLabel>
                <PasswordInput
                  id="sign-up-password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy("sign-up-password-hint", errors.length > 0 && "sign-up-password-error")}
                />
                <FieldDescription id="sign-up-password-hint">At least {PASSWORD_MIN} characters</FieldDescription>
                <FieldError id="sign-up-password-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <div className="flex flex-col">
        <FormError message={formError?.message} />
        {formError?.exists && (
          <Button type="button" variant="link" className="mb-4 self-start" onClick={signInInstead}>
            Sign in instead
          </Button>
        )}
        <form.Subscribe selector={(state) => state.isSubmitting || leaving}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Creating account…" : "Create account"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
