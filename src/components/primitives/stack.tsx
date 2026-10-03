import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const gap = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  block: "gap-block",
  section: "gap-section",
} as const;

const stackVariants = cva("flex flex-col", {
  variants: {
    gap,
    align: { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch" },
  },
  defaultVariants: { gap: "md", align: "stretch" },
});

/** Vertical rhythm: children separated by a fixed gap. */
export function Stack({
  className,
  gap,
  align,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof stackVariants>) {
  return <div className={cn(stackVariants({ gap, align }), className)} {...props} />;
}

const clusterVariants = cva("flex flex-wrap items-center", {
  variants: {
    gap,
    justify: { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" },
  },
  defaultVariants: { gap: "md", justify: "start" },
});

/** Horizontal group that wraps on small screens: button rows, nav items, filter chips. */
export function Cluster({
  className,
  gap,
  justify,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof clusterVariants>) {
  return <div className={cn(clusterVariants({ gap, justify }), className)} {...props} />;
}
