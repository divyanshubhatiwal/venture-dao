import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  CandlestickChart,
  Command,
  Compass,
  CornerDownLeft,
  LayoutDashboard,
  LogOut,
  PlayCircle,
  Search,
  ShieldCheck,
  Target,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDemo } from '../context/DemoContext'

/**
 * Keyboard-first navigation, opened with Ctrl/Cmd-K.
 *
 * Matching is subsequence-based rather than substring, so "gag" finds "Goal
 * Agent" the way an editor's fuzzy open does. Ranking prefers matches whose
 * characters land close together and at word starts, which is what stops short
 * queries from surfacing an incidental match ahead of the obvious one.
 */

/** Position of every query character in order, or null if they are not all present. */
function fuzzyScore(text, query) {
  if (!query) return 0
  const haystack = text.toLowerCase()
  let score = 0
  let cursor = 0
  let lastHit = -1

  for (const char of query.toLowerCase()) {
    const hit = haystack.indexOf(char, cursor)
    if (hit === -1) return null
    // Adjacent characters and word starts are the strong signals; distance
    // between hits is the penalty. Without this "sa" would rank any item
    // containing an s and a later a as highly as one literally starting "sa".
    if (hit === lastHit + 1) score += 8
    if (hit === 0 || /[\s/&-]/.test(haystack[hit - 1])) score += 6
    score -= Math.min(hit - lastHit - 1, 6)
    lastHit = hit
    cursor = hit + 1
  }
  return score
}

export default function CommandPalette() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const demo = useDemo()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const commands = useMemo(
    () => [
      { id: 'dashboard', label: 'Dashboard', hint: 'Overview and pipeline', icon: LayoutDashboard, group: 'Go to', run: () => navigate('/dashboard') },
      { id: 'markets', label: 'Live Markets', hint: 'Candles, volume, agent outlook', icon: CandlestickChart, group: 'Go to', run: () => navigate('/markets') },
      { id: 'macro', label: 'Macro & Flow', hint: 'Regime, rates, positioning', icon: Compass, group: 'Go to', run: () => navigate('/macro') },
      { id: 'trading', label: 'Signals & Trading', hint: 'Scans, backtest, paper orders', icon: Bot, group: 'Go to', run: () => navigate('/trading') },
      { id: 'agent', label: 'Goal Agent', hint: 'Autonomous run with risk gates', icon: Target, group: 'Go to', run: () => navigate('/agent') },
      { id: 'kyc', label: 'Identity verification', hint: 'KYC status and submission', icon: ShieldCheck, group: 'Go to', run: () => navigate('/kyc') },
      { id: 'demo', label: 'Start judge walkthrough', hint: 'Hands-free guided tour', icon: PlayCircle, group: 'Actions', run: () => demo?.start?.() },
      {
        id: 'signout',
        label: 'Sign out',
        hint: 'Clear this local session',
        icon: LogOut,
        group: 'Actions',
        run: () => {
          signOut()
          window.location.assign('/')
        },
      },
    ],
    [navigate, demo, signOut],
  )

  const results = useMemo(() => {
    if (!query.trim()) return commands
    return commands
      .map((c) => ({ c, score: fuzzyScore(`${c.label} ${c.hint}`, query.trim()) }))
      .filter((r) => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.c)
  }, [commands, query])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }, [])

  const run = useCallback(
    (command) => {
      if (!command) return
      // Close first: a command that navigates would otherwise leave the overlay
      // mounted over the page it just moved to.
      close()
      command.run()
    },
    [close],
  )

  // Global open/close shortcut.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % Math.max(results.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[active])
    }
  }

  let lastGroup = null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <button className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={close} aria-label="Close command palette" tabIndex={-1} />

      <div role="dialog" aria-modal="true" aria-label="Command palette" className="card-grad relative w-full max-w-xl animate-fade-up shadow-lift">
        <div className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/[0.07] px-4">
            <Search size={16} className="shrink-0 text-slate-500" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={onKeyDown}
              placeholder="Jump to a page or run a command…"
              className="w-full bg-transparent py-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
            />
            <kbd className="kbd shrink-0">ESC</kbd>
          </div>

          <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
            {results.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Nothing matches “{query}”.</p>}
            {results.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null
              lastGroup = c.group
              const Icon = c.icon
              return (
                <div key={c.id}>
                  {header && <p className="label px-3 pb-1 pt-3">{header}</p>}
                  <button
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(c)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      i === active ? 'bg-brand-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon size={16} className={i === active ? 'text-brand-300' : 'text-slate-500'} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.label}</span>
                      <span className="block truncate text-[11px] text-slate-500">{c.hint}</span>
                    </span>
                    {i === active && <CornerDownLeft size={13} className="shrink-0 text-slate-500" />}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-4 border-t border-white/[0.07] px-4 py-2.5 text-[11px] text-slate-600">
            <span className="flex items-center gap-1.5">
              <kbd className="kbd">↑</kbd>
              <kbd className="kbd">↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="kbd">↵</kbd> run
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              <Command size={11} /> palette
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
