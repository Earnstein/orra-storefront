import { Container } from "@/components/primitives";
import { Skeleton } from "@/components/ui/skeleton";

/** An admin page's frame: the heading, an optional line under it and action beside it, then the content. */
export function AdminPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Container className="flex flex-col gap-block py-section">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-headline">{title}</h1>
          {description && <p className="text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Container>
  );
}

/** What an admin page shows while requireAdmin and its reads run. */
export function AdminPageSkeleton() {
  return (
    <Container aria-hidden className="flex flex-col gap-block py-section">
      <Skeleton className="h-10 w-48 bg-surface" />
      <Skeleton className="h-64 bg-surface" />
    </Container>
  );
}
