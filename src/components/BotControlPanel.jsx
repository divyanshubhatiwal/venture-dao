import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, OctagonX, Pause, Play, RotateCw } from 'lucide-react'
import { botApi } from '../lib/botApi'
import { summariseBlockers } from '../lib/botReasons'

const STATE_TONE = {
  STOPPED: 'border-white/10 bg-white/[0.04] text-slate-400',
  ANALYZING: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
  SIGNAL_DETECTED: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  RISK_CHECK: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  ORDER_APPROVED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  ORDER_SUBMITTED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  POSITION_OPEN: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  RISK_BLOCKED: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  RECONCILING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  COOLDOWN: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  ERROR: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  KILL_SWITCH: 'border-rose-500/40 bg-rose-500/15 text-rose-300',
}


/** Compact money for the panel's dense rows; sign is always explicit. */
const money = (n) => {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`)

const FIELDS = [
  ['startingBalance', 'Capital', 'Money the bot sizes positions against.'],
  ['targetBalance', 'Target balance', 'Balance that ends the whole campaign.'],
  ['riskPerTradePercent', 'Risk / trade %', 'Most you can lose on one trade if the stop is hit. Not the position size.'],
  ['maxLeverage', 'Max leverage', 'Largest position as a multiple of equity.'],
  ['maxPositionPercent', 'Max position %', 'Largest single position as a share of equity. Lower this to be safer; raise it if trades keep being blocked.'],
  ['maxOpenPositions', 'Max positions', 'How many markets it may hold at once.'],
  ['dailyTargetPercent', 'Daily target %', 'Profit that stops trading for the day. An objective, never a promise.'],
  ['dailyLossLimitPercent', 'Daily loss %', 'Loss that stops trading for the day.'],
]

const TONE = {
  slate: 'border-white/10 bg-white/[0.03] text-slate-300',
  amber: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
  rose: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-200',
  emerald: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
}

/**
 * Controls for the server-side autonomous bot.
 *
 * The panel renders whatever the server reports and never predicts it. After
 * every command it replaces its state with the server's response rather than
 * assuming the command worked, so a rejected start — an emergency stop still
 * latched, for instance — shows the real state instead of an optimistic one.
 */
export default function BotControlPanel() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const apply = useCallback((next) => {
    if (!alive.current) return
    setStatus(next)
    setDraft((d) => d ?? next.config)
  }, [])

  const run = useCallback(
    async (name, fn) => {
      setBusy(name)
      setError(null)
      try {
        apply(await fn())
      } catch (err) {
        if (alive.current) setError(err.message)
      } finally {
        if (alive.current) setBusy(null)
      }
    },
    [apply],
  )

  useEffect(() => {
    let timer
    const poll = () =>
      botApi
        .status()
        .then(apply)
        .catch((err) => alive.current && setError(err.message))
    poll()
    timer = setInterval(poll, 5000)
    return () => clearInterval(timer)
  }, [apply])

  if (!status) {
    return (
      <div className="card p-4">
        <p className="label mb-2">Autonomous bot</p>
        <p className="text-xs text-slate-500">{error ? `Backend unreachable — ${error}` : 'Connecting to the bot service…'}</p>
      </div>
    )
  }

  const locked = status.emergencyStop
  const cfg = draft ?? status.config
  const blocker = summariseBlockers(status.journal)

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-3">
        <p className="label">Autonomous bot</p>
        <span className={`chip ml-auto ${STATE_TONE[status.state] ?? STATE_TONE.STOPPED}`}>{status.state}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-2">
        <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-200">{status.mode.toUpperCase()}</span>
        <span className="chip border-white/10 bg-white/[0.04] text-slate-400">DELTA {status.deltaEnvironment.toUpperCase()}</span>
        {status.killSwitch && <span className="chip border-rose-500/40 bg-rose-500/15 text-rose-300">KILL SWITCH</span>}
        {!status.liveTradingAllowed && <span className="chip border-white/10 bg-white/[0.04] text-slate-500">LIVE DISABLED</span>}
      </div>

      {locked && (
        <div className="mx-4 mb-3 flex gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-400" />
          <p className="text-[11px] leading-relaxed text-rose-200/90">
            Emergency stop is latched. No orders can be submitted until it is explicitly cleared — a restart will not clear it.
          </p>
        </div>
      )}

      {error && <p className="mx-4 mb-2 text-[11px] text-rose-300">{error}</p>}

      {/* The question this app kept failing to answer. The engine always knew
          why it declined; it just said so in codes, in a log, below the fold. */}
      {blocker && (
        <div className={`mx-4 mb-3 rounded-xl border p-3 ${TONE[blocker.tone] ?? TONE.slate}`}>
          <div className="flex items-center gap-2">
            {blocker.healthy ? <CheckCircle2 size={14} className="shrink-0" /> : <AlertTriangle size={14} className="shrink-0" />}
            <p className="text-[11px] font-semibold">{status.running ? blocker.title : 'Bot is stopped'}</p>
            {blocker.count > 1 && <span className="num ml-auto text-[10px] opacity-70">{blocker.count}×</span>}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed opacity-90">
            {status.running ? blocker.why : 'Press Start and it will scan the markets on its own, every minute.'}
          </p>
          {status.running && blocker.fix && <p className="mt-1.5 text-[10px] leading-relaxed opacity-70">{blocker.fix}</p>}
        </div>
      )}

      {/* Controls */}
      <div className="grid grid-cols-2 gap-1.5 px-4 pb-3">
        <button
          onClick={() => run('start', botApi.start)}
          disabled={busy || status.running || locked}
          className="btn-ghost btn-sm justify-center py-2 disabled:opacity-40"
        >
          {busy === 'start' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
          Start
        </button>
        <button onClick={() => run('pause', botApi.pause)} disabled={busy || !status.running} className="btn-ghost btn-sm justify-center py-2 disabled:opacity-40">
          {busy === 'pause' ? <Loader2 size={13} className="animate-spin" /> : <Pause size={13} />}
          Pause
        </button>
        {locked ? (
          <button onClick={() => run('resume', botApi.resume)} disabled={busy} className="btn-ghost btn-sm justify-center py-2 text-amber-300 disabled:opacity-40">
            <RotateCw size={13} />
            Clear stop
          </button>
        ) : (
          <button
            onClick={() => run('estop', () => botApi.emergencyStop('dashboard'))}
            disabled={busy}
            className="btn-sm justify-center rounded-xl border border-rose-500/40 bg-rose-500/10 py-2 font-semibold text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"
          >
            <OctagonX size={13} />
            Emergency stop
          </button>
        )}
      </div>

      {/* Account */}
      <dl className="grid grid-cols-2 gap-x-4 border-y border-white/[0.06] px-4 py-3">
        {[
          ['Balance', status.account.balance.toLocaleString('en-IN')],
          ['Open positions', `${status.account.openPositions} / ${status.config.maxOpenPositions}`],
          ['Trades today', `${status.account.tradesToday} / ${status.config.maxTradesPerDay}`],
          ['Risk / trade', `${status.config.riskPerTradePercent}%`],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between py-0.5">
            <dt className="text-[11px] text-slate-500">{k}</dt>
            <dd className="num text-[11px] font-semibold text-slate-100">{v}</dd>
          </div>
        ))}
      </dl>

      {/* Daily session */}
      {status.session && status.progress && (
        <div className="border-b border-white/[0.06] px-4 py-3">
          <div className="flex items-center gap-2">
            <p className="label">Session</p>
            <span className={`chip ml-auto ${status.session.open ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.04] text-slate-500'}`}>
              {status.session.aroundTheClock ? '24H' : status.session.open ? 'OPEN' : 'CLOSED'}
            </span>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">
            {/* "00:00 → 00:00" is how a 24-hour session is stored, but it reads
                like a misconfiguration, so say what it means instead. */}
            {status.session.aroundTheClock ? (
              <>Continuous · no session close · {status.session.timeZone}</>
            ) : (
              <>
                {status.session.start} → {status.session.end} {status.session.timeZone}
                {status.session.minutesToClose != null && ` · closes in ${fmtMins(status.session.minutesToClose)}`}
              </>
            )}
          </p>

          {/* Progress toward the daily objective. Realised only — an unrealised
              gain can evaporate, so it must not read as target achieved. */}
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-[11px] text-slate-500">Daily target</span>
            <span className="num text-[11px] font-semibold text-slate-100">
              {money(status.progress.realisedPnl)} / {money(status.progress.targetAmount)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={`h-full rounded-full ${status.progress.lossLimitHit ? 'bg-rose-400' : status.progress.targetReached ? 'bg-emerald-400' : 'bg-brand-400'}`}
              style={{ width: `${Math.min(100, Math.max(0, status.progress.targetAchievedPercent))}%` }}
            />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4">
            {[
              ['Unrealised', money(status.progress.unrealisedPnl)],
              ['Remaining', money(status.progress.remainingToTarget)],
              ['Return', `${status.progress.returnPercent.toFixed(2)}%`],
              ['Loss limit', money(-status.progress.lossLimitAmount)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-0.5">
                <dt className="text-[10px] text-slate-500">{k}</dt>
                <dd className="num text-[10px] text-slate-300">{v}</dd>
              </div>
            ))}
          </dl>

          {status.progress.targetReached && (
            <p className="mt-2 text-[10px] text-emerald-300">Target reached — new entries stopped for the day.</p>
          )}
          {status.progress.lossLimitHit && <p className="mt-2 text-[10px] text-rose-300">Daily loss limit hit — no further entries.</p>}
        </div>
      )}

      {/* Daily report */}
      {status.report?.trades > 0 && (
        <div className="border-b border-white/[0.06] px-4 py-3">
          <p className="label mb-2">Daily report</p>
          <dl className="grid grid-cols-2 gap-x-4">
            {[
              ['Trades', `${status.report.trades} (${status.report.wins}W / ${status.report.losses}L)`],
              ['Gross', money(status.report.grossPnl)],
              ['Fees', money(-status.report.fees)],
              ['Net', money(status.report.netPnl)],
              ['Target hit', `${status.report.targetAchievedPercent}%`],
              ['Max drawdown', `${status.report.maxDrawdownPercent}%`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-0.5">
                <dt className="text-[10px] text-slate-500">{k}</dt>
                <dd className={`num text-[10px] ${k === 'Net' ? (status.report.netPnl >= 0 ? 'text-emerald-300' : 'text-rose-300') : 'text-slate-300'}`}>{v}</dd>
              </div>
            ))}
          </dl>
          {status.report.markets.length > 0 && (
            <p className="mt-1.5 text-[10px] text-slate-600">Markets: {status.report.markets.join(', ')}</p>
          )}
        </div>
      )}

      {/* Config */}
      <div className="grid grid-cols-2 gap-2 px-4 py-3">
        {FIELDS.map(([key, label, help]) => (
          <label key={key} className="block" title={help}>
            <span className="label flex items-center gap-1 text-[10px]">
              {label}
              <HelpCircle size={9} className="text-slate-600" />
            </span>
            <input
              type="number"
              value={cfg[key] ?? ''}
              disabled={status.running}
              onChange={(e) => setDraft({ ...cfg, [key]: e.target.value })}
              className="input mt-1 px-2 py-1.5 text-xs disabled:opacity-50"
            />
          </label>
        ))}
      </div>
      <div className="px-4 pb-3">
        <button
          onClick={() => run('config', () => botApi.updateConfig(draft))}
          disabled={busy || status.running || !draft}
          className="btn-ghost btn-sm w-full justify-center py-2 disabled:opacity-40"
        >
          {busy === 'config' ? <Loader2 size={13} className="animate-spin" /> : null}
          Apply configuration
        </button>
        {status.running && <p className="mt-1.5 text-center text-[10px] text-slate-600">Pause the bot to change risk limits.</p>}
      </div>

      {/* Journal */}
      <div className="max-h-40 overflow-y-auto border-t border-white/[0.06]">
        {status.journal.length === 0 ? (
          <p className="px-4 py-3 text-[11px] text-slate-600">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {status.journal.map((j, i) => (
              <li key={i} className="flex items-center gap-2 px-4 py-1.5 text-[11px]">
                <span className={`chip shrink-0 ${j.kind === 'order' ? 'border-emerald-500/25 text-emerald-300' : j.kind === 'error' ? 'border-rose-500/25 text-rose-300' : 'border-white/10 text-slate-500'}`}>
                  {j.code ?? j.kind}
                </span>
                <span className="num shrink-0 text-slate-400">{j.symbol ?? ''}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500">{j.detail ?? j.reason ?? ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
