import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useMarket } from '../context/MarketContext'
import CountUp from '../components/CountUp'
import Reveal from '../components/Reveal'

/**
 * Public landing page.
 *
 * Two rules hold this page together.
 *
 * Every number on it is one the app actually produced, including the ones that
 * look bad. A trading product advertising returns it cannot demonstrate is the
 * exact thing this project argues against, so the evidence section leads with
 * the failed simulation instead of hiding it.
 *
 * And it is written in plain words. Not because the ideas are simple, but
 * because dense wording is where misleading claims hide most comfortably —
 * "adversarial critic pass" sounds impressive and tells a reader nothing. If a
 * sentence here cannot survive being said simply, it probably should not be
 * said.
 */

const FEATURES = [
  {
    icon: Target,
    title: 'It decides on its own',
    body: 'Every two minutes it looks at four markets and picks the best trade it can find. Most of the time it finds none and does nothing.',
  },
  {
    icon: ShieldCheck,
    title: 'Risk gets the last word',
    body: 'Three checks run in order, and each one can only make a trade smaller — never bigger. Doubling down after a loss cannot happen.',
  },
  {
    icon: CandlestickChart,
    title: 'Prices are live',
    body: 'Prices stream in from Binance and update as they move. Nothing on screen is an old number pretending to be current.',
  },
  {
    icon: Compass,
    title: 'It reads the wider market',
    body: 'A trade is judged against what the rest of the market is doing, not on its own. A good setup in a bad week is still a bad trade.',
  },
  {
    icon: Dices,
    title: 'It tests itself 2,000 times',
    body: 'It replays its own past trades in random orders to see how else things could have gone. If your goal is out of reach, it says so.',
  },
  {
    icon: Brain,
    title: 'It grades its own thinking',
    body: 'Each trade is scored on whether the reasoning was sound, separately from whether it made money. Being right by luck counts as a loss.',
  },
]

const EVIDENCE = [
  { value: '31 / 31', label: 'trades won', note: 'and the account still lost 6.16% — fees cost 4× what the trades made' },
  { value: '0%', label: 'of tests reached the goal', note: '2,000 runs, and every one hit the loss limit first' },
  { value: '0.94', label: 'best score found', note: 'anything under 1.0 loses money. We tried six markets and every variation.' },
  { value: '$0.00', label: 'of real money at risk', note: 'practice mode only — real trading needs two switches this app will not flip' },
]

const SCALE = [
  { value: 2000, label: 'test runs per simulation' },
  { value: 40, label: 'safety tests on the risk rules' },
  { value: 9, label: 'world markets streamed live' },
  { value: 4, label: 'markets checked every cycle' },
]

const PIPELINE = [
  { step: '01', title: 'Find', body: 'It spots a possible trade from price movement and market conditions.' },
  { step: '02', title: 'Challenge', body: 'A second pass tries to prove the trade wrong. If it finds something serious, the trade is dropped.' },
  { step: '03', title: 'Limit', body: 'Hard limits check losses, losing streaks and whether the odds are good enough. This step cannot be overruled.' },
  { step: '04', title: 'Place', body: 'Anything that survives is sized carefully and sent to the practice account.' },
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

/** Eyebrow → headline → optional standfirst. Every section opens the same way,
 *  which is most of what makes a long page feel composed rather than assembled. */
function SectionHead({ eyebrow, title, children, align = 'left' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-300/80">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold leading-[1.15] tracking-tight text-white sm:text-[2.75rem]">{title}</h2>
      {children && <p className="mt-5 text-[15px] leading-relaxed text-slate-400">{children}</p>}
    </div>
  )
}

function Nav({ showCta }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent shadow-glow">
            <svg viewBox="0 0 64 64" className="h-5 w-5">
              <path d="M16 18l16 30 16-30" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <p className="text-[15px] font-semibold tracking-tight text-white">Venture DAO</p>
        </div>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          {[
            ['What it does', '#features'],
            ['How it works', '#pipeline'],
            ['The results', '#evidence'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-lg px-3.5 py-2 text-sm text-slate-400 transition hover:bg-white/[0.05] hover:text-white"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Kept mounted and faded rather than unmounted, so revealing it on
            scroll does not reflow the header. */}
        <div
          className={`ml-auto transition-opacity duration-200 md:ml-5 ${showCta ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
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
    <div className="flex shrink-0 items-center gap-10 px-5" aria-hidden={hidden || undefined}>
      {rows.map((t) => (
        <span key={t.symbol} className="flex items-center gap-2 whitespace-nowrap text-xs">
          <span className="font-mono font-semibold text-slate-400">{t.symbol}</span>
          <span className="num text-slate-500">
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
    <div className="relative overflow-hidden border-b border-white/[0.06] bg-white/[0.015] py-3">
      <div className="flex w-max animate-marquee">
        <Row />
        <Row hidden />
      </div>
      {/* Fade the strip into the page edges so items do not pop in and out. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-ink-950 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ink-950 to-transparent" />
    </div>
  )
}

function Hero({ ctaRef }) {
  return (
    <section className="relative overflow-hidden px-5 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
      {/* Decorative only — hidden from assistive tech rather than announced as an image. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 grid-bg" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[680px] overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[480px] w-[660px] -translate-x-2/3 animate-drift-a rounded-full bg-brand-500/20 blur-[130px]" />
        <div className="absolute -top-28 left-1/2 h-[440px] w-[580px] -translate-x-1/4 animate-drift-b rounded-full bg-accent/15 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <span className="chip border-brand-500/25 bg-brand-500/[0.08] text-brand-200">
          <span className="live-dot" />
          Live prices · practice account
        </span>

        <h1 className="mt-8 text-balance text-[2.75rem] font-semibold leading-[1.06] tracking-[-0.02em] text-white sm:text-7xl">
          A trading bot that admits <span className="grad-text">when it can&rsquo;t win</span>
        </h1>

        <p className="mx-auto mt-7 max-w-xl text-pretty text-lg leading-relaxed text-slate-400">
          It watches live markets, protects your money first and chases profit second. Before it trades, it has to prove
          the trade is worth making. Usually it can&rsquo;t — so it waits.
        </p>

        <div ref={ctaRef} className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LaunchButton className="btn-primary w-full px-7 py-3.5 text-base sm:w-auto" />
          <a href="#evidence" className="btn-ghost w-full px-7 py-3.5 text-base sm:w-auto">
            See the results
          </a>
        </div>

        <p className="mt-6 text-[13px] text-slate-500">No card. No deposit. No real trades.</p>
      </div>

      {/* A real decision block, printed the way the app prints one. */}
      <div className="mx-auto mt-20 max-w-2xl">
        <div className="card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/60" />
            <p className="ml-2 font-mono text-[11px] text-slate-500">a real decision</p>
            <span className="ml-auto chip border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300">NO TRADE</span>
          </div>
          <pre className="overflow-x-auto px-5 py-5 text-left font-mono text-[11px] leading-[1.9] text-slate-400 sm:text-xs">
{`market      ETH
idea        buy — price is trending up
challenge   the safety net is too close to the
            price for how much it's moving today
decision    skip it — no proof this market
            is worth trading
result      wait, and write down why`}
          </pre>
        </div>
        <p className="mt-4 text-center text-[13px] text-slate-500">Most decisions end this way. That is the point.</p>
      </div>

      <div className="mx-auto mt-20 grid max-w-3xl grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.05] sm:grid-cols-4">
        {SCALE.map(({ value, label }, i) => (
          <Reveal key={label} delay={i * 70} className="bg-ink-950/70 px-4 py-6 text-center">
            <CountUp value={value} className="num text-[1.75rem] font-semibold text-white" />
            <p className="mt-2 text-[11px] leading-snug text-slate-500">{label}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="What it does" title="Six parts, one rule">
          The safety limits always run last, so nothing else can talk the bot into a bigger bet.
        </SectionHead>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <Reveal as="article" key={title} delay={(i % 3) * 80} className="card card-hover group p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] transition group-hover:border-brand-400/40 group-hover:bg-brand-500/10">
                <Icon size={18} className="text-brand-300" />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-white">{title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-slate-400">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Pipeline() {
  return (
    <section id="pipeline" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="How it works" title="Four steps to every trade">
          Each step can only shrink a trade, never grow it. That order is what stops the bot chasing a loss.
        </SectionHead>

        <ol className="mt-14 grid gap-5 md:grid-cols-4">
          {PIPELINE.map(({ step, title, body }, i) => (
            <Reveal as="li" key={step} delay={i * 90} className="card card-hover relative p-6">
              <span className="num text-sm font-semibold text-brand-300/70">{step}</span>
              <h3 className="mt-3 text-[17px] font-semibold tracking-tight text-white">{title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-slate-400">{body}</p>
              {i < PIPELINE.length - 1 && (
                <ArrowRight
                  aria-hidden
                  size={15}
                  className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-700 md:block"
                />
              )}
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  )
}

/**
 * The most important section on the page, and the reason for the plain wording
 * everywhere else: these numbers say the strategy loses money. They are stated
 * in words a reader cannot mistake — "anything under 1.0 loses money" rather
 * than "profit factor 0.94".
 */
function Evidence() {
  return (
    <section id="evidence" className="scroll-mt-20 px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="card overflow-hidden">
          <div className="border-b border-white/[0.06] bg-gradient-to-br from-brand-500/[0.08] to-accent/[0.04] px-7 py-8 sm:px-9">
            <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-brand-300/80">Measured, not promised</p>
            <h2 className="mt-3 max-w-2xl text-[1.75rem] font-semibold leading-tight tracking-tight text-white sm:text-[2.5rem]">
              Right now, this strategy loses money
            </h2>
            <p className="mt-5 max-w-2xl text-[15px] leading-relaxed text-slate-400">
              Every number below came out of this app. They are here for the same reason they are inside it: a trading
              tool that only shows you its wins is not a tool, it is a sales pitch.
            </p>
          </div>

          <div className="grid gap-px bg-white/[0.05] sm:grid-cols-2 lg:grid-cols-4">
            {EVIDENCE.map(({ value, label, note }, i) => (
              <Reveal key={label} delay={i * 70} className="bg-ink-950/60 p-6">
                <p className="num text-[1.75rem] font-semibold text-white">{value}</p>
                <p className="mt-1.5 text-sm font-medium text-slate-300">{label}</p>
                <p className="mt-2.5 text-xs leading-relaxed text-slate-500">{note}</p>
              </Reveal>
            ))}
          </div>

          <div className="border-t border-white/[0.06] px-7 py-6 sm:px-9">
            <p className="max-w-3xl text-[14px] leading-relaxed text-slate-400">
              So out of the box, the bot trades nothing at all. It stays out until a market proves itself worth trading.
              That is the correct behaviour — and you can turn it off to watch practice orders go through.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Safety() {
  return (
    <section className="px-5 py-24 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Safety" title="Why it can’t spend your money by accident" align="center" />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Lock,
              title: 'Your keys stay on the server',
              body: 'Exchange keys never reach your browser. Nothing in the page can reach your account, even if someone tampered with it.',
            },
            {
              icon: ShieldCheck,
              title: 'Real trading needs two switches',
              body: 'Both must be turned on deliberately. If only one is set, the app quietly stays in practice mode — so a typo can never spend real money.',
            },
            {
              icon: Bot,
              title: 'Limits you cannot edit',
              body: 'Order size caps and an emergency stop live on the server. Limits the browser can change are not really limits.',
            },
          ].map(({ icon: Icon, title, body }, i) => (
            <Reveal as="article" key={title} delay={i * 80} className="card card-hover p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.08]">
                <Icon size={18} className="text-emerald-300" />
              </span>
              <h3 className="mt-5 text-[17px] font-semibold tracking-tight text-white">{title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-slate-400">{body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="px-5 pb-28 sm:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-[2.75rem]">
          Try it with nothing on the line
        </h2>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-slate-400">
          The practice account starts with fake money and live prices. Watch it think, and watch it decide not to trade.
        </p>
        <div className="mt-9 flex justify-center">
          {/* Full width on a phone, matching the hero's button — a narrow
              button under a full-width one reads as a different action. */}
          <LaunchButton className="btn-primary w-full px-7 py-3.5 text-base sm:w-auto" />
        </div>
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
    const HEADER_H = 68
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
        <Closing />
      </main>

      <footer className="border-t border-white/[0.06] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-xs text-slate-600 sm:flex-row sm:items-center">
          <p>Venture DAO</p>
          <p className="sm:ml-auto">Not financial advice. Markets are uncertain and no target is a promise.</p>
          <span className="hidden items-center gap-1.5 sm:flex">
            <Code2 size={13} />
            Built with React
          </span>
        </div>
      </footer>
    </div>
  )
}
