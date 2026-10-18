import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Underlined like Input: a hairline that thickens on focus, 16px text on phones.
        "flex field-sizing-content min-h-16 w-full rounded-none border-0 border-b border-border-strong bg-transparent px-0 py-2 text-base transition-shadow duration-200 outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_-1px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_-1px_0_0_var(--color-destructive)] md:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
