import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        // Underlined, as on the search field and Gucci's forms: a hairline that thickens on focus.
        // 16px text on phones so iOS doesn't zoom in on focus.
        "h-12 w-full min-w-0 rounded-none border-0 border-b border-border-strong bg-transparent px-0 py-2 text-base transition-shadow duration-200 outline-none placeholder:text-muted-foreground focus-visible:shadow-[inset_0_-1px_0_0_var(--color-foreground)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[inset_0_-1px_0_0_var(--color-destructive)] md:text-body",
        className
      )}
      {...props}
    />
  )
}

export { Input }
