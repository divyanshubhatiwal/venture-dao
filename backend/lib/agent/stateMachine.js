/**
 * Account state machine.
 *
 * State is derived from the account's own numbers rather than stored, so it can
 * never drift out of sync with reality. Order matters: the halting states are
 * checked first, because a breached limit outranks every other consideration.
 */

export const STATES = {
  TARGET_REACHED: {
    key: 'TARGET_REACHED',
    label: 'Target reached',
    tone: 'emerald',
    trading: false,
    description: 'Goal met. Trading paused until a new cycle is explicitly approved.',
  },
  SAFE_MODE: {
    key: 'SAFE_MODE',
    label: 'Safe mode',
    tone: 'rose',
    trading: false,
    description: 'Kill switch engaged. No new orders, pending orders cancelled.',
  },
  HALTED_DRAWDOWN: {
    key: 'HALTED_DRAWDOWN',
    label: 'Halted — drawdown limit',
    tone: 'rose',
    trading: false,
    description: 'Maximum drawdown breached. Trading stops; this is not a signal to size up and recover.',
  },
  HALTED_FLOOR: {
    key: 'HALTED_FLOOR',
    label: 'Halted — profit floor',
    tone: 'rose',
    trading: false,
    description: 'Balance fell through the protected floor. Locked profit is not available to risk.',
  },
  COOLDOWN: {
    key: 'COOLDOWN',
    label: 'Cooldown',
    tone: 'amber',
    trading: false,
    description: 'Daily loss limit or losing streak hit. Waiting out the session rather than trading through it.',
  },
  RISK_REDUCTION: {
    key: 'RISK_REDUCTION',
    label: 'Risk reduction',
    tone: 'amber',
    trading: true,
    description: 'In drawdown or coming off losses. Still trading, at materially smaller size.',
  },
  TARGET_NEAR: {
    key: 'TARGET_NEAR',
    label: 'Target near',
    tone: 'sky',
    trading: true,
    description: 'Most of the way to goal. Risk is cut, not raised — the last stretch is where gains get given back.',
  },
  PROFIT_PROTECTION: {
    key: 'PROFIT_PROTECTION',
    label: 'Profit protection',
    tone: 'sky',
    trading: true,
    description: 'Profit lock active. A share of the peak gain is now off the table permanently.',
  },
  PROFITING: {
    key: 'PROFITING',
    label: 'Profiting',
    tone: 'emerald',
    trading: true,
    description: 'Above starting balance, below the profit-lock threshold.',
  },
  NORMAL: {
    key: 'NORMAL',
    label: 'Normal',
    tone: 'slate',
    trading: true,
    description: 'Base conditions. Standard risk per trade.',
  },
}

/**
 * @returns the single active state plus the conditions that produced it.
 */
export function deriveState({ goalState, streaks = { consecutiveLosses: 0 }, agentStopped = false }) {
  const cfg = goalState.config
  const notes = []

  const pick = (state, reason) => ({ ...state, reason, notes })

  if (agentStopped) return pick(STATES.SAFE_MODE, 'Operator stopped the agent.')
  if (goalState.targetReached) return pick(STATES.TARGET_REACHED, `Balance ${goalState.balance} ≥ target ${goalState.targetBalance}.`)
  if (goalState.drawdownLimitBreached)
    return pick(STATES.HALTED_DRAWDOWN, `Drawdown ${goalState.drawdownFromPeak}% ≥ limit ${cfg.maxDrawdownPercent}%.`)
  if (goalState.floorBreached) return pick(STATES.HALTED_FLOOR, `Balance below protected floor ${goalState.protectedFloor}.`)
  if (goalState.dailyLossLimitBreached)
    return pick(STATES.COOLDOWN, `Down ${goalState.dayLossPercent}% today, limit ${cfg.dailyLossLimitPercent}%.`)
  if (streaks.consecutiveLosses >= cfg.maxConsecutiveLosses)
    return pick(STATES.COOLDOWN, `${streaks.consecutiveLosses} consecutive losses.`)

  if (goalState.drawdownFromPeak >= cfg.maxDrawdownPercent * 0.4 || streaks.consecutiveLosses >= 1) {
    notes.push('Size is reduced while this persists.')
    return pick(
      STATES.RISK_REDUCTION,
      goalState.drawdownFromPeak >= cfg.maxDrawdownPercent * 0.4
        ? `Drawdown ${goalState.drawdownFromPeak}% from peak.`
        : `${streaks.consecutiveLosses} recent loss.`,
    )
  }

  if (goalState.targetNear) return pick(STATES.TARGET_NEAR, `${goalState.progressPercent}% of goal reached.`)
  if (goalState.protectedFloor != null) return pick(STATES.PROFIT_PROTECTION, `Floor locked at ${goalState.protectedFloor}.`)
  if (goalState.profit > 0) return pick(STATES.PROFITING, `Up ${goalState.profit} on the cycle.`)

  return pick(STATES.NORMAL, 'No limit conditions active.')
}
