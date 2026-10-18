import type { Metadata } from "next";

import { AuthSwitchLink } from "@/components/auth/auth-switch-link";
import { LeaveWhenSignedIn } from "@/components/auth/leave-when-signed-in";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { Container } from "@/components/primitives";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: false },
};

const BENEFITS = [
  { title: "Saved items on every device", text: "Save pieces on your phone and find them on your laptop." },
  { title: "Your account in one place", text: "Update your details, password and signed-in devices whenever you like." },
];

// Static: `?returnTo` is read in the browser (when the form succeeds, and by the link to /sign-in).
export default function SignUpPage() {
  return (
    <Container size="prose" className="flex flex-col gap-block py-section">
      <LeaveWhenSignedIn />
      <header className="flex flex-col gap-6">
        <h1 id="sign-up-heading" className="text-title uppercase">
          Create an account
        </h1>
        <ul className="flex flex-col gap-4">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="flex flex-col gap-1">
              <span className="eyebrow">{benefit.title}</span>
              <span className="text-caption text-muted-foreground">{benefit.text}</span>
            </li>
          ))}
        </ul>
      </header>
      <SignUpForm />
      <section aria-labelledby="have-account" className="flex flex-col gap-4 border-t pt-block">
        <h2 id="have-account" className="eyebrow">
          Already have an account?
        </h2>
        <AuthSwitchLink to="/sign-in">Sign in</AuthSwitchLink>
      </section>
    </Container>
  );
}
