import type { Metadata } from "next";
import { Suspense } from "react";

import { BackToSignIn } from "@/components/auth/back-to-sign-in";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Container } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Set a new password",
  robots: { index: false },
  // The URL carries a reset token; don't send it to other sites.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return (
    <Container size="prose" className="flex flex-col gap-block py-section">
      <BackToSignIn />
      <h1 id="reset-heading" className="text-title uppercase">
        Set a new password
      </h1>
      {/* The token is in the URL, read in the browser; the rest of the page is static. */}
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </Container>
  );
}
