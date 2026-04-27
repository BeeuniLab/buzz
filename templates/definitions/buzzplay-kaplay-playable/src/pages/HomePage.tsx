import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'

import { startPlayableGame } from '@/game/playable-game'

interface LastResult {
  score: number
  combo: number
  title: string
}

export function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isReady, setIsReady] = useState(false)
  const [lastResult, setLastResult] = useState<LastResult | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const stopGame = startPlayableGame(canvas, {
      onReady: () => setIsReady(true),
      onResult: setLastResult,
    })

    return stopGame
  }, [])

  return (
    <main className="min-h-[100svh] w-full overflow-hidden bg-[#070a12] text-white">
      <section className="relative mx-auto flex min-h-[100svh] w-full max-w-[430px] flex-col overflow-hidden bg-[#070a12] sm:my-5 sm:h-[min(860px,calc(100svh-40px))] sm:min-h-0 sm:rounded-xl sm:shadow-2xl">
        <canvas
          ref={canvasRef}
          aria-label="BuzzPlay arcade playable"
          className="block h-full min-h-[100svh] w-full touch-none bg-[#070a12] sm:min-h-0"
        />

        {!isReady ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[#070a12]">
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-4 py-3 text-sm font-black text-white shadow-lg backdrop-blur">
              <Sparkles className="h-4 w-4 text-[#ffd166]" />
              Loading playable
            </div>
          </div>
        ) : null}

        {lastResult ? (
          <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-right text-xs font-black text-white/90 backdrop-blur">
            <div>{lastResult.title}</div>
            <div className="text-white/60">Score {lastResult.score}</div>
          </div>
        ) : null}
      </section>
    </main>
  )
}
