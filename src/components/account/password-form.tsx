"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";

import { describedBy, focusFirstInvalid, hasErrors, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { PasswordInput } from "@/components/auth/password-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { goToSignIn } from "@/lib/account/signed-out";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth/errors";
import { PASSWORD_MIN } from "@/lib/auth/password";
import { passwordSchema } from "@/lib/auth/schemas";

const schema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordSchema,
  revokeOtherSessions: z.boolean(),
});

const FIELDS: [string, string][] = [
  ["currentPassword", "current-password"],
  ["newPassword", "new-password"],
];

/** Changes the password; "Sign out of other devices" is on by default (the spec). */
export function PasswordForm() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", revokeOtherSessions: true },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value, formApi }) => {
      setFormError(null);
      setStatus("");
      try {
        const { error } = await authClient.changePassword(value);
        if (error?.status === 401) return goToSignIn();
        if (error) return setFormError(authErrorMessage(error));
      } catch {
        return setFormError(authErrorMessage(null));
      }
      formApi.reset();
      setStatus(value.revokeOtherSessions ? "Password changed. Your other devices have been signed out." : "Password changed.");
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  return (
    <form
      noValidate
      aria-label="Change your password"
      onSubmit={async (event) => {
        event.preventDefault();
        await form.handleSubmit();
        focusFirstInvalid(FIELDS, (name) => hasErrors(form.getFieldMeta(name as "currentPassword")));
      }}
      className="flex flex-col gap-block"
    >
      <FieldGroup>
        <form.Field name="currentPassword">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="current-password">Current password</FieldLabel>
                <PasswordInput
                  id="current-password"
                  autoComplete="current-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy(errors.length > 0 && "current-password-error")}
                />
                <FieldError id="current-password-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="newPassword">
          {(field) => {
            const errors = shownErrors(field.state.meta, submitted);
            return (
              <Field data-invalid={errors.length > 0 || undefined}>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <PasswordInput
                  id="new-password"
                  autoComplete="new-password"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={errors.length > 0 || undefined}
                  aria-describedby={describedBy("new-password-hint", errors.length > 0 && "new-password-error")}
                />
                <FieldDescription id="new-password-hint">At least {PASSWORD_MIN} characters</FieldDescription>
                <FieldError id="new-password-error" errors={errors} />
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="revokeOtherSessions">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id="revoke-other-sessions"
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked)}
              />
              <FieldLabel htmlFor="revoke-other-sessions" className="font-normal text-body">
                Sign out of other devices
              </FieldLabel>
            </Field>
          )}
        </form.Field>
      </FieldGroup>
      <div className="flex flex-col">
        <FormError message={formError} />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" className="self-start max-sm:w-full" disabled={isSubmitting}>
              {isSubmitting ? "Changing password…" : "Change password"}
            </Button>
          )}
        </form.Subscribe>
        <p role="status" className="text-caption not-empty:mt-4">
          {status}
        </p>
      </div>
    </form>
  );
}
