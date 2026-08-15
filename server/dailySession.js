/**
 * The daily trading session: when the bot may trade, and when it must stop.
 *
 * Crypto never closes, so "the end of the day" has to be invented rather than
 * observed. Everything here is pure and takes an explicit clock, because a
 * session boundary that depends on the host's local time is untestable and
 * silently wrong for anyone in another timezone.
 *
 * Two independent reasons to stop trading live here and they are deliberately
 * not the same switch: the target being reached is success, and the loss limit
 * being hit is failure. Both stop new entries; only one of them is good news.
 */

export const SESSION = {
  IDLE: 'IDLE',
  OPEN: 'OPEN',
  CLOSING: 'CLOSING',
  COMPLETE: 'COMPLETE',
}

export const STOP_REASON = {
  TARGET_REACHED: 'TARGET_REACHED',
  DAILY_LOSS: 'DAILY_LOSS',
  SESSION_ENDED: 'SESSION_ENDED',
  NEAR_CLOSE: 'NEAR_CLOSE',
}

/** Minutes past midnight in the session's own timezone. */
export function minutesInZone(at, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(at))
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return hour * 60 + minute
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Whether the clock is inside the trading window.
 *
 * Handles a window that wraps past midnight (22:00 → 04:00), which is a normal
 * thing to configure for a market that never closes and would otherwise be
 * treated as a window that is never open.
 */
/**
 * A session with identical start and end never closes.
 *
 * Crypto trades continuously, so this is the normal configuration rather than
 * an edge case, and it has to be recognised explicitly: treated as an ordinary
 * wrap-around window it would compute a bogus countdown to midnight, and the
 * near-close cutoff would then bar entries for the last stretch of every day
 * for no reason anyone configured.
 */
export function isAroundTheClock({ sessionStart, sessionEnd } = {}) {
  if (sessionStart == null || sessionEnd == null) return true
  return toMinutes(sessionStart) === toMinutes(sessionEnd)
}

export function inWindow(at, config = {}) {
  const { sessionStart = '08:00', sessionEnd = '23:00', timeZone = 'Asia/Kolkata' } = config
  if (isAroundTheClock({ sessionStart, sessionEnd })) return true
  const now = minutesInZone(at, timeZone)
  const start = toMinutes(sessionStart)
  const end = toMinutes(sessionEnd)
  return start < end ? now >= start && now < end : now >= start || now < end
}

/** Minutes until the window closes, or null if it is already shut. */
export function minutesToClose(at, config = {}) {
  const { sessionEnd = '23:00', timeZone = 'Asia/Kolkata' } = config
  // A 24-hour session has no close to count down to.
  if (isAroundTheClock(config)) return null
  if (!inWindow(at, config)) return null
  const now = minutesInZone(at, timeZone)
  const end = toMinutes(sessionEnd)
  return end > now ? end - now : 1440 - now + end
}

/**
 * Day-level P&L against the configured objective.
 *
 * Unrealised P&L counts toward the loss limit but not toward the target: a
 * paper profit can evaporate before it is booked, so treating it as "target
 * reached" would stop the bot on money it never made, while ignoring it for
 * losses would let a drawdown run past the limit unnoticed.
 */
export function dailyProgress({ startingEquity, realisedPnl = 0, unrealisedPnl = 0, config = {} }) {
  const { dailyTargetPercent = 2, dailyLossLimitPercent = 3 } = config
  const targetAmount = startingEquity * (dailyTargetPercent / 100)
  const lossLimitAmount = startingEquity * (dailyLossLimitPercent / 100)
  const netPnl = realisedPnl + unrealisedPnl

  return {
    startingEquity,
    targetAmount,
    lossLimitAmount,
    realisedPnl,
    unrealisedPnl,
    netPnl,
    remainingToTarget: Math.max(0, targetAmount - realisedPnl),
    returnPercent: startingEquity > 0 ? (netPnl / startingEquity) * 100 : 0,
    targetAchievedPercent: targetAmount > 0 ? Math.min(100, (realisedPnl / targetAmount) * 100) : 0,
    targetReached: realisedPnl >= targetAmount,
    lossLimitHit: netPnl <= -lossLimitAmount,
  }
}

/** Why new entries are barred right now, or null if they are allowed. */
export function entriesBlocked({ at, config, progress }) {
  if (progress.lossLimitHit) return STOP_REASON.DAILY_LOSS
  if (progress.targetReached && !config.continueAfterTarget) return STOP_REASON.TARGET_REACHED
  /* The window is opt-in. Applying a default 08:00–23:00 to a config that
     never asked for one makes the engine's behaviour depend on the wall clock,
     which is both surprising and untestable — the same cycle would trade at
     14:00 and refuse at 23:30 with no configuration explaining why. */
  const windowed = config.sessionStart != null && config.sessionEnd != null && !isAroundTheClock(config)
  if (windowed && !inWindow(at, config)) return STOP_REASON.SESSION_ENDED

  /* Late entries are structurally doomed.
     A position opened minutes before the session closes gets flattened before
     the thesis has any room to play out, so it pays a full round trip of fees
     for a gross move of roughly nothing. That is not a losing trade in any
     interesting sense — it is a guaranteed cost with the upside removed. */
  const left = windowed ? minutesToClose(at, config) : null
  if (windowed && config.entryCutoffMinutes != null && left != null && left <= config.entryCutoffMinutes) {
    return STOP_REASON.NEAR_CLOSE
  }
  return null
}

/** Gross, fees and net kept separate — a net-only report hides the cost of trading. */
export function dailyReport({ startingEquity, endingEquity, trades = [], config = {}, markets = [] }) {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const fees = trades.reduce((s, t) => s + (t.fee ?? 0), 0)
  const funding = trades.reduce((s, t) => s + (t.funding ?? 0), 0)
  const grossPnl = trades.reduce((s, t) => s + (t.pnl ?? 0), 0) + fees + funding
  const netPnl = endingEquity - startingEquity

  let peak = startingEquity
  let maxDrawdown = 0
  let running = startingEquity
  for (const t of [...trades].reverse()) {
    running += t.pnl ?? 0
    peak = Math.max(peak, running)
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - running) / peak) * 100)
  }

  const targetAmount = startingEquity * ((config.dailyTargetPercent ?? 2) / 100)

  return {
    startingEquity,
    endingEquity,
    grossPnl: +grossPnl.toFixed(2),
    fees: +fees.toFixed(2),
    funding: +funding.toFixed(2),
    netPnl: +netPnl.toFixed(2),
    returnPercent: startingEquity > 0 ? +((netPnl / startingEquity) * 100).toFixed(2) : 0,
    targetPercent: config.dailyTargetPercent ?? 2,
    targetAchievedPercent: targetAmount > 0 ? +Math.min(100, (netPnl / targetAmount) * 100).toFixed(0) : 0,
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    maxDrawdownPercent: +maxDrawdown.toFixed(2),
    markets: [...new Set(markets)],
  }
}
