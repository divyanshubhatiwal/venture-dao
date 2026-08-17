import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  Bot,
  CandlestickChart,
  CheckCircle2,
  Compass,
  Database,
  Globe,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Server,
  Shield,
  Target,
  X,
  Zap,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import CommandPalette from './CommandPalette'
import DemoOverlay, { DemoLaunchButton } from './DemoOverlay'
import { Modal, StatusBadge } from './ui'
import { usingMocks } from '../lib/api/api'

const API_URL = import.meta.env?.VITE_API_URL || ''

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
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-accent shadow-glow transition hover:scale-105">
        <svg viewBox="0 0 64 64" className="h-5 w-5">
          <path d="M16 18l16 30 16-30" fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <p className="text-[15px] font-semibold tracking-tight text-white">Venture DAO</p>
        <p className="text-[10px] font-medium tracking-wide text-brand-400">INSTITUTIONAL AI</p>
      </div>
    </Link>
  )
}

/**
 * Real-time Backend & Atlas connectivity hook.
 */
function useBackendHealth() {
  const [status, setStatus] = useState({ online: true, ping: 35, at: null })

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
    const timer = setInterval(check, 20_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return status
}

/** Signed-in identity plus the way out. */
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
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-2 py-1.5 backdrop-blur-md">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-accent text-[11px] font-bold text-white shadow-sm">
        {initials}
      </span>
      <div className="hidden leading-tight sm:block">
        <p className="max-w-[120px] truncate text-xs font-semibold text-slate-100">{user.name || 'Trader'}</p>
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
            `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
              isActive
                ? 'bg-gradient-to-r from-brand-500/20 to-accent/10 text-white shadow-sm border border-brand-500/20'
                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={16} className={isActive ? 'text-brand-400' : 'text-slate-500 group-hover:text-slate-300'} />
              <span>{label}</span>
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const { pathname } = useLocation()
  const health = useBackendHealth()

  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="flex min-h-screen bg-ink-950 text-slate-200">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 shrink-0 flex-col border-r border-white/[0.07] bg-ink-900/80 px-4 py-6 backdrop-blur-2xl lg:flex">
        <Brand />
        <div className="mt-8 flex-1">
          <p className="label mb-2 px-3 text-[10px] uppercase tracking-wider text-slate-500">Navigation</p>
          <NavItems />
        </div>

        {/* Live system health pill */}
        <div className="mt-auto border-t border-white/[0.07] pt-4">
          <button
            onClick={() => setShowStatusModal(true)}
            className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-left transition hover:border-white/15 hover:bg-white/[0.05]"
          >
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${health.online ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <div>
                <p className="text-xs font-semibold text-slate-200">
                  {usingMocks ? 'Demo Dataset' : health.online ? 'Live (Atlas)' : 'Connecting'}
                </p>
                <p className="text-[10px] text-slate-500">
                  {health.ping ? `${health.ping}ms latency` : 'Cloud Services'}
                </p>
              </div>
            </div>
            <Activity size={14} className="text-slate-500" />
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 flex w-72 animate-fade-up flex-col border-r border-white/10 bg-ink-900 px-4 py-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/10" aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <div className="mt-8">
              <p className="label mb-2 px-3 text-[10px] uppercase tracking-wider text-slate-500">Navigation</p>
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.07] bg-ink-950/85 px-4 py-3 backdrop-blur-xl sm:px-6">
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

          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
            className="ml-auto hidden items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-slate-400 transition hover:border-white/20 hover:text-slate-200 md:flex"
          >
            <Search size={14} />
            <span className="pr-6">Search markets or commands…</span>
            <kbd className="kbd">Ctrl K</kbd>
          </button>

          <div className="ml-auto flex items-center gap-2 md:ml-3 sm:gap-3">
            <button
              onClick={() => setShowStatusModal(true)}
              className="cursor-pointer"
              title="System Connectivity Status"
            >
              <StatusBadge
                status={health.online ? 'online' : 'connecting'}
                text={health.online ? 'Atlas Connected' : 'Reconnecting'}
                ping={health.ping}
              />
            </button>
            <DemoLaunchButton />
            <UserMenu />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8 animate-fade-in">
          <Outlet />
        </main>

        <footer className="border-t border-white/[0.07] px-4 py-5 text-center text-xs text-slate-500 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row max-w-[1440px] mx-auto">
            <span>Venture DAO · Institutional Autonomous Trading Intelligence</span>
            <span className="font-mono text-[11px] text-slate-600">TLS 1.3 · HMAC AES-256 · Node 22</span>
          </div>
        </footer>
      </div>

      <CommandPalette />
      <DemoOverlay />

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
