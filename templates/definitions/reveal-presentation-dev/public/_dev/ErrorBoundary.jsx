import { Component } from 'react'

/**
 * Error Boundary Component
 * Catches errors in child components and displays fallback UI
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    })

    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-900/20 to-orange-900/20 p-20">
          <div className="glass-strong rounded-3xl p-12 max-w-4xl">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h2 className="text-6xl font-bold text-red-400 mb-2">Slide Error</h2>
                <p className="text-3xl text-text-secondary">Something went wrong with this slide</p>
              </div>
            </div>

            {this.state.error && (
              <div className="space-y-4">
                <div className="glass rounded-xl p-6">
                  <p className="text-2xl font-semibold text-text-primary mb-2">Error Message:</p>
                  <p className="text-2xl text-red-300 font-mono">{this.state.error.toString()}</p>
                </div>

                {this.state.errorInfo && this.state.errorInfo.componentStack && (
                  <details className="glass rounded-xl p-6">
                    <summary className="text-2xl font-semibold text-text-primary cursor-pointer">
                      Stack Trace (click to expand)
                    </summary>
                    <pre className="text-xl text-text-secondary mt-4 overflow-auto max-h-96 font-mono">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="mt-8 flex gap-4">
              <button
                onClick={() => window.location.reload()}
                className="px-8 py-4 text-2xl font-semibold bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl hover:shadow-glow-lg transition-all"
              >
                Reload Presentation
              </button>
              {this.props.onReset && (
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null, errorInfo: null })
                    this.props.onReset()
                  }}
                  className="px-8 py-4 text-2xl font-semibold glass hover:bg-white/10 text-white rounded-xl transition-all"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </section>
      )
    }

    return this.props.children
  }
}
