import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from './ui'

/**
 * Headline metric tile. `delta` is a signed percentage; `tone` overrides the
 * accent when the metric is not a money figure.
 */
export default function KpiCard({ icon: Icon, label, value, unit, delta, hint, tone = 'brand', className = '' }) {
  const tones = {
    brand: 'from-brand-500/20 to-accent/10 text-brand-300',
    emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-300',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-300',
    sky: 'from-sky-500/20 to-sky-500/5 text-sky-300',
  }
  const up = delta >= 0

  return (
    <Card hover className={`group relative overflow-hidden p-5 ${className}`}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand-500/10 blur-2xl transition group-hover:bg-brand-500/20" />
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {Icon && (
          <span className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${tones[tone]}`}>
            <Icon size={15} />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-bold tracking-tight text-white">{value}</span>
        {unit && <span className="text-xs font-medium text-slate-500">{unit}</span>}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {delta != null && (
          <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {up ? '+' : ''}
            {delta}%
          </span>
        )}
        {hint && <span className="truncate text-slate-500">{hint}</span>}
      </div>
    </Card>
  )
}
