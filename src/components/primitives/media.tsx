import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const mediaVariants = cva("relative w-full overflow-hidden bg-surface", {
  variants: {
    ratio: {
      portrait: "aspect-[4/5]", // product tiles
      square: "aspect-square",
      landscape: "aspect-video",
      // Campaign hero: tall on phones, cinematic on desktop.
      hero: "aspect-[4/5] md:aspect-video lg:aspect-[21/9]",
    },
  },
  defaultVariants: { ratio: "portrait" },
});

/**
 * Fixed-ratio frame on the surface colour, so tiles keep their shape while images
 * load. Children should fill it, e.g. `<Image fill sizes="..." className="object-cover" />`.
 */
export function Media({
  className,
  ratio,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof mediaVariants>) {
  return <div className={cn(mediaVariants({ ratio }), className)} {...props} />;
}
