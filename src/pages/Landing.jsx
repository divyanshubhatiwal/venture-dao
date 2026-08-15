import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  CandlestickChart,
  Compass,
  Code2,
  Dices,
  Lock,
  ShieldCheck,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMarket } from '../context/MarketContext'
import CountUp from '../components/CountUp'
import Reveal from '../components/Reveal'

/**
 * Public landing page. Everything quoted here is a number the app actually
 * produces — including the unflattering ones. A trading product that advertises
 * returns it cannot demonstrate is the exact thing this project was built to
 * argue against, so the evidence band below leads with the failed simulation
 * rather than burying it.
 */

const FEATURES = [
  {
    icon: Target,
    tag: 'AUTO',
    title: 'Goal-based agent',
    body: 'Runs a full decision cycle across four assets every two minutes and acts on the best surviving opportunity — or does nothing at all, which is most cycles.',
  },
  {
    icon: ShieldCheck,
    tag: 'RISK',
    title: 'The risk engine runs last',
    body: 'Signal, then an adversarial critic, then risk. Every stage can only shrink the position, never grow it. Martingale and revenge trading are structurally impossible, not merely discouraged.',
  },
  {
    icon: CandlestickChart,
    tag: 'LIVE',
    title: 'Streaming market data',
    body: 'Prices arrive over a Binance WebSocket and update continuously, with reconnect backoff. Nothing on screen is a thirty-second-old snapshot pretending to be live.',
  },
  {
    icon: Compass,
    tag: 'CTX',
    title: 'Macro & flow context',
    body: 'Funding rates, cross-venue divergence and regime read, so a signal is judged against the environment it fires in rather than in isolation.',
  },
  {
    icon: Dices,
    tag: 'PROOF',
    title: 'Monte Carlo validation',
    body: 'Two thousand runs resample the strategy’s own trades in random order. If the goal is unreachable, the app says so on the same screen as the goal.',
  },
  {
    icon: Brain,
    tag: 'LEARN',
    title: 'Post-trade grading',
    body: 'Every episode is scored on whether the reasoning was sound, separately from whether the trade won. Being right for the wrong reason counts as a loss.',
  },
]

const EVIDENCE = [
  { value: '31 / 31', label: 'winning scalp trades', note: 'and the account still lost 6.16% — fees were 4× the gross profit' },
  { value: '0%', label: 'of runs reached the goal', note: '2,000 Monte Carlo runs; 100% hit the drawdown stop' },
  { value: '0.94', label: 'best profit factor found', note: 'across six symbols and every variant tried — still below 1.0' },
  { value: '$0.00', label: 'of real money at risk', note: 'testnet only; live mode needs two switches the app will not flip' },
]

/** Facts about the build, each one countable from the repo or a run log. */
const SCALE = [
  { value: 2000, label: 'Monte Carlo runs per simulation' },
  { value: 40, label: 'safety tests on the risk engine' },
  { value: 9, label: 'world indices streamed live' },
  { value: 4, label: 'assets scanned every cycle' },
]

const PIPELINE = [
  { step: '01', title: 'Signal', body: 'A setup is proposed from price structure and macro context.' },
  { step: '02', title: 'Critic', body: 'An adversarial pass hunts for reasons the setup is wrong. Critical findings veto it outright.' },
  { step: '03', title: 'Risk engine', body: 'Hard gates check drawdown, daily loss, streaks and expected value. It runs last and cannot be overridden.' },
  { step: '04', title: 'Execution', body: 'Whatever survives is sized in R and routed to the paper simulator or Delta testnet.' },
]

/**
 * The one launch action on the page. It appears in the hero and is mirrored in
 * the sticky header, but never both at once — the header only reveals it once
 * the hero's copy has scrolled away. One button, always reachable, never
 * duplicated on screen.
 */
function LaunchButton({ className = '' }) {
  const { signedIn } = useAuth()
  return (
    <Link to={signedIn ? '/dashboard' : '/login'} className={className}>
      {signedIn ? 'Open app' : 'Launch app'}
      <ArrowRight size={16} />
    </Link>
  )
}

function Nav({ showCta }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent shadow-glow">
            <svg viewBox="0 0 64 64" className="h-5 w-5">
              <path d="M16 18l16 30 16-30" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-white">VentureDAO</p>
            <p className="text-[10px] font-medium uppercase tracking-[.16em] text-slate-500">Investment Intelligence</p>
          </div>
        </div>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {[
            ['Features', '#features'],
            ['How it works', '#pipeline'],
            ['Evidence', '#evidence'],
          ].map(([label, href]) => (
            <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-slate-100">
              {label}
            </a>
          ))}
        </nav>

        {/* Kept mounted and faded rather than unmounted, so revealing it on
            scroll does not reflow the header. */}
        <div
          className={`ml-auto transition-opacity duration-200 md:ml-4 ${showCta ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          aria-hidden={!showCta}
        >
          <LaunchButton className="btn-primary btn-sm sm:px-4 sm:py-2 sm:text-sm" />
        </div>
      </div>
    </header>
  )
}

/**
 * Live prices, scrolling. Real ones — the landing page renders inside the same
 * MarketProvider the app uses, so this is the actual websocket feed rather than
 * a decorative loop of invented numbers on a page that argues for honesty.
 *
 * The row is duplicated and the track translated exactly -50%, which is what
 * makes the wrap seamless: at the end of the cycle the second copy sits exactly
 * where the first began. The duplicate is aria-hidden so a screen reader hears
 * the list once.
 */
function Ticker() {
  const { tickers } = useMarket()
  const rows = (tickers ?? []).slice(0, 8)
  if (rows.length < 2) return null

  const Row = ({ hidden }) => (
    <div className="flex shrink-0 items-center gap-8 px-4" aria-hidden={hidden || undefined}>
      {rows.map((t) => (
        <span key={t.symbol} className="flex items-center gap-2 whitespace-nowrap text-xs">
          <span className="font-mono font-bold text-slate-300">{t.symbol}</span>
          <span className="num text-slate-400">
            ${t.price?.toLocaleString('en-US', { maximumFractionDigits: t.price >= 100 ? 0 : 2 })}
          </span>
          <span className={`num font-semibold ${(t.change24h ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {(t.change24h ?? 0) >= 0 ? '+' : ''}
            {(t.change24h ?? 0).toFixed(2)}%
          </span>
        </span>
      ))}
    </div>
  )

  return (
    <div className="relative overflow-hidden border-b border-white/[0.07] bg-white/[0.02] py-2.5">
      <div className="flex w-max animate-marquee">
        <Row />
        <Row hidden />
      </div>
      {/* Fade the strip into the page edges so items do not pop in and out. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-ink-950 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  )
}

function Hero({ ctaRef }) {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
      {/* Decorative only — hidden from assistive tech rather than announced as an image. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid-bg" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[460px] w-[620px] -translate-x-2/3 animate-drift-a rounded-full bg-brand-500/25 blur-[120px]" />
        <div className="absolute -top-24 left-1/2 h-[420px] w-[560px] -translate-x-1/4 animate-drift-b rounded-full bg-accent/20 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-4xl text-center">
        <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-200">
          <span className="live-dot" />
          Delta testnet connected · live streaming data
        </span>

        <h1 className="mt-6 text-balance text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
          An autonomous trading agent that <span className="grad-text">tells you when it has no edge</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-slate-400 sm:text-lg">
          VentureDAO runs a goal-based agent over live crypto markets: capital protection first, target second. It
          backtests itself, simulates two thousand futures, and refuses to trade a setup it cannot show an edge for.
        </p>

        <div ref={ctaRef} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LaunchButton className="btn-primary w-full px-6 py-3 text-base sm:w-auto" />
          <a href="#evidence" className="btn-ghost w-full px-6 py-3 text-base sm:w-auto">
            See what it measured
          </a>
        </div>

        <p className="mt-5 text-xs text-slate-500">
          Paper account by default · no card, no funding, no live orders
        </p>
      </div>

      {/* Terminal-style panel: a real decision block, formatted the way the app prints one. */}
      <div className="mx-auto mt-16 max-w-3xl">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.07] bg-white/[0.02] px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <p className="ml-2 font-mono text-[11px] text-slate-500">agent · decision cycle</p>
            <span className="ml-auto chip border-emerald-500/30 bg-emerald-500/10 text-emerald-300">NO TRADE</span>
          </div>
          <pre className="overflow-x-auto px-4 py-4 text-left font-mono text-[11px] leading-relaxed text-slate-400 sm:text-xs">
{`━━━ AI TRADING DECISION ━━━
  asset        ETH-PERP
  signal       long · momentum continuation
  critic       stop is 0.83× ATR — too tight for
               current volatility  [CRITICAL]
  risk engine  VETO · no demonstrated edge on
               this symbol (evidence gate)
  action       stand down, log the episode
━━━━━━━━━━━━━━━━━━━━━━━━━━━`}
          </pre>
        </div>
        <p className="mt-3 text-center text-xs text-slate-600">
          Most cycles end like this. That is the feature.
        </p>
      </div>

      <div className="mx-auto mt-16 grid max-w-4xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] sm:grid-cols-4">
        {SCALE.map(({ value, label }, i) => (
          <Reveal key={label} delay={i * 70} className="bg-ink-950/70 px-4 py-5 text-center">
            <CountUp value={value} className="num text-2xl font-bold text-white" />
            <p className="mt-1.5 text-[11px] leading-snug text-slate-500">{label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="label">What it does</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Eight modules, one rule: the risk engine has the last word
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, tag, title, body }, i) => (
            <Reveal as="article" key={title} delay={(i % 3) * 80} className="card card-hover group p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.04] transition group-hover:border-brand-400/40 group-hover:bg-brand-500/10">
                  <Icon size={18} className="text-brand-300" />
                </span>
                <span className="ml-auto rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                  {tag}
                </span>
              </div>
              <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pipeline() {
  return (
    <section id="pipeline" className="scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <p className="label">How a trade is decided</p>
        <h2 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Four stages, each able only to shrink the position
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
          Ordering matters. Because risk evaluates last and its output is capped at the configured base risk, no
          upstream stage — including the language model — can talk the system into a bigger bet after a loss.
        </p>

        <ol className="mt-10 grid gap-4 md:grid-cols-4">
          {PIPELINE.map(({ step, title, body }, i) => (
            <Reveal as="li" key={step} delay={i * 90} className="card card-hover relative p-5">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-brand-400/30 bg-brand-500/10 font-mono text-xs font-bold text-brand-200">
                {step}
              </span>
              <h3 className="mt-3.5 text-base font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
              {i < PIPELINE.length - 1 && (
                <ArrowRight
                  aria-hidden
                  size={16}
                  className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-slate-700 md:block"
                />
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Evidence() {
  return (
    <section id="evidence" className="scroll-mt-20 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="card overflow-hidden">
          <div className="border-b border-white/[0.07] bg-gradient-to-r from-brand-500/10 to-accent/5 px-6 py-5">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-brand-300" />
              <p className="label text-brand-200">Measured, not promised</p>
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              The strategy does not currently have an edge
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
              Every figure below came out of this app. They are on the landing page for the same reason they are on the
              agent screen: a trading tool that only shows you its good simulations is not a tool, it is a pitch.
            </p>
          </div>

          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE.map(({ value, label, note }, i) => (
              <Reveal key={label} delay={i * 70} className="bg-ink-950/60 p-5">
                <p className="num text-2xl font-bold text-white">{value}</p>
                <p className="mt-1 text-sm font-medium text-slate-300">{label}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{note}</p>
              </Reveal>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.07] px-6 py-5 sm:flex-row sm:items-center">
            <TrendingUp size={18} className="shrink-0 text-slate-500" />
            <p className="text-sm leading-relaxed text-slate-400">
              The agent’s evidence gate keeps it flat until a symbol demonstrates an edge — so out of the box, it trades
              nothing. That is the correct behaviour, and you can switch it off to watch orders land on testnet.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Safety() {
  return (
    <section className="px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
        {[
          {
            icon: Lock,
            title: 'Keys never reach the browser',
            body: 'Delta orders are HMAC-signed in the backend process. The API secret is not in the bundle, and the browser cannot reach Delta’s private endpoints at all.',
          },
          {
            icon: ShieldCheck,
            title: 'Live mode needs two switches',
            body: 'DELTA_ENV=live and DELTA_ALLOW_LIVE=true, both set deliberately. One alone silently falls back to testnet, so a typo cannot start moving real funds.',
          },
          {
            icon: Bot,
            title: 'Server-side caps and a kill switch',
            body: 'Per-order notional limits and a hard stop are enforced in the backend, where the client cannot edit them. Guards the browser can change are not guards.',
          },
        ].map(({ icon: Icon, title, body }, i) => (
          <Reveal as="article" key={title} delay={i * 80} className="card card-hover p-5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10">
              <Icon size={17} className="text-emerald-300" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export default function Landing() {
  const heroCtaRef = useRef(null)
  const [heroCtaVisible, setHeroCtaVisible] = useState(true)

  // The header CTA is the same action as the hero's, so it stays hidden while
  // the hero's is on screen — one launch button visible at any moment.
  //
  // Measured from scroll position rather than an IntersectionObserver: the
  // observer needs the page to be compositing frames, so it silently never
  // fires in a backgrounded or hidden view. getBoundingClientRect always
  // answers. HEADER_H keeps the swap in step with the sticky bar's height, so
  // the hero button is considered gone once it slides under it.
  useEffect(() => {
    const HEADER_H = 64
    const el = heroCtaRef.current
    if (!el) return

    const update = () => setHeroCtaVisible(el.getBoundingClientRect().bottom > HEADER_H)
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <Nav showCta={!heroCtaVisible} />
      <Ticker />
      <main>
        <Hero ctaRef={heroCtaRef} />
        <Features />
        <Pipeline />
        <Evidence />
        <Safety />
      </main>

      <footer className="border-t border-white/[0.07] px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-slate-600 sm:flex-row sm:items-center">
          <p>VentureDAO · AI-powered decentralised investment intelligence</p>
          <p className="sm:ml-auto">
            Not investment advice. Markets are uncertain and the target is a goal, not a guarantee.
          </p>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Code2 size={13} />
            Built with React, Gemini &amp; Ethereum
          </span>
        </div>
      </footer>
    </div>
  )
}
