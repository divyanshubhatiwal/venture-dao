import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

/** Keeps one broken chart or API shape from blanking the whole demo. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[VentureDAO] render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="card max-w-md p-8 text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <AlertTriangle size={22} />
          </span>
          <h2 className="text-lg font-semibold text-white">Something broke on this screen</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            The rest of the app is still running. Reload to recover this view.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-white/10 bg-ink-950 p-3 text-left font-mono text-[11px] text-rose-300">
            {String(this.state.error?.message || this.state.error)}
          </pre>
          <button onClick={() => window.location.reload()} className="btn-primary mt-5 w-full">
            Reload app
          </button>
        </div>
      </div>
    )
  }
}
