"use client";

import { useForm, useStore } from "@tanstack/react-form";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";

import { describedBy, focusFirstInvalid, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth/errors";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/schemas";

const schema = z.object({ password: passwordSchema });

/**
 * Sets a new password from the emailed link. Better Auth's link checks the token, then redirects
 * here with `?token=…`, or with `?error=INVALID_TOKEN` when it's unknown, used or expired.
 */
export function ResetPasswordForm() {
  const params = useSearchParams();
  // Read once, then dropped from the address bar and history: an unused token stays valid for an
  // hour, and the URL shouldn't hand it to the next person at a shared computer.
  const [token] = useState(() => params.get("token"));
  const [state, setState] = useState<"form" | "done" | "expired">(token && !params.get("error") ? "form" : "expired");
  useEffect(() => {
    if (params.has("token")) window.history.replaceState(null, "", "/sign-in/reset-password");
  }, [params]);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { password: "" },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      try {
        const { error } = await authClient.resetPassword({ newPassword: value.password, token: token ?? "" });
        if (error?.code === "INVALID_TOKEN") {
          setState("expired");
          return;
        }
        if (error) {
          setFormError(authErrorMessage(error));
          return;
        }
      } catch {
        setFormError(authErrorMessage(null));
        return;
      }
      setState("done");
    },
  });
  const submitted = useStore(form.store, (s) => s.submissionAttempts > 0);

  if (state === "done") {
    return (
      <div className="flex flex-col gap-block">
        <p role="status" className="text-body">
          Your password has been changed. Sign in with your new password.
        </p>
        <Link href="/sign-in" className={cn(buttonVariants(), "w-full")}>
          Sign in
        </Link>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="flex flex-col gap-block">
        <p role="alert" className="text-body">
          This link has expired or was already used.
        </p>
        <Link href="/sign-in/forgot-password" className="link self-start">
          Request a new link
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      aria-labelledby="reset-heading"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        focusFirstInvalid([["password", "reset-password"]], (name) => hasErrors(form.getFieldMeta(name as "password")));
      }}
      className="flex flex-col gap-block"
    >
      <FieldGroup>
        <form.Field name="password">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="reset-password">New password</FieldLabel>
                <PasswordInput
                  id="reset-password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy("reset-password-hint", errors.length > 0 && "reset-password-error")}
                />
                <FieldDescription id="reset-password-hint">At least {PASSWORD_MIN} characters</FieldDescription>
                <FieldError id="reset-password-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
      <div>
        <FormError message={formError} />
        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Changing password…" : "Change password"}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
