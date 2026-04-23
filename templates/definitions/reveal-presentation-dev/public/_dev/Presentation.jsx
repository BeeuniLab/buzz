import { useEffect, useRef } from 'react'
import Reveal from 'reveal.js'

/**
 * Presentation wrapper component that initializes Reveal.js
 * @param {Object} props
 * @param {React.ReactNode} props.children - Slide components
 * @param {string} [props.theme='dark'] - Theme ('dark' | 'light')
 * @param {string} [props.transition='slide'] - Slide transition type
 * @param {boolean} [props.controls=true] - Show navigation controls
 * @param {boolean} [props.progress=true] - Show progress bar
 * @param {boolean} [props.center=true] - Center slides vertically
 */
export default function Presentation({
  children,
  theme = 'dark',
  transition = 'slide',
  controls = true,
  progress = true,
  center = true,
}) {
  const revealDivRef = useRef(null)
  const deckRef = useRef(null)
  const showAllFragmentsRef = useRef(false)

  useEffect(() => {
    if (revealDivRef.current && !deckRef.current) {
      const urlParams = new URLSearchParams(window.location.search)
      const hashParams = window.location.hash.includes('?')
        ? new URLSearchParams(window.location.hash.split('?')[1])
        : new URLSearchParams()

      showAllFragmentsRef.current = urlParams.has('showAllFragments') || hashParams.has('showAllFragments')

      console.log('[Presentation] PRE-INIT - URL search:', window.location.search)
      console.log('[Presentation] PRE-INIT - Hash:', window.location.hash)
      console.log('[Presentation] PRE-INIT - showAllFragments:', showAllFragmentsRef.current)

      const isPdfMode = new URLSearchParams(window.location.search).has('print-pdf')

      deckRef.current = new Reveal(revealDivRef.current, {
        transition,
        controls,
        progress,
        center,
        hash: true,
        slideNumber: 'c/t',
        showSlideNumber: 'all',
        controlsLayout: 'bottom-right',
        controlsBackArrows: 'faded',
        navigationMode: 'linear',
        embedded: false,
        width: 1920,
        height: 1080,
        margin: 0.04,
        minScale: 0.2,
        maxScale: 2.0,
        pdfSeparateFragments: false,
        pdfMaxPagesPerSlide: 1,
      })

      deckRef.current.initialize().then(() => {
        console.log('Reveal.js initialized successfully')

        const deck = deckRef.current
        if (!deck) return

        console.log('[Presentation] POST-INIT - URL search:', window.location.search)
        console.log('[Presentation] POST-INIT - Hash:', window.location.hash)
        console.log('[Presentation] POST-INIT - showAllFragments from ref:', showAllFragmentsRef.current)

        if (showAllFragmentsRef.current) {
          console.log('[Presentation] showAllFragments detected, advancing all fragments')
          const initialIndices = deck.getIndices()
          console.log('[Presentation] Initial indices:', initialIndices)

          let safety = 0
          let lastFragmentIndex = initialIndices.f ?? -1
          while (safety < 50) {
            deck.nextFragment()
            const currentFragmentIndex = deck.getIndices().f ?? -1
            console.log(`[Presentation] Fragment ${safety}: lastIndex=${lastFragmentIndex}, currentIndex=${currentFragmentIndex}`)
            if (currentFragmentIndex === lastFragmentIndex) break
            lastFragmentIndex = currentFragmentIndex
            safety++
          }

          const finalIndices = deck.getIndices()
          console.log(`[Presentation] Advanced ${safety} fragments. Final indices:`, finalIndices)
        }

        if (window.parent !== window) {
          window.parent.postMessage({
            type: 'REVEAL_READY',
            data: {
              totalSlides: deck.getTotalSlides(),
              currentSlide: deck.getIndices(),
            },
          }, '*')
        }

        if (isPdfMode) {
          setTimeout(() => {
            window.print()
          }, 1000)
        }

        deck.on('slidechanged', (event) => {
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'SLIDE_CHANGED',
              data: {
                currentSlide: event.indexh,
                previousSlide: event.previousSlide ? event.previousSlide.dataset.slideIndex : null,
              },
            }, '*')
          }
        })
      }).catch((err) => {
        console.error('Reveal.js initialization failed:', err)
      })
    }

    return () => {
      if (deckRef.current) {
        try {
          deckRef.current.destroy()
        } catch (err) {
          console.error('Error destroying Reveal:', err)
        }
        deckRef.current = null
      }
    }
  }, [transition, controls, progress, center])

  useEffect(() => {
    const handleMessage = (event) => {
      const deck = deckRef.current
      if (!deck) return

      const { type, data } = event.data

      switch (type) {
        case 'GET_SLIDE_COUNT':
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'SLIDE_COUNT_RESPONSE',
              data: { totalSlides: deck.getTotalSlides() },
            }, '*')
          }
          break

        case 'GET_CURRENT_SLIDE':
          if (window.parent !== window) {
            window.parent.postMessage({
              type: 'CURRENT_SLIDE_RESPONSE',
              data: { currentSlide: deck.getIndices().h },
            }, '*')
          }
          break

        case 'NAVIGATE_TO_SLIDE':
          if (typeof data?.index === 'number') {
            deck.slide(data.index)
          }
          break

        case 'NAVIGATE_NEXT':
          deck.next()
          break

        case 'NAVIGATE_PREV':
          deck.prev()
          break

        case 'EXPORT_PDF':
          const currentUrl = new URL(window.location.href)
          currentUrl.searchParams.set('print-pdf', '')
          window.location.href = currentUrl.toString()
          break

        case 'CAPTURE_SLIDE':
          if (typeof data?.index === 'number') {
            console.log(`[Presentation] [TEST] CAPTURE_SLIDE received for index ${data.index}`)
            ;(async () => {
              try {
                const targetIndex = data.index
                const currentIndex = deck.getIndices().h

                console.log(`[Presentation] Current slide index: ${currentIndex}, target: ${targetIndex}`)

                console.log(`[Presentation] Advancing fragments for slide ${targetIndex}`)
                let safety = 0
                let lastFragmentIndex = deck.getIndices().f ?? -1

                while (safety < 50) {
                  deck.nextFragment()
                  const currentFragmentIndex = deck.getIndices().f ?? -1
                  if (currentFragmentIndex === lastFragmentIndex) break
                  lastFragmentIndex = currentFragmentIndex
                  safety++
                }
                console.log(`[Presentation] Advanced ${safety} fragments for slide ${targetIndex}`)

                if (document.fonts?.ready) {
                  console.log(`[Presentation] Waiting for fonts to load...`)
                  await document.fonts.ready
                  console.log(`[Presentation] Fonts loaded`)
                }

                console.log(`[Presentation] Waiting 500ms for content rendering...`)
                await new Promise(resolve => setTimeout(resolve, 500))

                console.log(`[Presentation] Starting html2canvas capture for slide ${targetIndex}`)
                const slideElement = deck.getCurrentSlide()
                if (!slideElement) {
                  throw new Error('No slide element found')
                }

                if (!window.html2canvas) {
                  throw new Error('html2canvas not loaded')
                }

                const fullCanvas = await window.html2canvas(slideElement, {
                  useCORS: true,
                  backgroundColor: null,
                  logging: false,
                  foreignObjectRendering: true,
                  scale: 2,
                  allowTaint: false,
                  scrollX: 0,
                  scrollY: 0,
                  windowWidth: 1920,
                  windowHeight: 1080,
                })
                console.log(`[Presentation] html2canvas completed for slide ${targetIndex}, canvas size: ${fullCanvas.width}x${fullCanvas.height}`)

                const thumbWidth = 384
                const thumbHeight = 216
                const thumbCanvas = document.createElement('canvas')
                thumbCanvas.width = thumbWidth
                thumbCanvas.height = thumbHeight

                const ctx = thumbCanvas.getContext('2d')
                if (!ctx) {
                  throw new Error('Failed to get canvas context')
                }

                ctx.imageSmoothingEnabled = true
                ctx.imageSmoothingQuality = 'high'
                ctx.drawImage(fullCanvas, 0, 0, thumbWidth, thumbHeight)

                const thumbnail = thumbCanvas.toDataURL('image/png', 0.9)
                console.log(`[Presentation] Thumbnail generated for slide ${targetIndex}, size: ${thumbnail.length} bytes`)

                if (window.parent !== window) {
                  window.parent.postMessage({
                    type: 'SLIDE_CAPTURED',
                    data: {
                      index: targetIndex,
                      thumbnail: thumbnail,
                    },
                  }, '*')
                  console.log(`[Presentation] SLIDE_CAPTURED sent for index ${targetIndex}`)
                } else {
                  console.warn(`[Presentation] No parent window, cannot send SLIDE_CAPTURED`)
                }
              } catch (err) {
                console.error(`[Presentation] Failed to capture slide ${data.index}:`, err)
                if (window.parent !== window) {
                  window.parent.postMessage({
                    type: 'CAPTURE_ERROR',
                    data: {
                      index: data.index,
                      error: err.message,
                    },
                  }, '*')
                }
              }
            })()
          }
          break

        default:
          break
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return (
    <div className={`reveal-viewport ${theme}`}>
      <div className="reveal" ref={revealDivRef}>
        <div className="slides">{children}</div>
      </div>
    </div>
  )
}
