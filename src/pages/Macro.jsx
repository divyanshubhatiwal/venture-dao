import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { AlertTriangle, Compass, Gauge, Globe, Layers, RefreshCw, Scale, Waves } from 'lucide-react'
import { Card, ChartTooltip, Chip, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import LiveValue, { LiveBadge } from '../components/LiveValue'
import { getMacro } from '../lib/macro'
import { formatPrice } from '../lib/stockApi'
import { usd } from '../lib/format'

const toneClass = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  slate: 'border-white/15 bg-white/5 text-slate-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
}

const verdictDot = {
  'risk-on': 'bg-emerald-400',
  'risk-off': 'bg-rose-400',
  'crowded-long': 'bg-amber-400',
  'crowded-short': 'bg-amber-400',
  neutral: 'bg-slate-600',
}

function Change({ value }) {
  if (value == null) return <span className="text-slate-600">—</span>
  const up = value >= 0
  return (
    <span className={`font-mono text-xs font-semibold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
      {up ? '+' : ''}
      {value.toFixed(2)}%
    </span>
  )
}

export default function Macro() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getMacro())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 60_000)
    return () => clearInterval(timer)
  }, [load])

  const regime = data?.regime
  const oiSeries = (data?.flow?.openInterestSeries ?? []).map((v, i) => ({ i, oi: v }))

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Context layer"
        title="Macro &amp; Flow"
        subtitle="What a price chart cannot show you: volatility, the dollar, rates, global breadth, and where leverage is positioned. This is the backdrop every decision is taken into."
        actions={
          <>
            <LiveBadge live={!loading && Boolean(data)} label={loading ? 'loading' : 'live'} />
            <button onClick={load} className="btn-ghost">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </>
        }
      />

      {/* Regime read */}
      <Card className="overflow-hidden" data-demo="regime">
        <div className="border-b border-white/[0.07] bg-gradient-to-r from-brand-500/10 via-transparent to-accent/10 p-5">
          {!regime ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Compass size={16} className="text-brand-300" />
                  <p className="label">Current regime</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-bold tracking-tight text-white">{regime.label}</h2>
                  <Chip tone={toneClass[regime.tone]}>net {regime.net > 0 ? '+' : ''}{regime.net}</Chip>
                </div>
                <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-slate-300">{regime.summary}</p>
              </div>
              <div className="shrink-0 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center">
                <p className="text-[10px] uppercase tracking-[.12em] text-slate-500">Risk on / off</p>
                <p className="mt-1 font-mono text-sm">
                  <span className="text-emerald-400">{regime.riskOn}</span>
                  <span className="mx-1.5 text-slate-600">vs</span>
                  <span className="text-rose-400">{regime.riskOff}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {regime && (
          <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {regime.factors.map((f) => (
              <div key={f.name} className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${verdictDot[f.verdict] ?? 'bg-slate-600'}`} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-200">{f.name}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{f.detail}</p>
                </div>
                {f.weight > 0 && <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-600">w{f.weight}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Macro complex */}
        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={Scale} title="Macro complex" hint="Volatility, dollar, rates, havens and growth" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.rates?.rows ?? Array.from({ length: 5 })).map((row, i) =>
              !row ? (
                <Skeleton key={i} className="h-24" />
              ) : (
                <div key={row.symbol} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-200">{row.name}</p>
                    <Change value={row.change} />
                  </div>
                  <LiveValue
                    value={row.price}
                    format={(v) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }))}
                    className="mt-1 block font-mono text-lg font-bold text-white"
                  />
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-600">{row.hint}</p>
                </div>
              ),
            )}
          </div>
          {data?.rates?.source && <p className="mt-3 text-[11px] text-slate-600">Source: {data.rates.source}</p>}
        </Card>

        {/* Breadth */}
        <Card className="p-5">
          <SectionTitle icon={Globe} title="Global breadth" hint="How many world markets are actually up" />
          {!data?.breadth?.ok ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <p className="font-mono text-3xl font-bold text-white">
                  {data.breadth.advancing}
                  <span className="text-lg text-slate-500">/{data.breadth.total}</span>
                </p>
                <p className="text-xs text-slate-500">advancing</p>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className={`h-full rounded-full ${data.breadth.pct >= 60 ? 'bg-emerald-400' : data.breadth.pct <= 40 ? 'bg-rose-400' : 'bg-amber-400'}`}
                  style={{ width: `${data.breadth.pct}%` }}
                />
              </div>
              <ul className="mt-4 space-y-1.5">
                {data.breadth.rows.map((r) => (
                  <li key={r.symbol} className="flex items-center gap-2 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${r.change > 0 ? 'bg-emerald-400' : r.change < 0 ? 'bg-rose-400' : 'bg-slate-600'}`} />
                    <span className="text-slate-300">{r.name}</span>
                    <span className="ml-auto font-mono text-slate-500">{r.region}</span>
                    <Change value={r.change} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Crypto aggregates */}
        <Card className="p-5">
          <SectionTitle icon={Layers} title="Crypto aggregates" hint="Size and where capital is hiding" />
          {!data?.crypto?.ok ? (
            <Skeleton className="h-32" />
          ) : (
            <dl className="space-y-3 text-sm">
              {[
                ['Total market cap', usd(data.crypto.totalMarketCap, { compact: true })],
                ['24h change', null, <Change key="c" value={data.crypto.change24h} />],
                ['24h volume', usd(data.crypto.volume24h, { compact: true })],
                ['BTC dominance', `${data.crypto.btcDominance.toFixed(1)}%`],
                ['ETH dominance', `${data.crypto.ethDominance.toFixed(1)}%`],
              ].map(([k, v, node]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-mono text-slate-200">{node ?? v}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
            Rising BTC dominance means capital is rotating out of smaller assets into the most liquid one — defensive behaviour
            inside crypto, even when the total cap is flat.
          </p>
        </Card>

        {/* Positioning */}
        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={Waves} title="Positioning &amp; flow" hint="ETH perpetuals — what leverage is doing" />
          {!data?.flow?.ok ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  ['Funding rate', `${(data.flow.fundingRate * 100).toFixed(4)}%`, 'per 8h period'],
                  [
                    'Annualised',
                    `${data.flow.fundingAnnualised > 0 ? '+' : ''}${data.flow.fundingAnnualised.toFixed(1)}%`,
                    data.flow.fundingAnnualised > 0 ? 'longs pay shorts' : 'shorts pay longs',
                  ],
                  ['Open interest', usd(data.flow.openInterest, { compact: true }), `${data.flow.openInterestChange24h > 0 ? '+' : ''}${data.flow.openInterestChange24h?.toFixed(1)}% in 24h`],
                ].map(([label, value, hint]) => (
                  <div key={label}>
                    <p className="label">{label}</p>
                    <p className="mt-1 font-mono text-lg font-bold text-white">{value}</p>
                    <p className="mt-0.5 text-[10px] text-slate-600">{hint}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={oiSeries} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="oiFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip content={<ChartTooltip formatter={(v) => usd(v, { compact: true })} />} />
                    <Area type="monotone" dataKey="oi" name="Open interest" stroke="#a855f7" strokeWidth={2} fill="url(#oiFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Open interest over the last 24 hours. Rising open interest with rising price means new money; rising open interest
                with falling price means shorts are building. Funding tells you which side is paying to hold.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* Sentiment & cross-venue positioning */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <SectionTitle icon={Gauge} title="Fear &amp; Greed" hint="Contrarian: crowds are surest at the worst moments" />
          {!data?.sentiment?.fearGreed?.ok ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-3">
                <p
                  className={`font-mono text-4xl font-bold ${
                    data.sentiment.fearGreed.value <= 25
                      ? 'text-rose-400'
                      : data.sentiment.fearGreed.value >= 75
                        ? 'text-emerald-400'
                        : 'text-slate-100'
                  }`}
                >
                  {data.sentiment.fearGreed.value}
                </p>
                <Chip
                  tone={
                    data.sentiment.fearGreed.value <= 25
                      ? toneClass.rose
                      : data.sentiment.fearGreed.value >= 75
                        ? toneClass.emerald
                        : toneClass.slate
                  }
                >
                  {data.sentiment.fearGreed.label}
                </Chip>
                <span className="text-[11px] text-slate-500">
                  {data.sentiment.fearGreed.change > 0 ? '+' : ''}
                  {data.sentiment.fearGreed.change} vs yesterday
                </span>
              </div>

              <div className="mt-4 h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.sentiment.fearGreed.history} margin={{ top: 5, right: 0, left: -28, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fngFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={38} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="value" name="Index" stroke="#818cf8" strokeWidth={2} fill="url(#fngFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                30-day history. Extreme fear marks the conditions in which lows have historically formed — which is not the same
                as calling a low. Source: {data.sentiment.fearGreed.source}.
              </p>
            </>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Waves} title="Cross-venue funding" hint="Where leverage disagrees" />
          {!data?.sentiment?.hyperliquid?.ok ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              <dl className="space-y-3 text-sm">
                {[
                  ['Binance ETH', data.flow?.ok ? `${data.flow.fundingAnnualised.toFixed(1)}%` : '—'],
                  ['Hyperliquid ETH', `${data.sentiment.hyperliquid.fundingAnnualised.toFixed(1)}%`],
                  ['Hyperliquid OI', usd(data.sentiment.hyperliquid.openInterestUsd, { compact: true })],
                  ['Perps listed', data.sentiment.hyperliquid.universeSize],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-mono text-slate-200">{v}</dd>
                  </div>
                ))}
              </dl>
              {data.sentiment.divergence && (
                <p className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-400">
                  {Math.abs(data.sentiment.divergence.spreadPercent) <= 3
                    ? `Both venues price leverage within ${Math.abs(data.sentiment.divergence.spreadPercent).toFixed(1)} percentage points of each other — positioning looks balanced across the market.`
                    : `${data.sentiment.divergence.spreadPercent > 0 ? 'Binance' : 'Hyperliquid'} longs are paying more to hold, ${Math.abs(
                        data.sentiment.divergence.spreadPercent,
                      ).toFixed(1)}pp apart annualised. A persistent gap means one venue is carrying crowded positioning.`}
                </p>
              )}
              <p className="mt-3 text-[11px] text-slate-600">Annualised, both venues. Source: Binance futures &amp; Hyperliquid.</p>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            Context, not prediction. A risk-off reading does not mean price falls — it means the conditions that often accompany
            drawdowns are present. Every factor above is shown with the number it fired on so you can disagree with the
            conclusion.
          </span>
        </p>
      </Card>
    </div>
  )
}
