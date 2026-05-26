import * as React from "react"

const MOBILE_BREAKPOINT = 768

function getIsMobileViewport() {
  if (typeof window === "undefined") return false

  const coarsePointer = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0
  return window.innerWidth < MOBILE_BREAKPOINT || (coarsePointer && Math.min(window.innerWidth, window.innerHeight) < MOBILE_BREAKPOINT)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const pointerMql = window.matchMedia("(pointer: coarse)")
    const onChange = () => {
      setIsMobile(getIsMobileViewport())
    }
    mql.addEventListener("change", onChange)
    pointerMql.addEventListener("change", onChange)
    window.addEventListener("resize", onChange)
    setIsMobile(getIsMobileViewport())
    return () => {
      mql.removeEventListener("change", onChange)
      pointerMql.removeEventListener("change", onChange)
      window.removeEventListener("resize", onChange)
    }
  }, [])

  return !!isMobile
}
