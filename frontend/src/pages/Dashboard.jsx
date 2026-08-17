import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Activity, ArrowRight, Brain, CandlestickChart, CheckCircle2, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, ChartTooltip, SectionTitle, Skeleton } from '../components/ui'
import LiveValue from '../components/LiveValue'
import { useMarket } from '../context/MarketContext'
import { useTrading } from '../context/TradingContext'
import { fetchOverview } from '../lib/api/api'
import { num, relativeTime, usd } from '../lib/format'

/**
 * Dashboard, laid out the way a financial site lays out an instrument page.
 *
 * The pattern borrowed here is the one Groww, Zerodha and TradingView all
 * share, and it is a hierarchy rather than a grid: ONE headline number at the
 * top with its change beside it, then the chart, then everything else as
 * label-and-value rows. A wall of equally-sized tiles gives the eye no starting
 * point — every figure claims the same importance, so none of them lead.
 *
 * Each figure carries a plain line explaining what it is. That is the detail
 * that separates a real financial product from a dashboard template: "P/E
 * Ratio" with a sentence under it is useful, "P/E Ratio" alone assumes the
 * reader already knows.
 *
 * Sections are divided rules on one surface instead of a dozen floating cards.
 * Cards were what made this page read as scattered.
 *
 * The timeframe buttons genuinely slice the series. Range controls that do not
 * filter anything are the easiest fake in this whole layout, so there are only
 * as many here as there is data behind.
 */

const activityIcons = {
  analysis: { icon: Brain, tone: 'text-brand-300' },
  signal: { icon: Activity, tone: 'text-sky-400' },
  trade: { icon: CandlestickChart, tone: 'text-emerald-400' },
  learning: { icon: Brain, tone: 'text-emerald-400' },
  risk: { icon: CheckCircle2, tone: 'text-amber-400' },
}

/** Only ranges the data can actually support. */
const RANGES = [
  { id: '3M', months: 3 },
  { id: '6M', months: 6 },
  { id: 'All', months: null },
]

const price = (n) =>
  n == null ? '—' : n >= 100 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`

/** Label, value, and a line saying what it means. */
function Metric({ label, value, explain, tone = 'text-white' }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`num mt-1 text-[17px] font-semibold ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] leading-snug text-slate-600">{explain}</p>
    </div>
  )
}

function TickerRow({ row }) {
  const up = (row.change24h ?? 0) >= 0
  return (
    <Link to="/markets" className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
      <span className="w-11 shrink-0 font-mono text-xs font-semibold text-slate-100">{row.symbol}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{row.name}</span>
      <LiveValue value={row.price} format={price} className="num shrink-0 text-[13px] text-slate-100" />
      <span className={`w-14 shrink-0 text-right font-mono text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {up ? '+' : ''}
        {(row.change24h ?? 0).toFixed(2)}%
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
  const [range, setRange] = useState('All')
  const { ethPrice, ethChange24h, valueEth, stale: marketStale, tickers, streaming } = useMarket()
  const trading = useTrading()

  useEffect(() => {
    let alive = true
    fetchOverview().then(({ data }) => alive && setOverview(data))
    return () => {
      alive = false
    }
  }, [])

  const stats = overview?.stats
  const watch = tickers.slice(0, 5)

  const series = useMemo(() => {
    const all = overview?.performance ?? []
    const months = RANGES.find((r) => r.id === range)?.months
    return months ? all.slice(-months) : all
  }, [overview, range])

  const up = trading.totalReturn >= 0

  return (
    <div className="animate-fade-up">
      {/* Headline block: the one number this page is about, its change beside
          it, and the action. Everything below is detail on this. */}
      <Card className="overflow-hidden" data-demo="kpis">
        <div className="flex flex-col gap-5 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <p className="label">Practice account</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-3">
              <span className="num text-[34px] font-semibold leading-none tracking-tight text-white sm:text-[40px]">
                {usd(trading.equity)}
              </span>
              <span className={`inline-flex items-center gap-1 text-sm font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
                {up ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {up ? '+' : ''}
                {trading.totalReturn}%
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {trading.positions.length} open · {trading.closedCount} closed · fake money, live prices
            </p>
          </div>

          <Link to="/agent" className="btn-primary shrink-0">
            <Target size={15} />
            Open trading bot
          </Link>
        </div>

        {/* Label-value grid, each with a line saying what it means. */}
        <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.05] lg:grid-cols-4">
          <div className="bg-ink-950/60">
            <Metric
              label="Cash available"
              value={usd(trading.cash)}
              explain="Not tied up in any open trade"
            />
          </div>
          <div className="bg-ink-950/60">
            <Metric
              label="Open profit / loss"
              value={usd(trading.openPnl)}
              tone={trading.openPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}
              explain="Would be yours if you closed everything now"
            />
          </div>
          <div className="bg-ink-950/60">
            <Metric
              label="Locked in"
              value={usd(trading.realised)}
              tone={trading.realised >= 0 ? 'text-emerald-400' : 'text-rose-400'}
              explain="Already banked from closed trades"
            />
          </div>
          <div className="bg-ink-950/60">
            <Metric
              label="Trades won"
              value={trading.winRate != null ? `${trading.winRate}%` : '—'}
              explain={trading.closedCount ? `Out of ${trading.closedCount} closed` : 'No trades closed yet'}
            />
          </div>
        </div>
      </Card>

      {/* Chart, with ranges that really filter. */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-slate-100">Treasury over time</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">Compared with simply holding</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  range === r.id ? 'bg-white/[0.09] text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>

        <div className="h-64 px-2 pb-4 sm:px-4">
          {overview ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="treasuryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<ChartTooltip suffix=" ETH" />} cursor={{ stroke: 'rgba(255,255,255,.15)' }} />
                <Area type="monotone" dataKey="benchmark" name="Holding" stroke="#475569" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
                <Area type="monotone" dataKey="treasury" name="Treasury" stroke="#818cf8" strokeWidth={2.5} fill="url(#treasuryFill)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="skeleton h-full w-full" />
          )}
        </div>

        {/* Treasury figures, same label-value-explanation pattern. */}
        <div className="grid grid-cols-2 gap-px border-t border-white/[0.06] bg-white/[0.05] lg:grid-cols-4">
          {!stats
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="bg-ink-950/60 px-5 py-4">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-5 w-24" />
                </div>
              ))
            : [
                {
                  label: 'Treasury value',
                  value: <LiveValue value={valueEth(stats.treasuryEth, stats.treasuryUsd)} format={(v) => usd(v, { compact: true })} />,
                  explain: `${stats.treasuryEth} ETH${marketStale ? ' · snapshot' : ''}`,
                },
                {
                  label: 'ETH price',
                  value: ethPrice ? `$${ethPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—',
                  // The only live change on the page, so it is the only one shown.
                  explain: ethPrice ? `${ethChange24h >= 0 ? '+' : ''}${ethChange24h.toFixed(1)}% in 24 hours` : 'waiting for prices',
                },
                { label: 'Bot accuracy', value: `${stats.aiAccuracy}%`, explain: 'A coin flip would be 50%' },
                { label: 'Token holders', value: num(stats.tokenHolders), explain: `${num(stats.totalVotes)} votes cast` },
              ].map((m) => (
                <div key={m.label} className="bg-ink-950/60">
                  <Metric {...m} />
                </div>
              ))}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="flex flex-col p-0">
          <div className="px-5 pt-5">
            <SectionTitle icon={CandlestickChart} title="Live prices" hint={streaming ? 'Streaming live' : 'Reconnecting…'} />
          </div>
          <div className="divide-row flex-1">
            {watch.length ? (
              watch.map((row) => <TickerRow key={row.symbol} row={row} />)
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Connecting…</div>
            )}
          </div>
          <Link
            to="/markets"
            className="flex items-center justify-center gap-1.5 border-t border-white/[0.06] px-5 py-3 text-xs font-semibold text-brand-300 transition hover:bg-white/[0.03]"
          >
            All markets <ArrowRight size={13} />
          </Link>
        </Card>

        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={Activity} title="Recent activity" hint="What the bot has been doing" />
          <ul>
            {(overview?.activity ?? []).map((item) => {
              const { icon: Icon, tone } = activityIcons[item.type] ?? activityIcons.analysis
              return (
                <li key={item.id} className="flex items-start gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[0.03]">
                  <Icon size={14} className={`mt-0.5 shrink-0 ${tone}`} />
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-300">{item.text}</p>
                  <span className="shrink-0 text-[11px] text-slate-600">{relativeTime(item.at)}</span>
                </li>
              )
            })}
            {!overview && Array.from({ length: 5 }).map((_, i) => <li key={i} className="skeleton my-2 h-8" />)}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle icon={Brain} title="What it has learned" hint="How often its calls were right" />
        <div className="h-44">
          {overview ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overview.accuracy} margin={{ top: 5, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} />
                <YAxis domain={[40, 90]} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<ChartTooltip suffix="%" />} />
                <Line type="monotone" dataKey="baseline" name="Coin flip" stroke="#475569" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey="accuracy" name="Bot" stroke="#34d399" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="skeleton h-full w-full" />
          )}
        </div>
      </Card>
    </div>
  )
}
