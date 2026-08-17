import { computeGoalState, computeStreaks } from './goalManager.js'
import { deriveState } from './stateMachine.js'
import { critique } from './critic.js'
import { assessRisk } from './riskEngine.js'
import { generateSignal } from '../trading/signals.js'

/**
 * The decision pipeline, in the order the spec lays out:
 *
 *   market data → signal → critic → risk engine → goal manager → decision
 *
 * The risk engine runs LAST and has the final word. Neither the signal's
 * confidence nor the critic's approval can produce a trade the risk engine
 * blocks — that ordering is what makes the safety rules unbypassable rather
 * than advisory.
 */

export const ACTIONS = {
  BUY: 'BUY',
  SELL: 'SELL',
  HOLD: 'HOLD',
  NO_TRADE: 'NO_TRADE',
  CLOSE_POSITION: 'CLOSE_POSITION',
}

export function decide({
  symbol,
  assetClass = 'crypto',
  candles = [],
  config,
  account,
  trades = [],
  episodes = [],
  openPositions = 0,
  regime = null,
  /* A sentiment read plus the weight it has earned. Weight is 0 until the
     reading has been scored against real outcomes enough times to justify
     one, so passing this in has no effect on trades until it does. */
  sentiment = null,
  agentStopped = false,
}) {
  const goalState = computeGoalState(config, account)
  const streaks = computeStreaks(trades)
  const machineState = deriveState({ goalState, streaks, agentStopped })

  const signal = generateSignal(candles, { symbol, sentiment })
  const atr = signal?.ok ? signal.levels.atr : null
  const price = signal?.ok ? signal.price : (candles[candles.length - 1]?.close ?? null)
  const volatilityPercent = atr && price ? (atr / price) * 100 : null

  const criticReport = critique({ signal, regime, episodes, volatilityPercent, atr })

  const risk = assessRisk({
    goalState,
    streaks,
    signal,
    openPositions,
    trades,
    criticVerdict: criticReport.verdict,
    volatilityPercent,
    agentStopped,
  })

  const action = !risk.approved
    ? ACTIONS.NO_TRADE
    : signal.direction === 'long'
      ? ACTIONS.BUY
      : signal.direction === 'short'
        ? ACTIONS.SELL
        : ACTIONS.NO_TRADE

  const reason = risk.approved
    ? `${signal.bias} with ${signal.confidence}% agreement. ${criticReport.summary} Sized at ${risk.riskPercent}% of ${goalState.balance} against a stop at ${signal.levels.stop}.`
    : risk.blocks.map((b) => b.detail).join(' ')

  return {
    at: Date.now(),
    symbol,
    assetClass,
    action,
    approved: risk.approved,
    confidence: signal?.ok ? signal.confidence : null,
    price,
    levels: signal?.ok ? signal.levels : null,
    quantity: risk.quantity,
    notional: risk.notional,
    riskPercent: risk.riskPercent,
    riskAmount: risk.riskAmount,
    riskReward: risk.riskReward,
    expectedValue: risk.expectedValue,
    winEstimate: risk.winEstimate,
    riskLevel: volatilityPercent == null ? 'UNKNOWN' : volatilityPercent > 3 ? 'HIGH' : volatilityPercent > 1.5 ? 'MEDIUM' : 'LOW',
    volatilityPercent: volatilityPercent != null ? +volatilityPercent.toFixed(2) : null,
    regime: regime ? { label: regime.label, net: regime.net } : null,
    state: machineState,
    goalState,
    streaks,
    signal,
    critic: criticReport,
    risk,
    reason,
    invalidation: signal?.ok
      ? `Thesis is wrong below ${signal.levels.stop}${signal.direction === 'short' ? ' inverted for the short' : ''}; the position closes there without discretion.`
      : 'No position, nothing to invalidate.',
  }
}

/** The fixed-width decision record from the spec, for the journal and logs. */
export function formatDecision(d) {
  const line = '━'.repeat(34)
  const row = (label, value) => `${label}:\n${value}\n`

  return [
    line,
    'AI TRADING DECISION',
    line,
    '',
    row('Asset', d.symbol),
    row('Action', d.action),
    row('Confidence', d.confidence != null ? `${d.confidence}%` : '—'),
    row('Account State', d.state.label),
    row('Current Balance', `$${d.goalState.balance}`),
    row('Target', `$${d.goalState.targetBalance}`),
    row('Target Progress', `${d.goalState.progressPercent}%`),
    row('Protected Floor', d.goalState.protectedFloor != null ? `$${d.goalState.protectedFloor}` : 'not yet active'),
    row('Risk Per Trade', `${d.riskPercent}% (base ${d.risk.baseRiskPercent}%)`),
    row('Entry', d.levels ? `$${d.levels.entry}` : '—'),
    row('Stop Loss', d.levels ? `$${d.levels.stop}` : '—'),
    row('Take Profit', d.levels ? `$${d.levels.target}` : '—'),
    row('Risk/Reward', d.riskReward ? `1 : ${d.riskReward}` : '—'),
    row('Expected Value', d.expectedValue ? `${d.expectedValue.evR}R (${d.expectedValue.positive ? 'positive' : 'negative'})` : '—'),
    row('Market Regime', d.regime?.label ?? 'unknown'),
    row('Risk Level', d.riskLevel),
    row('Critic', d.critic.verdict.toUpperCase()),
    row('Decision', d.approved ? 'APPROVED' : 'REJECTED'),
    row('Reason', d.reason),
    row('Invalidation', d.invalidation),
    line,
  ].join('\n')
}
