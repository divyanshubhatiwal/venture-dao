import { useEffect, useState } from 'react'
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
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  CandlestickChart,
  CheckCircle2,
  Coins,
  Compass,
  Gauge,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Card, ChartTooltip, PageHeader, ProgressBar, SectionTitle, StatSkeleton } from '../components/ui'
import KpiCard from '../components/KpiCard'
import LiveValue from '../components/LiveValue'
import { useMarket } from '../context/MarketContext'
import { useTrading } from '../context/TradingContext'
import { fetchOverview } from '../lib/api'
import { num, relativeTime, usd } from '../lib/format'

const activityIcons = {
  analysis: { icon: Brain, tone: 'text-brand-300' },
  signal: { icon: Activity, tone: 'text-sky-400' },
  trade: { icon: CandlestickChart, tone: 'text-emerald-400' },
  learning: { icon: Brain, tone: 'text-emerald-400' },
  risk: { icon: CheckCircle2, tone: 'text-amber-400' },
}

const price = (n) =>
  n == null ? '—' : n >= 100 ? `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `$${n.toFixed(4)}`

function TickerRow({ row }) {
  const up = (row.change24h ?? 0) >= 0
  return (
    <Link to="/markets" className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.04]">
      <span className="w-12 shrink-0 font-mono text-xs font-bold text-slate-100">{row.symbol}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{row.name}</span>
      <LiveValue value={row.price} format={price} className="shrink-0 font-mono text-sm text-slate-100" />
      <span className={`w-16 shrink-0 text-right font-mono text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
        {up ? '+' : ''}
        {(row.change24h ?? 0).toFixed(2)}%
      </span>
    </Link>
  )
}

export default function Dashboard() {
  const [overview, setOverview] = useState(null)
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

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Overview"
        title="Command Centre"
        subtitle="Live market data, a signal engine that shows its working, and a goal-based agent that protects capital before it chases a target."
        actions={
          <>
            <Link to="/agent" className="btn-primary">
              <Target size={15} />
              Goal agent
            </Link>
            <Link to="/markets" className="btn-ghost">
              <CandlestickChart size={15} />
              Live markets
            </Link>
          </>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-demo="kpis">
        {!stats ? (
          Array.from({ length: 4 }).map((_, i) => <StatSkeleton key={i} />)
        ) : (
          <>
            <KpiCard
              icon={Coins}
              label="Treasury value"
              value={<LiveValue value={valueEth(stats.treasuryEth, stats.treasuryUsd)} format={(v) => usd(v, { compact: true })} />}
              unit={`· ${stats.treasuryEth} ETH`}
              delta={ethPrice ? +ethChange24h.toFixed(1) : 12.4}
              hint={ethPrice ? `at live ETH $${ethPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}${marketStale ? ' (snapshot)' : ''}` : 'vs last month'}
            />
            <KpiCard
              icon={Gauge}
              label="Paper equity"
              value={usd(trading.equity)}
              delta={trading.totalReturn}
              hint={`${trading.positions.length} open · ${trading.closedCount} closed`}
              tone="sky"
            />
            <KpiCard
              icon={Target}
              label="AI accuracy"
              value={`${stats.aiAccuracy}%`}
              delta={7.4}
              hint="vs 50% baseline"
              tone="emerald"
            />
            <KpiCard
              icon={Users}
              label="Token holders"
              value={num(stats.tokenHolders)}
              delta={4.1}
              hint={`${num(stats.totalVotes)} votes cast`}
              tone="amber"
            />
          </>
        )}
      </div>

      {/* Treasury + live watchlist */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle
            icon={Activity}
            title="Treasury performance"
            hint="Treasury in ETH against a passive hold benchmark"
            action={
              <div className="hidden items-center gap-4 text-[11px] text-slate-400 sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-400" /> Treasury
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-slate-600" /> Benchmark
                </span>
              </div>
            }
          />
          <div className="h-64">
            {overview ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview.performance} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="treasuryFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<ChartTooltip suffix=" ETH" />} cursor={{ stroke: 'rgba(255,255,255,.15)' }} />
                  <Area type="monotone" dataKey="benchmark" name="Benchmark" stroke="#475569" strokeDasharray="4 4" fill="none" strokeWidth={1.5} />
                  <Area type="monotone" dataKey="treasury" name="Treasury" stroke="#818cf8" strokeWidth={2.5} fill="url(#treasuryFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="skeleton h-full w-full" />
            )}
          </div>
        </Card>

        <Card className="flex flex-col p-0">
          <div className="p-5 pb-0">
            <SectionTitle
              icon={CandlestickChart}
              title="Live prices"
              hint={streaming ? 'Streaming from Binance' : 'Polling — websocket reconnecting'}
            />
          </div>
          <div className="divide-row flex-1">
            {watch.length ? (
              watch.map((row) => <TickerRow key={row.symbol} row={row} />)
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-500">Connecting to the feed…</div>
            )}
          </div>
          <Link
            to="/markets"
            className="flex items-center justify-center gap-1.5 border-t border-white/[0.06] px-5 py-3.5 text-xs font-semibold text-brand-300 transition hover:bg-white/[0.04]"
          >
            Open markets <ArrowRight size={13} />
          </Link>
        </Card>
      </div>

      {/* Accuracy + activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={Brain} title="AI is learning" hint="Recommendation accuracy over time" />
          <div className="h-40">
            {overview ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.accuracy} margin={{ top: 5, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis domain={[40, 90]} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<ChartTooltip suffix="%" />} />
                  <Line type="monotone" dataKey="baseline" name="Random" stroke="#475569" strokeDasharray="4 4" dot={false} strokeWidth={1.5} />
                  <Line type="monotone" dataKey="accuracy" name="Model" stroke="#34d399" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="skeleton h-full w-full" />
            )}
          </div>
          <Link to="/agent" className="btn-ghost btn-sm mt-4 w-full">
            See what it decided <ArrowRight size={13} />
          </Link>
        </Card>

        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={Activity} title="Recent activity" hint="Signals, trades and risk events" />
          <ul className="space-y-1">
            {(overview?.activity ?? []).map((item) => {
              const { icon: Icon, tone } = activityIcons[item.type] ?? activityIcons.analysis
              return (
                <li key={item.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition hover:bg-white/[0.03]">
                  <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04] ${tone}`}>
                    <Icon size={13} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-relaxed text-slate-300">{item.text}</p>
                  <span className="shrink-0 text-[11px] text-slate-600">{relativeTime(item.at)}</span>
                </li>
              )
            })}
            {!overview && Array.from({ length: 5 }).map((_, i) => <li key={i} className="skeleton my-2 h-8" />)}
          </ul>
        </Card>
      </div>

      {/* Pipeline explainer */}
      <Card className="mt-4 overflow-hidden p-5" data-demo="pipeline">
        <SectionTitle icon={Compass} title="How a decision gets made" hint="Context, signal, critic, then the risk engine has the last word" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { n: '01', t: 'Read the context', d: 'Volatility, dollar, rates, breadth and positioning set the backdrop.', to: '/macro', icon: Compass },
            { n: '02', t: 'Score the setup', d: 'Indicators vote with explicit weights and every check is shown.', to: '/trading', icon: Activity },
            { n: '03', t: 'Argue against it', d: 'A critic looks for reasons to pass; the risk engine can veto outright.', to: '/agent', icon: Bot },
            { n: '04', t: 'Learn from it', d: 'Episodes grade the reasoning, not just the profit, and feed back.', to: '/agent', icon: Brain },
          ].map((step) => (
            <Link
              key={step.n}
              to={step.to}
              className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:border-brand-500/40 hover:bg-white/[0.05]"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-brand-400">{step.n}</span>
                <step.icon size={13} className="text-slate-600 transition group-hover:text-brand-300" />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-100">{step.t}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{step.d}</p>
            </Link>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-4 border-t border-white/[0.06] pt-5 sm:grid-cols-3">
          <ProgressBar label="Capital protected first" value={100} barClass="bg-emerald-500" />
          <ProgressBar label="Treasury deployed" value={68} barClass="bg-accent" />
          <ProgressBar label="AI vs analyst speed" value={94} barClass="bg-brand-500" />
        </div>
      </Card>
    </div>
  )
}
