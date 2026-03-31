import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold border-2 border-[var(--neo-border-color)] transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none cursor-pointer active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_var(--neo-border-color)]",
  {
    variants: {
      variant: {
        default:
          "bg-neo-orange text-[#1a1a1a] shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:shadow-[6px_6px_0px_0px_var(--neo-border-color)] hover:-translate-x-[1px] hover:-translate-y-[1px]",
        destructive:
          "bg-destructive text-white shadow-[4px_4px_0px_0px_var(--neo-border-color)] hover:shadow-[6px_6px_0px_0px_var(--neo-border-color)] hover:-translate-x-[1px] hover:-translate-y-[1px]",
        outline:
          "bg-bg-4 shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:shadow-[5px_5px_0px_0px_var(--neo-border-color)] hover:-translate-x-[1px] hover:-translate-y-[1px] hover:bg-neo-yellow/30",
        secondary:
          "bg-neo-cyan text-[#1a1a1a] shadow-[3px_3px_0px_0px_var(--neo-border-color)] hover:shadow-[5px_5px_0px_0px_var(--neo-border-color)] hover:-translate-x-[1px] hover:-translate-y-[1px]",
        ghost:
          "border-transparent shadow-none hover:bg-neo-yellow/30 hover:border-[var(--neo-border-color)] text-text-primary",
        link: "text-text-primary border-transparent shadow-none underline-offset-4 hover:underline font-bold",
      },
      size: {
        default: "h-10 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded-lg gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 rounded-lg px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
