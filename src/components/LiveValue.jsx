import { useEffect, useRef, useState } from 'react'

/**
 * Renders a number that flashes green or red for a moment whenever it changes.
 *
 * The flash is driven entirely by real incoming values — nothing is animated
 * between ticks and no movement is interpolated. If a market is closed and the
 * price genuinely does not move, this stays perfectly still, which is the
 * honest thing for it to do.
 */
export default function LiveValue({ value, format = (v) => v, className = '', flash = true }) {
  const previous = useRef(value)
  const [direction, setDirection] = useState(null)

  useEffect(() => {
    if (!flash || value == null || previous.current == null) {
      previous.current = value
      return undefined
    }
    if (value === previous.current) return undefined

    setDirection(value > previous.current ? 'up' : 'down')
    previous.current = value
    const timer = setTimeout(() => setDirection(null), 700)
    return () => clearTimeout(timer)
  }, [value, flash])

  return (
    <span className={`${direction === 'up' ? 'tick-up' : direction === 'down' ? 'tick-down' : ''} ${className}`}>
      {format(value)}
    </span>
  )
}

/** Small "streaming" indicator with an explicit state, never a false positive. */
export function LiveBadge({ live, label, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide ${
        live ? 'text-emerald-300' : 'text-slate-500'
      }`}
    >
      {live ? <span className="live-dot" /> : <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-600" />}
      {label}
    </span>
  )
}
