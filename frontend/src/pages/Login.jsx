import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Flame,
  Globe,
  Key,
  Layers,
  Loader2,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'

/**
 * Institutional-Grade Authentication Portal.
 *
 * Provides a modern, secure, and responsive interface for both Sign In
 * and Account Registration backed by Scrypt hashing, Bearer auth, and MongoDB Atlas.
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
  const [rememberMe, setRememberMe] = useState(true)
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState(null)

  const creating = mode === 'register'
  const destination = location.state?.from?.pathname || '/dashboard'

  // Dynamic password strength scoring (0-4)
  const passwordStrength = useMemo(() => {
    if (!password) return 0
    let score = 0
    if (password.length >= 10) score++
    if (password.length >= 14) score++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
    if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score++
    return score
  }, [password])

  const strengthColor = useMemo(() => {
    switch (passwordStrength) {
      case 1:
        return 'bg-rose-500 text-rose-400'
      case 2:
        return 'bg-amber-500 text-amber-400'
      case 3:
        return 'bg-blue-500 text-blue-400'
      case 4:
        return 'bg-emerald-500 text-emerald-400'
      default:
        return 'bg-slate-700 text-slate-500'
    }
  }, [passwordStrength])

  const strengthLabel = useMemo(() => {
    switch (passwordStrength) {
      case 1:
        return 'Weak'
      case 2:
        return 'Moderate'
      case 3:
        return 'Strong'
      case 4:
        return 'Very Strong'
      default:
        return 'Too short'
    }
  }, [passwordStrength])

  const validate = () => {
    const next = {}
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'Please enter a valid email address.'
    if (creating && password.length < 10) next.password = 'Password must be at least 10 characters.'
    if (!creating && !password) next.password = 'Password is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    try {
      const user = creating ? await register({ email, password, name }) : await signIn({ email, password })
      toast({
        tone: 'success',
        title: creating ? 'Welcome to Venture DAO' : 'Signed in successfully',
        description: `Authenticated as ${user.email}`,
      })
      navigate(destination, { replace: true })
    } catch (err) {
      setFormError(err.message || 'Authentication failed. Please verify credentials.')
    }
  }

  const fillDemo = () => {
    setEmail('trader@venturedao.io')
    setPassword('VentureDAO2026!')
    setName('Quantitative Trader')
    setErrors({})
    setFormError(null)
  }

  return (
    <div className="flex min-h-screen bg-ink-950 text-slate-200">
      {/* ── Left Institutional Showcase Panel ── */}
      <aside className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-white/[0.08] bg-ink-900/60 p-12 lg:flex xl:p-16">
        {/* Glow ambient meshes */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-brand-600/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 right-0 h-96 w-96 rounded-full bg-accent/10 blur-3xl"
        />

        {/* Top brand header */}
        <div className="relative z-10 flex items-center justify-between">
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
              <p className="text-[10px] font-semibold uppercase tracking-widest text-brand-400">Institutional Protocol</p>
            </div>
          </Link>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Institutional Network Online
          </span>
        </div>

        {/* Center narrative & telemetry showcase */}
        <div className="relative z-10 my-auto max-w-lg space-y-8 py-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-300">
              <Sparkles size={14} />
              <span>Next-Generation Quantitative Agent</span>
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-white xl:text-4xl">
              Algorithmic execution built on mathematical safety gates.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Multi-regime machine learning models and real-time orderbook micro-structure analysis protect portfolios
              against asymmetric drawdowns.
            </p>
          </div>

          {/* Institutional Feature Highlights */}
          <div className="space-y-3">
            {[
              {
                icon: ShieldCheck,
                title: 'Capital-Preservation First',
                desc: 'Strict drawdowns, daily loss ceilings, and deterministic stop-loss preflights.',
              },
              {
                icon: Cpu,
                title: 'Machine Learning Signal Engine',
                desc: 'Walk-forward precision validation trained to avoid uncalibrated overconfidence.',
              },
              {
                icon: Key,
                title: 'AES-256-GCM Vault Isolation',
                desc: 'Exchange credentials encrypted at rest with per-record hardware-level salt.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 backdrop-blur-md transition hover:border-white/15 hover:bg-white/[0.04]"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand-500/20 bg-brand-500/10 text-brand-300">
                  <Icon size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">{title}</h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Trust & Compliance Footer */}
        <div className="relative z-10 border-t border-white/[0.08] pt-4 text-xs text-slate-500 flex items-center justify-between">
          <span>Encrypted with TLS 1.3 · Hardware-Salted AES-256 Vault</span>
          <span className="font-mono text-[11px] text-slate-600">v1.0.0-PROD</span>
        </div>
      </aside>

      {/* ── Right Authentication Card Panel ── */}
      <main className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 md:px-16 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile brand header */}
          <div className="mb-8 flex items-center justify-between lg:hidden">
            <Link to="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-accent">
                <svg viewBox="0 0 64 64" className="h-4 w-4">
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
              <span className="text-sm font-bold text-white">Venture DAO</span>
            </Link>
            <Link to="/" className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
              <ArrowLeft size={13} /> Back to Home
            </Link>
          </div>

          {/* Form Header */}
          <div className="text-left">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {creating ? 'Create Trading Account' : 'Welcome Back'}
            </h2>
            <p className="mt-2 text-xs text-slate-400 sm:text-sm">
              {creating
                ? 'Join institutional quantitative desks and autonomous algorithmic traders.'
                : 'Access your portfolio dashboard and trading algorithms.'}
            </p>
          </div>

          {/* Modern Tab Selector */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-ink-900/90 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => {
                setMode('signin')
                setErrors({})
                setFormError(null)
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                !creating
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Lock size={13} />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register')
                setErrors({})
                setFormError(null)
              }}
              className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition ${
                creating
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User size={13} />
              <span>Register</span>
            </button>
          </div>

          {/* Error Banner */}
          {formError && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 animate-fade-in">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-400" />
              <span>{formError}</span>
            </div>
          )}

          {/* Form Element */}
          <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
            {creating && (
              <div>
                <label htmlFor="name" className="label mb-1.5 block text-xs font-semibold text-slate-300">
                  Full Name / Desk Label
                </label>
                <div className="relative">
                  <User size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Divyanshu Bhatiwal"
                    className="input pl-10 h-11 text-sm bg-white/[0.03] border-white/10 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="label mb-1.5 block text-xs font-semibold text-slate-300">
                Work / Trader Email
              </label>
              <div className="relative">
                <Mail size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@company.com"
                  className={`input pl-10 h-11 text-sm bg-white/[0.03] border-white/10 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 ${
                    errors.email ? 'border-rose-500/60 ring-1 ring-rose-500/20' : ''
                  }`}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertCircle size={12} />
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="label text-xs font-semibold text-slate-300">
                  {creating ? 'Master Password' : 'Password'}
                </label>
                {!creating && (
                  <a
                    href="#forgot"
                    onClick={(e) => {
                      e.preventDefault()
                      toast({
                        tone: 'info',
                        title: 'Password Recovery',
                        description: 'Please contact support or your account administrator to reset your credentials.',
                      })
                    }}
                    className="text-[11px] text-brand-400 hover:text-brand-300 transition"
                  >
                    Forgot Password?
                  </a>
                )}
              </div>
              <div className="relative">
                <Lock size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={creating ? 'new-password' : 'current-password'}
                  placeholder={creating ? 'Min 10 characters with symbols' : '••••••••••••'}
                  className={`input pl-10 pr-11 h-11 text-sm bg-white/[0.03] border-white/10 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 ${
                    errors.password ? 'border-rose-500/60 ring-1 ring-rose-500/20' : ''
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 transition hover:text-slate-300"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Real-time Password Strength Meter (Registration Mode) */}
              {creating && password && (
                <div className="mt-2.5 space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Password Security Level:</span>
                    <span className={`font-semibold ${strengthColor.split(' ')[1]}`}>{strengthLabel}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`rounded-full transition-colors duration-300 ${
                          passwordStrength >= step ? strengthColor.split(' ')[0] : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {errors.password && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertCircle size={12} />
                  {errors.password}
                </p>
              )}
            </div>

            {/* Remember device checkbox */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-400 select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-brand-500 focus:ring-brand-400 focus:ring-offset-ink-950"
                />
                <span>Remember this workstation</span>
              </label>

              <button
                type="button"
                onClick={fillDemo}
                className="text-[11px] font-medium text-slate-500 hover:text-brand-300 transition flex items-center gap-1"
                title="Fill sample demo credentials"
              >
                <Zap size={12} />
                <span>Fill Demo</span>
              </button>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={pending}
              className="btn-primary w-full h-11 py-2.5 text-sm font-semibold shadow-lg shadow-brand-500/20 transition hover:shadow-brand-500/30"
            >
              {pending ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  <span>Authenticating...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <span>{creating ? 'Create Vault Account' : 'Authenticate Session'}</span>
                  <ArrowRight size={15} />
                </span>
              )}
            </button>
          </form>

          {/* Quick toggle footer */}
          <div className="mt-8 border-t border-white/[0.07] pt-5 text-center text-xs text-slate-500">
            {creating ? 'Already have an authenticated profile?' : 'Need to create an institutional desk account?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(creating ? 'signin' : 'register')
                setErrors({})
                setFormError(null)
              }}
              className="font-semibold text-brand-400 transition hover:text-brand-300 underline underline-offset-4"
            >
              {creating ? 'Sign in here' : 'Register now'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
