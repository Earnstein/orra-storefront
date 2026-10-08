import type { Metadata } from "next";

import { AuthSwitchLink } from "@/components/auth/auth-switch-link";
import { LeaveWhenSignedIn } from "@/components/auth/leave-when-signed-in";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Container } from "@/components/primitives";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

// Static: `?returnTo` is read in the browser (when the form succeeds, and by the link to /sign-up).
export default function SignInPage() {
  return (
    <Container size="prose" className="flex flex-col gap-block py-section">
      <LeaveWhenSignedIn />
      <header className="flex flex-col gap-3">
        <h1 id="sign-in-heading" className="text-title uppercase">
          Sign in
        </h1>
        <p className="text-body text-muted-foreground">Welcome back. Sign in to find your saved items on every device.</p>
      </header>
      <SignInForm />
      <section aria-labelledby="new-here" className="flex flex-col gap-4 border-t pt-block">
        <h2 id="new-here" className="eyebrow">
          New to {site.name}?
        </h2>
        <p className="text-caption text-muted-foreground">
          Create an account to keep your saved items on every device and manage your details in one place.
        </p>
        <AuthSwitchLink to="/sign-up">Create an account</AuthSwitchLink>
      </section>
    </Container>
  );
}
