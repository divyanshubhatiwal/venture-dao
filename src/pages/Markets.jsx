import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Coins, Globe, Minus, RefreshCw, Sparkles, TrendingDown, TrendingUp, Wifi, WifiOff } from 'lucide-react'
import { Card, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import CandleChart from '../components/CandleChart'
import LiveValue, { LiveBadge } from '../components/LiveValue'
import { useMarket } from '../context/MarketContext'
import { RANGES, WATCHLIST, getCandles } from '../lib/marketApi'
import { INDICES, STOCKS, STOCK_RANGES, formatPrice, getIndexQuotes, getStockCandles, getStockQuotes } from '../lib/stockApi'
import { explainSignal, generateSignal, MIN_CANDLES } from '../lib/signals'
import { DAO_STATS } from '../lib/mockData'
import { num, usd } from '../lib/format'

const TABS = [
  { key: 'crypto', label: 'Crypto', hint: 'The asset class the treasury holds' },
  { key: 'stocks', label: 'Stocks', hint: 'Listed comparables for the AI thesis' },
  { key: 'indices', label: 'World indices', hint: 'Nine benchmarks across six markets' },
]

// Fixed decimals so a ticking price does not change width and shift the layout.
const cryptoPrice = (n) =>
  n == null
    ? '—'
    : n >= 100
      ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : `$${n.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`

function Change({ value, className = '' }) {
  if (value == null) return <span className="text-slate-600">—</span>
  const up = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'} ${className}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {up ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}

/** Inline sparkline, scaled to its own min/max so small moves stay visible. */
function Sparkline({ points, up, className = 'h-8 w-24' }) {
  if (!points?.length) return <div className={className} />
  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const d = points.map((p, i) => `${(i / (points.length - 1)) * 96},${32 - ((p - min) / span) * 28 - 2}`).join(' ')
  return (
    <svg viewBox="0 0 96 32" className={className} preserveAspectRatio="none">
      <polyline points={d} fill="none" stroke={up ? '#34d399' : '#fb7185'} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function SourceBadge({ source, stale, capturedAt }) {
  if (!source) return null
  return (
    <span
      className={`chip ${
        stale ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      }`}
      title={stale && capturedAt ? `Captured ${new Date(capturedAt).toLocaleString()}` : undefined}
    >
      {stale ? <WifiOff size={11} /> : <Wifi size={11} />}
      {stale ? `Snapshot · ${source}` : `Live · ${source}`}
    </span>
  )
}

function IndexCard({ row, active, onSelect }) {
  const up = row.change >= 0
  return (
    <button
      onClick={() => onSelect(row.symbol)}
      className={`rounded-xl border p-4 text-left transition ${
        active ? 'border-brand-500/50 bg-brand-500/[0.08]' : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{row.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-500">{row.region}</p>
        </div>
        <Sparkline points={row.sparkline} up={up} className="h-7 w-16 shrink-0" />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <p className="font-mono text-base font-bold text-white">{formatPrice(row.price, row.currency)}</p>
        <Change value={row.change} className="text-xs" />
      </div>
    </button>
  )
}

const OUTLOOK = {
  long: { word: 'Up', icon: TrendingUp, frame: 'border-emerald-500/30 bg-emerald-500/[0.06]', text: 'text-emerald-300', bar: 'bg-emerald-400' },
  short: { word: 'Down', icon: TrendingDown, frame: 'border-rose-500/30 bg-rose-500/[0.06]', text: 'text-rose-300', bar: 'bg-rose-400' },
  flat: { word: 'Sideways', icon: Minus, frame: 'border-white/10 bg-white/[0.03]', text: 'text-slate-300', bar: 'bg-slate-400' },
}

/**
 * The agent's read on the chart above: which way it leans, how hard, and why.
 *
 * The word is deliberately "lean", not "will". The engine is weighted technical
 * analysis over price history — it has no view on news, earnings or macro, and
 * confidence here measures how much its own checks agree with each other, not
 * the probability of being right. Presenting agreement as certainty is the one
 * dishonest thing this panel could do, so the checks that disagree are shown
 * next to the ones that don't.
 */
function Outlook({ signal, candles, priceOf }) {
  if (!signal.ok) {
    return (
      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <Sparkles size={14} className="shrink-0 text-slate-500" />
        <p className="text-xs text-slate-500">
          Not enough history for a read — {candles.length} candles loaded, {MIN_CANDLES} needed. Try a longer range.
        </p>
      </div>
    )
  }

  const look = OUTLOOK[signal.direction]
  const Icon = look.icon
  const agreeing = signal.checks.filter((c) => c.verdict === (signal.direction === 'short' ? 'bearish' : 'bullish'))
  const opposing = signal.checks.filter((c) => c.verdict === (signal.direction === 'short' ? 'bullish' : 'bearish'))

  return (
    <div className={`mt-4 rounded-xl border ${look.frame} p-4`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* The verdict */}
        <div className="flex shrink-0 items-center gap-3">
          <span className={`grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.05] ${look.text}`}>
            <Icon size={20} />
          </span>
          <div>
            <p className="label flex items-center gap-1.5">
              <Sparkles size={10} /> Agent outlook
            </p>
            <p className={`text-xl font-bold leading-tight ${look.text}`}>
              {look.word}
              <span className="ml-2 text-xs font-medium text-slate-500">{signal.bias}</span>
            </p>
          </div>
        </div>

        {/* Conviction */}
        <div className="shrink-0 lg:w-40">
          <div className="flex items-baseline justify-between">
            <p className="label">Agreement</p>
            <p className="font-mono text-sm font-bold text-slate-100">{signal.confidence}%</p>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className={`h-full rounded-full ${look.bar}`} style={{ width: `${signal.confidence}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] leading-snug text-slate-600">
            {agreeing.length} of {signal.checks.length} checks agree · {opposing.length} against
          </p>
        </div>

        {/* Reasoning */}
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-slate-400">{explainSignal(signal)}</p>
      </div>

      {/* Every check, with the number it fired on. */}
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/[0.07] pt-3.5">
        {signal.checks.map((c) => (
          <span
            key={c.name}
            title={`weight ${c.weight}`}
            className={`chip ${
              c.verdict === 'bullish'
                ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300'
                : c.verdict === 'bearish'
                  ? 'border-rose-500/25 bg-rose-500/[0.08] text-rose-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-500'
            }`}
          >
            {c.name} <span className="font-mono opacity-70">{c.detail}</span>
          </span>
        ))}
      </div>

      {/* Where it expects to be proved right, and where wrong. */}
      {signal.direction !== 'flat' && (
        <div className="mt-3.5 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-3.5 sm:grid-cols-4">
          {[
            ['If right — target', priceOf(signal.levels.target), 'text-emerald-300'],
            ['If wrong — stop', priceOf(signal.levels.stop), 'text-rose-300'],
            ['Reward : risk', signal.levels.riskReward ? `${signal.levels.riskReward} : 1` : '—', 'text-slate-100'],
            ['Volatility (ATR 14)', priceOf(signal.levels.atr), 'text-slate-100'],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <p className="label">{label}</p>
              <p className={`mt-1 font-mono text-sm font-semibold ${tone}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-600">{signal.disclaimer}</p>
    </div>
  )
}

export default function Markets() {
  const market = useMarket()
  const [tab, setTab] = useState('crypto')

  // One selected symbol and range per asset class, so switching tabs back and
  // forth does not lose what you were looking at.
  const [selection, setSelection] = useState({
    crypto: { symbol: 'ETH', range: '1D' },
    stocks: { symbol: 'NVDA', range: '1D' },
    indices: { symbol: '^GSPC', range: '1D' },
  })
  const [equity, setEquity] = useState({ stocks: null, indices: null })
  const [equityLoading, setEquityLoading] = useState(true)
  const [chart, setChart] = useState(null)
  const [chartLoading, setChartLoading] = useState(true)
  const [showSma, setShowSma] = useState(true)

  const isCrypto = tab === 'crypto'
  const { symbol, range: rangeKey } = selection[tab]
  const ranges = isCrypto ? RANGES : STOCK_RANGES

  const loadEquities = useCallback(async () => {
    const [stocks, indices] = await Promise.all([getStockQuotes(), getIndexQuotes()])
    setEquity({ stocks, indices })
    setEquityLoading(false)
  }, [])

  useEffect(() => {
    loadEquities()
    // Equities have no public stream, so poll them fast enough to feel live.
    const timer = setInterval(loadEquities, 5_000)
    return () => clearInterval(timer)
  }, [loadEquities])

  useEffect(() => {
    let alive = true
    setChartLoading(true)
    const load = isCrypto ? getCandles(symbol, rangeKey) : getStockCandles(symbol, rangeKey)
    load
      .then((res) => alive && setChart(res))
      .finally(() => alive && setChartLoading(false))
    return () => {
      alive = false
    }
  }, [isCrypto, symbol, rangeKey])

  const select = (next) => setSelection((s) => ({ ...s, [tab]: { ...s[tab], ...next } }))

  const rows = isCrypto ? market.tickers : (equity[tab]?.rows ?? [])
  const quotesMeta = isCrypto
    ? { source: market.source, stale: market.stale, capturedAt: market.capturedAt }
    : { source: equity[tab]?.source, stale: equity[tab]?.stale, capturedAt: equity[tab]?.capturedAt }

  const active = rows.find((r) => r.symbol === symbol)
  const candles = chart?.candles ?? []
  const currency = isCrypto ? 'USD' : (chart?.currency ?? active?.currency ?? 'USD')
  const priceOf = (v) => (isCrypto ? cryptoPrice(v) : formatPrice(v, currency))

  // The agent's read on whatever is currently charted. Recomputed as candles
  // stream in, so the outlook tracks the chart rather than the page load.
  const signal = useMemo(() => generateSignal(candles, { symbol, currency }), [candles, symbol, currency])

  const stats = useMemo(() => {
    if (!candles.length) return null
    const first = candles[0]
    const last = candles[candles.length - 1]
    return {
      last: last.close,
      change: ((last.close - first.open) / first.open) * 100,
      high: Math.max(...candles.map((c) => c.high)),
      low: Math.min(...candles.map((c) => c.low)),
      volume: candles.reduce((s, c) => s + (c.volume || 0), 0),
    }
  }, [candles])

  const refreshAll = () => {
    market.refresh()
    loadEquities()
  }

  const loading = isCrypto ? market.loading : equityLoading
  const intraday = chart?.intraday ?? (isCrypto && (rangeKey === '1D' || rangeKey === '1W'))
  const treasuryUsd = market.valueEth(DAO_STATS.treasuryEth, DAO_STATS.treasuryUsd)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Live markets"
        title="Market Data"
        subtitle="Real prices from public exchange and market-data APIs — crypto, listed equities and nine world indices. Candles, volume and moving averages update while you watch."
        actions={
          <>
            <SourceBadge {...quotesMeta} />
            <button onClick={refreshAll} className="btn-ghost">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        }
      />

      {/* Asset class */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            title={t.hint}
            className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
              tab === t.key ? 'bg-gradient-to-r from-brand-500/25 to-accent/15 text-white' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {quotesMeta.stale && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-100/90">
            The market data provider is unreachable, so these are real prices captured on{' '}
            {quotesMeta.capturedAt ? new Date(quotesMeta.capturedAt).toLocaleDateString() : 'an earlier date'} rather than live
            quotes. The chart stays honest about which is which.
          </p>
        </div>
      )}

      {/* Price header + chart */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-lg font-bold text-white">
                {active?.name ?? symbol}
                <span className="ml-2 font-mono text-sm text-slate-500">{isCrypto ? `${symbol} / USD` : symbol}</span>
              </h2>
              {active && <Change value={isCrypto ? active.change24h : active.change} className="text-sm" />}
              <span className="text-[11px] text-slate-600">{isCrypto ? '24h' : 'session'}</span>
            </div>
            {loading && !active ? (
              <Skeleton className="mt-2 h-8 w-40" />
            ) : (
              <LiveValue
                value={active?.price ?? stats?.last}
                format={priceOf}
                className="mt-1 block font-mono text-3xl font-bold tracking-tight text-white"
              />
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
              {isCrypto ? (
                <>
                  <LiveBadge live={market.streaming} label={market.streaming ? 'streaming' : 'polling'} />
                  <span>
                    {market.streaming ? 'Binance websocket · ticks as they print' : 'Websocket reconnecting — polling every 60s'}
                  </span>
                </>
              ) : (
                <>
                  <LiveBadge live={Boolean(active?.marketOpen)} label={active?.marketOpen ? 'market open' : 'market closed'} />
                  <span>
                    {[chart?.exchange, chart?.marketTime ? `last trade ${new Date(chart.marketTime).toLocaleString()}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:items-end">
            <div className="flex flex-wrap gap-1.5 lg:justify-end">
              {(isCrypto ? WATCHLIST : tab === 'stocks' ? STOCKS : INDICES).map((c) => (
                <button
                  key={c.symbol}
                  onClick={() => select({ symbol: c.symbol })}
                  className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-semibold transition ${
                    symbol === c.symbol ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                  }`}
                >
                  {c.symbol}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
              {ranges.map((r) => (
                <button
                  key={r.key}
                  onClick={() => select({ range: r.key })}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    rangeKey === r.key ? 'bg-brand-500/20 text-brand-200' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={() => setShowSma((s) => !s)}
                className={`ml-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  showSma ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                }`}
              >
                SMA
              </button>
            </div>
          </div>
        </div>

        {stats && (
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-4">
            {[
              ['Window change', null, <Change key="c" value={stats.change} />],
              ['Window high', priceOf(stats.high)],
              ['Window low', priceOf(stats.low)],
              ['Volume', stats.volume > 0 ? `${num(stats.volume, 0)}M` : '—'],
            ].map(([label, text, node]) => (
              <div key={label}>
                <p className="label">{label}</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-100">{node ?? text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4" data-demo="candles">
          {chartLoading ? (
            <Skeleton className="h-[320px] w-full" />
          ) : (
            <CandleChart
              candles={candles}
              intraday={intraday}
              showSma={showSma}
              currency={currency}
              levels={signal.ok && signal.direction !== 'flat' ? signal.levels : null}
            />
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" /> Close above open
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-rose-400" /> Close below open
          </span>
          {showSma && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-4 bg-brand-400" /> SMA 7
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-4 bg-fuchsia-300" /> SMA 25
              </span>
            </>
          )}
          {signal.ok && signal.direction !== 'flat' && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-4 bg-emerald-400" /> Agent target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-[2px] w-4 bg-rose-400" /> Agent stop
              </span>
            </>
          )}
          {chart?.source && <span className="ml-auto">Candles: {chart.source}</span>}
        </div>

        {chartLoading ? <Skeleton className="mt-4 h-28 w-full" /> : <Outlook signal={signal} candles={candles} priceOf={priceOf} />}
      </Card>

      {/* World indices grid */}
      {tab === 'indices' && (
        <Card className="mt-4 p-5">
          <SectionTitle icon={Globe} title="World indices" hint="Click any benchmark to load its candles" />
          {equityLoading && !rows.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <IndexCard key={row.symbol} row={row} active={row.symbol === symbol} onSelect={(s) => select({ symbol: s })} />
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Watchlist + treasury */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={Coins} title="Treasury at market" hint="DAO holdings valued at the live ETH rate" />
          <p className="font-mono text-2xl font-bold text-white">{treasuryUsd == null ? '—' : usd(treasuryUsd, { compact: true })}</p>
          <p className="mt-1 text-xs text-slate-500">
            {DAO_STATS.treasuryEth} ETH × {market.ethPrice ? cryptoPrice(market.ethPrice) : '—'}
          </p>
          <dl className="mt-4 space-y-2.5 border-t border-white/[0.06] pt-4 text-xs">
            {[
              ['Deployed to positions', '285 ETH'],
              ['Open proposals request', '100 ETH'],
              ['Unallocated', `${(DAO_STATS.treasuryEth - 285).toFixed(2)} ETH`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="font-mono text-slate-200">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
            Treasury and position sizes are demo figures; the price they are valued at is real.
          </p>
        </Card>

        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="p-5 pb-3">
            <SectionTitle
              icon={Activity}
              title={isCrypto ? 'Crypto watchlist' : tab === 'stocks' ? 'Equity watchlist' : 'Index levels'}
              hint={isCrypto ? 'Sectors the DAO invests across' : 'Click any row to load its candles'}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-y border-white/[0.07] bg-white/[0.02]">
                  {(isCrypto ? ['Asset', 'Price', '24h', '7d', 'Market cap', '7d trend'] : ['Symbol', 'Name', 'Price', 'Session', 'Trend']).map(
                    (h, i) => (
                      <th
                        key={h}
                        className={`px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                          i === 0 || (!isCrypto && i === 1) ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {loading && !rows.length
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-5 py-3">
                          <Skeleton className="h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  : rows.map((t) => (
                      <tr
                        key={t.symbol}
                        onClick={() => select({ symbol: t.symbol })}
                        className={`cursor-pointer transition hover:bg-white/[0.04] ${symbol === t.symbol ? 'bg-white/[0.03]' : ''}`}
                      >
                        {isCrypto ? (
                          <>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono text-xs font-bold text-slate-100">{t.symbol}</span>
                                <span className="truncate text-xs text-slate-500">{t.name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-slate-100">
                              <LiveValue value={t.price} format={cryptoPrice} />
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Change value={t.change24h} />
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Change value={t.change7d} />
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-slate-400">
                              {t.marketCap ? usd(t.marketCap, { compact: true }) : '—'}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-5 py-3 font-mono text-xs font-bold text-slate-100">{t.symbol}</td>
                            <td className="px-5 py-3">
                              <span className="text-xs text-slate-300">{t.name}</span>
                              <span className="ml-2 text-[10px] text-slate-600">{t.region}</span>
                            </td>
                            <td className="px-5 py-3 text-right font-mono text-slate-100">
                              <LiveValue value={t.price} format={(v) => formatPrice(v, t.currency)} />
                            </td>
                            <td className="px-5 py-3 text-right">
                              <Change value={t.change} />
                            </td>
                          </>
                        )}
                        <td className="py-3 pr-5 text-right">
                          <div className="flex justify-end">
                            <Sparkline points={t.sparkline} up={(isCrypto ? (t.change7d ?? t.change24h) : t.change) >= 0} />
                          </div>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-white/[0.06] px-5 py-3 text-[11px] text-slate-600">
            {isCrypto
              ? 'Prices from CoinGecko, candles from Binance — public endpoints, no API key.'
              : 'Equities and indices from Yahoo Finance, bridged through the app server because Yahoo sends no CORS headers.'}
          </p>
        </Card>
      </div>
    </div>
  )
}
