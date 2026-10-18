import type { Metadata } from "next";

import { BackToSignIn } from "@/components/auth/back-to-sign-in";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Container } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Forgot your password?",
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <Container size="prose" className="flex flex-col gap-block py-section">
      <BackToSignIn />
      <div className="flex flex-col gap-3">
        <h1 id="forgot-heading" className="text-title uppercase">
          Forgot your password?
        </h1>
        <p className="text-body text-muted-foreground">
          Enter your email and we&apos;ll send you a link to set a new password.
        </p>
      </div>
      <ForgotPasswordForm />
    </Container>
  );
}
