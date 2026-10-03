import { createCn } from "cn/config";

/**
 * `cn` (clsx + Tailwind class merging) taught this project's design tokens, so that
 * e.g. `cn("text-caption", "text-foreground")` keeps both classes. Without this the
 * merger assumes `text-caption` is a colour and drops it.
 *
 * Keep in sync with the @theme block in src/app/globals.css. tsconfig aliases the bare
 * `cn` import to this file, so shadcn components (which `import { cn } from "cn"`) use it too.
 */
export const cn = createCn({
  extend: {
    theme: {
      text: ["display", "headline", "title", "body", "caption", "label"],
      spacing: ["gutter", "section", "block", "header", "tile"],
      container: ["page", "content", "prose"],
      breakpoint: ["xs", "3xl"],
    },
  },
});
