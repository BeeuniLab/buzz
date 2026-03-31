import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-bg-2 animate-pulse rounded-lg border-2 border-[var(--neo-border-color)]/20", className)}
      {...props}
    />
  )
}

export { Skeleton }
