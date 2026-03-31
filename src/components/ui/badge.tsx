import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg border-2 border-[var(--neo-border-color)] px-2.5 py-0.5 text-xs font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-all overflow-hidden shadow-[2px_2px_0px_0px_var(--neo-border-color)]",
  {
    variants: {
      variant: {
        default:
          "bg-neo-orange text-[#1a1a1a] [a&]:hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)]",
        secondary:
          "bg-neo-yellow text-[#1a1a1a] [a&]:hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)]",
        destructive:
          "bg-destructive text-white [a&]:hover:shadow-[3px_3px_0px_0px_var(--neo-border-color)]",
        outline:
          "bg-bg-4 text-text-primary [a&]:hover:bg-neo-yellow/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
