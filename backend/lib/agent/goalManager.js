/**
 * Goal Manager — tracks where the account stands against its objective.
 *
 * The target is a goal, not a promise. Markets are uncertain; this module
 * measures progress and, more importantly, how much of the accumulated gain is
 * currently protected. Nothing here can make the balance go up — it only
 * decides how much of it is allowed to be put at risk.
 */

export const DEFAULT_GOAL_CONFIG = {
  startingBalance: 100,
  targetBalance: 200,
  /** Hard stop: total decline from peak that halts trading entirely. */
  maxDrawdownPercent: 5,
  /** Base fraction of equity risked on a single idea. */
  riskPerTradePercent: 0.75,
  /** Realised loss in one day that ends the session. */
  dailyLossLimitPercent: 2,
  maxConsecutiveLosses: 3,
  maxOpenPositions: 2,
  /** Minimum reward-to-risk for a trade to be considered at all. */
  minRiskReward: 1.5,
  /** Minimum expected value per unit risked, as a fraction. */
  minExpectedValueR: 0.05,
  /** Profit lock switches on once the account is this far above start. */
  profitLockActivationPercent: 5,
  /** Share of peak profit that becomes untouchable once the lock is active. */
  trailingProtectionPercent: 50,
  /** Progress past this point triggers extra caution, not extra aggression. */
  targetNearProgressPercent: 80,
}

export function normaliseConfig(input = {}) {
  const cfg = { ...DEFAULT_GOAL_CONFIG, ...input }
  return {
    ...cfg,
    startingBalance: Math.max(1, +cfg.startingBalance),
    targetBalance: Math.max(+cfg.startingBalance + 0.01, +cfg.targetBalance),
    maxDrawdownPercent: clamp(+cfg.maxDrawdownPercent, 0.5, 50),
    riskPerTradePercent: clamp(+cfg.riskPerTradePercent, 0.05, 5),
    dailyLossLimitPercent: clamp(+cfg.dailyLossLimitPercent, 0.25, 20),
    maxConsecutiveLosses: clamp(Math.round(+cfg.maxConsecutiveLosses), 1, 20),
    maxOpenPositions: clamp(Math.round(+cfg.maxOpenPositions), 1, 20),
    minRiskReward: clamp(+cfg.minRiskReward, 0.5, 10),
    trailingProtectionPercent: clamp(+cfg.trailingProtectionPercent, 0, 95),
  }
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min))

/**
 * The protected floor ratchets up as new equity peaks are set and never falls.
 *
 * It only engages once profit clears the activation threshold, so ordinary
 * noise around the starting balance does not trip a shutdown. Once engaged it
 * protects `trailingProtectionPercent` of the peak profit.
 */
export function computeProtectedFloor(config, peakBalance, previousFloor = null) {
  const { startingBalance, profitLockActivationPercent, trailingProtectionPercent } = config
  const peakProfit = peakBalance - startingBalance
  const activationProfit = startingBalance * (profitLockActivationPercent / 100)

  if (peakProfit < activationProfit) {
    // Lock not engaged yet — the only floor is the hard drawdown limit.
    return previousFloor ?? null
  }

  const floor = startingBalance + peakProfit * (trailingProtectionPercent / 100)
  // Ratchet: a floor never moves down, even if the peak calculation would.
  return previousFloor == null ? round(floor) : round(Math.max(previousFloor, floor))
}

const round = (n) => Math.round(n * 100) / 100

/**
 * Full picture of the account against its goal. `previousFloor` is passed in so
 * the ratchet survives across ticks.
 */
export function computeGoalState(config, { balance, peakBalance, previousFloor = null, dayStartBalance = null }) {
  const cfg = normaliseConfig(config)
  const peak = Math.max(peakBalance ?? cfg.startingBalance, balance, cfg.startingBalance)
  const protectedFloor = computeProtectedFloor(cfg, peak, previousFloor)

  const profit = balance - cfg.startingBalance
  const goalDistance = cfg.targetBalance - cfg.startingBalance
  const progressPercent = goalDistance > 0 ? (profit / goalDistance) * 100 : 0

  const drawdownFromPeak = peak > 0 ? ((peak - balance) / peak) * 100 : 0
  const drawdownFromStart = ((cfg.startingBalance - balance) / cfg.startingBalance) * 100

  const dayPnl = dayStartBalance != null ? balance - dayStartBalance : 0
  const dayLossPercent = dayStartBalance ? (-dayPnl / dayStartBalance) * 100 : 0

  return {
    config: cfg,
    balance: round(balance),
    peakBalance: round(peak),
    startingBalance: cfg.startingBalance,
    targetBalance: cfg.targetBalance,
    profit: round(profit),
    remainingToTarget: round(Math.max(0, cfg.targetBalance - balance)),
    progressPercent: round(clamp(progressPercent, -999, 999)),
    drawdownFromPeak: round(drawdownFromPeak),
    drawdownFromStart: round(Math.max(0, drawdownFromStart)),
    protectedFloor,
    floorBreached: protectedFloor != null && balance < protectedFloor,
    drawdownLimitBreached: drawdownFromPeak >= cfg.maxDrawdownPercent,
    dailyLossLimitBreached: dayLossPercent >= cfg.dailyLossLimitPercent,
    dayPnl: round(dayPnl),
    dayLossPercent: round(Math.max(0, dayLossPercent)),
    targetReached: balance >= cfg.targetBalance,
    targetNear: progressPercent >= cfg.targetNearProgressPercent && balance < cfg.targetBalance,
  }
}

/** Rolling performance over the recent trade record. */
export function computeStreaks(trades = []) {
  const ordered = [...trades].sort((a, b) => (b.exitAt ?? 0) - (a.exitAt ?? 0))

  let consecutiveLosses = 0
  let consecutiveWins = 0
  for (const t of ordered) {
    if (t.pnl > 0) {
      if (consecutiveLosses > 0) break
      consecutiveWins += 1
    } else {
      if (consecutiveWins > 0) break
      consecutiveLosses += 1
    }
  }

  const window = (n) => {
    const slice = ordered.slice(0, n)
    if (!slice.length) return { count: 0, winRate: null, profitFactor: null, expectancy: null }
    const wins = slice.filter((t) => t.pnl > 0)
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
    const grossLoss = Math.abs(slice.filter((t) => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0))
    return {
      count: slice.length,
      winRate: round((wins.length / slice.length) * 100),
      profitFactor: grossLoss > 0 ? round(grossWin / grossLoss) : grossWin > 0 ? Infinity : 0,
      expectancy: round(slice.reduce((s, t) => s + t.pnl, 0) / slice.length),
    }
  }

  return {
    consecutiveLosses,
    consecutiveWins,
    last10: window(10),
    last20: window(20),
    totalTrades: ordered.length,
  }
}
