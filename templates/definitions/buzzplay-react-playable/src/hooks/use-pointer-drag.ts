import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react'

export interface PointerDragState {
  isDragging: boolean
  startX: number
  startY: number
  x: number
  y: number
  dx: number
  dy: number
}

interface UsePointerDragOptions {
  onDragEnd?: (state: PointerDragState) => void
}

const idleDragState: PointerDragState = {
  isDragging: false,
  startX: 0,
  startY: 0,
  x: 0,
  y: 0,
  dx: 0,
  dy: 0,
}

export function usePointerDrag(options: UsePointerDragOptions = {}) {
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const latestStateRef = useRef<PointerDragState>(idleDragState)
  const [state, setState] = useState<PointerDragState>(idleDragState)

  const commitState = useCallback((next: PointerDragState) => {
    latestStateRef.current = next
    setState(next)
  }, [])

  const updateFromEvent = useCallback(
    (event: PointerEvent<HTMLElement>, isDragging: boolean): PointerDragState => {
      const start = startRef.current ?? { x: event.clientX, y: event.clientY }
      const next = {
        isDragging,
        startX: start.x,
        startY: start.y,
        x: event.clientX,
        y: event.clientY,
        dx: event.clientX - start.x,
        dy: event.clientY - start.y,
      }
      commitState(next)
      return next
    },
    [commitState],
  )

  const bind = useMemo(
    () => ({
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        startRef.current = { x: event.clientX, y: event.clientY }
        updateFromEvent(event, true)
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        if (!startRef.current) return
        updateFromEvent(event, true)
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (!startRef.current) return
        const finalState = updateFromEvent(event, false)
        startRef.current = null
        options.onDragEnd?.(finalState)
      },
      onPointerCancel: (event: PointerEvent<HTMLElement>) => {
        if (!startRef.current) return
        const finalState = updateFromEvent(event, false)
        startRef.current = null
        options.onDragEnd?.(finalState)
      },
    }),
    [options, updateFromEvent],
  )

  const reset = useCallback(() => {
    startRef.current = null
    commitState(idleDragState)
  }, [commitState])

  return { state, bind, reset }
}
