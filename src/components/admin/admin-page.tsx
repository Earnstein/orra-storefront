import { Container } from "@/components/primitives";

/** An admin page's frame: the heading, an optional line under it, then the content. */
export function AdminPage({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <Container className="flex flex-col gap-block py-section">
      <div className="flex flex-col gap-2">
        <h1 className="text-headline">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Container>
  );
}
