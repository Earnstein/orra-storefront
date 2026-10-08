"use client";

import { useForm, useStore } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { z } from "zod";

import { describedBy, shownErrors } from "@/components/auth/field-errors";
import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateName } from "@/lib/account/actions";
import { goToSignIn } from "@/lib/account/signed-out";
import { nameSchema } from "@/lib/auth/schemas";

const schema = z.object({ name: nameSchema });

/**
 * The name, editable inline (Edit → field with Save and Cancel), and the email, read-only until
 * M7 adds the confirmation email that changing it needs. Confirmations are announced politely.
 */
export function ProfileForm({ name: initialName, email }: { name: string; email: string }) {
  const [name, setName] = useState(initialName);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  const form = useForm({
    defaultValues: { name },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const result = await updateName(value.name).catch(() => null);
      if (!result) return setFormError("Something went wrong. Try again.");
      if (!result.ok) {
        if (result.error === "signed-out") return goToSignIn();
        return setFormError(result.message);
      }
      setName(result.data.name);
      setStatus("Name updated.");
      close();
    },
  });
  const submitted = useStore(form.store, (state) => state.submissionAttempts > 0);

  function open() {
    form.reset({ name });
    setFormError(null);
    setStatus("");
    setEditing(true);
  }

  function close() {
    setEditing(false);
    // Back to the Edit button once it's rendered again.
    requestAnimationFrame(() => editButton.current?.focus());
  }

  return (
    <div className="flex flex-col">
      <dl className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-muted-foreground">Name</dt>
          {editing ? (
            <dd>
              <form
                noValidate
                aria-label="Edit your name"
                onSubmit={(event) => {
                  event.preventDefault();
                  void form.handleSubmit();
                }}
                className="flex flex-col gap-4"
              >
                <form.Field name="name">
                  {(field) => {
                    const errors = shownErrors(field.state.meta, submitted);
                    return (
                      <Field data-invalid={errors.length > 0 || undefined}>
                        <FieldLabel htmlFor="profile-name" className="sr-only">
                          Name
                        </FieldLabel>
                        <Input
                          id="profile-name"
                          autoComplete="name"
                          autoFocus
                          value={field.state.value}
                          onChange={(event) => field.handleChange(event.target.value)}
                          onBlur={field.handleBlur}
                          aria-invalid={errors.length > 0 || undefined}
                          aria-describedby={describedBy(errors.length > 0 && "profile-name-error")}
                        />
                        <FieldError id="profile-name-error" errors={errors} />
                      </Field>
                    );
                  }}
                </form.Field>
                <FormError message={formError} />
                <div className="flex gap-3">
                  <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(isSubmitting) => (
                      <Button type="submit" size="sm" disabled={isSubmitting}>
                        {isSubmitting ? "Saving…" : "Save"}
                      </Button>
                    )}
                  </form.Subscribe>
                  <Button type="button" size="sm" variant="outline" onClick={close}>
                    Cancel
                  </Button>
                </div>
              </form>
            </dd>
          ) : (
            <dd className="flex items-baseline justify-between gap-4">
              <span className="text-body">{name}</span>
              <Button ref={editButton} type="button" variant="link" onClick={open} aria-label="Edit your name">
                Edit
              </Button>
            </dd>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-caption text-muted-foreground">Email</dt>
          <dd className="flex flex-col gap-1">
            <span className="text-body break-all">{email}</span>
            <span className="text-caption text-muted-foreground">Changing your email will be possible soon.</span>
          </dd>
        </div>
      </dl>
      <p role="status" className="text-caption not-empty:mt-4">
        {status}
      </p>
    </div>
  );
}
