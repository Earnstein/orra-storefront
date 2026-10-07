"use client";

import { useEffect, useState } from "react";

import { CreateAccountForm } from "@/components/auth/create-account-form";
import { leaveSignIn } from "@/components/auth/field-errors";
import { SignInForm, type SignInPrefill } from "@/components/auth/sign-in-form";
import { authClient } from "@/lib/auth-client";

/**
 * Sign in and Create an account side by side from md, stacked on phones with Sign in first, as on
 * Gucci. The page stays static: the session is read here, and a signed-in visitor goes straight on.
 */
export function SignInView() {
  const { data: session } = authClient.useSession();
  const [prefill, setPrefill] = useState<SignInPrefill>();

  useEffect(() => {
    if (session) leaveSignIn();
  }, [session]);

  return (
    <div className="grid gap-section md:grid-cols-2 md:gap-x-16 lg:gap-x-24">
      <SignInForm prefill={prefill} />
      <CreateAccountForm onSignInInstead={(email) => setPrefill({ email, key: Date.now() })} />
    </div>
  );
}
