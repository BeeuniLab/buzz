import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-text-primary placeholder:!text-text-tertiary selection:bg-neo-yellow selection:text-[#1a1a1a] flex h-10 w-full min-w-0 rounded-lg border-2 border-[var(--neo-border-color)] bg-bg-4 px-3 py-1 text-base font-medium transition-all outline-none shadow-[2px_2px_0px_0px_var(--neo-border-color)] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-[4px_4px_0px_0px_var(--neo-border-color)] focus-visible:-translate-x-[1px] focus-visible:-translate-y-[1px]",
        "aria-invalid:border-destructive aria-invalid:shadow-[2px_2px_0px_0px_#ef4444]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
