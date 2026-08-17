import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Coins, Globe, RefreshCw, TrendingUp, Wifi, WifiOff, Zap } from 'lucide-react'
import { Card, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import CandleChart from '../components/CandleChart'
import ChartToolbar from '../components/ChartToolbar'
import BotSignalPanel from '../components/BotSignalPanel'
import TradingStatusBar from '../components/TradingStatusBar'
import LiveValue from '../components/LiveValue'
import { useMarket } from '../context/MarketContext'
import { RANGES, WATCHLIST, getCandles } from '../lib/market/marketApi'
import { INDICES, STOCKS, STOCK_RANGES, formatPrice, getIndexQuotes, getStockCandles, getStockQuotes } from '../lib/market/stockApi'
import { INTERVAL_MS, mergeLiveCandle } from '../lib/market/liveCandles'
import { detectCurrency, formatIn, getRate } from '../lib/market/fx'
import { getUsdtPeg } from '../lib/market/peg'
import { explainSignal, generateSignal, MIN_CANDLES } from '../lib/trading/signals'
import { DAO_STATS } from '../lib/demo/mockData'
import { num, usd } from '../lib/format'

/**
 * How often the candle series is reconciled against the exchange. Short enough
 * that a closed candle is corrected quickly, long enough to stay well inside
 * Binance's rate limits for a chart nobody is interacting with.
 */
const CHART_REFRESH_MS = 30_000

const TABS = [
  { key: 'crypto', label: 'Crypto Assets', icon: Coins, hint: 'Treasury crypto assets & live Binance feed' },
  { key: 'stocks', label: 'Tech & Equities', icon: TrendingUp, hint: 'Major tech & AI market equities' },
  { key: 'indices', label: 'World Indices', icon: Globe, hint: 'Global benchmarks across 6 regions' },
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

  const chartRef = useRef(null)
  const terminalRef = useRef(null)
  const [indicators, setIndicators] = useState({ ema20: true, sma50: true, bb: false, volume: true, rsi: false, macd: false, atr: false })
  const [viewport, setViewport] = useState({ size: 120, anchor: 0, paused: false })
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Drives whether the signal panel is collapsible: on a desktop it sits beside
  // the chart and is always open; below that it stacks and can be folded away.
  const [isDesktop, setIsDesktop] = useState(() => (typeof window === 'undefined' ? true : window.innerWidth >= 1280))

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 1280)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fullscreen is tracked from the browser's own event rather than assumed on
  // click, so pressing Escape leaves the button in the right state.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Display currency. Defaults to the viewer's region, but the rate must
  // actually load before anything is converted — see src/lib/fx.js for why
  // there is no fallback constant.
  const [display, setDisplay] = useState(detectCurrency)
  const [rate, setRate] = useState(null)
  // Binance quotes crypto in USDT, not USD. Without this the whole board sits
  // ~0.1% above a true-USD reference like TradingView's CRYPTO:BTCUSD.
  const [peg, setPeg] = useState(null)
  useEffect(() => {
    let alive = true
    const pull = () => getUsdtPeg().then((r) => alive && setPeg(r))
    pull()
    const t = setInterval(pull, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    let alive = true
    getRate(display).then((r) => alive && setRate(r))
    return () => {
      alive = false
    }
  }, [display])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.()
    else terminalRef.current?.requestFullscreen?.().catch(() => {})
  }, [])

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

    const load = (fresh) =>
      (isCrypto ? getCandles(symbol, rangeKey, { fresh }) : getStockCandles(symbol, rangeKey, { fresh }))
        .then((res) => alive && setChart(res))
        .catch(() => {
          /* keep the last good series rather than blanking the chart */
        })

    load(false).finally(() => alive && setChartLoading(false))

    // The websocket keeps the newest candle moving, but only the exchange knows
    // the true open/high/low/volume once a candle closes. This reconciles the
    // series against the source periodically so the live approximation never
    // accumulates. No spinner: refreshing in place must not blank the chart.
    const timer = setInterval(() => load(true), CHART_REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [isCrypto, symbol, rangeKey])

  const select = (next) => setSelection((s) => ({ ...s, [tab]: { ...s[tab], ...next } }))

  const rows = isCrypto ? market.tickers : (equity[tab]?.rows ?? [])
  const quotesMeta = isCrypto
    ? { source: market.source, stale: market.stale, capturedAt: market.capturedAt }
    : { source: equity[tab]?.source, stale: equity[tab]?.stale, capturedAt: equity[tab]?.capturedAt }

  const active = rows.find((r) => r.symbol === symbol)
  const restCandles = chart?.candles ?? []

  // Crypto ticks arrive about once a second over the websocket, so the newest
  // candle is rebuilt from them rather than waiting on the next REST refresh.
  // Equities have no such stream and their candles are only as fresh as the
  // poll, so they are passed through untouched instead of being animated with
  // a price the exchange has not actually printed into a bar.
  const livePrice = isCrypto ? active?.price : null
  const candles = useMemo(
    () => (isCrypto ? mergeLiveCandle(restCandles, livePrice, INTERVAL_MS[rangeKey]) : restCandles),
    [restCandles, livePrice, isCrypto, rangeKey],
  )
  // What the exchange quotes this instrument in. NSE listings already come
  // back in INR, so they are shown as-is rather than round-tripped.
  const currency = isCrypto ? 'USD' : (chart?.currency ?? active?.currency ?? 'USD')

  // Conversion applies only to USD-quoted instruments, and only once a real
  // rate has loaded. Anything quoted in a third currency (GBP, JPY, HKD) is
  // left alone: converting it would need a second rate this does not fetch.
  const converting = currency === 'USD' && display !== 'USD' && rate != null
  // Crypto only: equities are already quoted in real currency by the exchange.
  const pegFactor = isCrypto && peg != null ? peg : 1

  const priceOf = useCallback(
    (v) => {
      if (v == null) return '—'
      const usd = v * pegFactor
      if (converting) return formatIn(usd * rate, display)
      if (currency === 'USD') return isCrypto ? cryptoPrice(usd) : formatPrice(usd, 'USD')
      return formatPrice(v, currency)
    },
    [converting, rate, display, currency, isCrypto, pegFactor],
  )

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

  // Keyboard navigation for sub-tabs (1, 2, 3)
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.key === '1') setTab('crypto')
      if (e.key === '2') setTab('stocks')
      if (e.key === '3') setTab('indices')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const loading = isCrypto ? market.loading : equityLoading
  const intraday = chart?.intraday ?? (isCrypto && (rangeKey === '1D' || rangeKey === '1W'))
  const treasuryUsd = market.valueEth(DAO_STATS.treasuryEth, DAO_STATS.treasuryUsd)

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Live markets"
        title="Markets"
        subtitle="Real prices for crypto, shares and nine world markets. Charts and averages update while you watch."
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

      {/* Enhanced Segmented Tab Switcher */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-black/40 p-1.5 backdrop-blur-xl">
        {TABS.map((t, idx) => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              title={t.hint}
              className={`group flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
                active
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-lg shadow-brand-500/25 scale-[1.02]'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <Icon size={14} className={active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'} />
              <span>{t.label}</span>
              <kbd
                className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[9px] transition ${
                  active ? 'bg-black/30 text-brand-200' : 'bg-white/[0.06] text-slate-500 group-hover:text-slate-300'
                }`}
              >
                {idx + 1}
              </kbd>
            </button>
          )
        })}
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

      {/* Terminal: chart is the primary element, signal panel beside it */}
      <div ref={terminalRef} className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px] items-start">
        <Card className="min-w-0 p-4 sm:p-5">
          {/* Instrument header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h2 className="text-base font-bold text-white sm:text-lg">
                  {active?.name ?? symbol}
                  <span className="ml-2 num text-sm text-slate-500">{isCrypto ? `${symbol} / USD` : symbol}</span>
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
                  className="mt-1 block num text-2xl font-bold tracking-tight text-white sm:text-3xl"
                />
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <TradingStatusBar streaming={isCrypto && market.streaming} source={chart?.source} />
              <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
                {['USD', 'INR'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setDisplay(c)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
                      display === c ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              {display !== 'USD' && currency === 'USD' && (
                <p className="text-[10px] text-slate-600">
                  {rate ? `converted @ ₹${rate.toFixed(2)}/$` : 'rate unavailable — showing USD'}
                </p>
              )}
            </div>
          </div>

          {/* Instruments */}
          <div className="mt-3 flex flex-wrap gap-1">
            {(isCrypto ? WATCHLIST : tab === 'stocks' ? STOCKS : INDICES).map((c) => (
              <button
                key={c.symbol}
                onClick={() => select({ symbol: c.symbol })}
                className={`rounded-lg px-2 py-1 num text-xs font-semibold transition ${
                  symbol === c.symbol ? 'bg-white/10 text-white' : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-300'
                }`}
              >
                {c.symbol}
              </button>
            ))}
          </div>

          <div className="mt-3 border-t border-white/[0.06] pt-3">
            <ChartToolbar
              ranges={ranges}
              rangeKey={rangeKey}
              onRange={(key) => select({ range: key })}
              indicators={indicators}
              onToggleIndicator={(key) => setIndicators((s) => ({ ...s, [key]: !s[key] }))}
              onReset={() => chartRef.current?.reset()}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={isFullscreen}
              paused={viewport.paused}
              onTogglePause={() => chartRef.current?.setPaused(!viewport.paused)}
            />
          </div>

          <div className="mt-3 min-w-0" data-demo="candles">
            {chartLoading ? (
              <Skeleton className="h-[440px] w-full" />
            ) : (
              <CandleChart
                ref={chartRef}
                candles={candles}
                intraday={intraday}
                currency={currency}
                format={priceOf}
                height={isFullscreen ? Math.max(460, window.innerHeight - 300) : 440}
                indicators={indicators}
                livePrice={isCrypto ? (active?.price ?? null) : null}
                levels={signal.ok && signal.direction !== 'flat' ? signal.levels : null}
                onViewportChange={setViewport}
              />
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/[0.06] pt-2.5 text-[10px] text-slate-500">
            {stats && (
              <>
                <span>H {priceOf(stats.high)}</span>
                <span>L {priceOf(stats.low)}</span>
                <span>Vol {stats.volume > 0 ? `${num(stats.volume, 0)}M` : '—'}</span>
              </>
            )}
            <span className="text-slate-600">scroll to zoom · drag to pan</span>
            {isCrypto && (
              <span className="text-slate-600" title="Binance quotes in USDT; converted to true USD so prices match a USD reference.">
                {peg != null ? `USDT→USD @ ${peg.toFixed(5)}` : 'USDT-quoted (peg unavailable)'}
              </span>
            )}
            {chart?.source && <span className="ml-auto">Candles: {chart.source}</span>}
          </div>
        </Card>

        <div className="space-y-4 min-w-0 xl:sticky xl:top-20 xl:self-start">
          {chartLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : (
            <BotSignalPanel signal={signal} priceOf={priceOf} collapsible={!isDesktop} />
          )}

          {/* Quick Trade Transition */}
          <Link
            to="/trading"
            className="flex items-center justify-between rounded-xl border border-brand-500/40 bg-gradient-to-r from-brand-600/20 to-accent/20 p-3.5 text-xs font-semibold text-white transition hover:border-brand-500/70 hover:from-brand-600/30 hover:to-accent/30 shadow-md"
          >
            <div className="flex items-center gap-2">
              <Zap size={15} className="text-brand-300" />
              <span>Execute {symbol} on Trade Desk</span>
            </div>
            <ArrowRight size={14} className="text-brand-300" />
          </Link>

          {/* Live Market Overview Snapshot */}
          <Card className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Market Snapshot · {symbol}</p>
            <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/[0.05] bg-black/20 p-2 text-center">
                <span className="text-[10px] text-slate-500">24h High</span>
                <p className="mt-0.5 font-mono font-semibold text-slate-200">{stats?.high ? priceOf(stats.high) : '—'}</p>
              </div>
              <div className="rounded-lg border border-white/[0.05] bg-black/20 p-2 text-center">
                <span className="text-[10px] text-slate-500">24h Low</span>
                <p className="mt-0.5 font-mono font-semibold text-slate-200">{stats?.low ? priceOf(stats.low) : '—'}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-white/[0.05] pt-2 text-[10px] text-slate-400">
              <span>24h Volume</span>
              <span className="font-mono text-slate-200">{stats?.volume ? `${num(stats.volume, 2)}M` : '—'}</span>
            </div>
          </Card>
        </div>
      </div>

      {/* World indices grid */}
      {tab === 'indices' && (
        <Card className="mt-4 p-5">
          <SectionTitle icon={Globe} title="World benchmarks" hint="Click any benchmark to load its live candles above" />
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

      {/* Crypto Treasury Metrics Banner */}
      {isCrypto && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Coins size={14} className="text-brand-400" />
              <span>DAO Treasury Valuation</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold text-white">
              {treasuryUsd == null ? '—' : usd(treasuryUsd, { compact: true })}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {DAO_STATS.treasuryEth} ETH @ {market.ethPrice ? cryptoPrice(market.ethPrice) : '—'}
            </p>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Activity size={14} className="text-emerald-400" />
              <span>Capital Allocation</span>
            </div>
            <p className="mt-2 font-mono text-lg font-bold text-emerald-400">285 ETH Deployed</p>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>Proposals: 100 ETH</span>
              <span>Available: {(DAO_STATS.treasuryEth - 285).toFixed(1)} ETH</span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold">
              <Globe size={14} className="text-sky-400" />
              <span>Execution &amp; Settlement</span>
            </div>
            <p className="mt-2 font-mono text-lg font-bold text-slate-200">Binance / Delta</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Sub-second streaming · True USD Peg</p>
          </Card>
        </div>
      )}

      {/* Full-Width Watchlist Table */}
      <Card className="mt-4 overflow-hidden p-0">
        <div className="p-5 pb-3">
          <SectionTitle
            icon={Activity}
            title={isCrypto ? 'Crypto Market Watchlist' : tab === 'stocks' ? 'Tech & AI Equities Watchlist' : 'Global Index Performance'}
            hint="Click any asset row to chart candles and evaluate bot signals"
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-y border-white/[0.07] bg-white/[0.02]">
                {(isCrypto ? ['Asset', 'Price', '24h Change', '7d Change', 'Market Cap', '7d Trend'] : ['Symbol', 'Name', 'Price', 'Session', 'Trend']).map(
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
            ? 'Prices from CoinGecko, candles from Binance — public endpoints, real-time telemetry.'
            : 'Equities and indices from Yahoo Finance, bridged through the app server.'}
        </p>
      </Card>
    </div>
  )
}
