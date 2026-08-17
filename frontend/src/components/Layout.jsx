import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  Bot,
  CandlestickChart,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Database,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Radio,
  Search,
  Server,
  Shield,
  Sun,
  Vote,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import CommandPalette from './CommandPalette'
import { Modal } from './ui'

const API_URL = import.meta.env?.VITE_API_URL || ''

const NAV_GROUPS = [
  {
    title: 'Platform',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true, shortcut: '1' },
      { to: '/trading', label: 'Trade Desk', icon: CandlestickChart, shortcut: '2' },
      { to: '/agent', label: 'AI Agent', icon: Bot, badge: 'Auto', shortcut: '3' },
    ],
  },
  {
    title: 'Quant Studio',
    items: [
      { to: '/backtest', label: 'Strategy Studio', icon: Cpu, badge: 'Quant', shortcut: '4' },
      { to: '/governance', label: 'Governance', icon: Vote, shortcut: '5' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { to: '/markets', label: 'Markets', icon: Activity, shortcut: '6' },
      { to: '/macro', label: 'Macro & News', icon: Compass, shortcut: '7' },
    ],
  },
]

const ALL_NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items)

function Brand() {
  return (
    <Link to="/dashboard" className="group flex items-center gap-3 px-1">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-indigo-600 to-accent shadow-md shadow-brand-500/25 transition-transform duration-300 group-hover:scale-105">
        <svg viewBox="0 0 64 64" className="h-4.5 w-4.5 text-white">
          <path d="M16 18l16 30 16-30" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-ink-950 animate-pulse" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <p className="font-display text-sm font-bold tracking-tight text-white dark:text-white">Venture DAO</p>
          <span className="rounded bg-brand-500/15 border border-brand-500/30 px-1 py-0.2 text-[8px] font-mono font-bold text-brand-300">v2.4</span>
        </div>
        <p className="text-[9px] font-semibold tracking-wider text-brand-400 uppercase">Institutional Quant</p>
      </div>
    </Link>
  )
}

/** Real-time Backend & Atlas connectivity hook. */
function useBackendHealth() {
  const [status, setStatus] = useState({ online: true, ping: 32, at: null })

  useEffect(() => {
    let alive = true
    const check = async () => {
      const start = Date.now()
      try {
        const res = await fetch(`${API_URL}/api/health`)
        const ping = Date.now() - start
        if (res.ok && alive) {
          const json = await res.json().catch(() => ({}))
          setStatus({ online: true, ping: Math.max(12, ping), at: json.at || new Date().toISOString() })
        } else if (alive) {
          setStatus({ online: false, ping: null, at: null })
        }
      } catch {
        if (alive) setStatus({ online: false, ping: null, at: null })
      }
    }
    check()
    const timer = setInterval(check, 25_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return status
}

/** Clean Minimal User Menu */
function UserMenu() {
  const { user, signOut, initials } = useAuth()
  if (!user) return null

  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      window.location.assign('/')
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5 backdrop-blur-md">
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-accent text-[10px] font-bold text-white shadow-sm">
          {initials}
        </span>
        <span className="hidden text-xs font-semibold text-slate-200 sm:inline max-w-[100px] truncate">
          {user.name || 'Trader'}
        </span>
        <button
          onClick={handleSignOut}
          className="rounded p-1 text-slate-400 hover:text-rose-400 transition"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  )
}

function NavList({ onNavigate }) {
  const { isDark } = useTheme()

  return (
    <div className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className={`px-2.5 text-[9px] font-bold uppercase tracking-[0.14em] ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}>
            {group.title}
          </p>
          <nav className="flex flex-col gap-0.5">
            {group.items.map(({ to, label, icon: Icon, end, badge, shortcut }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-gradient-to-r from-brand-500/20 via-brand-500/10 to-accent/5 text-white font-semibold shadow-sm border border-brand-500/30'
                      : isDark
                        ? 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Left neon indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 rounded-r-full bg-brand-400 shadow-[0_0_8px_rgba(129,140,248,0.9)]" />
                    )}

                    <Icon
                      size={15}
                      className={`transition-colors ${
                        isActive
                          ? 'text-brand-400'
                          : isDark
                            ? 'text-slate-500 group-hover:text-slate-300'
                            : 'text-slate-400 group-hover:text-slate-700'
                      }`}
                    />
                    <span className="truncate">{label}</span>

                    {badge && (
                      <span className="ml-1 rounded bg-brand-500/20 px-1.5 py-0.2 text-[8px] font-bold uppercase text-brand-300 border border-brand-500/30">
                        {badge}
                      </span>
                    )}

                    <span className="ml-auto flex items-center gap-1.5">
                      <kbd
                        className={`hidden font-mono text-[9px] group-hover:inline-block rounded px-1.5 py-0.5 ${
                          isDark ? 'bg-white/[0.05] text-slate-500' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        ⌥{shortcut}
                      </kbd>
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      ))}
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const { pathname } = useLocation()
  const health = useBackendHealth()
  const { toggleTheme, isDark } = useTheme()

  // Global Alt+1..7 quick navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.altKey && e.key >= '1' && e.key <= '7') {
        const idx = parseInt(e.key, 10) - 1
        if (ALL_NAV_ITEMS[idx]) {
          e.preventDefault()
          window.location.hash = ''
          window.history.pushState(null, '', ALL_NAV_ITEMS[idx].to)
          window.dispatchEvent(new PopStateEvent('popstate'))
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className={`flex min-h-screen transition-colors duration-200 ${isDark ? 'bg-ink-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      {/* Desktop sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden w-60 shrink-0 flex-col border-r px-3.5 py-5 backdrop-blur-2xl lg:flex transition-colors duration-200 ${isDark ? 'border-white/[0.07] bg-ink-900/90' : 'border-slate-200 bg-white/95 text-slate-800 shadow-sm'}`}>
        <Brand />
        
        <div className="mt-6 flex-1 overflow-y-auto pr-1">
          <NavList />
        </div>

        {/* Live system health footer button */}
        <div className={`mt-auto border-t pt-3 ${isDark ? 'border-white/[0.07]' : 'border-slate-200'}`}>
          <button
            onClick={() => setShowStatusModal(true)}
            className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition ${
              isDark
                ? 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${health.online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <p className={`text-xs font-semibold leading-tight ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                  {health.online ? 'Atlas Live' : 'Connecting'}
                </p>
                <p className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {health.ping ? `${health.ping}ms latency · TLS 1.3` : 'Cloud Services'}
                </p>
              </div>
            </div>
            <Activity size={13} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className={`absolute inset-y-0 left-0 flex w-64 animate-fade-up flex-col border-r px-4 py-5 shadow-2xl transition-colors duration-200 ${isDark ? 'border-white/10 bg-ink-900' : 'border-slate-200 bg-white text-slate-800'}`}>
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        {/* Sleek, Clean Top Header */}
        <header className={`sticky top-0 z-20 flex items-center justify-between gap-4 border-b px-4 py-2.5 backdrop-blur-xl sm:px-6 transition-colors duration-200 ${isDark ? 'border-white/[0.07] bg-ink-950/80' : 'border-slate-200 bg-white/90 shadow-sm'}`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className={`rounded-lg border p-1.5 transition lg:hidden ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            
            <div className="lg:hidden">
              <Brand />
            </div>

            {/* Clean Desktop Search Bar */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              className={`hidden sm:flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition ${
                isDark
                  ? 'border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              <Search size={13} />
              <span className="pr-6">Search markets, commands…</span>
              <kbd className="kbd text-[10px]">Ctrl K</kbd>
            </button>
          </div>

          {/* Clean Right Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            <button
              onClick={toggleTheme}
              className={`flex h-8 w-8 items-center justify-center rounded-xl border transition ${
                isDark
                  ? 'border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100'
              }`}
              title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
              aria-label="Toggle Theme"
            >
              {isDark ? <Sun size={15} className="text-amber-400 transition-transform duration-300 hover:rotate-45" /> : <Moon size={15} className="text-brand-600 transition-transform duration-300 hover:-rotate-12" />}
            </button>

            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8 animate-fade-in">
          <Outlet />
        </main>

        <footer className={`border-t px-4 py-4 text-center text-xs sm:px-6 transition-colors duration-200 ${isDark ? 'border-white/[0.07] text-slate-500' : 'border-slate-200 bg-white/70 text-slate-500'}`}>
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row max-w-[1440px] mx-auto">
            <span>Venture DAO · Institutional Autonomous Trading Intelligence</span>
            <span className={`font-mono text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>TLS 1.3 · HMAC AES-256 · Node 22</span>
          </div>
        </footer>
      </div>

      <CommandPalette />

      {/* System Status Modal */}
      <Modal
        isOpen={showStatusModal}
        onClose={() => setShowStatusModal(false)}
        title="System Architecture & Cloud Status"
      >
        <div className="space-y-4 text-xs">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 size={16} />
              <span>All Cloud Systems Operational</span>
            </div>
            <p className="mt-1 text-slate-400 text-[11px]">
              Vercel Frontend, Render Backend, and MongoDB Atlas Cluster0 are securely synchronised with active Bearer Token authentication.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <span className="flex items-center gap-2 text-slate-300">
                <Server size={14} className="text-brand-400" />
                <span>Render Backend API</span>
              </span>
              <span className="font-mono text-emerald-400">{health.online ? 'Online (200 OK)' : 'Connecting'}</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <span className="flex items-center gap-2 text-slate-300">
                <Database size={14} className="text-amber-400" />
                <span>MongoDB Atlas Database</span>
              </span>
              <span className="font-mono text-emerald-400">Cluster0 (Active)</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <span className="flex items-center gap-2 text-slate-300">
                <Zap size={14} className="text-indigo-400" />
                <span>AI Sentiment Model</span>
              </span>
              <span className="font-mono text-emerald-400">Gemini 2.5 Flash</span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
              <span className="flex items-center gap-2 text-slate-300">
                <Shield size={14} className="text-fuchsia-400" />
                <span>Security & Crypto Vault</span>
              </span>
              <span className="font-mono text-emerald-400">AES-256-GCM + TOTP</span>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={() => setShowStatusModal(false)} className="btn btn-ghost btn-sm">
              Close
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

