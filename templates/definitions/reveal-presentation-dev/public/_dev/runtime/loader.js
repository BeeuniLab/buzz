import React from 'react'
import { createRoot } from 'react-dom/client'
import { jsxImport } from '../compiler/index.js'
import { setupGlobals } from './component-registry.js'

let ErrorBoundary = null

function createErrorComponent(error, slideId) {
  return () => {
    return React.createElement('div', {
      className: 'glass p-8 max-w-4xl mx-auto',
      style: { border: '1px solid rgba(255, 100, 100, 0.3)' }
    }, [
      React.createElement('h2', { key: 'title', className: 'text-5xl font-bold text-red-400 mb-4' }, `Error: ${slideId}`),
      React.createElement('pre', { key: 'msg', className: 'text-2xl text-red-300 whitespace-pre-wrap' }, error.message)
    ])
  }
}

class SlideLoader {
  constructor() {
    this.slides = []
    this.manifest = null
    this.Presentation = null
  }

  async loadManifest() {
    try {
      const response = await fetch('/slides/manifest.json', { cache: 'no-store' })
      if (response.ok) {
        this.manifest = await response.json()
        console.log('Manifest loaded:', this.manifest)
        return this.manifest
      }
    } catch (error) {
      console.warn('No manifest.json found, will use file discovery:', error.message)
    }
    return null
  }

  async discoverSlides() {
    const manifestSlides = this.manifest?.slides || []
    const discoveredSlides = new Set(manifestSlides)

    // Probe for Slide01-99.jsx files not in manifest
    for (let i = 1; i <= 99; i++) {
      const filename = `Slide${String(i).padStart(2, '0')}.jsx`

      // Skip if already in manifest
      if (manifestSlides.includes(filename)) continue

      // Check if file exists
      if (await this.fileExists(`/slides/${filename}`)) {
        discoveredSlides.add(filename)
      } else {
        // Stop after 3 consecutive misses
        if (i > 3 && !await this.fileExists(`/slides/Slide${String(i + 1).padStart(2, '0')}.jsx`)) {
          break
        }
      }
    }

    return this.orderSlides(Array.from(discoveredSlides), manifestSlides)
  }

  orderSlides(allSlides, manifestSlides) {
    // Slides in manifest come first (in manifest order)
    const ordered = [...manifestSlides]

    // Then add discovered slides not in manifest, sorted by number
    const unmapped = allSlides.filter(s => !manifestSlides.includes(s))
    const sorted = unmapped.sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '999')
      const numB = parseInt(b.match(/\d+/)?.[0] || '999')
      return numA - numB
    })

    return [...ordered, ...sorted]
  }

  async fileExists(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' })
      if (!res.ok) return false
      const ct = (res.headers.get('content-type') || '').toLowerCase()
      // If server fell back to SPA HTML, skip
      if (ct.includes('text/html')) return false
      // Quick sniff: if content starts with '<', it's likely HTML, skip
      const text = await res.text()
      const trimmed = text.trimStart()
      if (trimmed.startsWith('<')) return false
      return true
    } catch {
      return false
    }
  }

  async loadSlide(filename) {
    try {
      const { default: SlideComponent } = await jsxImport(`/slides/${filename}`)
      return SlideComponent
    } catch (error) {
      console.error(`Error loading ${filename}:`, error)
      return createErrorComponent(error, filename)
    }
  }

  async loadPresentation() {
    const [presentationModule, errorBoundaryModule] = await Promise.all([
      jsxImport('/_dev/Presentation.jsx'),
      jsxImport('/_dev/ErrorBoundary.jsx')
    ])

    this.Presentation = presentationModule.default
    ErrorBoundary = errorBoundaryModule.default
  }

  async loadAllSlides() {
    await this.loadManifest()
    const slideFiles = await this.discoverSlides()

    console.log(`Loading ${slideFiles.length} slides:`, slideFiles)

    const slideComponents = await Promise.all(
      slideFiles.map(file => this.loadSlide(file))
    )

    this.slides = slideComponents
    return slideComponents
  }

  renderApp() {
    if (!this.Presentation) {
      throw new Error('Presentation component not loaded')
    }

    if (!ErrorBoundary) {
      throw new Error('ErrorBoundary component not loaded')
    }

    const App = () => {
      return React.createElement(
        this.Presentation,
        {
          theme: this.manifest?.metadata?.theme || 'dark',
          transition: this.manifest?.metadata?.transition || 'slide',
          controls: true,
          progress: true,
          center: true
        },
        this.slides.map((SlideComponent, index) =>
          React.createElement(
            ErrorBoundary,
            { key: index },
            React.createElement(SlideComponent, { key: `slide-${index}` })
          )
        )
      )
    }

    const root = createRoot(document.getElementById('root'))
    root.render(React.createElement(App))
  }
}

// Bootstrap the application
async function bootstrap() {
  const rootEl = document.getElementById('root')
  
  const loadingEl = document.createElement('div')
  loadingEl.className = 'flex items-center justify-center min-h-screen bg-gray-900'
  loadingEl.innerHTML = `
    <div class="text-center">
      <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
      <p class="text-2xl text-gray-300">Loading presentation...</p>
    </div>
  `
  rootEl.appendChild(loadingEl)
  
  try {
    console.log('Starting presentation loader...')

    console.log('Loading component registry...')
    await setupGlobals()

    const loader = new SlideLoader()

    console.log('Loading Presentation component...')
    await loader.loadPresentation()

    console.log('Loading slides...')
    await loader.loadAllSlides()

    console.log(`Loaded ${loader.slides.length} slides, rendering...`)
    
    rootEl.removeChild(loadingEl)
    loader.renderApp()

    console.log('Presentation initialized successfully')
  } catch (error) {
    console.error('Failed to bootstrap presentation:', error)

    // Render error screen
    const root = createRoot(document.getElementById('root'))
    root.render(
      React.createElement('div', {
        className: 'flex items-center justify-center min-h-screen bg-gray-900 text-white p-8'
      }, [
        React.createElement('div', {
          key: 'error',
          className: 'max-w-2xl'
        }, [
          React.createElement('h1', {
            key: 'title',
            className: 'text-4xl font-bold text-red-400 mb-4'
          }, 'Failed to Load Presentation'),
          React.createElement('pre', {
            key: 'message',
            className: 'text-lg text-gray-300 whitespace-pre-wrap'
          }, error.message),
          React.createElement('p', {
            key: 'hint',
            className: 'mt-4 text-gray-400'
          }, 'Check the browser console for more details.')
        ])
      ])
    )
  }
}

// Start loading when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap)
} else {
  bootstrap()
}
