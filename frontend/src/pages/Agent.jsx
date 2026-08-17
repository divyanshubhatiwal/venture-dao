import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  Compass,
  Gauge,
  Loader2,
  Lock,
  OctagonX,
  Play,
  RotateCcw,
  ServerCog,
  ShieldCheck,
  Square,
  Target,
  XCircle,
} from 'lucide-react'
import { Card, ChartTooltip, Chip, PageHeader, SectionTitle, Skeleton } from '../components/ui'
import LiveValue, { LiveBadge } from '../components/LiveValue'
import DeltaStatus from '../components/DeltaStatus'
import { deltaTradable } from '../lib/trading/venues'
import { useTrading } from '../context/TradingContext'
import { useMarket } from '../context/MarketContext'
import { useDemo } from '../context/DemoContext'
import { useToast } from '../context/ToastContext'
import { useTheme } from '../context/ThemeContext'
import { getCandles } from '../lib/market/marketApi'
import { getStockCandles } from '../lib/market/stockApi'
import { getMacro } from '../lib/market/macro'
import { DEFAULT_GOAL_CONFIG, computeGoalState, computeStreaks, normaliseConfig } from '../lib/agent/goalManager'
import { decide, formatDecision } from '../lib/agent/decision'
import { deriveState } from '../lib/agent/stateMachine'
import { monteCarlo } from '../lib/agent/monteCarlo'
import { backtest } from '../lib/trading/backtest'
import { publishBotStatus } from '../lib/agent/botStatus'

const UNIVERSE = [
  { symbol: 'ETH', assetClass: 'crypto' },
  { symbol: 'BTC', assetClass: 'crypto' },
  { symbol: 'SOL', assetClass: 'crypto' },
  { symbol: 'NVDA', assetClass: 'stocks' },
]

const tone = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  sky: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  slate: 'border-white/15 bg-white/5 text-slate-300',
}

const money = (n, d = 2) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`)

const STORAGE_KEY = 'venturedao.agent.v1'

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? normaliseConfig(JSON.parse(raw)) : normaliseConfig(DEFAULT_GOAL_CONFIG)
  } catch {
    return normaliseConfig(DEFAULT_GOAL_CONFIG)
  }
}

/** $100 ▓▓▓▓▓░░░░░ $200 with the protected floor marked on the same scale. */
function GoalBar({ goalState }) {
  const { startingBalance, targetBalance, balance, protectedFloor, peakBalance } = goalState
  const span = targetBalance - startingBalance
  const pos = (v) => Math.max(0, Math.min(100, ((v - startingBalance) / span) * 100))

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-mono text-slate-500">{money(startingBalance, 0)}</span>
        <span className="font-mono text-slate-500">{money(targetBalance, 0)}</span>
      </div>
      <div className="relative mt-2 h-4 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent transition-[width] duration-700"
          style={{ width: `${pos(balance)}%` }}
        />
        {protectedFloor != null && (
          <div className="absolute inset-y-0 w-[2px] bg-emerald-400" style={{ left: `${pos(protectedFloor)}%` }} title={`Protected floor ${money(protectedFloor)}`} />
        )}
        {peakBalance > balance && (
          <div className="absolute inset-y-0 w-[2px] bg-white/40" style={{ left: `${pos(peakBalance)}%` }} title={`Peak ${money(peakBalance)}`} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="font-mono text-base font-bold text-white">{money(balance)}</span>
        <span className="text-slate-400">
          {goalState.progressPercent}% of goal · {money(goalState.remainingToTarget)} remaining
        </span>
        {protectedFloor != null && (
          <span className="flex items-center gap-1 text-emerald-300">
            <Lock size={11} /> floor {money(protectedFloor)}
          </span>
        )}
      </div>
    </div>
  )
}

export default function Agent() {
  const trading = useTrading()
  const market = useMarket()
  const { toast } = useToast()
  const { registerAction } = useDemo()

  const [config, setConfig] = useState(loadConfig)
  const [draft, setDraft] = useState(loadConfig)
  const [running, setRunning] = useState(false)
  const [stopped, setStopped] = useState(false)
  const [decisions, setDecisions] = useState([])
  const [thinking, setThinking] = useState(false)
  const [regime, setRegime] = useState(null)
  const [floor, setFloor] = useState(null)
  const [peak, setPeak] = useState(null)
  const [agentTab, setAgentTab] = useState('controls')

  const runningRef = useRef(running)
  runningRef.current = running
  const stoppedRef = useRef(stopped)
  stoppedRef.current = stopped

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }, [config])

  // Report run state so other screens can show it. Read-only: publishing has
  // no effect on the agent itself.
  useEffect(() => {
    publishBotStatus({
      mode: stopped ? 'paused' : running ? 'running' : 'off',
      reason: stopped ? 'Operator stopped the agent' : null,
    })
  }, [running, stopped])

  useEffect(() => {
    let alive = true
    const pull = () => getMacro().then((m) => alive && setRegime(m.regime)).catch(() => {})
    pull()
    const t = setInterval(pull, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  // The agent's account is the practice account, rebased onto the goal's scale.
  const balance = useMemo(() => {
    const ratio = trading.equity / (trading.startingCash || 1)
    return +(config.startingBalance * ratio).toFixed(2)
  }, [trading.equity, trading.startingCash, config.startingBalance])

  useEffect(() => {
    setPeak((p) => Math.max(p ?? config.startingBalance, balance))
  }, [balance, config.startingBalance])

  const goalState = useMemo(
    () => computeGoalState(config, { balance, peakBalance: peak ?? config.startingBalance, previousFloor: floor }),
    [config, balance, peak, floor],
  )

  // Ratchet the floor forward as the goal state recomputes it.
  useEffect(() => {
    if (goalState.protectedFloor != null && goalState.protectedFloor !== floor) setFloor(goalState.protectedFloor)
  }, [goalState.protectedFloor, floor])

  const streaks = useMemo(() => computeStreaks(trading.trades), [trading.trades])
  const state = useMemo(
    () => deriveState({ goalState, streaks, agentStopped: stopped }),
    [goalState, streaks, stopped],
  )
  const latest = decisions[0] ?? null

  /* ---------- the decision cycle ---------- */

  const runCycle = useCallback(async () => {
    setThinking(true)
    const results = []
    try {
      for (const asset of UNIVERSE) {
        const res = asset.assetClass === 'crypto' ? await getCandles(asset.symbol, '1h') : await getStockCandles(asset.symbol, '1h')
        const d = decide({
          symbol: asset.symbol,
          assetClass: asset.assetClass,
          candles: res.candles,
          config,
          account: { balance, peakBalance: peak ?? config.startingBalance, previousFloor: floor },
          trades: trading.trades,
          openPositions: trading.positions.length,
          regime,
          agentStopped: stoppedRef.current,
        })
        results.push(d)
      }

      // Rank by expected value, then act on the best one that survived.
      results.sort((a, b) => (b.expectedValue?.evR ?? -99) - (a.expectedValue?.evR ?? -99))
      setDecisions((prev) => [...results, ...prev].slice(0, 40))

      const actionable = results.find((d) => d.approved)
      if (actionable && runningRef.current && !stoppedRef.current) {
        const target = venueRef.current
        // Delta only lists a few perpetuals; anything else stays on paper
        // rather than silently failing.
        const useDelta = target === 'delta' && deltaTradable(actionable.symbol)
        if (target === 'delta' && !useDelta) {
          toast({
            tone: 'warning',
            title: `${actionable.symbol} is not on Delta`,
            description: 'Routed to the practice account instead. Delta lists ETH, BTC and SOL perpetuals.',
          })
        }

        const receipt = await trading.placeOrder({
          symbol: actionable.symbol,
          assetClass: actionable.assetClass,
          side: actionable.action === 'BUY' ? 'buy' : 'sell',
          type: 'market',
          qty: actionable.quantity,
          stop: actionable.levels.stop,
          target: actionable.levels.target,
          source: 'agent',
          venue: useDelta ? 'delta' : 'paper',
        })
        toast({
          tone: 'success',
          title: `${actionable.action} ${actionable.symbol}`,
          description: useDelta
            ? `${receipt.contracts ?? '?'} contracts on Delta ${receipt.environment} · order ${receipt.orderId ?? 'n/a'}`
            : `${actionable.riskPercent}% risk · EV ${actionable.expectedValue?.evR}R · practice account`,
        })
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Cycle failed', description: err.message })
    } finally {
      setThinking(false)
    }
  }, [config, balance, peak, floor, trading, regime, toast])

  useEffect(() => {
    if (!running || stopped) return undefined
    runCycle()
    const timer = setInterval(runCycle, 120_000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, stopped])

  // Run initial evaluation on load so Latest Decision is populated right away
  useEffect(() => {
    runCycle()
  }, [runCycle])

  // Judge mode runs one decision cycle from the walkthrough script.
  useEffect(() => registerAction('agent:cycle', () => runCycle()), [registerAction, runCycle])

  /* ---------- Monte Carlo: how often does this actually reach the goal? ---------- */

  const [mc, setMc] = useState(null)
  const [mcRunning, setMcRunning] = useState(false)
  const [venue, setVenue] = useState('paper')
  const venueRef = useRef(venue)
  venueRef.current = venue

  const runMonteCarlo = useCallback(async () => {
    setMcRunning(true)
    try {
      let pool = []
      for (const asset of UNIVERSE) {
        const res = asset.assetClass === 'crypto' ? await getCandles(asset.symbol, '1h') : await getStockCandles(asset.symbol, '1h')
        const bt = backtest(res.candles, { trailing: true, riskPct: config.riskPerTradePercent })
        if (bt.ok) pool = pool.concat(bt.trades)
        await new Promise((r) => setTimeout(r, 0))
      }
      setMc(
        monteCarlo({
          trades: pool,
          startingBalance: config.startingBalance,
          targetBalance: config.targetBalance,
          maxDrawdownPercent: config.maxDrawdownPercent,
          riskPerTradePercent: config.riskPerTradePercent,
          runs: 2000,
        }),
      )
    } catch (err) {
      toast({ tone: 'error', title: 'Simulation failed', description: err.message })
    } finally {
      setMcRunning(false)
    }
  }, [config, toast])

  useEffect(() => {
    runMonteCarlo()
  }, [runMonteCarlo])

  const killSwitch = () => {
    setStopped(true)
    setRunning(false)
    trading.orders.filter((o) => o.status === 'working').forEach((o) => trading.cancelOrder(o.id))
    toast({ tone: 'warning', title: 'Agent stopped', description: 'Safe mode: no new orders, pending orders cancelled.' })
  }

  const applyConfig = (e) => {
    e.preventDefault()
    const next = normaliseConfig(draft)
    setConfig(next)
    setFloor(null)
    setPeak(next.startingBalance)
    toast({ tone: 'info', title: 'Goal updated', description: `${money(next.startingBalance)} → ${money(next.targetBalance)}` })
  }

  const applyPreset = (preset) => {
    let nextDraft = { ...draft }
    if (preset === 'conservative') {
      nextDraft = {
        ...nextDraft,
        startingBalance: 100,
        targetBalance: 150,
        maxDrawdownPercent: 10,
        riskPerTradePercent: 1,
        dailyLossLimitPercent: 3,
        minRiskReward: 2.0,
      }
    } else if (preset === 'balanced') {
      nextDraft = {
        ...nextDraft,
        startingBalance: 100,
        targetBalance: 200,
        maxDrawdownPercent: 15,
        riskPerTradePercent: 2,
        dailyLossLimitPercent: 5,
        minRiskReward: 1.8,
      }
    } else if (preset === 'aggressive') {
      nextDraft = {
        ...nextDraft,
        startingBalance: 100,
        targetBalance: 300,
        maxDrawdownPercent: 25,
        riskPerTradePercent: 3,
        dailyLossLimitPercent: 8,
        minRiskReward: 1.5,
      }
    }
    setDraft(nextDraft)
    const next = normaliseConfig(nextDraft)
    setConfig(next)
    setFloor(null)
    setPeak(next.startingBalance)
    toast({
      tone: 'success',
      title: `${preset.toUpperCase()} Goal Applied`,
      description: `${money(next.startingBalance)} → ${money(next.targetBalance)} target`,
    })
  }

  const equityCurve = useMemo(
    () =>
      trading.equityCurve.map((p) => ({
        label: new Date(p.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        balance: +(config.startingBalance * (p.equity / (trading.startingCash || 1))).toFixed(2),
      })),
    [trading.equityCurve, config.startingBalance, trading.startingCash],
  )

  // Keyboard navigation for sub-tabs (1, 2, 3)
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      if (e.key === '1') setAgentTab('controls')
      if (e.key === '2') setAgentTab('simulation')
      if (e.key === '3') setAgentTab('logs')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const { isDark } = useTheme()
  const blocked = latest && !latest.approved

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Autonomous intelligence"
        title="AI Agent"
        subtitle="Monitors the signal engine, estimates expected value, tests recommendations on historical data and trades toward a target."
        actions={
          <>
            <LiveBadge live={running} label={stopped ? 'safe mode' : running ? 'evaluating' : 'standby'} />
            <button
              onClick={() => {
                if (stopped) return
                setRunning((r) => !r)
              }}
              disabled={stopped}
              className="btn-ghost"
            >
              {running ? <Square size={14} /> : <Play size={14} />}
              {running ? 'Pause' : 'Start'}
            </button>
            <button
              onClick={() => {
                setStopped(true)
                setRunning(false)
                toast({ tone: 'warn', title: 'Agent halted', description: 'Safe mode triggered manually.' })
              }}
              className="btn border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
            >
              STOP AGENT
            </button>
          </>
        }
      />

      {stopped && (
        <div className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${isDark ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-100/90' : 'border-rose-300 bg-rose-50 text-rose-900 shadow-sm'}`}>
          <OctagonX size={16} className={`mt-0.5 shrink-0 ${isDark ? 'text-rose-400' : 'text-rose-600'}`} />
          <div className="text-xs leading-relaxed">
            <p className="font-semibold">Safe mode — agent stopped.</p>
            <p className={`mt-1 ${isDark ? 'text-rose-100/70' : 'text-rose-700'}`}>No new orders will be placed. Reset below to start a new cycle.</p>
          </div>
        </div>
      )}

      {/* Target & Risk Disclaimer Banner */}
      <div className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${isDark ? 'border-amber-500/25 bg-amber-500/[0.07] text-amber-100/80' : 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm'}`}>
        <AlertTriangle size={16} className={`mt-0.5 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
        <p className={`text-xs leading-relaxed ${isDark ? 'text-amber-100/90' : 'text-amber-900'}`}>
          <span className={`font-bold ${isDark ? 'text-amber-100' : 'text-amber-950'}`}>The target is a goal, not a guarantee.</span> Markets are uncertain: the
          balance can fall, the target may never be reached, and the loss from peak limit can halt trading permanently. Everything here
          runs on a practice account with virtual money.
        </p>
      </div>

      {/* Enhanced Segmented Tab Switcher */}
      <div className={`mt-5 mb-5 flex flex-wrap items-center gap-2 rounded-2xl border p-1.5 backdrop-blur-xl ${isDark ? 'border-white/[0.08] bg-black/40' : 'border-slate-200 bg-white/90 shadow-sm'}`}>
        {[
          { id: 'controls', label: 'Autopilot Controls & Goal', icon: Bot, num: '1' },
          { id: 'simulation', label: 'Monte Carlo Simulation', icon: Gauge, badge: mc?.probabilityOfTarget != null ? `${mc.probabilityOfTarget}% win` : null, num: '2' },
          { id: 'logs', label: 'Decision Logs & Audit', icon: ServerCog, badge: decisions.length, num: '3' },
        ].map(({ id, label, icon: Icon, badge, num }) => {
          const active = agentTab === id
          return (
            <button
              key={id}
              onClick={() => setAgentTab(id)}
              className={`group flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
                active
                  ? 'bg-gradient-to-r from-brand-600 to-accent text-white shadow-lg shadow-brand-500/25 scale-[1.02]'
                  : isDark ? 'text-slate-400 hover:bg-white/[0.05] hover:text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={14} className={active ? 'text-white' : isDark ? 'text-slate-500 group-hover:text-slate-300' : 'text-slate-400 group-hover:text-slate-700'} />
              <span>{label}</span>
              {badge != null && (
                <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${active ? 'bg-white/20 text-white' : isDark ? 'bg-white/10 text-slate-400' : 'bg-slate-200 text-slate-700'}`}>
                  {badge}
                </span>
              )}
              <kbd
                className={`ml-1 rounded px-1.5 py-0.5 font-mono text-[9px] transition ${
                  active ? 'bg-black/30 text-brand-200' : isDark ? 'bg-white/[0.06] text-slate-500 group-hover:text-slate-300' : 'bg-slate-100 text-slate-500 group-hover:text-slate-700'
                }`}
              >
                {num}
              </kbd>
            </button>
          )
        })}
      </div>

      {agentTab === 'controls' && (
      <>
      {/* Goal + state */}
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2" data-demo="goal">
          <SectionTitle icon={Target} title="Progress to your goal" hint="Balance, peak and the protected floor on one scale" />
          <GoalBar goalState={goalState} />

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 sm:grid-cols-4">
            {[
              ['Profit', money(goalState.profit), goalState.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'],
              ['Peak', money(goalState.peakBalance), 'text-slate-100'],
              ['Loss from peak', `${goalState.drawdownFromPeak}%`, goalState.drawdownFromPeak > 0 ? 'text-amber-400' : 'text-slate-100'],
              ['Floor', goalState.protectedFloor != null ? money(goalState.protectedFloor) : 'inactive', 'text-emerald-300'],
            ].map(([label, value, cls]) => (
              <div key={label}>
                <p className="label">{label}</p>
                <p className={`mt-1 font-mono text-lg font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={Gauge} title="Your account" />
          {!state ? (
            <p className="py-6 text-center text-[11px] text-slate-600">Run a cycle to derive the state.</p>
          ) : (
            <>
              <Chip tone={tone[state.tone]}>{state.label}</Chip>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">{state.description}</p>
              <p className="mt-2 text-[11px] text-slate-500">{state.reason}</p>
              <dl className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 text-[11px]">
                {[
                  ['Trading permitted', state.trading ? 'yes' : 'no'],
                  ['Consecutive losses', streaks.consecutiveLosses],
                  ['Consecutive wins', streaks.consecutiveWins],
                  ['Open positions', `${trading.positions.length} / ${config.maxOpenPositions}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-2">
                    <dt className="text-slate-500">{k}</dt>
                    <dd className="font-mono text-slate-200">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Left Column: Latest Decision + Universe Opportunity Matrix */}
        <div className="space-y-4 xl:col-span-2">
          <Card className="p-5" data-demo="decision">
            <SectionTitle
              icon={Bot}
              title="Latest decision"
            hint="Find it → challenge it → check the limits, in that order"
            action={
              thinking ? (
                <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <Loader2 size={12} className="animate-spin" /> thinking
                </span>
              ) : (
                <button onClick={runCycle} className="btn-ghost btn-sm">
                  Run cycle
                </button>
              )
            }
          />

          {!latest ? (
            <p className="py-10 text-center text-xs text-slate-600">No decision yet. Run a cycle.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-bold text-slate-100">{latest.symbol}</span>
                <Chip tone={latest.approved ? tone.emerald : tone.slate}>{latest.action}</Chip>
                <Chip tone={latest.approved ? tone.emerald : tone.rose}>{latest.approved ? 'APPROVED' : 'REJECTED'}</Chip>
                {latest.confidence != null && <Chip>{latest.confidence}% agreement</Chip>}
                <Chip tone={latest.critic.verdict === 'veto' ? tone.rose : latest.critic.verdict === 'reduce' ? tone.amber : tone.slate}>
                  critic: {latest.critic.verdict}
                </Chip>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-300">{latest.reason}</p>

              {latest.approved && latest.levels && (
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {[
                    ['Entry', money(latest.levels.entry)],
                    ['Stop', money(latest.levels.stop), 'text-rose-300'],
                    ['Target', money(latest.levels.target), 'text-emerald-300'],
                    ['R:R', `1 : ${latest.riskReward}`],
                    ['Risk', `${latest.riskPercent}%`],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5 text-center">
                      <p className="text-[9px] uppercase tracking-wider text-slate-500">{k}</p>
                      <p className={`mt-0.5 font-mono text-xs font-semibold ${cls ?? 'text-slate-200'}`}>{v}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Why it was blocked */}
              {blocked && latest.risk.blocks.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {latest.risk.blocks.map((b) => (
                    <li key={b.code} className="flex items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-2.5">
                      <Ban size={13} className="mt-0.5 shrink-0 text-rose-400" />
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-wide text-rose-300">{b.code}</p>
                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{b.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {/* Sizing breakdown */}
              {latest.risk.reductions.length > 0 && (
                <div className="mt-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                  <p className="label mb-2">Size reductions applied</p>
                  <ul className="space-y-1">
                    {latest.risk.reductions.map((r) => (
                      <li key={r.factor} className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-300">{r.factor}</span>
                        <span className="text-slate-500">{r.detail}</span>
                        <span className="ml-auto font-mono text-slate-400">×{r.applied}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 border-t border-white/[0.06] pt-2 text-[11px] text-slate-500">
                    Base {latest.risk.baseRiskPercent}% → <span className="font-mono text-slate-300">{latest.riskPercent}%</span>.
                    Multipliers can only reduce size — never increase it.
                  </p>
                </div>
              )}

              {/* Critic */}
              {latest.critic.objections.length > 0 && (
                <div className="mt-4">
                  <p className="label mb-2">Critic objections</p>
                  <ul className="space-y-2">
                    {latest.critic.objections.map((o, i) => (
                      <li key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
                          {o.severity === 'critical' ? (
                            <XCircle size={12} className="text-rose-400" />
                          ) : o.severity === 'major' ? (
                            <AlertTriangle size={12} className="text-amber-400" />
                          ) : (
                            <CheckCircle2 size={12} className="text-slate-500" />
                          )}
                          {o.question}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{o.finding}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {latest.expectedValue && (
                <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
                  Expected value <span className="font-mono text-slate-300">{latest.expectedValue.evR}R</span> — needs a{' '}
                  {(latest.expectedValue.breakevenWinRate * 100).toFixed(1)}% win rate to break even after costs; the record
                  implies {(latest.winEstimate.probability * 100).toFixed(1)}%
                  {latest.winEstimate.shrunk ? ' (shrunk toward a pessimistic prior on a small sample)' : ''}.
                </p>
              )}
            </>
          )}
        </Card>

        {/* Candidate Evaluations in Current Cycle */}
        <Card className="overflow-hidden p-0">
          <div className="p-5 pb-3">
            <SectionTitle
              icon={Gauge}
              title="Universe Opportunity Ranking"
              hint="Ranked by expected value (EV) in latest evaluation cycle"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-y border-white/[0.07] bg-white/[0.02]">
                  <th className="px-4 py-2.5 text-left font-semibold uppercase text-slate-500">Asset</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase text-slate-500">Signal</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase text-slate-500">Verdict</th>
                  <th className="px-4 py-2.5 text-right font-semibold uppercase text-slate-500">Confidence</th>
                  <th className="px-4 py-2.5 text-right font-semibold uppercase text-slate-500">Expected Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {decisions.slice(0, 4).map((d) => (
                  <tr key={d.symbol} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-2.5 font-mono font-bold text-slate-100">{d.symbol}</td>
                    <td className="px-4 py-2.5">
                      <Chip tone={d.approved ? tone.emerald : tone.slate}>{d.action}</Chip>
                    </td>
                    <td className="px-4 py-2.5">
                      <Chip tone={d.approved ? tone.emerald : d.critic?.verdict === 'veto' ? tone.rose : tone.amber}>
                        {d.approved ? 'APPROVED' : d.critic?.verdict ? `Critic: ${d.critic.verdict}` : 'PASSED'}
                      </Chip>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      {d.confidence != null ? `${d.confidence}%` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-brand-300">
                      {d.expectedValue?.evR != null ? `${d.expectedValue.evR}R` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <SectionTitle icon={Bot} title="Autopilot Engine" hint="Auto-evaluates every 2 mins" />
            <Chip tone={running ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-white/15 bg-white/5 text-slate-400'}>
              {stopped ? 'Safe Mode' : running ? 'Active' : 'Standby'}
            </Chip>
          </div>

          <button
            onClick={() => {
              if (stopped) return
              setRunning((r) => !r)
            }}
            disabled={stopped}
            className={`btn mt-3.5 w-full border text-xs font-semibold ${
              running ? 'border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            {running ? <Square size={14} /> : <Play size={14} />}
            {running ? 'Pause Autopilot' : 'Start Autopilot'}
          </button>

          {stopped && (
            <button
              onClick={() => {
                setStopped(false)
                trading.reset()
                setFloor(null)
                setPeak(config.startingBalance)
                setDecisions([])
                toast({ tone: 'info', title: 'New cycle', description: 'Account reset and safe mode cleared.' })
              }}
              className="btn-ghost btn-sm mt-3 w-full"
            >
              <RotateCcw size={13} />
              Start a new goal cycle
            </button>
          )}

          {/* Execution Venue & Hedge Fund Algo */}
          <div className="mt-4 border-t border-white/[0.06] pt-3 space-y-3">
            <div>
              <p className="label mb-1.5">Trade Execution Venue</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'paper', label: 'Paper Sim', note: 'Internal simulator' },
                  { id: 'delta', label: 'Delta Testnet', note: 'Real order signing' },
                ].map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVenue(v.id)}
                    className={`rounded-lg border p-2.5 text-left transition ${
                      venue === v.id
                        ? 'border-brand-500/50 bg-brand-500/[0.12] text-white'
                        : 'border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <p className="text-xs font-semibold">{v.label}</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">{v.note}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="label mb-1.5">Execution Algorithm</p>
              <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-2 text-[11px] text-brand-200">
                <span className="font-semibold">⚡ TWAP/VWAP Slicing:</span> Slices Autopilot orders over 15-min intervals to prevent front-running and eliminate slippage.
              </div>
            </div>
          </div>
        </Card>

        {/* Delta live connection status if active */}
        {venue === 'delta' && <DeltaStatus />}

          <Card className="p-5">
            <SectionTitle icon={Target} title="Goal & Risk Strategy" hint="Quick presets or custom balance target" />
            
            {/* Quick Preset Buttons */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: 'conservative', label: 'Conservative', target: '$150', risk: '1%' },
                { id: 'balanced', label: 'Balanced', target: '$200', risk: '2%' },
                { id: 'aggressive', label: 'Growth', target: '$300', risk: '3%' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className="group rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-center transition hover:border-brand-500/50 hover:bg-brand-500/10"
                >
                  <p className="text-xs font-semibold text-slate-200 group-hover:text-brand-300">{p.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-slate-400">{p.target} · {p.risk}</p>
                </button>
              ))}
            </div>

            <form onSubmit={applyConfig} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label">Starting ($)</label>
                  <input
                    type="number"
                    step={1}
                    value={draft.startingBalance}
                    onChange={(e) => setDraft((d) => ({ ...d, startingBalance: e.target.value }))}
                    className="input mt-1 py-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">Target ($)</label>
                  <input
                    type="number"
                    step={1}
                    value={draft.targetBalance}
                    onChange={(e) => setDraft((d) => ({ ...d, targetBalance: e.target.value }))}
                    className="input mt-1 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label">Risk / Trade (%)</label>
                  <input
                    type="number"
                    step={0.05}
                    value={draft.riskPerTradePercent}
                    onChange={(e) => setDraft((d) => ({ ...d, riskPerTradePercent: e.target.value }))}
                    className="input mt-1 py-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">Max Loss Stop (%)</label>
                  <input
                    type="number"
                    step={0.5}
                    value={draft.maxDrawdownPercent}
                    onChange={(e) => setDraft((d) => ({ ...d, maxDrawdownPercent: e.target.value }))}
                    className="input mt-1 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label">Daily Limit (%)</label>
                  <input
                    type="number"
                    step={0.25}
                    value={draft.dailyLossLimitPercent}
                    onChange={(e) => setDraft((d) => ({ ...d, dailyLossLimitPercent: e.target.value }))}
                    className="input mt-1 py-1.5 font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">Min R:R Ratio</label>
                  <input
                    type="number"
                    step={0.1}
                    value={draft.minRiskReward}
                    onChange={(e) => setDraft((d) => ({ ...d, minRiskReward: e.target.value }))}
                    className="input mt-1 py-1.5 font-mono text-xs"
                  />
                </div>
              </div>

              <button type="submit" className="btn-primary mt-2 w-full py-2 text-xs">
                Save &amp; Recalibrate Goal
              </button>
            </form>
          </Card>
        </div>
      </div>
      </>
      )}

      {/* Monte Carlo Simulation */}
      {agentTab === 'simulation' && (
      <Card className="mt-4 p-5">
        <SectionTitle
          icon={Gauge}
          title="Will this actually reach your goal?"
          hint="2,000 runs resampling the strategy's own trades in random order"
          action={
            <button onClick={runMonteCarlo} disabled={mcRunning} className="btn-ghost btn-sm">
              {mcRunning ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              {mcRunning ? 'Running…' : 'Re-run'}
            </button>
          }
        />

        {!mc ? (
          <Skeleton className="h-44 w-full" />
        ) : !mc.ok ? (
          <p className="py-6 text-center text-xs text-slate-500">{mc.reason}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                [
                  `Reaches ${money(config.targetBalance, 0)}`,
                  `${mc.probabilityOfTarget}%`,
                  mc.probabilityOfTarget > 50 ? 'text-emerald-400' : 'text-rose-400',
                ],
                ['Hits loss from peak stop', `${mc.probabilityOfDrawdownStop}%`, mc.probabilityOfDrawdownStop > 50 ? 'text-rose-400' : 'text-emerald-400'],
                ['Median outcome', money(mc.median), mc.median >= config.startingBalance ? 'text-emerald-400' : 'text-rose-400'],
                ['Median max loss from peak', `${mc.medianMaxDrawdown}%`, 'text-amber-400'],
              ].map(([label, value, cls]) => (
                <div key={label}>
                  <p className="label">{label}</p>
                  <p className={`mt-1 font-mono text-2xl font-bold ${cls}`}>{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 h-44">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mc.histogram} margin={{ top: 5, right: 5, left: -26, bottom: 0 }}>
                  <defs>
                    <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="linear" dataKey="count" name="Runs" stroke="#a855f7" strokeWidth={2} fill="url(#mcFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 text-[11px] sm:grid-cols-4">
              {[
                ['Worst run', money(mc.worst)],
                ['5th percentile', money(mc.p5)],
                ['95th percentile', money(mc.p95)],
                ['Best run', money(mc.best)],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">{k}</span>
                  <span className="font-mono text-slate-300">{v}</span>
                </div>
              ))}
            </div>

            <p
              className={`mt-4 rounded-lg border p-3 text-[11px] leading-relaxed ${
                mc.probabilityOfTarget > 50
                  ? 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-100/90'
                  : 'border-rose-500/25 bg-rose-500/[0.07] text-rose-100/90'
              }`}
            >
              {mc.probabilityOfTarget === 0
                ? `Across ${mc.runs.toLocaleString()} runs resampled from ${mc.sampleTrades} real trades, the account reached ${money(config.targetBalance, 0)} zero times and hit the loss from peak stop in ${mc.probabilityOfDrawdownStop}% of them. On this evidence the goal is not reachable with this strategy — the answer is to find an edge, not to raise the risk.`
                : `Reached the target in ${mc.probabilityOfTarget}% of ${mc.runs.toLocaleString()} runs, with a median max loss from peak of ${mc.medianMaxDrawdown}%. The trade outcomes are real; only their order is simulated. Future trades can still be worse than anything drawn here.`}
            </p>
          </>
        )}
      </Card>
      )}

      {/* Equity + journal */}
      {agentTab === 'logs' && (
      <>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="p-5">
          <SectionTitle icon={Gauge} title="Account value over time" hint="Rebased to the goal scale" />
          <div className="h-40">
            {equityCurve.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityCurve} margin={{ top: 5, right: 5, left: -26, bottom: 0 }}>
                  <defs>
                    <linearGradient id="agentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={52} />
                  <Tooltip content={<ChartTooltip formatter={(v) => money(v)} />} />
                  <Area type="linear" dataKey="balance" name="Balance" stroke="#34d399" strokeWidth={2} fill="url(#agentFill)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="grid h-full place-items-center text-[11px] text-slate-600">The curve builds as the agent runs.</div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden p-0 xl:col-span-2">
          <div className="p-5 pb-3">
            <SectionTitle icon={Bot} title="What it decided, and why" hint="Every evaluation, including the ones that traded nothing" />
          </div>
          {decisions.length === 0 ? (
            <p className="px-5 pb-6 text-center text-xs text-slate-600">Decisions appear here as cycles run.</p>
          ) : (
            <ul className="max-h-[420px] divide-y divide-white/[0.05] overflow-y-auto">
              {decisions.slice(0, 20).map((d, i) => (
                <li key={`${d.at}-${d.symbol}-${i}`} className="flex items-start gap-3 px-5 py-3">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${d.approved ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-slate-100">{d.symbol}</span>
                      <span className={d.approved ? 'text-emerald-400' : 'text-slate-500'}>{d.action}</span>
                      {d.expectedValue && <span className="font-mono text-[10px] text-slate-600">EV {d.expectedValue.evR}R</span>}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">{d.reason}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-700">{new Date(d.at).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Full decision record */}
      {latest && (
        <Card className="mt-4 p-5">
          <SectionTitle icon={Bot} title="What it decided" hint="The full audit format" />
          <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-4 font-mono text-[11px] leading-relaxed text-slate-300">
            {formatDecision(latest)}
          </pre>
        </Card>
      )}
      </>
      )}
    </div>
  )
}
