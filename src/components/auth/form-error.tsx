import { cn } from "@/lib/utils";

/**
 * The error for a whole form (a failed sign-in, a network failure). The alert region is always
 * rendered so screen readers announce a message as soon as it appears; it's empty otherwise.
 */
export function FormError({ message, className }: { message?: string | null; className?: string }) {
  return (
    <div role="alert" className={cn("text-caption text-destructive not-empty:mb-4", className)}>
      {message}
    </div>
  );
}
