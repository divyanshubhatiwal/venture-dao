import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { sma } from '../lib/marketApi'

const UP = '#34d399'
const DOWN = '#fb7185'

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', INR: '₹' }

const money = (n, currency) => {
  if (n == null) return '—'
  const prefix = currency ? (CURRENCY_SYMBOLS[currency] ?? '') : ''
  const digits = n >= 100 ? 2 : n >= 1 ? 2 : 5
  return prefix + n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

/**
 * Recharts ships no candlestick, so each candle is a Bar spanning [low, high]
 * with a custom shape: a one-pixel wick across the full range and a body
 * between open and close, positioned by interpolating inside the bar's own
 * pixel box (which is what maps the value range to screen space).
 */
function Candle(props) {
  const { x, y, width, height, payload } = props
  const { open, close, high, low } = payload
  if (high == null || low == null) return null

  const span = high - low
  const toY = (value) => (span === 0 ? y + height / 2 : y + ((high - value) / span) * height)

  const up = close >= open
  const color = up ? UP : DOWN
  const bodyTop = toY(Math.max(open, close))
  const bodyBottom = toY(Math.min(open, close))
  const bodyHeight = Math.max(1, bodyBottom - bodyTop)
  const bodyWidth = Math.max(1, Math.min(width * 0.68, 14))
  const centerX = x + width / 2

  return (
    <g>
      <line x1={centerX} x2={centerX} y1={y} y2={y + height} stroke={color} strokeWidth={1} opacity={0.85} />
      <rect x={centerX - bodyWidth / 2} y={bodyTop} width={bodyWidth} height={bodyHeight} fill={color} rx={1} />
    </g>
  )
}

function CandleTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const change = ((d.close - d.open) / d.open) * 100
  const up = d.close >= d.open

  return (
    <div className="rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{d.fullLabel}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px]">
        {[
          ['O', d.open],
          ['H', d.high],
          ['L', d.low],
          ['C', d.close],
        ].map(([k, v]) => (
          <p key={k} className="flex justify-between gap-3">
            <span className="text-slate-500">{k}</span>
            <span className="text-slate-200">{money(v, currency)}</span>
          </p>
        ))}
      </div>
      <p className={`mt-1.5 font-mono text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {up ? '+' : ''}
        {change.toFixed(2)}%
      </p>
      {d.volume > 0 && <p className="mt-0.5 font-mono text-[10px] text-slate-500">Vol {money(d.volume)}M</p>}
    </div>
  )
}

/**
 * Recharts' ResponsiveContainer does not recover if it first mounts at zero
 * width — which happens whenever the chart renders in a hidden panel or a
 * backgrounded window. Measuring first and mounting only once there is real
 * width to fill avoids a permanently blank chart.
 */
function useMeasuredWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}

export default function CandleChart({
  candles,
  intraday = false,
  showSma = true,
  showVolume = true,
  height = 320,
  currency = 'USD',
  levels = null,
}) {
  const [wrapperRef, width] = useMeasuredWidth()
  const data = useMemo(() => {
    const sma7 = sma(candles, 7)
    const sma25 = sma(candles, 25)
    return candles.map((c, i) => {
      const d = new Date(c.time)
      return {
        ...c,
        label: intraday
          ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullLabel: d.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          ...(intraday ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
        }),
        range: [c.low, c.high],
        sma7: sma7[i],
        sma25: sma25[i],
      }
    })
  }, [candles, intraday])

  const domain = useMemo(() => {
    if (!candles.length) return ['auto', 'auto']
    const lows = candles.map((c) => c.low)
    const highs = candles.map((c) => c.high)
    // The projected target and stop are usually outside the candles' own range,
    // so they have to widen the axis or their lines get clipped off the chart.
    const marks = levels ? [levels.target, levels.stop].filter((v) => v != null) : []
    const min = Math.min(...lows, ...marks)
    const max = Math.max(...highs, ...marks)
    const pad = (max - min) * 0.06 || max * 0.02
    return [+(min - pad).toFixed(2), +(max + pad).toFixed(2)]
  }, [candles, levels])

  // Roughly a dozen x labels regardless of how many candles are in view.
  const tickGap = Math.max(0, Math.floor(data.length / 12) - 1)
  const hasVolume = showVolume && candles.some((c) => c.volume > 0)

  if (!candles.length) {
    return (
      <div className="grid h-[320px] place-items-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">
        No price history available for this asset offline.
      </div>
    )
  }

  return (
    <div ref={wrapperRef}>
      <div style={{ height }}>
        {width > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval={tickGap} minTickGap={12} />
            <YAxis
              domain={domain}
              tickLine={false}
              axisLine={false}
              width={62}
              orientation="right"
              tickFormatter={(v) => money(v, currency)}
            />
            <Tooltip content={<CandleTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
            <Bar dataKey="range" shape={<Candle />} isAnimationActive={false}>
              {data.map((d, i) => (
                <Cell key={i} />
              ))}
            </Bar>
            {showSma && <Line type="monotone" dataKey="sma7" name="SMA 7" stroke="#818cf8" strokeWidth={1.5} dot={false} connectNulls />}
            {showSma && <Line type="monotone" dataKey="sma25" name="SMA 25" stroke="#f0abfc" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls />}
            {/* Where the agent expects price to go, and where it admits it was
                wrong. Drawn together on purpose: a target shown without its
                stop is only half of the trade. */}
            {levels?.target != null && (
              <ReferenceLine
                y={levels.target}
                stroke="#34d399"
                strokeDasharray="5 4"
                strokeWidth={1.25}
                label={{ value: `target ${money(levels.target, currency)}`, position: 'insideTopLeft', fill: '#34d399', fontSize: 10 }}
              />
            )}
            {levels?.stop != null && (
              <ReferenceLine
                y={levels.stop}
                stroke="#fb7185"
                strokeDasharray="5 4"
                strokeWidth={1.25}
                label={{ value: `stop ${money(levels.stop, currency)}`, position: 'insideBottomLeft', fill: '#fb7185', fontSize: 10 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        )}
      </div>

      {hasVolume && width > 0 && (
        <div className="mt-1 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 0, right: 8, left: -6, bottom: 0 }}>
              <XAxis dataKey="label" hide />
              <YAxis width={62} orientation="right" tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}M`} />
              <Tooltip content={<CandleTooltip currency={currency} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
              <Bar dataKey="volume" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.close >= d.open ? 'rgba(52,211,153,.45)' : 'rgba(251,113,133,.45)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
