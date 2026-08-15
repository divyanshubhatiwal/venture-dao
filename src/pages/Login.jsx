import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Mail, ShieldAlert, Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useWallet } from '../context/WalletContext'
import { useToast } from '../context/ToastContext'

/**
 * Sign-in screen.
 *
 * The form validates shape, not identity — there is no server to check a
 * password against, so the notice below says exactly that rather than
 * implying a security guarantee the app cannot provide. See AuthContext.
 */
export default function Login() {
  const { signIn, signInWithWallet, pending } = useAuth()
  const { connect, connecting, hasMetaMask } = useWallet()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  // Where the user was headed before the gate bounced them here.
  const destination = location.state?.from?.pathname || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const next = {}
    // Deliberately loose: enough to catch a typo, not an attempt at RFC 5322.
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.'
    if (password.length < 8) next.password = 'Use at least 8 characters.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!validate()) return
    await signIn({ email, name })
    toast({ tone: 'success', title: 'Signed in', description: 'Local profile created on this device.' })
    navigate(destination, { replace: true })
  }

  const handleWallet = async () => {
    try {
      // connect() returns the address directly — the context's `account` state
      // is not readable here yet, since the re-render has not happened.
      const { address, demo } = await connect()
      await signInWithWallet(address, { demo })
      toast({
        tone: demo ? 'warning' : 'success',
        title: demo ? 'Demo wallet connected' : 'Wallet connected',
        description: demo ? 'MetaMask was not detected — this is a simulated identity.' : 'Signed in with your address.',
      })
      navigate(destination, { replace: true })
    } catch {
      toast({ tone: 'error', title: 'Connection failed', description: 'The wallet request was rejected.' })
    }
  }

  const busy = pending || connecting

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left: the pitch, so the form is not floating in a void. Hidden on
          mobile where it would just push the inputs below the fold. */}
      <aside className="relative hidden overflow-hidden border-r border-white/[0.07] bg-ink-900/40 lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(500px_360px_at_20%_10%,rgba(99,102,241,.18),transparent_70%)]" />

        <Link to="/" className="flex w-fit items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent shadow-glow">
            <svg viewBox="0 0 64 64" className="h-5 w-5">
              <path d="M16 18l16 30 16-30" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-white">VentureDAO</p>
            <p className="text-[10px] font-medium uppercase tracking-[.16em] text-slate-500">Investment Intelligence</p>
          </div>
        </Link>

        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">
            The agent’s job is to protect capital first and reach the target second.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            Inside you will find a goal-based trading agent wired to live market data and Delta’s testnet, a risk engine
            that can veto anything the model proposes, and a Monte Carlo panel that will happily tell you the goal is
            unreachable.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-4">
            {[
              ['0%', 'runs hit goal'],
              ['100%', 'hit drawdown stop'],
              ['$0', 'real money at risk'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="font-mono text-xl font-bold text-white">{value}</dt>
                <dd className="mt-1 text-[11px] leading-snug text-slate-500">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          Not investment advice. The target is a goal, not a guarantee — the balance can fall and the drawdown limit can
          halt trading permanently.
        </p>
      </aside>

      {/* Right: the form. */}
      <main className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-300 lg:hidden">
            <ArrowLeft size={14} />
            Back to home
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-white">Sign in</h1>
          <p className="mt-2 text-sm text-slate-400">Continue to your paper trading account.</p>

          {/* This is the honest bit. It stays visible rather than living in a
              tooltip, because a user should know what the login is worth. */}
          <div className="mt-6 flex gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3.5">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-400" />
            <p className="text-xs leading-relaxed text-amber-200/80">
              This is a local demo sign-in. There is no server checking your password — any valid-looking email works,
              and the profile is stored on this device only. Do not reuse a real password here.
            </p>
          </div>

          <button
            type="button"
            onClick={handleWallet}
            disabled={busy}
            className="btn-ghost mt-6 w-full py-3"
          >
            {connecting ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
            {connecting ? 'Connecting…' : hasMetaMask ? 'Continue with wallet' : 'Continue with demo wallet'}
          </button>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/[0.08]" />
            <span className="text-[11px] uppercase tracking-[.14em] text-slate-600">or</span>
            <span className="h-px flex-1 bg-white/[0.08]" />
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label htmlFor="name" className="label mb-1.5 block">
                Display name <span className="normal-case tracking-normal text-slate-600">(optional)</span>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                placeholder="Divyanshu"
                className="input"
              />
            </div>

            <div>
              <label htmlFor="email" className="label mb-1.5 block">
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={Boolean(errors.email)}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  className={`input pl-10 ${errors.email ? 'border-rose-500/50 focus:border-rose-500/60 focus:ring-rose-500/10' : ''}`}
                />
              </div>
              {errors.email && (
                <p id="email-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-300">
                  <AlertCircle size={13} />
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label mb-1.5 block">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`input pr-11 ${errors.password ? 'border-rose-500/50 focus:border-rose-500/60 focus:ring-rose-500/10' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-300">
                  <AlertCircle size={13} />
                  {errors.password}
                </p>
              )}
            </div>

            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {pending ? <Loader2 size={16} className="animate-spin" /> : null}
              Sign in
              {!pending && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            No account needed — signing in creates a local profile.{' '}
            <Link to="/" className="text-brand-300 transition hover:text-brand-200">
              Read what the app measured
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  )
}
