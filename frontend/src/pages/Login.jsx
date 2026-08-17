import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Sign in or create an account, against the server.
 *
 * The wallet button that used to sit here has been removed. It called
 * `eth_requestAccounts` and then created a client-side session, which proves
 * nothing: an address is public, and holding one in a browser is not evidence
 * of controlling its key. Alongside a real password login it would have been a
 * second door with no lock on it. Doing it properly means Sign-In With Ethereum
 * — a server-issued nonce, signed by the wallet, verified server-side — and
 * until that exists, no wallet path is better than a decorative one.
 *
 * Password rules here mirror the server's. The server is the authority; these
 * exist only so the answer arrives before a round trip.
 */
export default function Login() {
  const { signIn, register, pending } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)

  const creating = mode === 'register'
  const destination = location.state?.from?.pathname || '/dashboard'

  const validate = () => {
    const next = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Enter a valid email address.'
    // Only enforced when creating an account. Applying it at sign-in would
    // lock out anyone whose existing password predates the rule.
    if (creating && password.length < 10) next.password = 'Use at least 10 characters.'
    if (!creating && !password) next.password = 'Enter your password.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    try {
      const user = creating ? await register({ email, password, name }) : await signIn({ email, password })
      toast({ tone: 'success', title: creating ? 'Account created' : 'Signed in', description: user.email })
      navigate(destination, { replace: true })
    } catch (err) {
      // Shown as given: the server deliberately says the same thing for a wrong
      // password and an unknown email, and softening it here would undo that.
      setFormError(err.message)
    }
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden border-r border-white/[0.07] bg-ink-900/40 lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(500px_360px_at_20%_10%,rgba(99,102,241,.18),transparent_70%)]" />

        <Link to="/" className="flex w-fit items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent shadow-glow">
            <svg viewBox="0 0 64 64" className="h-5 w-5">
              <path d="M16 18l16 30 16-30" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-tight text-white">Venture DAO</p>
            <p className="text-[10px] font-medium uppercase tracking-[.16em] text-slate-500">Investment Intelligence</p>
          </div>
        </Link>

        <div className="max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-white">
            The agent’s job is to protect capital first and reach the target second.
          </h2>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            A trading bot that runs on live market prices, safety checks that can cancel any trade it wants to make, and a
            test that will tell you plainly when your goal is out of reach.
          </p>

          <dl className="mt-10 grid grid-cols-3 gap-4">
            {[
              ['0%', 'runs hit goal'],
              ['100%', 'hit loss from peak stop'],
              ['$0', 'real money at risk'],
            ].map(([value, label]) => (
              <div key={label}>
                <dt className="num text-xl font-bold text-white">{value}</dt>
                <dd className="mt-1 text-[11px] leading-snug text-slate-500">{label}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="text-xs leading-relaxed text-slate-600">
          Not investment advice. The target is a goal, not a guarantee — the balance can fall and the loss from peak limit can
          halt trading permanently.
        </p>
      </aside>

      <main className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-300 lg:hidden">
            <ArrowLeft size={14} />
            Back to home
          </Link>

          <h1 className="text-2xl font-bold tracking-tight text-white">{creating ? 'Create your account' : 'Sign in'}</h1>
          <p className="mt-2 text-sm text-slate-400">
            {creating ? 'Your password is hashed with scrypt and never stored in plain text.' : 'Continue to your trading account.'}
          </p>

          <div className="mt-6 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <Lock size={15} className="mt-0.5 shrink-0 text-emerald-300" />
            <p className="text-xs leading-relaxed text-slate-400">
              Sessions are held in an httpOnly cookie the page cannot read, and checked on the server for every request.
            </p>
          </div>

          {formError && (
            <p className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3 text-xs text-rose-200">
              <AlertCircle size={14} className="shrink-0" />
              {formError}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {creating && (
              <div>
                <label htmlFor="name" className="label mb-1.5 block">
                  Display name <span className="normal-case tracking-normal text-slate-600">(optional)</span>
                </label>
                <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Divyanshu" className="input" />
              </div>
            )}

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
                  className={`input pl-10 ${errors.email ? 'border-rose-500/50' : ''}`}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-300">
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
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  placeholder={creating ? 'At least 10 characters' : 'Your password'}
                  aria-invalid={Boolean(errors.password)}
                  className={`input pr-11 ${errors.password ? 'border-rose-500/50' : ''}`}
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
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-300">
                  <AlertCircle size={13} />
                  {errors.password}
                </p>
              )}
              {creating && !errors.password && (
                <p className="mt-1.5 text-[11px] text-slate-600">Length matters more than symbols. A short phrase you can remember beats P@ssw0rd.</p>
              )}
            </div>

            <button type="submit" disabled={pending} className="btn-primary w-full py-3">
              {pending && <Loader2 size={16} className="animate-spin" />}
              {creating ? 'Create account' : 'Sign in'}
              {!pending && <ArrowRight size={16} />}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            {creating ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(creating ? 'signin' : 'register')
                setErrors({})
                setFormError(null)
              }}
              className="text-brand-300 transition hover:text-brand-200"
            >
              {creating ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </main>
    </div>
  )
}
