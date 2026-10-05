import { Container, Section } from "@/components/primitives";

/**
 * Whole-page message on an inverse band (404, errors): kicker, headline, one line of copy and
 * actions, centred. Has no hooks, so error.tsx (a client component) can use it too.
 */
export function StatusMessage({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <Section tone="inverse" className="flex min-h-[60svh] items-center border-b border-inverse-foreground/20">
      <Container size="content" className="flex flex-col items-center gap-block text-center">
        <div className="flex flex-col items-center gap-4">
          <p className="eyebrow text-inverse-foreground/60">{eyebrow}</p>
          <h1 className="text-display">{title}</h1>
          <p className="max-w-prose text-inverse-foreground/70">{body}</p>
        </div>
        {children}
      </Container>
    </Section>
  );
}
