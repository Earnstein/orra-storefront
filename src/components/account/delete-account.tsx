"use client";

import { useState } from "react";

import { PasswordInput } from "@/components/auth/password-input";
import { FormError } from "@/components/auth/form-error";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { goToSignIn } from "@/lib/account/signed-out";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth/errors";

/**
 * Deletes the account after asking for the password in a confirmation dialog. Afterwards the
 * homepage loads in full (nothing from the old session stays in memory) and says so
 * (`?deleted=1`, read by AccountDeletedNotice).
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function submit() {
    if (!password) return setError("Enter your password.");
    setError(null);
    setDeleting(true);
    try {
      const { error } = await authClient.deleteUser({ password });
      if (error?.status === 401 && error.code !== "INVALID_PASSWORD") return goToSignIn();
      if (error) {
        setDeleting(false);
        return setError(authErrorMessage(error));
      }
    } catch {
      setDeleting(false);
      return setError(authErrorMessage(null));
    }
    window.location.replace("/?deleted=1");
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">Deleting your account removes your details and saved items. It can&apos;t be undone.</p>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (deleting) return;
          setOpen(next);
          if (!next) {
            setPassword("");
            setError(null);
          }
        }}
      >
        <AlertDialogTrigger render={<Button variant="outline" className="self-start max-sm:w-full" />}>
          Delete account
        </AlertDialogTrigger>
        <AlertDialogContent className="gap-6 rounded-none p-6 ring-border sm:max-w-md data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex flex-col gap-6"
          >
            <AlertDialogHeader className="place-items-start gap-2 text-left">
              <AlertDialogTitle className="text-title uppercase">Delete your account?</AlertDialogTitle>
              <AlertDialogDescription className="text-body">
                Your details, saved items and every signed-in device go with it. Enter your password to confirm.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor="delete-password">Password</FieldLabel>
              <PasswordInput
                id="delete-password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "delete-error" : undefined}
              />
            </Field>
            <div id="delete-error">
              <FormError message={error} />
            </div>
            <AlertDialogFooter className="mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              {/* Black like every primary action: red is for errors and sale prices only. */}
              <Button type="submit" disabled={deleting}>
                {deleting ? "Deleting…" : "Delete account"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
