import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const sectionVariants = cva("w-full", {
  variants: {
    spacing: {
      default: "py-section",
      compact: "py-block",
      none: "",
    },
    tone: {
      default: "bg-background text-foreground",
      surface: "bg-surface text-surface-foreground",
      // --ring is the focus outline colour; it would match the band, so it flips with the text.
      inverse: "bg-inverse text-inverse-foreground [--ring:var(--inverse-foreground)]",
    },
  },
  defaultVariants: { spacing: "default", tone: "default" },
});

/** A full-width page band. Put a <Container> inside to constrain its content. */
export function Section({
  className,
  spacing,
  tone,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof sectionVariants>) {
  return <section className={cn(sectionVariants({ spacing, tone }), className)} {...props} />;
}
