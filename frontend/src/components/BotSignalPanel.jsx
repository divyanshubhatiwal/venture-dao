import { ChevronDown, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useState } from 'react'

const LOOK = {
  long: { word: 'LONG', icon: TrendingUp, text: 'text-emerald-300', bar: 'bg-emerald-400', frame: 'border-emerald-500/30' },
  short: { word: 'SHORT', icon: TrendingDown, text: 'text-rose-300', bar: 'bg-rose-400', frame: 'border-rose-500/30' },
  flat: { word: 'FLAT', icon: Minus, text: 'text-slate-300', bar: 'bg-slate-400', frame: 'border-white/10' },
}

/** Short names for the signal engine's check labels, so the column stays narrow. */
const SHORT_NAME = {
  'RSI (14)': 'RSI',
  MACD: 'MACD',
  'Price vs EMA 20': 'EMA20',
  'Trend (SMA 50)': 'SMA50',
  'Bollinger (20,2)': 'Bollinger',
  Volume: 'Volume',
}

const VERDICT_TONE = { bullish: 'text-emerald-400', bearish: 'text-rose-400', neutral: 'text-slate-500' }
const VERDICT_WORD = { bullish: 'Bullish', bearish: 'Bearish', neutral: 'Neutral' }

/**
 * Compact read-out of the existing signal engine, sized to sit beside the
 * chart rather than under it.
 *
 * Every value here is taken straight from generateSignal — nothing is
 * recomputed and nothing is hardcoded. "Agreement" is how much the checks
 * agree with each other, which is not the same as a probability of being
 * right, and the label says so.
 */
export default function BotSignalPanel({ signal, priceOf, riskPerTrade = null, collapsible = false }) {
  const [open, setOpen] = useState(true)

  if (!signal?.ok) {
    return (
      <div className="card p-4">
        <p className="label mb-2">Bot signal</p>
        <p className="text-xs leading-relaxed text-slate-500">{signal?.reason ?? 'Waiting for enough candles to form a read.'}</p>
      </div>
    )
  }

  const look = LOOK[signal.direction]
  const Icon = look.icon
  const body = (
    <>
      <div className="flex items-center gap-3 px-4 pb-3">
        <span className={`grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.05] ${look.text}`}>
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <p className={`text-lg font-bold leading-none ${look.text}`}>{look.word}</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">{signal.bias}</p>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="flex items-baseline justify-between">
          <span className="label">Agreement</span>
          <span className="num text-sm font-bold text-slate-100">{signal.confidence}%</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full ${look.bar}`} style={{ width: `${signal.confidence}%` }} />
        </div>
      </div>

      <dl className="divide-y divide-white/[0.05] border-y border-white/[0.06]">
        {signal.checks.map((c) => (
          <div key={c.name} className="flex items-center justify-between gap-2 px-4 py-1.5" title={`${c.detail} · weight ${c.weight}`}>
            <dt className="text-[11px] font-medium text-slate-400">{SHORT_NAME[c.name] ?? c.name}</dt>
            <dd className={`text-[11px] font-semibold ${VERDICT_TONE[c.verdict]}`}>{VERDICT_WORD[c.verdict]}</dd>
          </div>
        ))}
      </dl>

      <dl className="px-4 py-3">
        {[
          ['Entry', priceOf(signal.levels.entry), 'text-slate-100'],
          ['Stop', priceOf(signal.levels.stop), 'text-rose-300'],
          ['Target', priceOf(signal.levels.target), 'text-emerald-300'],
          ['Reward / Risk', signal.levels.riskReward ? `${signal.levels.riskReward} : 1` : '—', 'text-slate-100'],
          ['ATR (14)', priceOf(signal.levels.atr), 'text-slate-100'],
          ['Risk per trade', riskPerTrade ?? '—', 'text-slate-100'],
        ].map(([k, v, tone]) => (
          <div key={k} className="flex items-center justify-between gap-2 py-1">
            <dt className="text-[11px] text-slate-500">{k}</dt>
            <dd className={`num text-[11px] font-semibold ${tone}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="border-t border-white/[0.06] px-4 py-2.5 text-[10px] leading-relaxed text-slate-600">
        Agreement between checks, not a probability of being right. {signal.disclaimer}
      </p>
    </>
  )

  return (
    <div className={`card overflow-hidden ${look.frame}`}>
      <button
        onClick={() => collapsible && setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 px-4 pt-3 pb-2 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <p className="label">Bot signal</p>
        <span className="ml-auto num text-[10px] text-slate-600">{signal.symbol}</span>
        {collapsible && <ChevronDown size={14} className={`text-slate-500 transition ${open ? 'rotate-180' : ''}`} />}
      </button>
      {(!collapsible || open) && body}
    </div>
  )
}
