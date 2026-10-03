import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const gridVariants = cva("grid", {
  variants: {
    layout: {
      // Product listings: dense, imagery-led, hairline gaps between tiles.
      products: "grid-cols-2 gap-x-tile gap-y-block md:grid-cols-3 xl:grid-cols-4",
      // Editorial pairs: campaign image + image, or image + copy.
      editorial: "grid-cols-1 gap-tile md:grid-cols-2",
      // Category / service cards.
      cards: "grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3",
      // Footer link columns.
      columns: "grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4",
    },
  },
  defaultVariants: { layout: "products" },
});

/** Responsive grid presets. Column counts step up at md / lg / xl. */
export function Grid({
  className,
  layout,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof gridVariants>) {
  return <div className={cn(gridVariants({ layout }), className)} {...props} />;
}
