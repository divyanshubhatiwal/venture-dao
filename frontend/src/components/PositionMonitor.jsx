import { ArrowDown, ArrowUp, ShieldCheck, Target } from 'lucide-react'

const price = (n, digits = 2) =>
  n == null || !Number.isFinite(n) ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })

const money = (n) => {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n < 0 ? '-' : '+'}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * Where each open position sits between its stop and its target.
 *
 * The numbers alone (entry 63,046 · stop 63,192 · target 62,753) require the
 * reader to work out which direction is good, which is easy to get backwards
 * on a short. The bar puts price on the line it is actually travelling: the
 * left end is always the losing exit and the right end always the winning one,
 * whichever way the trade faces.
 */
function ExitBar({ position }) {
  const { entry, stop, target, mark } = position
  if (![entry, stop, mark].every(Number.isFinite) || target == null) return null

  const span = Math.abs(target - stop)
  if (span === 0) return null
  // Distance from the stop, normalised — works for both directions because the
  // sign of (target - stop) flips with the side.
  const pct = Math.max(0, Math.min(100, (Math.abs(mark - stop) / span) * 100))
  const entryPct = Math.max(0, Math.min(100, (Math.abs(entry - stop) / span) * 100))
  const winning = position.unrealised >= 0

  return (
    <div className="mt-2">
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-rose-500/30 via-white/10 to-emerald-500/30">
        {/* Entry, so the reader can see how far price has travelled from it. */}
        <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-slate-400/70" style={{ left: `${entryPct}%` }} />
        <span
          className={`absolute top-1/2 h-3 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full ${winning ? 'bg-emerald-400' : 'bg-rose-400'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-slate-600">
        <span>stop {price(stop, stop < 100 ? 4 : 2)}</span>
        <span>target {price(target, target < 100 ? 4 : 2)}</span>
      </div>
    </div>
  )
}

/**
 * Live view of every managed position.
 *
 * The stop and target shown here are the ones the engine is actually watching
 * — the same values it checks every few seconds — not a display copy that
 * could drift from them.
 */
export default function PositionMonitor({ positions = [], monitorSeconds = 5 }) {
  if (!positions.length) {
    return (
      <div className="card p-4">
        <p className="label mb-2">Open positions</p>
        <p className="text-xs text-slate-500">No positions open. Each new one gets a stop and a target the moment it fills.</p>
      </div>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3">
        <p className="label">Open positions</p>
        <span className="ml-auto text-[10px] text-slate-600">exits checked every {monitorSeconds}s</span>
      </div>

      <ul className="mt-2 divide-y divide-white/[0.06]">
        {positions.map((p) => {
          const long = p.side === 'long'
          const digits = p.entry < 100 ? 4 : 2
          const winning = (p.unrealised ?? 0) >= 0
          return (
            <li key={p.id} className="px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`chip ${long ? 'border-emerald-500/30 text-emerald-300' : 'border-rose-500/30 text-rose-300'}`}>
                  {long ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                  {p.side}
                </span>
                <span className="num text-xs font-bold text-slate-100">{p.symbol}</span>
                <span className={`num ml-auto text-xs font-bold ${winning ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {money(p.unrealised)}
                  {p.unrealisedPct != null && <span className="ml-1 text-[10px] opacity-70">({p.unrealisedPct}%)</span>}
                </span>
              </div>

              <dl className="mt-2 grid grid-cols-3 gap-x-3">
                {[
                  ['Entry', price(p.entry, digits), 'text-slate-300'],
                  ['Current', p.mark != null ? price(p.mark, digits) : 'awaiting tick', winning ? 'text-emerald-300' : 'text-rose-300'],
                  ['Size', price(p.qty, p.qty < 10 ? 3 : 1), 'text-slate-300'],
                ].map(([k, v, tone]) => (
                  <div key={k}>
                    <dt className="text-[9px] uppercase tracking-wide text-slate-600">{k}</dt>
                    <dd className={`num text-[11px] ${tone}`}>{v}</dd>
                  </div>
                ))}
              </dl>

              <ExitBar position={p} />

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
                <span className="flex items-center gap-1 text-rose-300">
                  <ShieldCheck size={10} />
                  Stop {price(p.stop, digits)}
                  {p.toStopPct != null && <span className="text-slate-600">({p.toStopPct}% away)</span>}
                </span>
                <span className="flex items-center gap-1 text-emerald-300">
                  <Target size={10} />
                  Target {price(p.target, digits)}
                  {p.toTargetPct != null && <span className="text-slate-600">({p.toTargetPct}% away)</span>}
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="border-t border-white/[0.06] px-4 py-2.5 text-[10px] leading-relaxed text-slate-600">
        Stops and targets are monitored by the server and closed automatically — the position itself is the exit, so there is no
        second resting order to cancel.
      </p>
    </div>
  )
}
