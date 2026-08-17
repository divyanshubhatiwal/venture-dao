import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  CandlestickChart,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Database,
  Eye,
  Flame,
  Globe,
  Key,
  Layers,
  LineChart,
  Lock,
  Play,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Terminal,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMarket } from '../context/MarketContext'
import CountUp from '../components/CountUp'
import Reveal from '../components/Reveal'
import TiltCard from '../components/TiltCard'
import LiveTradingBackground from '../components/LiveTradingBackground'

/**
 * Institutional Public Landing Page with 3D Holographic Trading Grid.
 *
 * Professional, high-conversion, quantitative fintech design with
 * live market telemetry, interactive 3D perspective floor, and physics-based card responses.
 */

const BENTO_FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Deterministic Risk Gates',
    tag: 'Non-Negotiable Preflight',
    desc: 'Every single order is screened through three strict mathematical filters before reaching the exchange: maximum drawdown ceilings, daily loss limits, and reward-to-cost ratios.',
    stat: '100% Veto Authority',
    tone: 'from-brand-500/20 to-indigo-500/10 border-brand-500/30',
  },
  {
    icon: Brain,
    title: 'Walk-Forward ML Signal Engine',
    tag: 'Zero Lookahead Bias',
    desc: 'Machine learning classification models calibrated to report precision and baseline comparisons rather than inflated historical overfitting.',
    stat: '4-Feature Gradient',
    tone: 'from-accent/20 to-fuchsia-500/10 border-accent/30',
  },
  {
    icon: Activity,
    title: 'Live Exchange Telemetry',
    tag: 'Real-Time Streaming',
    desc: 'Direct WebSocket ticker streams and sub-second candle merging from Binance and Delta Exchange ensure decisions always execute on true current market structure.',
    stat: '<30ms Ingestion',
    tone: 'from-emerald-500/20 to-teal-500/10 border-emerald-500/30',
  },
  {
    icon: Key,
    title: 'Cryptographic Vault Security',
    tag: 'Hardware-Salted AES-256',
    desc: 'Exchange credentials and session secrets are encrypted at rest with hardware-level AES-256-GCM. Third-party zero-knowledge key isolation.',
    stat: 'Zero-Knowledge At Rest',
    tone: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  },
]

const PIPELINE_STEPS = [
  {
    step: '01',
    title: 'Market Structure & Volatility Scan',
    desc: 'The ingestor parses real-time ATR, Exponential Moving Averages, and orderbook imbalance across BTC, ETH, SOL, and LINK.',
    icon: CandlestickChart,
  },
  {
    step: '02',
    title: 'Machine Learning Signal Inference',
    desc: 'Trained model predicts directional probability and scores whether expected payoff exceeds historical round-trip fee friction.',
    icon: Brain,
  },
  {
    step: '03',
    title: 'Mathematical Risk Preflight Gate',
    desc: 'Checks daily session limits, current account drawdown, and enforces automatic hard stop-loss placement.',
    icon: ShieldCheck,
  },
  {
    step: '04',
    title: 'Autonomous Exchange Dispatch',
    desc: 'Orders are sized with fractional Kelly limits and routed via HMAC-signed execution or simulated paper ledger.',
    icon: Zap,
  },
]

function LaunchButton({ className = '', text = 'Launch Terminal' }) {
  const { signedIn } = useAuth()
  return (
    <Link
      to={signedIn ? '/dashboard' : '/login'}
      className={`btn-primary flex items-center justify-center gap-2.5 font-semibold shadow-lg shadow-brand-500/25 transition hover:scale-[1.03] active:scale-[0.98] ${className}`}
    >
      <span>{signedIn ? 'Enter Trading Terminal' : text}</span>
      <ArrowRight size={16} />
    </Link>
  )
}

function LiveTickerStrip() {
  const { tickers } = useMarket()
  const rows = (tickers ?? []).slice(0, 8)
  if (rows.length < 2) return null

  const items = [
    { symbol: 'BTC/USD', price: 68420.5, change: 2.34 },
    { symbol: 'ETH/USD', price: 2645.8, change: 3.12 },
    { symbol: 'SOL/USD', price: 178.4, change: 5.67 },
    { symbol: 'LINK/USD', price: 14.85, change: 1.45 },
    { symbol: 'SPY', price: 542.1, change: 0.42 },
    { symbol: 'QQQ', price: 478.9, change: 0.88 },
  ]

  const displayRows = rows.length ? rows : items

  const Row = ({ hidden }) => (
    <div className="flex shrink-0 items-center gap-10 px-6 py-2.5" aria-hidden={hidden || undefined}>
      {displayRows.map((t, idx) => {
        const isPos = (t.change24h ?? t.change ?? 0) >= 0
        const price = t.price ?? 0
        return (
          <span key={`${t.symbol}-${idx}`} className="flex items-center gap-2.5 whitespace-nowrap text-xs">
            <span className="font-mono font-bold text-slate-300">{t.symbol}</span>
            <span className="font-mono text-slate-400">
              ${price >= 100 ? price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : price.toFixed(2)}
            </span>
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
                isPos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
              }`}
            >
              {isPos ? '+' : ''}
              {(t.change24h ?? t.change ?? 0).toFixed(2)}%
            </span>
          </span>
        )
      })}
    </div>
  )

  return (
    <div className="relative overflow-hidden border-y border-white/[0.08] bg-ink-950/80 backdrop-blur-md">
      <div className="flex w-max animate-marquee">
        <Row />
        <Row hidden />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink-950 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  )
}

export default function Landing() {
  const { signedIn } = useAuth()

  return (
    <div className="min-h-screen bg-ink-950 text-slate-200 selection:bg-brand-500/30 selection:text-white">
      {/* ── Top Floating Navigation Header ── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-ink-950/80 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-accent shadow-glow transition group-hover:scale-105">
              <svg viewBox="0 0 64 64" className="h-5 w-5">
                <path
                  d="M16 18l16 30 16-30"
                  fill="none"
                  stroke="white"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-white">Venture DAO</p>
              <p className="text-[10px] font-semibold tracking-wider text-brand-400">QUANTITATIVE PROTOCOL</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex text-xs font-medium text-slate-400">
            <a href="#features" className="transition hover:text-white">
              Architecture
            </a>
            <a href="#pipeline" className="transition hover:text-white">
              Signal Pipeline
            </a>
            <a href="#cockpit" className="transition hover:text-white">
              Live Cockpit
            </a>
            <a href="#benchmarks" className="transition hover:text-white">
              Benchmarks
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to={signedIn ? '/dashboard' : '/login'}
              className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              {signedIn ? 'Dashboard' : 'Sign In'}
            </Link>
            <LaunchButton text="Open Terminal" className="hidden sm:flex px-4 py-2 text-xs" />
          </div>
        </div>
      </header>

      {/* ── Live Market Ticker Strip ── */}
      <LiveTickerStrip />

      {/* ── Hero Section with 3D Hologram Trading Floor ── */}
      <section className="relative overflow-hidden px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        {/* Ambient Live Trading Graph & Lighting */}
        <LiveTradingBackground />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-brand-600/20 via-accent/15 to-transparent blur-[140px]"
        />

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs font-medium text-brand-300 shadow-sm backdrop-blur-md">
              <span className="flex h-2 w-2 rounded-full bg-brand-400 animate-ping" />
              <span>Autonomous Algorithmic Trading Protocol · Quantitative Telemetry</span>
            </div>

            <h1 className="mt-8 text-balance text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl">
              Autonomous Quantitative Intelligence <br />
              <span className="bg-gradient-to-r from-brand-400 via-indigo-200 to-accent bg-clip-text text-transparent">
                Guarded by Mathematical Safety.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
              Multi-regime machine learning classifiers, deterministic risk preflight gates, and millisecond exchange
              telemetry. Protects capital first, executes with precision second.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <LaunchButton text="Launch Autonomous Terminal" className="w-full sm:w-auto px-8 py-3.5 text-sm" />
              <a
                href="#cockpit"
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.03] px-7 py-3.5 text-sm font-semibold text-slate-300 transition hover:border-white/30 hover:bg-white/[0.08]"
              >
                <Terminal size={16} />
                <span>Explore Live Cockpit</span>
              </a>
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" /> Real-Time Telemetry Streaming
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" /> Delta Exchange HMAC Live / Testnet
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-400" /> Gemini AI Sentiment Filter
              </span>
            </div>
          </div>
        </div>

        {/* ── Real Decision & Portfolio Telemetry Showcase (Tilt Card) ── */}
        <div className="relative z-10 mx-auto mt-16 max-w-5xl">
          <TiltCard maxTilt={4} glare={true} scale={1.01} className="rounded-2xl shadow-2xl">
            <div className="relative rounded-2xl border border-white/15 bg-ink-900/95 p-1.5 backdrop-blur-2xl shadow-[0_25px_60px_rgba(0,0,0,0.6)]">
              {/* Top terminal tab bar */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full bg-rose-500/70" />
                  <span className="h-3 w-3 rounded-full bg-amber-500/70" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
                  <span className="ml-3 font-mono text-xs font-semibold text-slate-400">
                    venturedao-engine://mainnet-gateway
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    PREFLIGHT VETO ACTIVE
                  </span>
                </div>
              </div>

              {/* Inner trading dashboard preview */}
              <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
                {/* Left Column: Live Decision Log */}
                <div className="rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-xs text-slate-300 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1.5 font-semibold text-brand-300">
                      <Zap size={13} /> DECISION MATRIX
                    </span>
                    <span>AUTONOMOUS</span>
                  </div>
                  <div className="space-y-1.5 leading-relaxed text-[11px]">
                    <p className="text-slate-400">
                      <span className="text-brand-400">Symbol:</span> ETH/USD (Binance Ingest)
                    </p>
                    <p className="text-slate-400">
                      <span className="text-brand-400">Mark:</span> $2,642.50 ·{' '}
                      <span className="text-emerald-400">+3.12%</span>
                    </p>
                    <p className="text-slate-400">
                      <span className="text-brand-400">ML Signal:</span> LONG (Confidence: 74.2%)
                    </p>
                    <p className="text-slate-400">
                      <span className="text-brand-400">Risk Filter:</span> Max Drawdown Safe (0.00% / 3.00%)
                    </p>
                    <p className="text-slate-400">
                      <span className="text-brand-400">Cost Barrier:</span> 3.84 R:R &gt; Minimum 1.50 Threshold
                    </p>
                    <div className="mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300 font-semibold text-center">
                      PASSED SAFETY PREFLIGHT · ORDER DISPATCHED
                    </div>
                  </div>
                </div>

                {/* Center Column: Live Metrics */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between space-y-4">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs">
                    <span className="font-semibold text-slate-200">PORTFOLIO TELEMETRY</span>
                    <span className="font-mono text-brand-400">PAPER #1</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] uppercase text-slate-500">Virtual Balance</span>
                      <p className="mt-1 font-mono text-lg font-bold text-white">$10,000.00</p>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] uppercase text-slate-500">Daily Loss Ceiling</span>
                      <p className="mt-1 font-mono text-lg font-bold text-slate-300">-$300.00</p>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] uppercase text-slate-500">Risk Per Trade</span>
                      <p className="mt-1 font-mono text-lg font-bold text-indigo-400">1.00%</p>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <span className="text-[10px] uppercase text-slate-500">Max Open Pos</span>
                      <p className="mt-1 font-mono text-lg font-bold text-emerald-400">2 Positions</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Delta Testnet Sync</span>
                    <span className="text-emerald-400 font-semibold">Healthy (18ms)</span>
                  </div>
                </div>

                {/* Right Column: AI Sentiment Intelligence */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 text-xs">
                    <span className="font-semibold text-slate-200">GEMINI SENTIMENT STREAM</span>
                    <span className="font-mono text-accent">FLASH 2.5</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <p className="text-[11px] text-slate-300 font-medium line-clamp-2">
                        &quot;Ethereum layer-2 gas consumption hits all-time record high amid institutional settlement
                        growth.&quot;
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Macro Pulse</span>
                        <span className="font-bold text-emerald-400">+0.82 BULLISH</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                      <p className="text-[11px] text-slate-300 font-medium line-clamp-2">
                        &quot;Global central banks signal rate pause as liquid risk assets expand liquidity.&quot;
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Central Bank Index</span>
                        <span className="font-bold text-emerald-400">+0.65 EXPANSIVE</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TiltCard>
        </div>
      </section>

      {/* ── Key Architecture Highlights (3D Bento Grid) ── */}
      <section id="features" className="px-6 py-24 border-t border-white/[0.08] bg-ink-900/40">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">
              Institutional Framework
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Architected for safety before scale.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Unlike discretionary algorithms that double down on losing streaks, Venture DAO implements immutable
              mathematical barriers that cannot be overruled.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
            {BENTO_FEATURES.map(({ icon: Icon, title, tag, desc, stat, tone }) => (
              <TiltCard
                key={title}
                maxTilt={6}
                glare={true}
                scale={1.02}
                className={`relative rounded-2xl border bg-gradient-to-br p-8 backdrop-blur-xl shadow-xl ${tone}`}
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/15 bg-white/[0.05] text-white shadow-md">
                    <Icon size={22} />
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 font-mono text-xs text-slate-300">
                    {stat}
                  </span>
                </div>

                <h3 className="mt-6 text-xl font-bold tracking-tight text-white">{title}</h3>
                <p className="mt-1 text-xs font-semibold text-brand-300">{tag}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{desc}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── Step-by-Step Signal Pipeline ── */}
      <section id="pipeline" className="px-6 py-24 border-t border-white/[0.08]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-400">Execution Pipeline</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              From market tick to exchange dispatch.
            </h2>
            <p className="mt-3 text-sm text-slate-400">
              Four deterministic stages execute sequentially on every 60-second cycle.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE_STEPS.map(({ step, title, desc, icon: Icon }) => (
              <TiltCard
                key={step}
                maxTilt={8}
                glare={true}
                scale={1.03}
                className="relative rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-3xl font-black text-white/20">{step}</span>
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-brand-500/20 bg-brand-500/10 text-brand-300">
                    <Icon size={16} />
                  </span>
                </div>
                <h3 className="mt-6 text-base font-bold text-white">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{desc}</p>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ── Quantitative Benchmarks & Scale ── */}
      <section id="benchmarks" className="px-6 py-20 border-t border-white/[0.08] bg-ink-900/60">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4 text-center">
            {[
              ['2,000', 'Monte Carlo Run Replays'],
              ['382', 'Automated Safety Unit Tests'],
              ['<30ms', 'WebSocket Telemetry Feed'],
              ['100%', 'Preflight Loss Gate Coverage'],
            ].map(([num, label]) => (
              <div key={label} className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] shadow-sm">
                <p className="font-mono text-3xl font-extrabold text-white sm:text-4xl">{num}</p>
                <p className="mt-2 text-xs font-medium text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final Call to Action Banner ── */}
      <section className="relative overflow-hidden px-6 py-24 border-t border-white/[0.08]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(600px_350px_at_50%_50%,rgba(99,102,241,0.18),transparent_70%)]"
        />
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Deploy the algorithmic engine to your portfolio.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400 max-w-xl mx-auto">
            Experience real-time telemetry, live candle streaming, and preflight safety verification directly in your
            browser.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <LaunchButton text="Launch Trading Terminal" className="w-full sm:w-auto px-9 py-4 text-base" />
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-7 py-4 text-sm font-semibold text-slate-300 transition hover:bg-white/10"
            >
              <Lock size={15} />
              <span>Sign In with Vault</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Institutional Footer ── */}
      <footer className="border-t border-white/[0.08] px-6 py-10 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-lg bg-brand-500/20 text-brand-300 font-bold text-[10px]">
              VD
            </span>
            <span className="font-semibold text-slate-300">Venture DAO Protocol</span>
          </div>
          <p className="text-center sm:text-left">
            Institutional Algorithmic Intelligence · TLS 1.3 · HMAC Nonce Isolation · Node 22
          </p>
          <div className="flex items-center gap-4 text-slate-400">
            <Link to="/login" className="hover:text-white transition">
              Vault Access
            </Link>
            <a href="#features" className="hover:text-white transition">
              Architecture
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
