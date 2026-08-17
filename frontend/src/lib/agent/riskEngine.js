/**
 * Risk Engine — the part the AI is not allowed to argue with.
 *
 * Two separate mechanisms:
 *
 *   HARD GATES     Boolean vetoes. Drawdown breached, daily loss hit, no stop
 *                  defined, reward-to-risk too thin, target already reached.
 *                  These return `approved: false` and no amount of model
 *                  confidence can flip them.
 *
 *   SOFT SIZING    Multipliers on the base risk. Every one of them can only
 *                  ever REDUCE size — the maximum possible output is the base
 *                  risk from config. That single invariant is what makes
 *                  martingale, loss-doubling and revenge trading structurally
 *                  impossible rather than merely discouraged.
 */

export const BLOCK = {
  TARGET_REACHED: 'TARGET_REACHED',
  DRAWDOWN_LIMIT: 'DRAWDOWN_LIMIT',
  FLOOR_BREACHED: 'PROFIT_FLOOR_BREACHED',
  DAILY_LOSS_LIMIT: 'DAILY_LOSS_LIMIT',
  LOSING_STREAK: 'LOSING_STREAK',
  MAX_POSITIONS: 'MAX_POSITIONS',
  NO_STOP: 'NO_STOP_DEFINED',
  POOR_RR: 'RISK_REWARD_TOO_LOW',
  NEGATIVE_EV: 'NEGATIVE_EXPECTED_VALUE',
  NO_SIGNAL: 'NO_VALID_SETUP',
  CRITIC_VETO: 'CRITIC_VETO',
  INSUFFICIENT_CAPITAL: 'INSUFFICIENT_CAPITAL',
  AGENT_STOPPED: 'AGENT_STOPPED',
}

/**
 * Win probability from the actual record, shrunk toward a deliberately
 * pessimistic prior so a handful of lucky trades cannot manufacture an edge.
 * With no history at all this returns the prior, which makes EV positive only
 * at genuinely good reward-to-risk.
 */
export function estimateWinProbability(trades = [], { prior = 0.45, priorWeight = 20 } = {}) {
  const settled = trades.filter((t) => typeof t.pnl === 'number')
  const wins = settled.filter((t) => t.pnl > 0).length
  const p = (wins + prior * priorWeight) / (settled.length + priorWeight)
  return { probability: +p.toFixed(4), sample: settled.length, prior, shrunk: settled.length < priorWeight }
}

/**
 * Expected value per unit of risk (in "R"). EV of +0.2R means the average
 * trade is expected to return a fifth of what it risks. Costs are charged on
 * both sides because they are the difference between a good idea and a
 * profitable one — as the scalp test showed.
 */
export function computeExpectedValue({ winProbability, riskReward, costR = 0.05 }) {
  const p = Math.max(0, Math.min(1, winProbability))
  const evR = p * riskReward - (1 - p) * 1 - costR
  return {
    evR: +evR.toFixed(4),
    winProbability: +p.toFixed(4),
    riskReward: +riskReward.toFixed(2),
    costR,
    positive: evR > 0,
    /** Win rate this reward-to-risk needs just to break even after costs. */
    breakevenWinRate: +((1 + costR) / (riskReward + 1)).toFixed(4),
  }
}

/**
 * Decide whether a trade may be taken, and at what size.
 * Returns a fully explained verdict — never a bare number.
 */
export function assessRisk({
  goalState,
  streaks = { consecutiveLosses: 0, consecutiveWins: 0 },
  signal = null,
  openPositions = 0,
  trades = [],
  criticVerdict = null,
  volatilityPercent = null,
  agentStopped = false,
}) {
  const cfg = goalState.config
  const blocks = []
  const reductions = []

  /* ---------- hard gates ---------- */

  if (agentStopped) blocks.push({ code: BLOCK.AGENT_STOPPED, detail: 'Kill switch engaged — agent is in safe mode.' })

  if (goalState.targetReached)
    blocks.push({
      code: BLOCK.TARGET_REACHED,
      detail: `Balance ${goalState.balance} reached the ${goalState.targetBalance} target. New cycles need explicit approval.`,
    })

  if (goalState.drawdownLimitBreached)
    blocks.push({
      code: BLOCK.DRAWDOWN_LIMIT,
      detail: `Drawdown from peak is ${goalState.drawdownFromPeak}%, at or beyond the ${cfg.maxDrawdownPercent}% limit.`,
    })

  if (goalState.floorBreached)
    blocks.push({
      code: BLOCK.FLOOR_BREACHED,
      detail: `Balance ${goalState.balance} is below the protected floor of ${goalState.protectedFloor}.`,
    })

  if (goalState.dailyLossLimitBreached)
    blocks.push({
      code: BLOCK.DAILY_LOSS_LIMIT,
      detail: `Down ${goalState.dayLossPercent}% today, at the ${cfg.dailyLossLimitPercent}% daily limit.`,
    })

  if (streaks.consecutiveLosses >= cfg.maxConsecutiveLosses)
    blocks.push({
      code: BLOCK.LOSING_STREAK,
      detail: `${streaks.consecutiveLosses} losses in a row — cooldown, not a bigger bet.`,
    })

  if (openPositions >= cfg.maxOpenPositions)
    blocks.push({ code: BLOCK.MAX_POSITIONS, detail: `${openPositions} positions already open (max ${cfg.maxOpenPositions}).` })

  if (!signal || !signal.ok || signal.direction === 'flat')
    blocks.push({ code: BLOCK.NO_SIGNAL, detail: 'No valid setup. Waiting is a position.' })

  const levels = signal?.levels
  if (signal?.ok && (!levels || levels.stop == null || !Number.isFinite(levels.stop)))
    blocks.push({ code: BLOCK.NO_STOP, detail: 'No invalidation level — a trade without a stop is not allowed.' })

  let riskReward = null
  if (levels && levels.stop != null && levels.target != null) {
    const risk = Math.abs(levels.entry - levels.stop)
    const reward = Math.abs(levels.target - levels.entry)
    riskReward = risk > 0 ? reward / risk : 0
    if (riskReward < cfg.minRiskReward)
      blocks.push({
        code: BLOCK.POOR_RR,
        detail: `Reward-to-risk ${riskReward.toFixed(2)} is below the ${cfg.minRiskReward} minimum.`,
      })
  }

  const winEstimate = estimateWinProbability(trades)
  const ev = riskReward ? computeExpectedValue({ winProbability: winEstimate.probability, riskReward }) : null
  if (ev && ev.evR <= (cfg.minExpectedValueR ?? 0))
    blocks.push({
      code: BLOCK.NEGATIVE_EV,
      detail: `Expected value ${ev.evR}R after costs; needs a ${(ev.breakevenWinRate * 100).toFixed(1)}% win rate to break even and the record implies ${(winEstimate.probability * 100).toFixed(1)}%.`,
    })

  if (criticVerdict === 'veto') blocks.push({ code: BLOCK.CRITIC_VETO, detail: 'The critic found a disqualifying objection.' })

  /* ---------- soft sizing: reductions only, never increases ---------- */

  let multiplier = 1

  const dd = goalState.drawdownFromPeak
  if (dd >= cfg.maxDrawdownPercent * 0.7) {
    multiplier *= 0.33
    reductions.push({ factor: 'Deep drawdown', detail: `${dd}% from peak — quarter size`, applied: 0.33 })
  } else if (dd >= cfg.maxDrawdownPercent * 0.4) {
    multiplier *= 0.66
    reductions.push({ factor: 'Drawdown', detail: `${dd}% from peak — two-thirds size`, applied: 0.66 })
  }

  if (streaks.consecutiveLosses === 1) {
    multiplier *= 0.75
    reductions.push({ factor: 'Recent loss', detail: '1 loss — three-quarter size', applied: 0.75 })
  } else if (streaks.consecutiveLosses >= 2) {
    multiplier *= 0.5
    reductions.push({ factor: 'Losing streak', detail: `${streaks.consecutiveLosses} losses — half size`, applied: 0.5 })
  }

  if (goalState.targetNear) {
    multiplier *= 0.5
    reductions.push({
      factor: 'Near target',
      detail: `${goalState.progressPercent}% of the way — protect gains, do not chase`,
      applied: 0.5,
    })
  }

  if (volatilityPercent != null && volatilityPercent > 3) {
    multiplier *= 0.6
    reductions.push({ factor: 'High volatility', detail: `ATR ${volatilityPercent.toFixed(2)}% of price`, applied: 0.6 })
  }

  if (signal?.confidence != null) {
    // Confidence scales between 0.6 and 1.0 — it can never push size above base.
    const scale = Math.max(0.6, Math.min(1, signal.confidence / 100))
    multiplier *= scale
    if (scale < 1) reductions.push({ factor: 'Confidence', detail: `${signal.confidence}% agreement`, applied: +scale.toFixed(2) })
  }

  if (criticVerdict === 'reduce') {
    multiplier *= 0.5
    reductions.push({ factor: 'Critic', detail: 'Objections raised — half size', applied: 0.5 })
  }

  // A winning streak deliberately does nothing. Confidence after wins is how
  // accounts give back gains.
  if (streaks.consecutiveWins >= 3) {
    reductions.push({ factor: 'Winning streak', detail: `${streaks.consecutiveWins} wins — size unchanged by design`, applied: 1 })
  }

  // THE INVARIANT: size can only ever shrink from base.
  multiplier = Math.max(0, Math.min(1, multiplier))

  const riskPercent = +(cfg.riskPerTradePercent * multiplier).toFixed(4)
  const riskAmount = +((goalState.balance * riskPercent) / 100).toFixed(4)

  let quantity = null
  let notional = null
  if (levels && levels.stop != null && riskAmount > 0) {
    const perUnitRisk = Math.abs(levels.entry - levels.stop)
    if (perUnitRisk > 0) {
      quantity = riskAmount / perUnitRisk
      notional = quantity * levels.entry
      // Never commit more than the account holds.
      if (notional > goalState.balance) {
        quantity = goalState.balance / levels.entry
        notional = goalState.balance
        reductions.push({ factor: 'Capital cap', detail: 'Size clamped to available balance', applied: 1 })
      }
      if (quantity <= 0) blocks.push({ code: BLOCK.INSUFFICIENT_CAPITAL, detail: 'Position size rounds to zero at this risk.' })
    }
  }

  return {
    approved: blocks.length === 0,
    blocks,
    reductions,
    baseRiskPercent: cfg.riskPerTradePercent,
    riskPercent,
    riskAmount,
    multiplier: +multiplier.toFixed(4),
    quantity: quantity != null ? +quantity.toFixed(8) : null,
    notional: notional != null ? +notional.toFixed(2) : null,
    riskReward: riskReward != null ? +riskReward.toFixed(2) : null,
    expectedValue: ev,
    winEstimate,
  }
}
