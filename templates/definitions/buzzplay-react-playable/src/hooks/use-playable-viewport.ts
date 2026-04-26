import { useEffect, useState } from 'react'

export interface PlayableViewport {
  width: number
  height: number
}

function readViewport(): PlayableViewport {
  if (typeof window === 'undefined') {
    return { width: 390, height: 844 }
  }

  return {
    width: Math.round(window.visualViewport?.width ?? window.innerWidth),
    height: Math.round(window.visualViewport?.height ?? window.innerHeight),
  }
}

export function usePlayableViewport(): PlayableViewport {
  const [viewport, setViewport] = useState<PlayableViewport>(() => readViewport())

  useEffect(() => {
    const update = () => {
      const next = readViewport()
      document.documentElement.style.setProperty('--playable-vh', `${next.height}px`)
      document.documentElement.style.setProperty('--playable-vw', `${next.width}px`)
      setViewport(next)
    }

    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
    window.visualViewport?.addEventListener('scroll', update)

    return () => {
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('scroll', update)
    }
  }, [])

  return viewport
}
