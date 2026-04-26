import { type ReactNode } from 'react'

import { usePlayableViewport } from '@/hooks/use-playable-viewport'
import { cn } from '@/lib/utils'

interface PlayableStageProps {
  children: ReactNode
  className?: string
}

export function PlayableStage({ children, className }: PlayableStageProps) {
  usePlayableViewport()

  return (
    <main className="min-h-[100svh] w-full overflow-hidden bg-[#101114] text-[#171512]">
      <section
        className={cn(
          'relative mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col overflow-hidden bg-[#f6efe4] shadow-2xl sm:my-5 sm:min-h-0 sm:h-[min(860px,calc(100svh-40px))] sm:rounded-xl',
          className,
        )}
      >
        {children}
      </section>
    </main>
  )
}
