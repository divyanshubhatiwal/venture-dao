import { useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, Pause, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'

const INDICATOR_LABELS = {
  ema20: 'EMA 20',
  sma50: 'SMA 50',
  bb: 'Bollinger Bands',
  volume: 'Volume',
  rsi: 'RSI',
  macd: 'MACD',
  atr: 'ATR',
}

/**
 * Timeframe, indicator and viewport controls for the price chart.
 *
 * Holds no chart state of its own — every control reports upward so the page
 * stays the single owner of what is displayed. The indicator menu is the only
 * local state, because whether a dropdown is open is nobody else's business.
 */
export default function ChartToolbar({
  ranges,
  rangeKey,
  onRange,
  indicators,
  onToggleIndicator,
  onReset,
  onToggleFullscreen,
  isFullscreen,
  paused,
  onTogglePause,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const btn = 'rounded-lg px-2.5 py-1.5 text-xs font-semibold transition'
  const activeCount = Object.values(indicators).filter(Boolean).length

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="flex items-center gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-0.5">
        {ranges.map((r) => (
          <button
            key={r.key}
            onClick={() => onRange(r.key)}
            className={`${btn} ${rangeKey === r.key ? 'bg-brand-500/20 text-brand-200' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`${btn} flex items-center gap-1.5 border border-white/[0.07] ${menuOpen ? 'bg-white/10 text-white' : 'bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}
        >
          <SlidersHorizontal size={13} />
          Indicators
          <span className="num rounded bg-white/10 px-1 text-[10px]">{activeCount}</span>
        </button>
        {menuOpen && (
          <div className="absolute left-0 top-full z-30 mt-1.5 w-52 rounded-xl border border-white/10 bg-ink-850/95 p-1.5 shadow-xl backdrop-blur">
            {Object.entries(INDICATOR_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => onToggleIndicator(key)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs text-slate-300 transition hover:bg-white/[0.06]"
              >
                {label}
                <span
                  className={`h-3.5 w-6 rounded-full transition ${indicators[key] ? 'bg-brand-500' : 'bg-white/15'} relative`}
                >
                  <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all ${indicators[key] ? 'left-3' : 'left-0.5'}`} />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onTogglePause}
        title={paused ? 'Resume auto-scroll to latest candle' : 'Pause auto-scroll'}
        className={`${btn} flex items-center gap-1.5 border border-white/[0.07] ${paused ? 'bg-amber-500/15 text-amber-300' : 'bg-white/[0.02] text-slate-400 hover:text-slate-200'}`}
      >
        {paused ? <Play size={13} /> : <Pause size={13} />}
        {paused ? 'Paused' : 'Live'}
      </button>

      <button onClick={onReset} title="Reset zoom and pan" className={`${btn} flex items-center gap-1.5 border border-white/[0.07] bg-white/[0.02] text-slate-400 hover:text-slate-200`}>
        <RotateCcw size={13} />
        Reset
      </button>

      <button onClick={onToggleFullscreen} title="Fullscreen" className={`${btn} flex items-center gap-1.5 border border-white/[0.07] bg-white/[0.02] text-slate-400 hover:text-slate-200`}>
        {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </button>
    </div>
  )
}
