import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const containerVariants = cva("mx-auto w-full px-gutter", {
  variants: {
    size: {
      page: "max-w-page", // grids, heroes, header/footer
      content: "max-w-content", // account, checkout, editorial text
      prose: "max-w-prose", // long-form copy
    },
  },
  defaultVariants: { size: "page" },
});

/** Centers content with the responsive page gutter. */
export function Container({
  className,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof containerVariants>) {
  return <div className={cn(containerVariants({ size }), className)} {...props} />;
}
