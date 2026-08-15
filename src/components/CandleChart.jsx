import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { atr, bollinger, ema, macd, rsi, sma } from '../lib/indicators'

const UP = '#34d399'
const DOWN = '#fb7185'

const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', INR: '₹' }

const money = (n, currency) => {
  if (n == null) return '—'
  const prefix = currency ? (CURRENCY_SYMBOLS[currency] ?? '') : ''
  const digits = n >= 100 ? 2 : n >= 1 ? 2 : 5
  return prefix + n.toLocaleString('en-US', { maximumFractionDigits: digits })
}

/** Shared plot geometry. The sub-panes must use the same left/right insets as
 *  the price pane or their x-axes drift out of alignment with the candles. */
const MARGIN = { top: 6, right: 8, left: -6, bottom: 0 }
const Y_WIDTH = 62
const MIN_VISIBLE = 20

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

function CandleTooltip({ active, payload, currency, fmt }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const change = ((d.close - d.open) / d.open) * 100
  const up = d.close >= d.open

  return (
    <div className="pointer-events-none rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{d.fullLabel}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px]">
        {[
          ['O', d.open],
          ['H', d.high],
          ['L', d.low],
          ['C', d.close],
        ].map(([k, v]) => (
          <p key={k} className="flex justify-between gap-3">
            <span className="text-slate-500">{k}</span>
            <span className="num text-slate-200">{(fmt ?? money)(v, currency)}</span>
          </p>
        ))}
      </div>
      <p className={`mt-1.5 num text-[11px] font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {up ? '+' : ''}
        {change.toFixed(2)}%
      </p>
      {d.volume > 0 && <p className="mt-0.5 num text-[10px] text-slate-500">Vol {money(d.volume)}M</p>}
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

const DEFAULT_INDICATORS = { ema20: true, sma50: true, bb: false, volume: true, rsi: false, macd: false, atr: false }

const CandleChart = forwardRef(function CandleChart(
  {
    candles,
    intraday = false,
    height = 460,
    currency = 'USD',
    format = null,
    levels = null,
    indicators = DEFAULT_INDICATORS,
    livePrice = null,
    onViewportChange,
  },
  ref,
) {
  const [wrapperRef, width] = useMeasuredWidth()
  // Display-layer only: values stay in the quote currency everywhere else, so
  // the signal engine and the candle data are never touched by a conversion.
  const fmtValue = format ?? money

  // Viewport is held as a window size plus a distance from the right edge.
  // Anchoring to the end rather than to an absolute index is what makes
  // auto-scroll fall out for free: while `anchor` is 0 the newest candle stays
  // pinned as the series grows, and panning back simply raises it.
  const [size, setSize] = useState(120)
  const [anchor, setAnchor] = useState(0)
  const [paused, setPaused] = useState(false)
  const [cursor, setCursor] = useState(null)
  const dragRef = useRef(null)
  const gridRectRef = useRef(null)

  const total = candles?.length ?? 0
  const visible = Math.min(size, total)
  const maxAnchor = Math.max(0, total - visible)
  const clampedAnchor = paused ? Math.min(anchor, maxAnchor) : 0
  const start = Math.max(0, total - visible - clampedAnchor)
  const end = start + visible

  useImperativeHandle(
    ref,
    () => ({
      reset: () => {
        setSize(120)
        setAnchor(0)
        setPaused(false)
      },
      setPaused,
      isPaused: () => paused,
    }),
    [paused],
  )

  useEffect(() => {
    onViewportChange?.({ size: visible, anchor: clampedAnchor, paused })
  }, [visible, clampedAnchor, paused, onViewportChange])

  /* ---- indicators, computed on the full series then sliced ----
     Computing after slicing would restart every moving average at the left
     edge of the viewport, so the same candle would show a different EMA
     depending on how far you had zoomed in. */
  const series = useMemo(() => {
    const closes = (candles ?? []).map((c) => c.close)
    return {
      ema20: indicators.ema20 ? ema(closes, 20) : null,
      sma50: indicators.sma50 ? sma(closes, 50) : null,
      bb: indicators.bb ? bollinger(closes, 20, 2) : null,
      rsi: indicators.rsi ? rsi(closes, 14) : null,
      macd: indicators.macd ? macd(closes) : null,
      atr: indicators.atr ? atr(candles ?? [], 14) : null,
    }
  }, [candles, indicators])

  const data = useMemo(() => {
    if (!candles?.length) return []
    return candles.slice(start, end).map((c, k) => {
      const i = start + k
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
        ema20: series.ema20?.[i] ?? null,
        sma50: series.sma50?.[i] ?? null,
        bbUpper: series.bb?.upper[i] ?? null,
        bbLower: series.bb?.lower[i] ?? null,
        bbMid: series.bb?.mid[i] ?? null,
        rsi: series.rsi?.[i] ?? null,
        macdLine: series.macd?.line[i] ?? null,
        macdSignal: series.macd?.signal[i] ?? null,
        macdHist: series.macd?.histogram[i] ?? null,
        atr: series.atr?.[i] ?? null,
      }
    })
  }, [candles, start, end, intraday, series])

  const domain = useMemo(() => {
    if (!data.length) return ['auto', 'auto']
    const marks = []
    if (levels) marks.push(levels.target, levels.stop, levels.entry)
    if (livePrice) marks.push(livePrice)
    const clean = marks.filter((v) => Number.isFinite(v))
    const min = Math.min(...data.map((c) => c.low), ...clean)
    const max = Math.max(...data.map((c) => c.high), ...clean)
    const pad = (max - min) * 0.06 || max * 0.02
    return [+(min - pad).toFixed(2), +(max + pad).toFixed(2)]
  }, [data, levels, livePrice])

  /* ---- zoom and pan ---- */
  const onWheel = useCallback(
    (e) => {
      if (!total) return
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.18 : 0.85
      setSize((s) => Math.round(Math.max(MIN_VISIBLE, Math.min(total, s * factor))))
    },
    [total],
  )

  // Wheel must be bound natively: React's onWheel is passive, so preventDefault
  // inside it is ignored and the page scrolls while you try to zoom.
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return undefined
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel, wrapperRef])

  const onPointerDown = (e) => {
    if (e.button !== 0) return
    dragRef.current = { x: e.clientX, anchor: clampedAnchor }
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e) => {
    // Crosshair geometry comes from the grid rect rather than the wrapper, so
    // the readout lines up with the plot area and not the axis gutters.
    const grid = e.currentTarget.querySelector('.recharts-cartesian-grid rect')
    if (grid) gridRectRef.current = grid.getBoundingClientRect()
    const rect = gridRectRef.current
    if (rect) {
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        const [lo, hi] = domain
        // Offsets are resolved to wrapper-relative here, once, rather than in
        // the overlay's style props — that was three layout reads per render.
        const wrap = e.currentTarget.getBoundingClientRect()
        setCursor({
          y,
          price: Number.isFinite(lo) ? hi - (y / rect.height) * (hi - lo) : null,
          w: rect.width,
          ox: rect.left - wrap.left,
          oy: rect.top - wrap.top,
        })
      } else {
        setCursor(null)
      }
    }

    const drag = dragRef.current
    if (!drag || !rect) return
    const perCandle = rect.width / Math.max(visible, 1)
    const moved = Math.round((e.clientX - drag.x) / perCandle)
    if (moved === 0) return
    const next = Math.max(0, Math.min(maxAnchor, drag.anchor + moved))
    if (next !== clampedAnchor) {
      setPaused(true)
      setAnchor(next)
    }
  }

  const endDrag = () => {
    dragRef.current = null
  }

  if (!candles?.length) {
    return (
      <div className="grid h-[320px] place-items-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">
        No price history available for this asset offline.
      </div>
    )
  }

  const hasVolume = indicators.volume && candles.some((c) => c.volume > 0)
  const subPanes = [indicators.rsi, indicators.macd, indicators.atr].filter(Boolean).length
  const priceHeight = Math.max(220, height - (hasVolume ? 80 : 0) - subPanes * 96)

  const priceLine = livePrice ?? candles[candles.length - 1]?.close
  const lastCandle = candles[candles.length - 1]
  const priceUp = lastCandle ? lastCandle.close >= lastCandle.open : true

  return (
    <div
      ref={wrapperRef}
      className="relative select-none"
      style={{ cursor: dragRef.current ? 'grabbing' : 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={() => {
        endDrag()
        setCursor(null)
      }}
    >
      {/* Crosshair. Drawn as an overlay rather than through Recharts so the
          horizontal arm and its price tag exist at all — the built-in cursor
          is vertical only. */}
      {cursor && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute border-t border-dashed border-white/25" style={{ left: cursor.ox, top: cursor.oy + cursor.y, width: cursor.w }} />
          {cursor.price != null && (
            <div
              className="absolute rounded bg-slate-200 px-1.5 py-0.5 num text-[10px] font-bold text-ink-950"
              style={{ left: cursor.ox + cursor.w + 2, top: cursor.oy + cursor.y - 8 }}
            >
              {fmtValue(cursor.price, currency)}
            </div>
          )}
        </div>
      )}

      <div style={{ height: priceHeight }}>
        {width > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={MARGIN}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(data.length / 10) - 1)} minTickGap={14} />
              <YAxis domain={domain} tickLine={false} axisLine={false} width={Y_WIDTH} orientation="right" tickFormatter={(v) => fmtValue(v, currency)} />
              <Tooltip content={<CandleTooltip currency={currency} fmt={format} />} cursor={{ stroke: 'rgba(255,255,255,.25)', strokeDasharray: '3 3' }} />

              {indicators.bb && (
                <>
                  <Line type="monotone" dataKey="bbUpper" name="BB upper" stroke="#94a3b8" strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="bbLower" name="BB lower" stroke="#94a3b8" strokeWidth={1} dot={false} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="bbMid" name="BB mid" stroke="#64748b" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
                </>
              )}

              <Bar dataKey="range" shape={<Candle />} isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} />
                ))}
              </Bar>

              {indicators.ema20 && <Line type="monotone" dataKey="ema20" name="EMA 20" stroke="#818cf8" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />}
              {indicators.sma50 && <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#f0abfc" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />}

              {/* Bot levels. Entry/stop/target come from the signal engine and
                  are never drawn unless it produced them. */}
              {levels?.entry != null && (
                <ReferenceLine y={levels.entry} stroke="#38bdf8" strokeDasharray="4 4" strokeWidth={1.25} label={{ value: `entry ${fmtValue(levels.entry, currency)}`, position: 'insideLeft', fill: '#38bdf8', fontSize: 10 }} />
              )}
              {levels?.target != null && (
                <ReferenceLine y={levels.target} stroke={UP} strokeDasharray="5 4" strokeWidth={1.25} label={{ value: `target ${fmtValue(levels.target, currency)}`, position: 'insideTopLeft', fill: UP, fontSize: 10 }} />
              )}
              {levels?.stop != null && (
                <ReferenceLine y={levels.stop} stroke={DOWN} strokeDasharray="5 4" strokeWidth={1.25} label={{ value: `stop ${fmtValue(levels.stop, currency)}`, position: 'insideBottomLeft', fill: DOWN, fontSize: 10 }} />
              )}

              {/* Current price */}
              {priceLine != null && (
                <ReferenceLine
                  y={priceLine}
                  stroke={priceUp ? UP : DOWN}
                  strokeWidth={1}
                  strokeDasharray="2 2"
                  label={{ value: fmtValue(priceLine, currency), position: 'right', fill: priceUp ? UP : DOWN, fontSize: 10, fontWeight: 700 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {hasVolume && width > 0 && (
        <div className="mt-1 h-[72px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={MARGIN}>
              <XAxis dataKey="label" hide />
              <YAxis width={Y_WIDTH} orientation="right" tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v)}M`} />
              <Tooltip content={<CandleTooltip currency={currency} fmt={format} />} cursor={{ fill: 'rgba(255,255,255,.04)' }} />
              <Bar dataKey="volume" isAnimationActive={false}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.close >= d.open ? 'rgba(52,211,153,.45)' : 'rgba(251,113,133,.45)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {indicators.rsi && width > 0 && (
        <SubPane title="RSI 14" data={data}>
          <Line type="monotone" dataKey="rsi" stroke="#fbbf24" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
          <ReferenceLine y={70} stroke="rgba(251,113,133,.4)" strokeDasharray="3 3" />
          <ReferenceLine y={30} stroke="rgba(52,211,153,.4)" strokeDasharray="3 3" />
        </SubPane>
      )}

      {indicators.macd && width > 0 && (
        <SubPane title="MACD 12,26,9" data={data} domain={['auto', 'auto']}>
          <ReferenceLine y={0} stroke="rgba(255,255,255,.15)" />
          <Line type="monotone" dataKey="macdLine" stroke="#818cf8" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="macdSignal" stroke="#f0abfc" strokeWidth={1.2} strokeDasharray="3 3" dot={false} connectNulls isAnimationActive={false} />
        </SubPane>
      )}

      {indicators.atr && width > 0 && (
        <SubPane title="ATR 14" data={data} domain={['auto', 'auto']}>
          <Line type="monotone" dataKey="atr" stroke="#22d3ee" strokeWidth={1.4} dot={false} connectNulls isAnimationActive={false} />
        </SubPane>
      )}
    </div>
  )
})

function SubPane({ title, data, domain = [0, 100], children }) {
  return (
    <div className="relative mt-1 h-[88px] border-t border-white/[0.06] pt-1">
      <span className="absolute left-1 top-1 z-10 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{title}</span>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={MARGIN}>
          <XAxis dataKey="label" hide />
          <YAxis domain={domain} width={Y_WIDTH} orientation="right" tickLine={false} axisLine={false} />
          {children}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default CandleChart
