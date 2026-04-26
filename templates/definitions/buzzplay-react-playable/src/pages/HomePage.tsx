import { useMemo, useState } from 'react'
import { Flame, Gauge, Hand, Sparkles, Zap } from 'lucide-react'

import { PlayableStage } from '@/components/playable/PlayableStage'
import { ResultCard } from '@/components/playable/ResultCard'
import { usePointerDrag } from '@/hooks/use-pointer-drag'
import { firstImageAsset } from '@/lib/playable-assets'
import { cn } from '@/lib/utils'

type Phase = 'intro' | 'playing' | 'result'

const choices = [
  { id: 'spark', label: 'Spark', icon: Sparkles, score: 12, color: 'bg-[#ffd166]' },
  { id: 'rush', label: 'Rush', icon: Zap, score: 18, color: 'bg-[#06d6a0]' },
  { id: 'heat', label: 'Heat', icon: Flame, score: 24, color: 'bg-[#ef476f]' },
]

const resultCopy = [
  {
    title: 'Quiet Magnet',
    description: 'You won by reading the room, then making one tiny move that changed the whole rhythm.',
  },
  {
    title: 'Fast Chaos',
    description: 'You turned the moment into a speed run and somehow made it look intentional.',
  },
  {
    title: 'Main Character',
    description: 'The room adjusted around you. Big timing, clean finish, very replayable energy.',
  },
]

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function HomePage() {
  const [phase, setPhase] = useState<Phase>('intro')
  const [score, setScore] = useState(38)
  const [combo, setCombo] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState(choices[0].id)

  const drag = usePointerDrag({
    onDragEnd: (state) => {
      if (phase !== 'playing') return
      const momentum = Math.round(Math.abs(state.dx) * 0.08 + Math.max(0, -state.dy) * 0.12)
      const nextScore = clamp(score + momentum, 0, 100)
      const nextCombo = combo + 1
      setScore(nextScore)
      setCombo(nextCombo)
      if (nextCombo >= 3 || nextScore >= 86) {
        setPhase('result')
      }
    },
  })

  const liveScore = clamp(score + Math.round(Math.max(0, -drag.state.dy) * 0.08), 0, 100)
  const activeChoice = choices.find((choice) => choice.id === selectedChoice) ?? choices[0]
  const ActiveChoiceIcon = activeChoice.icon

  const result = useMemo(() => {
    if (liveScore < 58) return resultCopy[0]
    if (liveScore < 82) return resultCopy[1]
    return resultCopy[2]
  }, [liveScore])

  const restart = () => {
    setPhase('intro')
    setScore(38)
    setCombo(0)
    setSelectedChoice(choices[0].id)
    drag.reset()
  }

  const applyChoice = (choiceId: string) => {
    const choice = choices.find((item) => item.id === choiceId) ?? choices[0]
    const nextScore = clamp(score + choice.score, 0, 100)
    const nextCombo = combo + 1
    setSelectedChoice(choice.id)
    setScore(nextScore)
    setCombo(nextCombo)
    if (nextCombo >= 3 || nextScore >= 86) {
      setPhase('result')
    }
  }

  return (
    <PlayableStage>
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#fff8e8_0%,#f3d6b4_58%,#e96f49_100%)]" />
      <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0))]" />

      <div className="relative z-10 flex h-full min-h-[100svh] flex-col px-4 pb-4 pt-5 sm:min-h-0">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#d04d2f]">BuzzPlay</p>
            <h1 className="text-2xl font-black leading-none text-[#171512]">60s Mood Sprint</h1>
          </div>
          <div className="flex h-12 items-center gap-2 rounded-lg border border-[#171512]/10 bg-white/70 px-3 text-sm font-black shadow-sm backdrop-blur">
            <Gauge className="h-4 w-4 text-[#118ab2]" />
            {liveScore}
          </div>
        </header>

        <section className="relative mt-4 flex flex-1 flex-col rounded-lg border border-[#171512]/10 bg-white/35 p-3 shadow-[0_16px_40px_rgba(23,21,18,0.12)] backdrop-blur">
          <div className="flex items-center justify-between text-xs font-bold text-[#5d5650]">
            <span>Combo {combo}</span>
            <span>{phase === 'result' ? 'Finished' : 'Drag upward or choose a boost'}</span>
          </div>

          <div className="relative mt-3 flex flex-1 items-center justify-center overflow-hidden rounded-lg bg-[#171512] text-white">
            {firstImageAsset ? (
              <img
                src={firstImageAsset.url}
                alt={firstImageAsset.description ?? 'Uploaded reference'}
                className="absolute inset-0 h-full w-full object-cover opacity-60"
              />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,#073b4c_0%,#118ab2_45%,#ffd166_100%)]" />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_25%,rgba(255,255,255,0.24),rgba(0,0,0,0)_34%),linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.46))]" />

            {phase === 'intro' ? (
              <div className="relative mx-4 max-w-[300px] text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-[#171512] shadow-lg">
                  <Hand className="h-8 w-8" />
                </div>
                <p className="text-sm font-bold uppercase tracking-[0.16em] text-[#ffd166]">Tap to start</p>
                <h2 className="mt-2 text-4xl font-black leading-none">Turn the moment into a result</h2>
                <button
                  type="button"
                  onClick={() => setPhase('playing')}
                  className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-black text-[#171512] shadow-lg transition active:scale-[0.98]"
                >
                  <Sparkles className="h-4 w-4" />
                  Play
                </button>
              </div>
            ) : null}

            {phase === 'playing' ? (
              <div className="relative flex h-full w-full flex-col items-center justify-center px-5">
                <div className="absolute left-4 right-4 top-4 h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-[#ffd166] transition-[width]"
                    style={{ width: `${liveScore}%` }}
                  />
                </div>

                <button
                  type="button"
                  {...drag.bind}
                  className={cn(
                    'touch-none select-none rounded-full border-4 border-white/70 text-[#171512] shadow-[0_22px_60px_rgba(0,0,0,0.35)] transition-transform active:scale-95',
                    activeChoice.color,
                  )}
                  style={{
                    width: 118,
                    height: 118,
                    transform: `translate(${drag.state.dx * 0.55}px, ${drag.state.dy * 0.55}px)`,
                  }}
                >
                  <ActiveChoiceIcon className="mx-auto h-10 w-10" />
                  <span className="mt-1 block text-sm font-black">{activeChoice.label}</span>
                </button>

                <p className="mt-8 max-w-[260px] text-center text-sm font-bold leading-6 text-white/85">
                  Drag the token upward, then pick a boost. Three good moves reveal a result.
                </p>
              </div>
            ) : null}

            {phase === 'result' ? (
              <div className="relative w-full max-w-[340px] px-4">
                <ResultCard
                  title={result.title}
                  description={result.description}
                  score={liveScore}
                  onReplay={restart}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {choices.map((choice) => {
              const Icon = choice.icon
              const isActive = selectedChoice === choice.id
              return (
                <button
                  key={choice.id}
                  type="button"
                  disabled={phase !== 'playing'}
                  onClick={() => applyChoice(choice.id)}
                  className={cn(
                    'flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-black transition active:scale-[0.98] disabled:opacity-45',
                    isActive
                      ? 'border-[#171512] bg-[#171512] text-white'
                      : 'border-[#171512]/10 bg-white/75 text-[#171512]',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {choice.label}
                </button>
              )
            })}
          </div>
        </section>
      </div>
    </PlayableStage>
  )
}
