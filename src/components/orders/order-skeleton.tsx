import { Skeleton } from "@/components/ui/skeleton";

/** The order pages' placeholder while the order loads. */
export function OrderSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-block">
      <Skeleton className="h-10 w-72 max-w-full bg-surface" />
      <div className="grid gap-block lg:grid-cols-3">
        <Skeleton className="h-48 bg-surface lg:col-span-2" />
        <Skeleton className="h-72 bg-surface" />
      </div>
    </div>
  );
}
