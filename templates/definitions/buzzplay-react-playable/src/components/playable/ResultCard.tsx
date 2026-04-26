import { RotateCcw, Share2 } from 'lucide-react'

interface ResultCardProps {
  title: string
  description: string
  score: number
  onReplay: () => void
  onShare?: () => void
}

export function ResultCard({ title, description, score, onReplay, onShare }: ResultCardProps) {
  const shareResult = () => {
    const text = `${title} (${score}): ${description}`
    if (navigator.share) {
      void navigator.share({ title, text }).catch(() => undefined)
      return
    }
    void navigator.clipboard?.writeText(text).catch(() => undefined)
  }

  return (
    <div className="rounded-lg border border-[#171512]/10 bg-white/90 p-4 shadow-[0_18px_40px_rgba(23,21,18,0.16)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#d04d2f]">Your result</p>
          <h2 className="mt-1 text-2xl font-black leading-tight text-[#171512]">{title}</h2>
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#171512] text-lg font-black text-white">
          {score}
        </div>
      </div>
      <p className="mt-3 text-sm leading-6 text-[#55514a]">{description}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onReplay}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#171512] px-3 text-sm font-bold text-white transition active:scale-[0.98]"
        >
          <RotateCcw className="h-4 w-4" />
          Replay
        </button>
        <button
          type="button"
          onClick={onShare ?? shareResult}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#171512]/15 bg-white px-3 text-sm font-bold text-[#171512] transition active:scale-[0.98]"
        >
          <Share2 className="h-4 w-4" />
          Share
        </button>
      </div>
    </div>
  )
}
