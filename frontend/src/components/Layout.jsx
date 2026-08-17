import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Bot,
  CandlestickChart,
  Compass,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Target,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import CommandPalette from './CommandPalette'
import DemoOverlay, { DemoLaunchButton } from './DemoOverlay'
import { usingMocks } from '../lib/api/api'

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/markets', label: 'Markets', icon: CandlestickChart },
  { to: '/macro', label: 'Market background', icon: Compass },
  { to: '/trading', label: 'Trade', icon: Bot },
  { to: '/agent', label: 'Trading bot', icon: Target },
]

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent shadow-glow">
        <svg viewBox="0 0 64 64" className="h-5 w-5">
          <path d="M16 18l16 30 16-30" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="text-[15px] font-semibold tracking-tight text-white">Venture DAO</p>
    </Link>
  )
}

/** Signed-in identity plus the way out. */
function UserMenu() {
  const { user, signOut, initials } = useAuth()
  if (!user) return null

  // A full page load rather than a client-side navigation, for two reasons.
  // Practically, clearing the session while still on a protected route lets
  // ProtectedRoute's redirect to /login win the race, so an in-app navigate()
  // lands on the sign-in form instead of the landing page. More importantly,
  // signing out should discard everything the previous session accumulated in
  // memory — open paper positions, episode history, streamed market state —
  // and a reload does that unconditionally, where a route change does not.
  /**
   * Ends the server session first, then does a full page load.
   *
   * The reload is not cosmetic: it discards everything the previous session
   * accumulated in memory — open paper positions, episode history, streamed
   * market state — which a client-side route change would leave sitting there
   * for the next person to sign in on this machine.
   */
  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      window.location.assign('/')
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-accent text-[11px] font-bold text-white">
        {initials}
      </span>
      <div className="hidden leading-tight sm:block">
        <p className="max-w-[120px] truncate text-xs font-semibold text-slate-100">{user.name}</p>
        <p className="text-[10px] text-slate-500">{user.email}</p>
      </div>
      <button
        onClick={handleSignOut}
        className="rounded-md p-1.5 text-slate-500 transition hover:bg-white/10 hover:text-slate-200"
        aria-label="Sign out"
        title="Sign out"
      >
        <LogOut size={14} />
      </button>
    </div>
  )
}

function NavItems({ onNavigate }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition ${
              isActive ? 'bg-white/[0.07] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={`absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-r-full bg-brand-400 transition-opacity ${
                  isActive ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <Icon size={16} className={isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300'} />
              <span className="flex-1">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 flex-col border-r border-white/[0.07] bg-ink-900/70 px-4 py-6 backdrop-blur-xl lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <p className="label mb-2 px-3">Menu</p>
          <NavItems />
        </div>
        {/* Data source, stated once and quietly. The verbose card that used to
            live here repeated setup instructions on every screen. */}
        <div className="flex items-center gap-2 px-3">
          <span className={`h-1.5 w-1.5 rounded-full ${usingMocks ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <p className="text-[11px] text-slate-500">{usingMocks ? 'Demo dataset' : 'Live backend'}</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-up flex-col border-r border-white/10 bg-ink-900 px-4 py-6">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="mt-8">
              <p className="label mb-2 px-3">Menu</p>
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.07] bg-ink-950/80 px-4 py-3 backdrop-blur-xl sm:px-6">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-white/10 p-2 text-slate-300 transition hover:bg-white/10 lg:hidden"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>

          {/* Dispatches the same shortcut the palette listens for, so there is
              one open path rather than two ways to get into the same state. */}
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="ml-auto hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-500 transition hover:border-white/20 hover:text-slate-300 md:flex"
          >
            <Search size={14} />
            <span className="pr-6">Search or jump to…</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2 md:ml-3 sm:gap-3">
            <DemoLaunchButton />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="border-t border-white/[0.07] px-4 py-5 text-center text-xs text-slate-600 sm:px-6">
          Venture DAO · Not investment advice · The target is a goal, not a guarantee
        </footer>
      </div>

      <CommandPalette />
      <DemoOverlay />
    </div>
  )
}
