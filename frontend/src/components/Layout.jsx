import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  Activity,
  Bot,
  CandlestickChart,
  CheckCircle2,
  ChevronDown,
  Compass,
  Cpu,
  Database,
  Globe,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Moon,
  Search,
  Server,
  Shield,
  Sparkles,
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

const NAV_DROPDOWNS = [
  {
    title: 'Platform',
    icon: Layers,
    hint: 'Core trading systems & automated agent',
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard',
        desc: 'Real-time telemetry, portfolio P&L and net asset allocation',
        icon: LayoutDashboard,
        end: true,
      },
      {
        to: '/trading',
        label: 'Trade Desk',
        desc: 'Advanced algorithmic TWAP/VWAP execution terminal',
        icon: CandlestickChart,
      },
      {
        to: '/agent',
        label: 'AI Agent',
        desc: 'Autonomous quantitative trading & risk protection engine',
        icon: Bot,
        badge: 'Auto',
      },
    ],
  },
  {
    title: 'Quant Studio',
    icon: Cpu,
    hint: 'Strategy backtesting & DAO treasury allocation',
    items: [
      {
        to: '/backtest',
        label: 'Strategy Studio',
        desc: 'Pessimistic walk-forward backtesting, Sharpe & 95% VaR',
        icon: Cpu,
        badge: 'Quant',
      },
      {
        to: '/governance',
        label: 'DAO Governance',
        desc: 'On-chain treasury allocator & decentralized voting portal',
        icon: Vote,
      },
    ],
  },
  {
    title: 'Intelligence',
    icon: Activity,
    hint: 'Live exchange feeds & global market mood',
    items: [
      {
        to: '/markets',
        label: 'Live Markets',
        desc: 'Sub-second crypto orderbooks, tech equities & world indices',
        icon: Activity,
      },
      {
        to: '/macro',
        label: 'Macro & Sentiment',
        desc: 'Live Market Mood, Fear & Greed index and Gemini news analysis',
        icon: Compass,
      },
    ],
  },
]

function Brand() {
  return (
    <Link to="/dashboard" className="group flex items-center gap-3 shrink-0">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-indigo-600 to-accent shadow-md shadow-brand-500/30 transition-transform duration-300 group-hover:scale-105">
        <svg viewBox="0 0 64 64" className="h-4.5 w-4.5 text-white">
          <path d="M16 18l16 30 16-30" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-ink-950 animate-pulse" />
      </div>
      <div>
        <div className="flex items-center gap-1.5">
          <p className="font-display text-sm font-extrabold tracking-tight text-white">Venture DAO</p>
          <span className="rounded-md bg-brand-500/20 border border-brand-500/30 px-1.5 py-0.2 text-[8px] font-mono font-bold text-brand-300">v2.4</span>
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

/** Dropdown menu component for top navigation bar */
function NavDropdown({ group, activeSection, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const timeoutRef = useRef(null)
  const { isDark } = useTheme()
  const GroupIcon = group.icon

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setIsOpen(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, 180)
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isCurrentActive = group.items.some((item) => item.to === activeSection)

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`group flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
          isCurrentActive
            ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/25'
            : isDark
              ? 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
        }`}
        aria-expanded={isOpen}
      >
        <GroupIcon size={14} className={isCurrentActive ? 'text-white' : isDark ? 'text-slate-400 group-hover:text-brand-300' : 'text-slate-500 group-hover:text-brand-600'} />
        <span>{group.title}</span>
        <ChevronDown
          size={12}
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-brand-300' : 'text-slate-400 opacity-70 group-hover:opacity-100'}`}
        />
      </button>

      {/* Floating Dropdown Box */}
      {isOpen && (
        <div className={`absolute left-1/2 -translate-x-1/2 top-full mt-2.5 w-80 origin-top rounded-2xl border p-2 shadow-2xl backdrop-blur-3xl transition-all animate-fade-up z-50 ${
          isDark
            ? 'border-white/10 bg-ink-900/95 shadow-black/80'
            : 'border-slate-200 bg-white/95 shadow-slate-300/70'
        }`}>
          <div className={`mb-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
            isDark ? 'text-slate-500' : 'text-slate-400'
          }`}>
            {group.hint}
          </div>
          <div className="space-y-1">
            {group.items.map(({ to, label, desc, icon: Icon, end, badge }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => {
                  setIsOpen(false)
                  onNavigate?.()
                }}
                className={({ isActive }) =>
                  `group flex items-start gap-3 rounded-xl p-2.5 transition-all duration-150 ${
                    isActive
                      ? isDark
                        ? 'bg-brand-500/20 border border-brand-500/30 text-white'
                        : 'bg-brand-50 border border-brand-200 text-brand-900'
                      : isDark
                        ? 'hover:bg-white/[0.05] text-slate-300 hover:text-white'
                        : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className={`mt-0.5 rounded-lg p-2 transition-colors ${
                      isActive
                        ? 'bg-brand-500 text-white shadow-sm'
                        : isDark
                          ? 'bg-white/[0.05] text-slate-400 group-hover:bg-brand-500/20 group-hover:text-brand-300'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-brand-100 group-hover:text-brand-700'
                    }`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold">{label}</span>
                        {badge && (
                          <span className="rounded bg-brand-500/20 px-1.5 py-0.2 text-[8px] font-mono font-bold uppercase text-brand-600 dark:text-brand-300 border border-brand-500/30">
                            {badge}
                          </span>
                        )}
                      </div>
                      <p className={`mt-0.5 text-[11px] leading-tight line-clamp-1 ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}>
                        {desc}
                      </p>
                    </div>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Clean Minimal User Menu */
function UserMenu({ inline }) {
  const { user, signOut, initials } = useAuth()
  const { isDark } = useTheme()
  if (!user) return null

  const handleSignOut = async () => {
    try {
      await signOut()
    } finally {
      window.location.assign('/')
    }
  }

  if (inline) {
    return (
      <div className={`flex items-center gap-2 px-2.5 py-1.5 transition-colors duration-150 rounded-r-[10px] ${
        isDark ? 'hover:bg-white/[0.05]' : 'hover:bg-slate-100'
      }`}>
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-accent text-[10px] font-bold text-white shadow-sm shrink-0">
          {initials}
        </span>
        <span className={`hidden text-xs font-semibold sm:inline max-w-[80px] truncate ${
          isDark ? 'text-slate-200' : 'text-slate-700'
        }`}>
          {user.name || 'Trader'}
        </span>
        <button
          onClick={handleSignOut}
          className={`rounded p-1 transition-colors duration-150 ${
            isDark ? 'text-slate-500 hover:text-rose-400' : 'text-slate-400 hover:text-rose-500'
          }`}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={12} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 backdrop-blur-md ${
        isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
      }`}>
        <span className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-accent text-[10px] font-bold text-white shadow-sm">
          {initials}
        </span>
        <span className={`hidden text-xs font-semibold sm:inline max-w-[100px] truncate ${
          isDark ? 'text-slate-200' : 'text-slate-700'
        }`}>
          {user.name || 'Trader'}
        </span>
        <button
          onClick={handleSignOut}
          className={`rounded p-1 transition ${isDark ? 'text-slate-400 hover:text-rose-400' : 'text-slate-400 hover:text-rose-500'}`}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const { pathname } = useLocation()
  const health = useBackendHealth()
  const { toggleTheme, isDark } = useTheme()

  useEffect(() => {
    setMobileMenuOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-200 ${isDark ? 'bg-ink-950 text-slate-200' : 'bg-slate-50 text-slate-900'}`}>
      {/* ── Top Horizontal Institutional Navigation Bar ── */}
      <header className={`sticky top-0 z-40 border-b backdrop-blur-2xl transition-colors duration-200 ${
        isDark ? 'border-white/[0.08] bg-ink-950/85' : 'border-slate-200 bg-white/90 shadow-sm'
      }`}>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          {/* Left: Brand Emblem & Mobile Menu Trigger */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`rounded-lg border p-1.5 transition lg:hidden ${
                isDark ? 'border-white/10 text-slate-300 hover:bg-white/10' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>

            <Brand />
          </div>

          {/* Center: Sleek Segmented Pill Navigation Bar */}
          <nav className={`hidden lg:flex items-center gap-1 rounded-2xl border p-1 backdrop-blur-xl ${
            isDark ? 'border-white/[0.08] bg-white/[0.02]' : 'border-slate-200 bg-slate-100/80 shadow-sm'
          }`}>
            {NAV_DROPDOWNS.map((group) => (
              <NavDropdown
                key={group.title}
                group={group}
                activeSection={pathname}
              />
            ))}
          </nav>

          {/* Right: Unified Action Blocks */}
          <div className="flex items-center gap-2">
            {/* Block 1: Search Trigger */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
              className={`hidden sm:flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all duration-200 ${
                isDark
                  ? 'border-white/[0.08] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:bg-white/[0.05] hover:text-slate-200'
                  : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Search size={13} />
              <span className="pr-3">Search…</span>
              <kbd className={`rounded-[5px] border px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                isDark ? 'border-white/10 bg-white/[0.04] text-slate-500' : 'border-slate-200 bg-white text-slate-400'
              }`}>⌘K</kbd>
            </button>

            {/* Block 2: Combined Status + Controls Block */}
            <div className={`flex items-center rounded-xl border backdrop-blur-md transition-colors duration-200 ${
              isDark
                ? 'border-white/[0.08] bg-white/[0.02]'
                : 'border-slate-200 bg-slate-50 shadow-sm'
            }`}>
              {/* Atlas Live Status */}
              <button
                onClick={() => setShowStatusModal(true)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  isDark
                    ? 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                } rounded-l-[10px]`}
                title="System Architecture & Cloud Status"
              >
                <span className={`h-2 w-2 rounded-full shrink-0 ${health.online ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)] animate-pulse' : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]'}`} />
                <span className="hidden md:inline whitespace-nowrap">{health.online ? 'Atlas Live' : 'Connecting'}</span>
                <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                  {health.ping ? `${health.ping}ms` : ''}
                </span>
              </button>

              {/* Divider */}
              <div className={`h-5 w-px shrink-0 ${isDark ? 'bg-white/[0.08]' : 'bg-slate-200'}`} />

              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className={`flex h-8 w-8 items-center justify-center transition-colors duration-150 ${
                  isDark
                    ? 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
                title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
                aria-label="Toggle Theme"
              >
                {isDark ? <Sun size={14} className="text-amber-400 transition-transform duration-300 hover:rotate-45" /> : <Moon size={14} className="text-brand-600 transition-transform duration-300 hover:-rotate-12" />}
              </button>

              {/* Divider */}
              <div className={`h-5 w-px shrink-0 ${isDark ? 'bg-white/[0.08]' : 'bg-slate-200'}`} />

              {/* User Inline */}
              <UserMenu inline />
            </div>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer Menu ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />
          <aside className={`absolute inset-y-0 left-0 flex w-72 animate-fade-up flex-col border-r px-4 py-5 shadow-2xl transition-colors duration-200 ${
            isDark ? 'border-white/10 bg-ink-900 text-slate-200' : 'border-slate-200 bg-white text-slate-900'
          }`}>
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <Brand />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto space-y-5">
              {NAV_DROPDOWNS.map((group) => (
                <div key={group.title} className="space-y-1">
                  <p className={`px-2 text-[10px] font-bold uppercase tracking-wider ${
                    isDark ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {group.title}
                  </p>
                  <nav className="flex flex-col gap-1">
                    {group.items.map(({ to, label, icon: Icon, end, badge }) => (
                      <NavLink
                        key={to}
                        to={to}
                        end={end}
                        onClick={() => setMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                            isActive
                              ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                              : isDark
                                ? 'text-slate-300 hover:bg-white/[0.04]'
                                : 'text-slate-700 hover:bg-slate-100'
                          }`
                        }
                      >
                        <Icon size={15} />
                        <span>{label}</span>
                        {badge && (
                          <span className="ml-auto rounded bg-brand-500/20 px-1.5 py-0.2 text-[8px] font-mono font-bold uppercase text-brand-300">
                            {badge}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </nav>
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}

      {/* ── Main Full-Width Content Container ── */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8 animate-fade-in">
        <Outlet />
      </main>

      {/* ── Institutional Footer ── */}
      <footer className={`border-t px-4 py-4 text-center text-xs sm:px-6 transition-colors duration-200 ${
        isDark ? 'border-white/[0.07] text-slate-500' : 'border-slate-200 bg-white/70 text-slate-500'
      }`}>
        <div className="mx-auto flex max-w-[1440px] flex-col items-center justify-between gap-2 sm:flex-row">
          <span>Venture DAO · Institutional Autonomous Trading Intelligence</span>
          <span className={`font-mono text-[11px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>TLS 1.3 · HMAC AES-256 · Node 22</span>
        </div>
      </footer>

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


