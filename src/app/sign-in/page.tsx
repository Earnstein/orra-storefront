import type { Metadata } from "next";

import { SignInView } from "@/components/auth/sign-in-view";
import { Container } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false },
};

// Static: `?returnTo` is read in the browser when a form succeeds, so no request data is needed here.
export default function SignInPage() {
  return (
    <Container size="content" className="py-section">
      <SignInView />
    </Container>
  );
}
