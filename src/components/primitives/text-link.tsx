import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const textLinkVariants = cva("", {
  variants: {
    variant: {
      underline: "link", // inline links in copy; underline retracts on hover
      quiet: "link-quiet", // nav and footer; underline appears on hover
    },
    tone: {
      default: "",
      muted: "text-muted-foreground hover:text-foreground",
    },
    label: {
      true: "eyebrow", // uppercase label style ("Shop the collection")
      false: "",
    },
  },
  defaultVariants: { variant: "underline", tone: "default", label: false },
});

/** next/link with the design system's link styles. */
export function TextLink({
  className,
  variant,
  tone,
  label,
  ...props
}: React.ComponentProps<typeof Link> & VariantProps<typeof textLinkVariants>) {
  return <Link className={cn(textLinkVariants({ variant, tone, label }), className)} {...props} />;
}
