import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card } from './ui'

/**
 * Headline metric tile.
 *
 * `delta` is a signed percentage and is only ever passed when there is a real
 * measured change. It renders with a coloured arrow, which reads as evidence —
 * so a placeholder number here is not decoration, it is a false claim about
 * performance. Leave it undefined rather than filling it in.
 *
 * The tile is deliberately plain: a label, a number, one line of context. Four
 * of these sit in a row, and gradients and glows behind each one turn a
 * scannable row of figures into four competing objects.
 */
export default function KpiCard({ icon: Icon, label, value, unit, delta, hint, tone = 'brand', className = '' }) {
  const tones = {
    brand: 'text-brand-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    sky: 'text-sky-300',
  }
  const up = delta >= 0

  return (
    <Card className={`p-5 ${className}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon size={14} className={`shrink-0 ${tones[tone]}`} />}
        <p className="label truncate">{label}</p>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="num text-[26px] font-semibold tracking-tight text-white">{value}</span>
        {unit && <span className="text-xs text-slate-500">{unit}</span>}
      </div>

      {(delta != null || hint) && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {delta != null && (
            <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {up ? '+' : ''}
              {delta}%
            </span>
          )}
          {hint && <span className="truncate text-slate-500">{hint}</span>}
        </div>
      )}
    </Card>
  )
}
