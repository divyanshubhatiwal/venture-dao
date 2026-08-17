import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Presentation, X } from 'lucide-react'
import { useDemo } from '../context/DemoContext'
import { DEMO_STEPS } from '../lib/demo/demoScript'

/** Entry point for the walkthrough — lives in the top bar. */
export function DemoLaunchButton() {
  const { running, start } = useDemo()
  if (running) return null
  return (
    <button
      onClick={start}
      className="btn-ghost btn-sm border-brand-500/30 text-brand-200 hover:border-brand-500/60 sm:px-3 sm:py-2"
      title="Run the hands-free 3-minute walkthrough"
    >
      <Presentation size={15} />
      <span className="hidden sm:inline">Judge mode</span>
    </button>
  )
}

/**
 * Dims the page, cuts a hole around the element the current step refers to,
 * and narrates. Pointer events pass through everywhere except the controls,
 * so the underlying page keeps animating while the script drives it.
 */
export default function DemoOverlay() {
  const { running, paused, busy, index, step, rect, total, stop, next, prev, togglePause } = useDemo()

  if (!running || !step) return null

  const elapsed = DEMO_STEPS.slice(0, index).reduce((s, x) => s + x.duration, 0)
  const totalMs = DEMO_STEPS.reduce((s, x) => s + x.duration, 0)
  const progress = ((elapsed + (paused ? 0 : step.duration / 2)) / totalMs) * 100
  const pad = 10

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      {/* Spotlight: one element stays lit, everything else dims. */}
      {rect ? (
        <div
          className="absolute rounded-2xl ring-2 ring-brand-400/70 transition-all duration-500 ease-out"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(3, 5, 12, .74)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink-950/70" />
      )}

      {/* Narration + transport */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-4 sm:p-6">
        <div className="pointer-events-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-white/12 bg-ink-850/95 shadow-2xl backdrop-blur-xl">
          <div className="h-1 w-full bg-white/[0.06]">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-accent transition-[width] duration-500"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>

          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-200">{step.chapter}</span>
                <span className="font-mono text-[11px] text-slate-500">
                  {index + 1} / {total}
                </span>
                {busy && (
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Loader2 size={11} className="animate-spin text-brand-400" />
                    running
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">{step.narration}</p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button onClick={prev} disabled={index === 0} className="btn-ghost btn-sm" aria-label="Previous step">
                <ChevronLeft size={15} />
              </button>
              <button onClick={togglePause} className="btn-primary btn-sm px-3" aria-label={paused ? 'Resume' : 'Pause'}>
                {paused ? <Play size={15} /> : <Pause size={15} />}
              </button>
              <button onClick={next} disabled={index + 1 >= total} className="btn-ghost btn-sm" aria-label="Next step">
                <ChevronRight size={15} />
              </button>
              <button onClick={stop} className="btn-ghost btn-sm" aria-label="Exit walkthrough">
                <X size={15} />
              </button>
            </div>
          </div>

          <p className="border-t border-white/[0.06] px-5 py-2 text-[10px] text-slate-600">
            Space pauses · ← → step · Esc exits
          </p>
        </div>
      </div>
    </div>
  )
}
