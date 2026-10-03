import { stockStatus } from "@/lib/catalog/stock";
import { cn } from "@/lib/utils";

/** Stock as text with a small marker: filled = available, hollow = running low, muted = sold out. */
export function StockStatus({ units, className }: { units: number; className?: string }) {
  const status = stockStatus(units);
  return (
    <p className={cn("flex items-center gap-2 caption", className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          status.state === "in_stock" && "bg-foreground",
          status.state === "low_stock" && "border border-foreground",
          status.state === "out_of_stock" && "bg-muted-foreground",
        )}
      />
      <span className={cn(status.state === "out_of_stock" && "text-muted-foreground")}>{status.label}</span>
    </p>
  );
}
