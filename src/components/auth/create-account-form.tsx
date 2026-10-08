"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { z } from "zod";

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

const emailStepSchema = z.object({ email: emailSchema, name: z.string(), password: z.string() });

const BENEFITS = [
  { title: "Saved items on every device", text: "Save pieces on your phone and find them on your laptop." },
  { title: "Manage your account", text: "Update your details, password and signed-in devices in one place." },
];

/**
 * Create an account in two steps, as on Gucci: an email and Continue, then the name and password.
 * If the email already has an account, it says so and offers to sign in with it instead.
 */
const FIELDS: [string, string][] = [
  ["email", "create-email"],
  ["name", "create-name"],
  ["password", "create-password"],
];

export function CreateAccountForm({ onSignInInstead }: { onSignInInstead: (email: string) => void }) {
  const [step, setStep] = useState<"email" | "details">("email");
  // Stays true while the full page load after success is under way, so the button stays disabled.
  const [leaving, setLeaving] = useState(false);
  const [formError, setFormError] = useState<{ message: string; exists: boolean } | null>(null);
  // Name and password show their errors once the details step has been submitted; the Continue
  // click on the email step doesn't count for them.
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);

  const schema = step === "email" ? emailStepSchema : signUpSchema;
  const form = useForm({
    defaultValues: { email: "", name: "", password: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (step === "email") {
        setStep("details");
        return;
      }
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

  // Revealing the details moves focus to the first new field.
  useEffect(() => {
    if (step === "details") document.getElementById("create-name")?.focus();
  }, [step]);

  return (
    <div className="flex flex-col gap-block">
      <form
        noValidate
        aria-labelledby="create-heading"
        onSubmit={async (event) => {
          event.preventDefault();
          if (step === "details") setDetailsSubmitted(true);
          await form.handleSubmit();
          // Checked here, not in onSubmitInvalid: TanStack Form skips that when a blur has already
          // marked the form invalid.
          focusFirstInvalid(FIELDS, (name) => hasErrors(form.getFieldMeta(name as "email")));
        }}
        className="flex flex-col gap-block"
      >
        <h2 id="create-heading" className="text-title uppercase">
          Create an account
        </h2>
        <FieldGroup>
          <form.Field name="email">
            {(field) => {
              const errors = shownErrors(field.state.meta, submitted);
              return (
                <Field data-invalid={errors.length > 0 || undefined}>
                  <FieldLabel htmlFor="create-email">Email</FieldLabel>
                  <Input
                    id="create-email"
                    type="email"
                    autoComplete="email"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onBlur={field.handleBlur}
                    aria-invalid={errors.length > 0 || undefined}
                    aria-describedby={describedBy(errors.length > 0 && "create-email-error")}
                  />
                  <FieldError id="create-email-error" errors={errors} />
                </Field>
              );
            }}
          </form.Field>
          {step === "details" && (
            <>
              <form.Field name="name">
                {(field) => {
                  const errors = shownErrors(field.state.meta, detailsSubmitted);
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="create-name">Name</FieldLabel>
                      <Input
                        id="create-name"
                        autoComplete="name"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={errors.length > 0 || undefined}
                        aria-describedby={describedBy(errors.length > 0 && "create-name-error")}
                      />
                      <FieldError id="create-name-error" errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>
              <form.Field name="password">
                {(field) => {
                  const errors = shownErrors(field.state.meta, detailsSubmitted);
                  return (
                    <Field data-invalid={errors.length > 0 || undefined}>
                      <FieldLabel htmlFor="create-password">Password</FieldLabel>
                      <PasswordInput
                        id="create-password"
                        autoComplete="new-password"
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={errors.length > 0 || undefined}
                        aria-describedby={describedBy("create-password-hint", errors.length > 0 && "create-password-error")}
                      />
                      <FieldDescription id="create-password-hint">At least {PASSWORD_MIN} characters</FieldDescription>
                      <FieldError id="create-password-error" errors={errors} />
                    </Field>
                  );
                }}
              </form.Field>
            </>
          )}
        </FieldGroup>
        <div className="flex flex-col">
          <FormError message={formError?.message} />
          {formError?.exists && (
            <Button
              type="button"
              variant="link"
              className="mb-4 self-start"
              onClick={() => onSignInInstead(form.getFieldValue("email"))}
            >
              Sign in with this email
            </Button>
          )}
          <form.Subscribe selector={(state) => state.isSubmitting || leaving}>
            {(isSubmitting) => (
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {step === "email" ? "Continue" : isSubmitting ? "Creating account…" : "Create account"}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
      <ul className="flex flex-col gap-4">
        {BENEFITS.map((benefit) => (
          <li key={benefit.title} className="flex flex-col gap-1">
            <span className="eyebrow">{benefit.title}</span>
            <span className="text-caption text-muted-foreground">{benefit.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
