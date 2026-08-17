import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Check,
  Compass,
  Gauge,
  History,
  Info,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  Square,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { Card, ChartTooltip, Chip, EmptyState, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import LiveValue, { LiveBadge } from '../components/LiveValue'
import MarketNews from '../components/MarketNews'
import { useTrading } from '../context/TradingContext'
import { useMarket } from '../context/MarketContext'
import { useEpisodes } from '../context/EpisodeContext'
import { useDemo } from '../context/DemoContext'
import { useToast } from '../context/ToastContext'
import { getMacro } from '../lib/market/macro'
import { adjustConfidence } from '../lib/agent/episodes'
import { getCandles, WATCHLIST } from '../lib/market/marketApi'
import { getStockCandles, getStockQuotes, STOCKS } from '../lib/market/stockApi'
import { explainSignal, generateSignal } from '../lib/trading/signals'
import { backtest, verdict } from '../lib/trading/backtest'
import { VENUES } from '../lib/trading/venues'
import { num } from '../lib/format'

/** Hard cap on any single position, as a percentage of account equity. */
const MAX_NOTIONAL_PCT = 20

/** Symbols the signal engine scans. Kept small so a scan is a handful of calls. */
const UNIVERSE = [
  { symbol: 'ETH', name: 'Ethereum', assetClass: 'crypto' },
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto' },
  { symbol: 'SOL', name: 'Solana', assetClass: 'crypto' },
  { symbol: 'NVDA', name: 'NVIDIA', assetClass: 'stocks' },
  { symbol: 'AAPL', name: 'Apple', assetClass: 'stocks' },
  { symbol: 'TSLA', name: 'Tesla', assetClass: 'stocks' },
]

// Fixed decimals: a live number that changes width makes the table jitter.
const money = (n, digits = 2) =>
  n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`

const toneClass = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  slate: 'border-white/15 bg-white/5 text-slate-300',
}

function Pnl({ value, pct, className = '', live = false }) {
  if (value == null) return <span className="text-slate-600">—</span>
  const up = value >= 0
  const body = (
    <>
      {up ? '+' : ''}
      {value.toFixed(2)}
      {pct != null && <span className="ml-1 text-[10px] opacity-80">({up ? '+' : ''}{pct.toFixed(2)}%)</span>}
    </>
  )
  const tone = `font-mono font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'} ${className}`

  if (!live) return <span className={tone}>{body}</span>
  return <LiveValue value={value} className={tone} format={() => body} />
}

function SignalCard({ signal, name, onTrade, busy, tuned }) {
  const [open, setOpen] = useState(false)
  if (!signal?.ok) return null

  const long = signal.direction === 'long'
  const flat = signal.direction === 'flat'

  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition hover:border-white/20">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-slate-100">{signal.symbol}</span>
              <span className="truncate text-xs text-slate-500">{name}</span>
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-white">{money(signal.price, signal.price >= 100 ? 2 : 4)}</p>
          </div>
          <div className="text-right">
            <Chip tone={toneClass[signal.tone]}>{signal.bias}</Chip>
            <p className="mt-1.5 text-[10px] text-slate-500">
              {tuned?.adjustment ? (
                <>
                  <span className="line-through opacity-60">{signal.confidence}%</span>{' '}
                  <span className={tuned.adjustment > 0 ? 'text-emerald-400' : 'text-amber-400'}>{tuned.confidence}%</span> agreement
                </>
              ) : (
                `${signal.confidence}% agreement`
              )}
            </p>
          </div>
        </div>

        {/* Level matrix or Neutral indicator metrics */}
        <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-white/[0.06] bg-black/20 p-2.5 text-center">
          {[
            ['Entry', signal.levels?.entry ?? signal.price, 'text-slate-200'],
            ['Stop', signal.levels?.stop ?? (signal.price ? signal.price * 0.98 : null), 'text-rose-300'],
            ['Target', signal.levels?.target ?? (signal.price ? signal.price * 1.04 : null), 'text-emerald-300'],
          ].map(([label, value, tone]) => (
            <div key={label}>
              <p className="text-[9px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className={`mt-0.5 font-mono text-xs font-semibold ${tone}`}>{value ? money(value, value >= 100 ? 2 : 4) : '—'}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-slate-400 line-clamp-2">{explainSignal(signal)}</p>

        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-2 text-[11px] font-semibold text-brand-300 transition hover:text-brand-200"
        >
          {open ? 'Hide' : 'Show'} the {signal.checks.length} checks
        </button>

        {open && (
          <ul className="mt-2 space-y-1.5 border-t border-white/[0.06] pt-2">
            {signal.checks.map((c) => (
              <li key={c.name} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    c.verdict === 'bullish' ? 'bg-emerald-400' : c.verdict === 'bearish' ? 'bg-rose-400' : 'bg-slate-600'
                  }`}
                />
                <span className="text-slate-300">{c.name}</span>
                <span className="text-slate-500">{c.detail}</span>
                {c.weight > 0 && <span className="ml-auto font-mono text-slate-600">w{c.weight}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={() => onTrade(signal)}
        disabled={busy}
        className={`btn-sm mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-lg border font-semibold text-xs transition ${
          flat
            ? 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
            : long
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              : 'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
        }`}
      >
        {busy ? (
          <Loader2 size={13} className="animate-spin" />
        ) : long ? (
          <TrendingUp size={13} />
        ) : flat ? (
          <Activity size={13} />
        ) : (
          <TrendingDown size={13} />
        )}
        {flat ? `Trade ${signal.symbol}` : `Load ${long ? 'Long' : 'Short'} Ticket`}
      </button>
    </div>
  )
}

export default function Trading() {
  const trading = useTrading()
  const market = useMarket()
  const { toast } = useToast()
  const { episodes, aggregates, open: openEpisode } = useEpisodes()
  const { registerAction } = useDemo()
  const [regime, setRegime] = useState(null)
  const regimeRef = useRef(null)
  regimeRef.current = regime

  const [signals, setSignals] = useState({})
  const [scanning, setScanning] = useState(true)
  const [ticket, setTicket] = useState({ symbol: 'ETH', assetClass: 'crypto', side: 'buy', type: 'market', qty: 1, limitPrice: '', stop: '', target: '' })
  const [submitting, setSubmitting] = useState(false)
  const [agent, setAgent] = useState({
    enabled: false,
    minConfidence: 65,
    riskPct: 1,
    maxPositions: 3,
    // Only trade symbols whose backtest shows an edge. On by default, because
    // the honest finding is that most of them do not.
    requireEdge: true,
    dailyLossLimitPct: 3,
  })
  const agentRef = useRef(agent)
  agentRef.current = agent

  const [tests, setTests] = useState({})
  const [testing, setTesting] = useState(false)
  const testsRef = useRef(tests)
  testsRef.current = tests
  const [halt, setHalt] = useState(null)

  /* ---------- prices into the engine ---------- */

  // Marks are fed by TradingContext itself now, so positions keep marking to
  // market on every screen rather than only this one. This page just reads.

  // Equities have no public stream; poll them hard instead.
  const [equityFeed, setEquityFeed] = useState({ open: null, at: null })
  useEffect(() => {
    let alive = true
    const pull = async () => {
      try {
        const { rows } = await getStockQuotes()
        if (!alive) return
        // Only the session indicator now; the provider owns the marks.
        setEquityFeed({ open: rows.some((r) => r.marketOpen), at: Date.now() })
      } catch {
        /* equities unavailable — crypto marks still flow */
      }
    }
    pull()
    const timer = setInterval(pull, 5_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Macro backdrop, captured into every decision so the reasoning can be judged
  // against the conditions it was taken in.
  useEffect(() => {
    let alive = true
    const pull = () => getMacro().then((m) => alive && setRegime(m.regime)).catch(() => {})
    pull()
    const timer = setInterval(pull, 60_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  /* ---------- signal scan ---------- */

  const scan = useCallback(async () => {
    setScanning(true)
    const next = {}
    await Promise.all(
      UNIVERSE.map(async (asset) => {
        try {
          const res =
            asset.assetClass === 'crypto' ? await getCandles(asset.symbol, '1h') : await getStockCandles(asset.symbol, '1h')
          next[asset.symbol] = generateSignal(res.candles, { symbol: asset.symbol })
        } catch {
          next[asset.symbol] = { ok: false, reason: 'No candles available' }
        }
      }),
    )
    setSignals(next)
    setScanning(false)
    return next
  }, [])

  useEffect(() => {
    scan()
    const timer = setInterval(scan, 120_000)
    return () => clearInterval(timer)
  }, [scan])

  // Judge mode drives the scan from the walkthrough script.
  useEffect(() => registerAction('trading:scan', () => scan()), [registerAction, scan])

  /* ---------- backtest: does this strategy actually work? ---------- */

  const runBacktests = useCallback(async () => {
    setTesting(true)
    const next = {}
    for (const asset of UNIVERSE) {
      try {
        const res =
          asset.assetClass === 'crypto' ? await getCandles(asset.symbol, '1h') : await getStockCandles(asset.symbol, '1h')
        // Trailing stops measurably outperformed fixed stops across this pool,
        // so they are the default the agent is judged on.
        const result = backtest(res.candles, { minConfidence: agentRef.current.minConfidence, riskPct: agentRef.current.riskPct, trailing: true })
        next[asset.symbol] = result.ok ? { ...result, verdict: verdict(result.metrics) } : result
      } catch {
        next[asset.symbol] = { ok: false, reason: 'No candles available' }
      }
      // Yield between symbols so the UI stays responsive during the sweep.
      await new Promise((r) => setTimeout(r, 0))
    }
    setTests(next)
    setTesting(false)
    return next
  }, [])

  useEffect(() => {
    runBacktests()
  }, [runBacktests])

  const hasEdge = useCallback((symbol) => {
    const t = testsRef.current[symbol]
    return Boolean(t?.ok && t.verdict?.pass)
  }, [])

  /* ---------- automation ---------- */

  const runAgent = useCallback(
    async (currentSignals) => {
      const cfg = agentRef.current
      if (!cfg.enabled) return

      // Kill switch: stop for the day once realised losses breach the limit.
      // Capping the downside is the only part of the outcome a system controls.
      const since = new Date().setHours(0, 0, 0, 0)
      const realisedToday = trading.trades.filter((t) => t.exitAt >= since).reduce((s, t) => s + t.pnl, 0)
      const lossLimit = -(trading.equity * cfg.dailyLossLimitPct) / 100
      if (realisedToday <= lossLimit) {
        setHalt(`Daily loss limit hit: ${realisedToday.toFixed(2)} against a ${lossLimit.toFixed(2)} limit.`)
        setAgent((a) => ({ ...a, enabled: false }))
        toast({ tone: 'warning', title: 'Agent halted', description: 'Daily loss limit reached. No further orders today.' })
        return
      }

      // React state does not update inside this loop, so open positions are
      // counted locally — otherwise every pass reads the same stale length and
      // blows straight through maxPositions.
      let openCount = trading.positions.length
      const held = new Set(trading.positions.map((p) => p.symbol))
      if (openCount >= cfg.maxPositions) return

      for (const asset of UNIVERSE) {
        if (openCount >= cfg.maxPositions) break
        const signal = currentSignals[asset.symbol]
        if (!signal?.ok || signal.direction === 'flat') continue
        if (signal.confidence < cfg.minConfidence) continue
        if (held.has(asset.symbol)) continue
        // Evidence gate: no backtested edge, no trade.
        if (cfg.requireEdge && !hasEdge(asset.symbol)) continue

        // Position size from risk budget: risk% of equity ÷ distance to stop.
        const riskBudget = (trading.equity * cfg.riskPct) / 100
        const perUnitRisk = Math.abs(signal.levels.entry - signal.levels.stop)
        if (perUnitRisk <= 0) continue
        let qty = riskBudget / perUnitRisk

        // A tight stop can make risk-based size enormous. Cap the notional so
        // one signal cannot swallow the account.
        const maxNotional = trading.equity * (MAX_NOTIONAL_PCT / 100)
        if (qty * signal.levels.entry > maxNotional) qty = maxNotional / signal.levels.entry
        qty = +qty.toFixed(6)
        if (qty <= 0) continue

        try {
          await trading.placeOrder({
            symbol: asset.symbol,
            assetClass: asset.assetClass,
            side: signal.direction === 'long' ? 'buy' : 'sell',
            type: 'market',
            qty,
            stop: signal.levels.stop,
            target: signal.levels.target,
            source: 'agent',
          })
          setHalt(null)
          openCount += 1
          held.add(asset.symbol)
          openEpisode({
            symbol: asset.symbol,
            assetClass: asset.assetClass,
            direction: signal.direction,
            signal,
            regime: regimeRef.current,
            qty,
            entry: signal.levels.entry,
            source: 'agent',
          })
          toast({
            tone: 'info',
            title: `Agent opened ${signal.direction} ${asset.symbol}`,
            description: `${qty} @ ${money(signal.levels.entry)} · stop ${money(signal.levels.stop)} · practice account`,
          })
        } catch (err) {
          toast({ tone: 'error', title: `Agent could not trade ${asset.symbol}`, description: err.message })
        }
      }
    },
    [trading, toast, hasEdge, openEpisode],
  )

  useEffect(() => {
    if (!agent.enabled) return undefined
    runAgent(signals)
    const timer = setInterval(async () => {
      const fresh = await scan()
      runAgent(fresh)
    }, 120_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.enabled, agent.requireEdge, agent.minConfidence, signals])

  /* ---------- manual ticket ---------- */

  const loadTicket = (signal) => {
    const asset = UNIVERSE.find((a) => a.symbol === signal.symbol)
    setTicket({
      symbol: signal.symbol,
      assetClass: asset?.assetClass ?? 'crypto',
      side: signal.direction === 'long' ? 'buy' : 'sell',
      type: 'market',
      qty: +((trading.equity * 0.01) / Math.abs(signal.levels.entry - signal.levels.stop)).toFixed(4),
      limitPrice: '',
      stop: signal.levels.stop,
      target: signal.levels.target,
    })
    toast({ tone: 'info', title: `Ticket loaded for ${signal.symbol}`, description: 'Review the size and levels before submitting.' })
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      await trading.placeOrder({
        symbol: ticket.symbol,
        assetClass: ticket.assetClass,
        side: ticket.side,
        type: ticket.type,
        qty: +ticket.qty,
        limitPrice: ticket.limitPrice ? +ticket.limitPrice : null,
        stop: ticket.stop ? +ticket.stop : null,
        target: ticket.target ? +ticket.target : null,
      })
      openEpisode({
        symbol: ticket.symbol,
        assetClass: ticket.assetClass,
        direction: ticket.side === 'buy' ? 'long' : 'short',
        signal: signals[ticket.symbol]?.ok ? signals[ticket.symbol] : null,
        regime,
        qty: +ticket.qty,
        entry: ticketPrice,
        source: 'manual',
      })
      toast({ tone: 'success', title: 'Order submitted to the practice account', description: `${ticket.side.toUpperCase()} ${ticket.qty} ${ticket.symbol}` })
    } catch (err) {
      toast({ tone: 'error', title: 'Order rejected', description: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const equityCurve = useMemo(
    () => trading.equityCurve.map((p) => ({ label: new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), equity: p.equity })),
    [trading.equityCurve],
  )

  const ticketPrice = trading.priceOf(ticket.symbol)
  const workingOrders = trading.orders.filter((o) => o.status === 'working')
  const edgeCount = UNIVERSE.filter((a) => tests[a.symbol]?.ok && tests[a.symbol].verdict?.pass).length
  const [tradingTab, setTradingTab] = useState('terminal')

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Practice account"
        title="Trade"
        subtitle="It reads real prices, shows every check behind its decision, and trades a practice account with $100,000 of fake money. No real money is involved."
        actions={
          <>
            {regime && (
              <Link to="/macro" className="btn-ghost" title={regime.summary}>
                <Compass size={15} />
                {regime.label}
              </Link>
            )}
            <button onClick={trading.reset} className="btn-ghost">
              <RotateCcw size={15} />
              Reset account
            </button>
          </>
        }
      />

      {/* Standing disclosure — never let this demo be mistaken for advice */}
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-4">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />
        <div className="text-xs leading-relaxed text-amber-100/90">
          <p className="font-semibold">Simulated trading. Not investment advice.</p>
          <p className="mt-1 text-amber-100/70">
            Signals come from technical indicators on price history alone — no earnings, news, filings or macro. Orders fill in a
            practice account against live prices. Nothing here places a real order or touches real funds, and no exchange API key is
            stored anywhere in this app.
          </p>
        </div>
      </div>

      {/* Account */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          [
            'Equity',
            null,
            trading.totalReturn,
            <LiveValue key="e" value={trading.equity} format={money} className="font-mono text-2xl font-bold text-white" />,
          ],
          ['Cash', money(trading.cash), null],
          ['Open P&L', null, null, <Pnl key="p" value={trading.openPnl} className="text-2xl" live />],
          ['Realised', null, null, <Pnl key="r" value={trading.realised} className="text-2xl" />],
          ['Win rate', trading.winRate != null ? `${trading.winRate}%` : '—', null, null, `${trading.closedCount} closed`],
        ].map(([label, value, delta, node, hint]) => (
          <Card key={label} className="p-4">
            <p className="label">{label}</p>
            {node ? <div className="mt-1.5">{node}</div> : <p className="mt-1.5 font-mono text-2xl font-bold text-white">{value}</p>}
            {delta != null && (
              <p className={`mt-1 font-mono text-[11px] font-semibold ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {delta >= 0 ? '+' : ''}
                {delta}% total
              </p>
            )}
            {hint && <p className="mt-1 text-[11px] text-slate-600">{hint}</p>}
          </Card>
        ))}
      </div>

      {/* Trading Sub-Tabs */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-b border-white/[0.08] pb-3">
        {[
          { id: 'terminal', label: 'Signals & Order Ticket', icon: Activity },
          { id: 'positions', label: 'Open Positions & History', icon: Gauge, badge: trading.positions.length },
          { id: 'backtest', label: 'Strategy Backtest', icon: TrendingUp, badge: `${edgeCount}/${UNIVERSE.length}` },
          { id: 'journal', label: 'AI Decision Journal', icon: History, badge: episodes.length },
        ].map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setTradingTab(id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              tradingTab === id
                ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-md'
                : 'border border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-white'
            }`}
          >
            <Icon size={14} />
            <span>{label}</span>
            {badge != null && badge !== 0 && (
              <span className="rounded-full bg-white/20 px-1.5 py-0.2 font-mono text-[10px] text-white">
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tradingTab === 'terminal' && (
        <div className="mt-4 space-y-4">
          {/* Top Section: Signal scan across full width */}
          <Card className="p-5" data-demo="signals">
            <SectionTitle
              icon={Activity}
              title="Signal scan"
              hint="Hourly candles · RSI, MACD, EMA/SMA trend, Bollinger, volume"
              action={
                scanning ? (
                  <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <Loader2 size={12} className="animate-spin" /> scanning
                  </span>
                ) : (
                  <button onClick={scan} className="btn-ghost btn-sm">
                    Rescan
                  </button>
                )
              }
            />
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {UNIVERSE.map((asset) => {
                const signal = signals[asset.symbol]
                if (!signal) return <div key={asset.symbol} className="skeleton h-52" />
                if (!signal.ok) {
                  return (
                    <div key={asset.symbol} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                      <p className="font-mono text-sm font-bold text-slate-100">{asset.symbol}</p>
                      <p className="mt-2 text-[11px] text-slate-500">{signal.reason}</p>
                    </div>
                  )
                }
                return (
                  <SignalCard
                    key={asset.symbol}
                    signal={signal}
                    name={asset.name}
                    onTrade={loadTicket}
                    busy={submitting}
                    tuned={adjustConfidence(signal, aggregates)}
                  />
                )
              })}
            </div>
          </Card>

          {/* Bottom Section: Order Ticket + Autopilot on Left, Market News on Right */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="space-y-4 lg:col-span-5">
          <Card className="p-5">
            <SectionTitle icon={Target} title="Order ticket" hint="Practice account" />
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={ticket.symbol}
                  onChange={(e) => {
                    const asset = UNIVERSE.find((a) => a.symbol === e.target.value)
                    setTicket((t) => ({ ...t, symbol: e.target.value, assetClass: asset?.assetClass ?? 'crypto' }))
                  }}
                  className="input py-2"
                >
                  {[...WATCHLIST.map((c) => c.symbol), ...STOCKS.map((s) => s.symbol)].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select value={ticket.type} onChange={(e) => setTicket((t) => ({ ...t, type: e.target.value }))} className="input py-2">
                  <option value="market">Market (Immediate)</option>
                  <option value="limit">Limit (Maker)</option>
                  <option value="twap">TWAP Algo (15m Time Slice)</option>
                  <option value="vwap">VWAP Algo (Volume Curve)</option>
                  <option value="iceberg">Iceberg (Stealth Fill)</option>
                </select>
              </div>

              {/* Execution Strategy Badge */}
              {ticket.type !== 'market' && ticket.type !== 'limit' && (
                <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-2 text-[11px] text-brand-200">
                  <span className="font-semibold">⚡ Hedge Fund Execution:</span> Slices order into sub-fills to eliminate slippage and public book footprint.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {['buy', 'sell'].map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setTicket((t) => ({ ...t, side }))}
                    className={`btn border text-xs ${
                      ticket.side === side
                        ? side === 'buy'
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-md'
                          : 'border-rose-500/50 bg-rose-500/15 text-rose-300 shadow-md'
                        : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/25'
                    }`}
                  >
                    {side === 'buy' ? 'Buy / Long' : 'Sell / Short'}
                  </button>
                ))}
              </div>

              <div>
                <label className="label">Quantity</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={ticket.qty}
                  onChange={(e) => setTicket((t) => ({ ...t, qty: e.target.value }))}
                  className="input mt-1 py-2"
                />
              </div>

              {ticket.type === 'limit' && (
                <div>
                  <label className="label">Limit price</label>
                  <input
                    type="number"
                    step="any"
                    value={ticket.limitPrice}
                    onChange={(e) => setTicket((t) => ({ ...t, limitPrice: e.target.value }))}
                    className="input mt-1 py-2"
                    placeholder={ticketPrice ? String(ticketPrice) : ''}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Stop Loss</label>
                  <input
                    type="number"
                    step="any"
                    value={ticket.stop}
                    onChange={(e) => setTicket((t) => ({ ...t, stop: e.target.value }))}
                    className="input mt-1 py-2"
                  />
                </div>
                <div>
                  <label className="label">Take Profit</label>
                  <input
                    type="number"
                    step="any"
                    value={ticket.target}
                    onChange={(e) => setTicket((t) => ({ ...t, target: e.target.value }))}
                    className="input mt-1 py-2"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px]">
                <span className="text-slate-500">Live mark</span>
                <span className="font-mono text-slate-200">{ticketPrice ? money(ticketPrice, ticketPrice >= 100 ? 2 : 4) : '—'}</span>
              </div>

              <button type="submit" disabled={submitting || !ticketPrice} className="btn-primary w-full">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                Execute {ticket.type.toUpperCase()} Order
              </button>
            </form>
          </Card>

          {/* Quick Autopilot Control */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <SectionTitle icon={Bot} title="Autopilot Engine" hint="Auto-execute signals" />
              <Chip tone={agent.enabled ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/15 bg-white/5 text-slate-400'}>
                {agent.enabled ? 'Active' : 'Standby'}
              </Chip>
            </div>
            
            <button
              onClick={() => setAgent((a) => ({ ...a, enabled: !a.enabled }))}
              className={`btn mt-3.5 w-full border text-xs font-semibold ${
                agent.enabled
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              {agent.enabled ? <Square size={14} /> : <Play size={14} />}
              {agent.enabled ? 'Stop Autopilot' : 'Start Autopilot'}
            </button>

            {halt && (
              <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] p-2.5 text-[11px] leading-relaxed text-amber-200">
                {halt}
              </p>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3 text-[11px] text-slate-400">
              <span>Risk Budget: <span className="font-mono text-slate-200">{agent.riskPct}%</span></span>
              <span>Min Agreement: <span className="font-mono text-slate-200">{agent.minConfidence}%</span></span>
            </div>

            <Link
              to="/agent"
              className="mt-3.5 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-2 text-xs font-medium text-brand-300 transition hover:border-white/20 hover:text-brand-200"
            >
              Full Risk & Monte Carlo Settings →
            </Link>
          </Card>
        </div>

        {/* Right side of bottom section: Market News */}
        <div className="lg:col-span-7">
          <MarketNews />
        </div>
      </div>
    </div>
    )}

      {/* Episodes — the decision cycle, reviewed */}
      {tradingTab === 'journal' && (
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="p-5 pb-3">
            <SectionTitle
              icon={History}
              title="Episodes"
              hint="One decision cycle each: reasoning captured at entry, graded after the exit"
              action={
                <span className="text-[11px] text-slate-500">
                  {episodes.length} total · {aggregates.closed} reviewed
                </span>
              }
            />
          </div>

          {episodes.length === 0 ? (
            <EmptyState
              icon={History}
              title="No episodes yet"
              description="Every reasoned order opens an episode. It closes with the trade and is graded a few minutes later, once there is price action to judge the reasoning against."
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {episodes.slice(0, 6).map((e) => {
                const review = e.review
                return (
                  <li key={e.id} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-100">{e.symbol}</span>
                      <Chip tone={e.direction === 'long' ? toneClass.emerald : toneClass.rose}>{e.direction}</Chip>
                      {e.source === 'agent' && <Chip>agent</Chip>}
                      {e.decision.regime && <Chip>{e.decision.regime.label}</Chip>}
                      <span className="ml-auto text-[11px] text-slate-600">{new Date(e.openedAt).toLocaleString()}</span>
                    </div>

                    <p className="mt-2.5 text-xs leading-relaxed text-slate-400">{e.decision.thesis}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {!e.outcome ? (
                        <Chip tone={toneClass.slate}>Running</Chip>
                      ) : (
                        <>
                          <Pnl value={e.outcome.pnl} pct={e.outcome.pnlPct} />
                          <span className="text-[11px] text-slate-600">exit {money(e.outcome.exit, 2)} · {e.outcome.reason}</span>
                          {review ? (
                            <Chip tone={toneClass[review.tone] ?? toneClass.slate}>{review.label}</Chip>
                          ) : (
                            <span className="text-[11px] text-slate-600">awaiting review…</span>
                          )}
                        </>
                      )}
                    </div>

                    {review?.checkAccuracy?.length > 0 && (
                      <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="text-[11px] leading-relaxed text-slate-500">{review.note}</p>
                        {review.moveAfterExit != null && (
                          <p className="mt-1.5 text-[11px] text-slate-500">
                            Price moved{' '}
                            <span className={review.moveAfterExit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {review.moveAfterExit > 0 ? '+' : ''}
                              {review.moveAfterExit}%
                            </span>{' '}
                            in the thesis direction after the exit.
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {review.checkAccuracy.map((c) => (
                            <span
                              key={c.name}
                              className={`rounded-md border px-1.5 py-0.5 text-[10px] ${
                                c.correct
                                  ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300'
                                  : 'border-rose-500/25 bg-rose-500/[0.08] text-rose-300'
                              }`}
                            >
                              {c.name} {c.correct ? '✓' : '✗'}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* Feedback loop */}
        <Card className="p-5">
          <SectionTitle icon={Brain} title="What the record says" hint="Episode outcomes feeding back" />
          {aggregates.closed === 0 ? (
            <p className="py-6 text-center text-[11px] leading-relaxed text-slate-600">
              Nothing reviewed yet. Once episodes close, this shows which checks actually earned their weight — and adjusts the
              confidence on new signals accordingly.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="label">Hit rate</p>
                  <p className="mt-1 font-mono text-xl font-bold text-white">{aggregates.hitRate}%</p>
                </div>
                <div>
                  <p className="label">Net</p>
                  <Pnl value={aggregates.netPnl} className="mt-1 block text-xl" />
                </div>
              </div>

              <p className="label mt-5 mb-2">Check accuracy</p>
              <ul className="space-y-2">
                {aggregates.byCheck.map((c) => (
                  <li key={c.name}>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-slate-300">{c.name}</span>
                      <span className={`font-mono ${c.accuracy >= 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {c.accuracy}% <span className="text-slate-600">n={c.total}</span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                      <div
                        className={`h-full rounded-full ${c.accuracy >= 50 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                        style={{ width: `${c.accuracy}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              {aggregates.byRegime.length > 0 && (
                <>
                  <p className="label mt-5 mb-2">By regime</p>
                  <ul className="space-y-1.5">
                    {aggregates.byRegime.map((r) => (
                      <li key={r.regime} className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-slate-400">{r.regime}</span>
                        <span className="font-mono text-slate-300">
                          {r.winRate}% <span className="text-slate-600">of {r.total}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
                Checks with at least 5 reviewed episodes nudge the confidence on new signals, capped at ±15 points. A short
                record should influence a decision, not dictate it.
              </p>
            </>
          )}
        </Card>
      </div>
      )}

      {/* Backtest — does the strategy actually work? */}
      {tradingTab === 'backtest' && (
      <Card className="mt-4 overflow-hidden p-0" data-demo="backtest">
        <div className="flex flex-col gap-3 p-5 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle
            icon={Gauge}
            title="Strategy backtest"
            hint="Walk-forward, no look-ahead, costs charged both sides, stop assumed to hit before target"
          />
          <button onClick={runBacktests} disabled={testing} className="btn-ghost btn-sm shrink-0">
            {testing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            {testing ? 'Running…' : 'Re-run'}
          </button>
        </div>

        <div className="border-y border-white/[0.07] bg-white/[0.02] px-5 py-3">
          <p className="text-xs leading-relaxed text-slate-400">
            {edgeCount === 0
              ? 'No symbol in this universe passes. On this data the strategy loses money after costs — which is exactly what the agent needs to know before it trades.'
              : `${edgeCount} of ${UNIVERSE.length} symbols show an edge in this window. One window is not proof.`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-white/[0.07]">
                {['Symbol', 'Trades', 'Win rate', 'Profit factor', 'Expectancy', 'Return', 'Buy & hold', 'Max DD', 'Verdict'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${
                      i === 0 || i === 8 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {UNIVERSE.map((asset) => {
                const t = tests[asset.symbol]
                if (!t) {
                  return (
                    <tr key={asset.symbol}>
                      <td colSpan={9} className="px-4 py-2.5">
                        <Skeleton className="h-5 w-full" />
                      </td>
                    </tr>
                  )
                }
                if (!t.ok) {
                  return (
                    <tr key={asset.symbol}>
                      <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-100">{asset.symbol}</td>
                      <td colSpan={8} className="px-4 py-2.5 text-[11px] text-slate-500">
                        {t.reason}
                      </td>
                    </tr>
                  )
                }
                const m = t.metrics
                const v = t.verdict
                return (
                  <tr key={asset.symbol} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-100">{asset.symbol}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">{m.tradeCount}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">{m.winRate != null ? `${m.winRate}%` : '—'}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${m.profitFactor >= 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.profitFactor === Infinity ? '∞' : m.profitFactor}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${m.expectancy > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.expectancy > 0 ? '+' : ''}
                      {m.expectancy}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${m.totalReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {m.totalReturn > 0 ? '+' : ''}
                      {m.totalReturn}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-500">
                      {m.buyHoldReturn > 0 ? '+' : ''}
                      {m.buyHoldReturn}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">{m.maxDrawdown}%</td>
                    <td className="px-4 py-2.5">
                      <Chip tone={toneClass[v.tone] ?? toneClass.slate}>{v.label}</Chip>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t border-white/[0.07] p-4">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
            <span>
              A few hundred bars on six symbols is a small sample, and a strategy that worked in this window can fail in the next.
              Tuning settings until the numbers look good is how you fool yourself — the honest use of this table is to decide
              whether to trade at all, not to hunt for a configuration that passes.
            </span>
          </p>
        </div>
      </Card>
      )}

      {/* Positions + equity */}
      {tradingTab === 'positions' && (
      <>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="p-5 pb-3">
            <SectionTitle
              icon={Gauge}
              title="Open positions"
              hint="Marked continuously against live prices"
              action={
                <div className="flex items-center gap-3">
                  <LiveBadge live={market.streaming} label="crypto" title={market.streaming ? 'Binance websocket connected' : 'Stream reconnecting — falling back to polling'} />
                  <LiveBadge
                    live={Boolean(equityFeed.open)}
                    label={equityFeed.open === null ? 'equities' : equityFeed.open ? 'equities' : 'market closed'}
                    title={
                      equityFeed.open
                        ? 'Polling Yahoo every 5 seconds'
                        : 'The exchange is shut, so these prices are genuinely static until it reopens.'
                    }
                  />
                </div>
              }
            />
          </div>
          {trading.positions.length === 0 ? (
            <EmptyState icon={Target} title="No open positions" description="Load a signal into the ticket, or start the agent." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-y border-white/[0.07] bg-white/[0.02]">
                    {['Symbol', 'Side', 'Qty', 'Entry', 'Mark', 'Stop / Target', 'P&L', ''].map((h, i) => (
                      <th
                        key={h || i}
                        className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${i > 1 ? 'text-right' : 'text-left'}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {trading.positions.map((p) => (
                    <tr key={p.id} className="transition hover:bg-white/[0.03]">
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-xs font-bold text-slate-100">{p.symbol}</span>
                        {p.source === 'agent' && <Chip className="ml-2 !px-1.5 !py-0 !text-[9px]">agent</Chip>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Chip tone={p.side === 'long' ? toneClass.emerald : toneClass.rose}>{p.side}</Chip>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-300">{num(p.qty, 4)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-400">{money(p.entry, p.entry >= 100 ? 2 : 4)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-100">
                        <LiveValue value={p.mark} format={(v) => money(v, v >= 100 ? 2 : 4)} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px]">
                        <span className="text-rose-300">{p.stop ? money(p.stop, 2) : '—'}</span>
                        <span className="mx-1 text-slate-700">/</span>
                        <span className="text-emerald-300">{p.target ? money(p.target, 2) : '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Pnl value={p.unrealised} pct={p.unrealisedPct} live />
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <button
                          onClick={() => trading.closePosition(p.id)}
                          className="rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {workingOrders.length > 0 && (
            <div className="border-t border-white/[0.07] p-4">
              <p className="label mb-2">Working orders</p>
              <ul className="space-y-1.5">
                {workingOrders.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs">
                    <span className="font-mono text-slate-200">
                      {o.side.toUpperCase()} {o.qty} {o.symbol}
                    </span>
                    <span className="text-slate-500">limit {money(o.limitPrice, 2)}</span>
                    <button onClick={() => trading.cancelOrder(o.id)} className="ml-auto text-slate-500 hover:text-rose-300">
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle icon={TrendingUp} title="Account value over time" hint="Sampled every minute" />
          <div className="h-40">
            {equityCurve.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eqFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={58} />
                  <Tooltip content={<ChartTooltip formatter={(v) => money(v)} />} />
                  <Area type="linear" dataKey="equity" name="Equity" stroke="#818cf8" strokeWidth={2} fill="url(#eqFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-center text-[11px] text-slate-600">
                The curve builds as the session runs.
              </div>
            )}
          </div>

          <div className="mt-4 border-t border-white/[0.06] pt-4">
            <p className="label mb-2">Activity</p>
            {trading.log.length === 0 ? (
              <p className="text-[11px] text-slate-600">Fills, stops and targets appear here.</p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {trading.log.map((l) => (
                  <li key={l.id} className="flex items-start gap-2 text-[11px]">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                        l.kind === 'stop' ? 'bg-rose-400' : l.kind === 'target' ? 'bg-emerald-400' : 'bg-brand-400'
                      }`}
                    />
                    <span className="text-slate-400">{l.text}</span>
                    <span className="ml-auto shrink-0 text-slate-700">{new Date(l.at).toLocaleTimeString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {/* Closed trades */}
      {trading.trades.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="p-5 pb-3">
            <SectionTitle icon={Activity} title="Closed trades" hint={`${trading.closedCount} round trips`} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-y border-white/[0.07] bg-white/[0.02]">
                  {['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'Reason', 'P&L'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${i > 1 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {trading.trades.slice(0, 12).map((t, i) => (
                  <tr key={`${t.id}-${i}`}>
                    <td className="px-4 py-2.5 font-mono text-xs font-bold text-slate-100">{t.symbol}</td>
                    <td className="px-4 py-2.5">
                      <Chip tone={t.side === 'long' ? toneClass.emerald : toneClass.rose}>{t.side}</Chip>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">{num(t.qty, 4)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">{money(t.entry, 2)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">{money(t.exit, 2)}</td>
                    <td className="px-4 py-2.5 text-right text-[11px] text-slate-500">{t.reason}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Pnl value={t.pnl} pct={t.pnlPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </>
      )}
    </div>
  )
}
