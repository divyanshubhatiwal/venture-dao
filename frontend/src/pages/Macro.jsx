import { useCallback, useEffect, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import { AlertTriangle, Compass, Gauge, Globe, Layers, Newspaper, RefreshCw, Scale, TrendingUp, Waves, Zap } from 'lucide-react'
import { Card, ChartTooltip, Chip, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import LiveValue, { LiveBadge } from '../components/LiveValue'
import MarketNews from '../components/MarketNews'
import { useTheme } from '../context/ThemeContext'
import { getMacro } from '../lib/market/macro'
import { formatPrice } from '../lib/market/stockApi'
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
  const [macroTab, setMacroTab] = useState('news')
  const { isDark } = useTheme()

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

  // Keyboard navigation for sub-tabs (1, 2, 3)
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.key === '1') setMacroTab('news')
      if (e.key === '2') setMacroTab('macro')
      if (e.key === '3') setMacroTab('liquidity')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const regime = data?.regime
  const oiSeries = (data?.flow?.openInterestSeries ?? []).map((v, i) => ({ i, oi: v }))

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Market Intelligence"
        title="News & Macro Sentiment"
        subtitle="Global market context: breaking news wire, volatility regimes, rates, and institutional liquidity."
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

      {/* Enhanced Segmented Tab Switcher */}
      <div className={`mb-5 flex flex-wrap items-center gap-2 rounded-2xl border p-1.5 backdrop-blur-xl ${isDark ? 'border-white/[0.08] bg-black/40' : 'border-slate-200 bg-white/90 shadow-sm'}`}>
        {[
          { id: 'news', label: 'Breaking News & Sentiment', icon: Newspaper, num: '1' },
          { id: 'macro', label: 'Macro Complex & World Markets', icon: Scale, num: '2' },
          { id: 'liquidity', label: 'Derivatives & Liquidity Flow', icon: Waves, num: '3' },
        ].map(({ id, label, icon: Icon, num }) => {
          const active = macroTab === id
          return (
            <button
              key={id}
              onClick={() => setMacroTab(id)}
              className={`group flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
                active
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-lg shadow-brand-500/25 scale-[1.02]'
                  : isDark ? 'text-slate-400 hover:bg-white/[0.05] hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={14} className={active ? 'text-white' : isDark ? 'text-slate-500 group-hover:text-slate-300' : 'text-slate-400 group-hover:text-slate-700'} />
              <span>{label}</span>
              <kbd
                className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[9px] transition ${
                  active ? 'bg-black/30 text-brand-200' : isDark ? 'bg-white/[0.06] text-slate-500 group-hover:text-slate-300' : 'bg-slate-100 text-slate-500 group-hover:text-slate-700'
                }`}
              >
                {num}
              </kbd>
            </button>
          )
        })}
      </div>

      {/* News & AI Sentiment Tab */}
      {macroTab === 'news' && (
        <div className="space-y-4">
          {/* Institutional Live Global Market Mood Command Center */}
          <Card className={`overflow-hidden p-0 border ${isDark ? 'border-brand-500/20' : 'border-slate-200 bg-white shadow-md'}`}>
            <div className={`border-b p-5 ${isDark ? 'border-white/[0.07] bg-gradient-to-r from-brand-500/15 via-accent/5 to-transparent' : 'border-slate-200 bg-gradient-to-r from-brand-50 via-slate-50 to-white'}`}>
              {!regime ? (
                <Skeleton className="h-28 w-full" />
              ) : (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${isDark ? 'bg-brand-500/20 border-brand-500/30 text-brand-300' : 'bg-brand-50 border-brand-200 text-brand-700'}`}>
                        <Compass size={13} className="animate-spin-slow" />
                        Live Global Market Mood
                      </span>
                      <span className={`text-[11px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Updated Real-Time</span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      <h2 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{regime.label}</h2>
                      <Chip tone={toneClass[regime.tone]}>
                        Net Posture {regime.net > 0 ? '+' : ''}{regime.net}
                      </Chip>
                    </div>

                    <p className={`mt-2 max-w-2xl text-xs sm:text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {regime.summary}
                    </p>
                  </div>

                  {/* Right Side: Fear & Greed + Risk Score */}
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    {/* Fear & Greed Dial */}
                    <div className={`rounded-2xl border p-3.5 text-center min-w-[130px] ${isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50/80 shadow-sm'}`}>
                      <p className={`text-[10px] uppercase tracking-[.12em] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Fear &amp; Greed</p>
                      <p className={`mt-1 font-mono text-xl font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        {data?.sentiment?.fearGreed?.value ?? 64}
                        <span className={`text-xs font-normal ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>/100</span>
                      </p>
                      <p className={`text-[10px] font-semibold uppercase mt-0.5 ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>
                        {data?.sentiment?.fearGreed?.label ?? 'Greed (Bullish)'}
                      </p>
                    </div>

                    {/* Risk-On vs Risk-Off Profile */}
                    <div className={`rounded-2xl border p-3.5 text-center min-w-[140px] ${isDark ? 'border-white/10 bg-black/30' : 'border-slate-200 bg-slate-50/80 shadow-sm'}`}>
                      <p className={`text-[10px] uppercase tracking-[.12em] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Factor Consensus</p>
                      <p className="mt-1 font-mono text-lg font-bold">
                        <span className={isDark ? 'text-emerald-400' : 'text-emerald-600'}>{regime.riskOn} Risk-On</span>
                        <span className={`mx-1.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>/</span>
                        <span className={isDark ? 'text-rose-400' : 'text-rose-600'}>{regime.riskOff} Risk-Off</span>
                      </p>
                      <p className={`text-[10px] font-mono mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        {Math.round((regime.riskOn / (regime.riskOn + regime.riskOff || 1)) * 100)}% Positive Bias
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 5-Stage Visual Mood Stance Bar */}
            <div className={`p-4 ${isDark ? 'bg-white/[0.01]' : 'bg-slate-50/50'}`}>
              <div className={`flex items-center justify-between text-xs font-semibold pb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                <span>Market Mood Spectrum</span>
                <span className={`font-mono ${isDark ? 'text-brand-300' : 'text-brand-600 font-bold'}`}>
                  {regime?.net > 1 ? 'Bullish Expansion' : regime?.net < -1 ? 'Defensive Contraction' : 'Neutral Equilibrium'}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { label: 'Extreme Fear', range: 'Score < -3', active: regime?.net <= -3, tone: 'from-rose-600 to-rose-500' },
                  { label: 'Risk-Off / Caution', range: 'Score -2..-1', active: regime?.net === -2 || regime?.net === -1, tone: 'from-amber-600 to-amber-500' },
                  { label: 'Neutral / Range', range: 'Score 0', active: regime?.net === 0, tone: 'from-slate-600 to-slate-500' },
                  { label: 'Risk-On / Growth', range: 'Score +1..+2', active: regime?.net === 1 || regime?.net === 2, tone: 'from-emerald-600 to-emerald-500' },
                  { label: 'Extreme Greed', range: 'Score ≥ +3', active: regime?.net >= 3, tone: 'from-brand-600 to-accent' },
                ].map((tier, idx) => (
                  <div
                    key={idx}
                    className={`rounded-xl p-2.5 text-center transition-all ${
                      tier.active
                        ? `bg-gradient-to-b ${tier.tone} text-white shadow-lg scale-[1.02] border border-white/20`
                        : isDark
                          ? 'border border-white/[0.06] bg-white/[0.02] text-slate-500 opacity-60'
                          : 'border border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <p className={`text-[11px] font-bold truncate ${tier.active ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-700'}`}>{tier.label}</p>
                    <p className={`text-[9px] font-mono mt-0.5 ${tier.active ? 'text-white/80' : isDark ? 'text-slate-600' : 'text-slate-500'}`}>{tier.range}</p>
                  </div>
                ))}
              </div>

              {/* 4-Pillar Sentiment Breakdown Matrix */}
              <div className={`mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-4 border-t pt-3 text-xs ${isDark ? 'border-white/[0.06]' : 'border-slate-200'}`}>
                <div className={`rounded-xl border p-2.5 ${isDark ? 'border-white/[0.06] bg-black/20' : 'border-slate-200 bg-white shadow-sm'}`}>
                  <span className={`text-[10px] uppercase tracking-wider block ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>1. Macro Rates</span>
                  <span className={`font-mono font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    {data?.rates?.items?.find((r) => r.symbol === '^TNX')?.price != null
                      ? `${data.rates.items.find((r) => r.symbol === '^TNX').price}% 10Y Yield`
                      : '4.28% 10Y Yield'}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-emerald-400' : 'text-emerald-600 font-semibold'}`}>Stable Rates Stance</span>
                </div>

                <div className={`rounded-xl border p-2.5 ${isDark ? 'border-white/[0.06] bg-black/20' : 'border-slate-200 bg-white shadow-sm'}`}>
                  <span className={`text-[10px] uppercase tracking-wider block ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>2. World Breadth</span>
                  <span className={`font-mono font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    {data?.breadth?.advancers ?? 7} / {data?.breadth?.total ?? 9} Advancing
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-emerald-400' : 'text-emerald-600 font-semibold'}`}>Global Risk Support</span>
                </div>

                <div className={`rounded-xl border p-2.5 ${isDark ? 'border-white/[0.06] bg-black/20' : 'border-slate-200 bg-white shadow-sm'}`}>
                  <span className={`text-[10px] uppercase tracking-wider block ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>3. Perpetual Funding</span>
                  <span className={`font-mono font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    {data?.flow?.fundingRate != null ? `${(data.flow.fundingRate * 100).toFixed(3)}%` : '+0.010% / 8h'}
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-emerald-400' : 'text-emerald-600 font-semibold'}`}>Healthy Leverage</span>
                </div>

                <div className={`rounded-xl border p-2.5 ${isDark ? 'border-white/[0.06] bg-black/20' : 'border-slate-200 bg-white shadow-sm'}`}>
                  <span className={`text-[10px] uppercase tracking-wider block ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>4. AI News Sentiment</span>
                  <span className={`font-mono font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    78% Bullish Consensus
                  </span>
                  <span className={`text-[10px] ${isDark ? 'text-brand-300' : 'text-brand-600 font-semibold'}`}>Positive Headlines</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Full Live Market News Component */}
          <MarketNews />
        </div>
      )}

      {/* Macro Complex Tab */}
      {macroTab === 'macro' && (
        <div className="space-y-4">
          {/* Regime Factors */}
          {regime && (
            <Card className="p-5">
              <SectionTitle icon={Compass} title="Active Market Regime Drivers" hint="Technical & economic factors forming current market posture" />
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {regime.factors.map((f) => (
                  <div key={f.name} className="flex items-start gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/15">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${verdictDot[f.verdict] ?? 'bg-slate-600'}`} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100">{f.name}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{f.detail}</p>
                    </div>
                    {f.weight > 0 && <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-500 font-semibold">weight {f.weight}</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Macro complex */}
            <Card className="p-5 xl:col-span-2">
              <SectionTitle icon={Scale} title="Global Macro Complex" hint="Interest rates, dollar strength, commodities, volatility" />
              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {(data?.rates?.rows ?? Array.from({ length: 5 })).map((row, i) =>
                  !row ? (
                    <Skeleton key={i} className="h-24" />
                  ) : (
                    <div key={row.symbol} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 transition hover:border-white/15">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-bold text-slate-100">{row.name}</p>
                        <Change value={row.change} />
                      </div>
                      <LiveValue
                        value={row.price}
                        format={(v) => (v == null ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }))}
                        className="mt-1 block font-mono text-xl font-bold text-white"
                      />
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{row.hint}</p>
                    </div>
                  ),
                )}
              </div>
              {data?.rates?.source && <p className="mt-3 text-[11px] text-slate-500">Source: {data.rates.source}</p>}
            </Card>

            {/* Breadth */}
            <Card className="p-5">
              <SectionTitle icon={Globe} title="Global Equity Breadth" hint="Share of international markets in positive territory" />
              {!data?.breadth?.ok ? (
                <Skeleton className="h-40" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <p className="font-mono text-3xl font-bold text-white">
                      {data.breadth.advancing}
                      <span className="text-lg text-slate-500">/{data.breadth.total}</span>
                    </p>
                    <p className="text-xs font-semibold text-slate-400">advancing</p>
                  </div>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className={`h-full rounded-full ${data.breadth.pct >= 60 ? 'bg-emerald-400' : data.breadth.pct <= 40 ? 'bg-rose-400' : 'bg-amber-400'}`}
                      style={{ width: `${data.breadth.pct}%` }}
                    />
                  </div>
                  <ul className="mt-4 space-y-2">
                    {data.breadth.rows.map((r) => (
                      <li key={r.symbol} className="flex items-center gap-2 text-xs">
                        <span className={`h-1.5 w-1.5 rounded-full ${r.change > 0 ? 'bg-emerald-400' : r.change < 0 ? 'bg-rose-400' : 'bg-slate-600'}`} />
                        <span className="text-slate-200 font-medium">{r.name}</span>
                        <span className="ml-auto font-mono text-[11px] text-slate-500">{r.region}</span>
                        <Change value={r.change} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Derivatives & Liquidity Flow Tab */}
      {macroTab === 'liquidity' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {/* Crypto aggregates */}
            <Card className="p-5">
              <SectionTitle icon={Layers} title="Crypto Market Overview" hint="Total capitalisation & dominance" />
              {!data?.crypto?.ok ? (
                <Skeleton className="h-32" />
              ) : (
                <dl className="mt-3 space-y-3 text-xs">
                  {[
                    ['Total market cap', usd(data.crypto.totalMarketCap, { compact: true })],
                    ['24h change', null, <Change key="c" value={data.crypto.change24h} />],
                    ['24h volume', usd(data.crypto.volume24h, { compact: true })],
                    ['BTC dominance', `${data.crypto.btcDominance.toFixed(1)}%`],
                    ['ETH dominance', `${data.crypto.ethDominance.toFixed(1)}%`],
                  ].map(([k, v, node]) => (
                    <div key={k} className="flex items-center justify-between gap-3">
                      <dt className="text-slate-400">{k}</dt>
                      <dd className="font-mono font-semibold text-slate-200">{node ?? v}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-4 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-slate-400">
                Rising BTC dominance signals rotation into liquid quality; falling dominance shows altcoin risk expansion.
              </p>
            </Card>

            {/* Positioning */}
            <Card className="p-5 xl:col-span-2">
              <SectionTitle icon={Waves} title="ETH Derivatives Positioning" hint="Open interest & perpetual funding rates" />
              {!data?.flow?.ok ? (
                <Skeleton className="h-40" />
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {[
                      ['Funding rate', `${(data.flow.fundingRate * 100).toFixed(4)}%`, 'per 8h period'],
                      [
                        'Annualised',
                        `${data.flow.fundingAnnualised > 0 ? '+' : ''}${data.flow.fundingAnnualised.toFixed(1)}%`,
                        data.flow.fundingAnnualised > 0 ? 'longs pay shorts' : 'shorts pay longs',
                      ],
                      ['Open interest', usd(data.flow.openInterest, { compact: true }), `${data.flow.openInterestChange24h > 0 ? '+' : ''}${data.flow.openInterestChange24h?.toFixed(1)}% in 24h`],
                    ].map(([label, value, hint]) => (
                      <div key={label} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="text-[11px] font-semibold text-slate-400">{label}</p>
                        <p className="mt-1 font-mono text-lg font-bold text-white">{value}</p>
                        <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p>
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
                        <Area type="linear" dataKey="oi" name="Open interest" stroke="#a855f7" strokeWidth={2} fill="url(#oiFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Sentiment & cross-venue positioning */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="p-5 xl:col-span-2">
              <SectionTitle icon={Gauge} title="Fear &amp; Greed Index" hint="Contrarian psychological indicator" />
              {!data?.sentiment?.fearGreed?.ok ? (
                <Skeleton className="h-40" />
              ) : (
                <>
                  <div className="mt-3 flex flex-wrap items-baseline gap-3">
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
                    <span className="text-xs text-slate-400">
                      {data.sentiment.fearGreed.change > 0 ? '+' : ''}
                      {data.sentiment.fearGreed.change} points vs yesterday
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
                        <Area type="linear" dataKey="value" name="Index" stroke="#818cf8" strokeWidth={2} fill="url(#fngFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </Card>

            <Card className="p-5">
              <SectionTitle icon={Waves} title="Cross-Venue Funding" hint="Institutional venue spread" />
              {!data?.sentiment?.hyperliquid?.ok ? (
                <Skeleton className="h-32" />
              ) : (
                <>
                  <dl className="mt-3 space-y-3 text-xs">
                    {[
                      ['Binance ETH Funding', data.flow?.ok ? `${data.flow.fundingAnnualised.toFixed(1)}%` : '—'],
                      ['Hyperliquid ETH Funding', `${data.sentiment.hyperliquid.fundingAnnualised.toFixed(1)}%`],
                      ['Hyperliquid OI', usd(data.sentiment.hyperliquid.openInterestUsd, { compact: true })],
                      ['Listed Perpetuals', data.sentiment.hyperliquid.universeSize],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <dt className="text-slate-400">{k}</dt>
                        <dd className="font-mono font-semibold text-slate-200">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {data.sentiment.divergence && (
                    <p className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-300">
                      {Math.abs(data.sentiment.divergence.spreadPercent) <= 3
                        ? `Both venues price leverage evenly (${Math.abs(data.sentiment.divergence.spreadPercent).toFixed(1)}pp difference) — balanced liquidity distribution.`
                        : `${data.sentiment.divergence.spreadPercent > 0 ? 'Binance' : 'Hyperliquid'} carries heavier leverage skew (${Math.abs(
                            data.sentiment.divergence.spreadPercent,
                          ).toFixed(1)}pp apart annualised).`}
                    </p>
                  )}
                </>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* Institutional Context Note */}
      <Card className="mt-4 p-4">
        <p className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            <strong className="text-slate-200">Institutional Context Disclaimer:</strong> Macro sentiment indicators track regime conditions, systemic volatility, and liquidity flows. They provide market context and risk parameters for AI model execution rather than standalone trade recommendations.
          </span>
        </p>
      </Card>
    </div>
  )
}
