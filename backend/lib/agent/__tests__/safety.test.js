import { describe, expect, it } from 'vitest'
import { DEFAULT_GOAL_CONFIG, computeGoalState, computeProtectedFloor, computeStreaks, normaliseConfig } from '../goalManager'
import { BLOCK, assessRisk, computeExpectedValue, estimateWinProbability } from '../riskEngine'
import { STATES, deriveState } from '../stateMachine'
import { critique } from '../critic'

const config = normaliseConfig(DEFAULT_GOAL_CONFIG) // start 100, target 200, maxDD 5%, risk 0.75%

const goal = (balance, peak = balance, extra = {}) =>
  computeGoalState(config, { balance, peakBalance: peak, ...extra })

/** A clean, tradeable signal: 3:1 reward-to-risk, decent agreement. */
const goodSignal = (overrides = {}) => ({
  ok: true,
  symbol: 'ETH',
  direction: 'long',
  bias: 'Buy',
  confidence: 75,
  price: 100,
  checks: [
    { name: 'RSI (14)', verdict: 'bullish', weight: 1.5, detail: '' },
    { name: 'MACD', verdict: 'bullish', weight: 2, detail: '' },
    { name: 'Trend (SMA 50)', verdict: 'bullish', weight: 1.5, detail: '' },
  ],
  // Stop is 1.0 away against a 0.5 ATR — 2× ATR, outside routine noise.
  levels: { entry: 100, stop: 99, target: 103, atr: 0.5, riskReward: 3 },
  ...overrides,
})

/** ATR matching the fixture, so critic tests isolate the condition under test. */
const FIXTURE_ATR = 0.5

/* ------------------------------------------------------------------ */

describe('goal manager — profit lock', () => {
  it('stays dormant until profit clears the activation threshold', () => {
    // +4% profit, activation is +5%
    expect(computeProtectedFloor(config, 104)).toBeNull()
  })

  it('protects half of peak profit once active', () => {
    // peak 110 → profit 10 → floor = 100 + 5
    expect(computeProtectedFloor(config, 110)).toBe(105)
    expect(computeProtectedFloor(config, 130)).toBe(115)
  })

  it('ratchets and never falls back', () => {
    const high = computeProtectedFloor(config, 130) // 115
    const afterPullback = computeProtectedFloor(config, 112, high)
    expect(afterPullback).toBe(high)
  })

  it('flags a breach when balance falls through the floor', () => {
    const state = computeGoalState(config, { balance: 104, peakBalance: 130, previousFloor: 115 })
    expect(state.protectedFloor).toBe(115)
    expect(state.floorBreached).toBe(true)
  })
})

describe('goal manager — progress and drawdown', () => {
  it('measures progress against the goal, not the balance', () => {
    const s = goal(112)
    expect(s.profit).toBe(12)
    expect(s.progressPercent).toBe(12) // 12 of the 100 needed
    expect(s.remainingToTarget).toBe(88)
  })

  it('measures drawdown from peak', () => {
    const s = goal(112, 115)
    expect(s.drawdownFromPeak).toBeCloseTo(2.61, 1)
    expect(s.drawdownLimitBreached).toBe(false)
  })

  it('breaches at the configured limit', () => {
    expect(goal(94, 100).drawdownLimitBreached).toBe(true)
  })
})

describe('streaks', () => {
  it('counts only the current run', () => {
    const trades = [
      { pnl: -1, exitAt: 5 },
      { pnl: -1, exitAt: 4 },
      { pnl: 3, exitAt: 3 },
    ]
    const s = computeStreaks(trades)
    expect(s.consecutiveLosses).toBe(2)
    expect(s.consecutiveWins).toBe(0)
  })
})

/* ------------------------------------------------------------------ */

describe('expected value', () => {
  it('rejects a tiny-target strategy once costs are charged', () => {
    // The "+0.1% and never lose" idea: high win rate, terrible payoff.
    const ev = computeExpectedValue({ winProbability: 0.95, riskReward: 0.1 })
    expect(ev.positive).toBe(false)
  })

  it('accepts a genuine edge', () => {
    expect(computeExpectedValue({ winProbability: 0.5, riskReward: 3 }).positive).toBe(true)
  })

  it('shrinks a small sample toward the pessimistic prior', () => {
    const perfect = estimateWinProbability([{ pnl: 1 }, { pnl: 1 }, { pnl: 1 }])
    expect(perfect.probability).toBeLessThan(0.6) // 3 wins is not a 100% win rate
    expect(perfect.shrunk).toBe(true)
  })
})

/* ------------------------------------------------------------------ */

describe('risk engine — hard gates cannot be bypassed', () => {
  const base = { streaks: { consecutiveLosses: 0, consecutiveWins: 0 }, signal: goodSignal(), openPositions: 0 }

  const codes = (r) => r.blocks.map((b) => b.code)

  it('blocks once the target is reached', () => {
    const r = assessRisk({ ...base, goalState: goal(200) })
    expect(r.approved).toBe(false)
    expect(codes(r)).toContain(BLOCK.TARGET_REACHED)
  })

  it('blocks when max drawdown is breached', () => {
    expect(codes(assessRisk({ ...base, goalState: goal(94, 100) }))).toContain(BLOCK.DRAWDOWN_LIMIT)
  })

  it('blocks when the protected floor is breached', () => {
    const goalState = computeGoalState(config, { balance: 104, peakBalance: 130, previousFloor: 115 })
    expect(codes(assessRisk({ ...base, goalState }))).toContain(BLOCK.FLOOR_BREACHED)
  })

  it('blocks on the daily loss limit', () => {
    const goalState = computeGoalState(config, { balance: 97, peakBalance: 100, dayStartBalance: 100 })
    expect(codes(assessRisk({ ...base, goalState }))).toContain(BLOCK.DAILY_LOSS_LIMIT)
  })

  it('blocks after the configured losing streak', () => {
    const r = assessRisk({ ...base, goalState: goal(100), streaks: { consecutiveLosses: 3, consecutiveWins: 0 } })
    expect(codes(r)).toContain(BLOCK.LOSING_STREAK)
  })

  it('blocks a trade with no stop defined', () => {
    const signal = goodSignal({ levels: { entry: 100, stop: null, target: 103 } })
    expect(codes(assessRisk({ ...base, goalState: goal(100), signal }))).toContain(BLOCK.NO_STOP)
  })

  it('blocks poor reward-to-risk', () => {
    const signal = goodSignal({ levels: { entry: 100, stop: 99, target: 100.5, atr: 1 } })
    expect(codes(assessRisk({ ...base, goalState: goal(100), signal }))).toContain(BLOCK.POOR_RR)
  })

  it('blocks when there is no setup', () => {
    expect(codes(assessRisk({ ...base, goalState: goal(100), signal: null }))).toContain(BLOCK.NO_SIGNAL)
  })

  it('blocks when the critic vetoes', () => {
    const r = assessRisk({ ...base, goalState: goal(100), criticVerdict: 'veto' })
    expect(codes(r)).toContain(BLOCK.CRITIC_VETO)
    expect(r.approved).toBe(false)
  })

  it('blocks when the kill switch is engaged', () => {
    expect(codes(assessRisk({ ...base, goalState: goal(100), agentStopped: true }))).toContain(BLOCK.AGENT_STOPPED)
  })

  it('approves a clean setup in normal conditions', () => {
    const r = assessRisk({ ...base, goalState: goal(100) })
    expect(r.approved).toBe(true)
    expect(r.quantity).toBeGreaterThan(0)
  })
})

describe('risk engine — the no-martingale invariant', () => {
  const signal = goodSignal()

  it('never sizes above base risk, in any state', () => {
    const scenarios = [
      { label: 'normal', goalState: goal(100), streaks: { consecutiveLosses: 0, consecutiveWins: 0 } },
      { label: 'after 1 loss', goalState: goal(99), streaks: { consecutiveLosses: 1, consecutiveWins: 0 } },
      { label: 'after 2 losses', goalState: goal(98), streaks: { consecutiveLosses: 2, consecutiveWins: 0 } },
      { label: 'after 5 wins', goalState: goal(120, 120), streaks: { consecutiveLosses: 0, consecutiveWins: 5 } },
      { label: 'deep drawdown', goalState: goal(97, 100), streaks: { consecutiveLosses: 0, consecutiveWins: 0 } },
      { label: 'near target', goalState: goal(185, 185), streaks: { consecutiveLosses: 0, consecutiveWins: 0 } },
    ]

    for (const s of scenarios) {
      const r = assessRisk({ goalState: s.goalState, streaks: s.streaks, signal, openPositions: 0 })
      expect(r.riskPercent, `${s.label} exceeded base risk`).toBeLessThanOrEqual(config.riskPerTradePercent)
      expect(r.multiplier, `${s.label} multiplier above 1`).toBeLessThanOrEqual(1)
    }
  })

  it('shrinks size after a loss rather than growing it', () => {
    const flat = assessRisk({ goalState: goal(100), streaks: { consecutiveLosses: 0, consecutiveWins: 0 }, signal })
    const afterLoss = assessRisk({ goalState: goal(99), streaks: { consecutiveLosses: 1, consecutiveWins: 0 }, signal })
    expect(afterLoss.riskPercent).toBeLessThan(flat.riskPercent)
  })

  it('does not raise size on a winning streak', () => {
    const flat = assessRisk({ goalState: goal(100), streaks: { consecutiveLosses: 0, consecutiveWins: 0 }, signal })
    const hot = assessRisk({ goalState: goal(100), streaks: { consecutiveLosses: 0, consecutiveWins: 6 }, signal })
    expect(hot.riskPercent).toBeLessThanOrEqual(flat.riskPercent)
  })

  it('cuts risk as the target approaches instead of chasing it', () => {
    const early = assessRisk({ goalState: goal(110, 110), streaks: { consecutiveLosses: 0, consecutiveWins: 0 }, signal })
    const late = assessRisk({ goalState: goal(185, 185), streaks: { consecutiveLosses: 0, consecutiveWins: 0 }, signal })
    expect(late.riskPercent).toBeLessThan(early.riskPercent)
  })

  it('never commits more than the account holds', () => {
    const r = assessRisk({
      goalState: goal(100),
      streaks: { consecutiveLosses: 0, consecutiveWins: 0 },
      // A 1-cent stop would demand an enormous position on risk-based sizing.
      signal: goodSignal({ levels: { entry: 100, stop: 99.99, target: 103, atr: 1.2 } }),
    })
    expect(r.notional).toBeLessThanOrEqual(100)
  })
})

/* ------------------------------------------------------------------ */

describe('state machine', () => {
  const streaks = { consecutiveLosses: 0 }

  it('reports target reached above the goal', () => {
    expect(deriveState({ goalState: goal(200), streaks }).key).toBe(STATES.TARGET_REACHED.key)
  })

  it('halts on drawdown breach', () => {
    expect(deriveState({ goalState: goal(94, 100), streaks }).key).toBe(STATES.HALTED_DRAWDOWN.key)
  })

  it('cools down on a losing streak', () => {
    expect(deriveState({ goalState: goal(100), streaks: { consecutiveLosses: 3 } }).key).toBe(STATES.COOLDOWN.key)
  })

  it('enters risk reduction on a single loss', () => {
    expect(deriveState({ goalState: goal(100), streaks: { consecutiveLosses: 1 } }).key).toBe(STATES.RISK_REDUCTION.key)
  })

  it('flags target-near before the goal', () => {
    expect(deriveState({ goalState: goal(185, 185), streaks }).key).toBe(STATES.TARGET_NEAR.key)
  })

  it('respects the kill switch above everything else', () => {
    expect(deriveState({ goalState: goal(150, 150), streaks, agentStopped: true }).key).toBe(STATES.SAFE_MODE.key)
  })

  it('halting states never permit trading', () => {
    for (const key of ['TARGET_REACHED', 'SAFE_MODE', 'HALTED_DRAWDOWN', 'HALTED_FLOOR', 'COOLDOWN']) {
      expect(STATES[key].trading, `${key} allowed trading`).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------ */

describe('critic', () => {
  it('vetoes a stop tighter than one ATR', () => {
    const signal = goodSignal({ levels: { entry: 100, stop: 99.5, target: 103, atr: 2 } })
    const r = critique({ signal, atr: 2, volatilityPercent: 2 })
    expect(r.verdict).toBe('veto')
  })

  it('vetoes extreme volatility', () => {
    const r = critique({ signal: goodSignal(), atr: FIXTURE_ATR, volatilityPercent: 6 })
    expect(r.verdict).toBe('veto')
    expect(r.objections.some((o) => o.question.includes('volatility'))).toBe(true)
  })

  it('reduces when macro and crowding both argue against', () => {
    const r = critique({
      signal: goodSignal(),
      atr: FIXTURE_ATR,
      volatilityPercent: 1,
      regime: { label: 'Risk-off', net: -3, crowding: 'crowded-long' },
    })
    expect(r.verdict).toBe('reduce')
  })

  it('flags a poor record on the same setup', () => {
    const episodes = Array.from({ length: 5 }, (_, i) => ({
      symbol: 'ETH',
      direction: 'long',
      outcome: { pnl: i < 4 ? -1 : 2 },
    }))
    const r = critique({ signal: goodSignal(), atr: FIXTURE_ATR, volatilityPercent: 1, episodes })
    expect(r.objections.some((o) => o.question.includes('similar'))).toBe(true)
  })

  it('approves a clean setup', () => {
    const r = critique({ signal: goodSignal(), atr: FIXTURE_ATR, volatilityPercent: 1, regime: { label: 'Mixed', net: 0 } })
    expect(r.verdict).toBe('approve')
  })

  it('vetoes when there is no setup at all', () => {
    expect(critique({ signal: null }).verdict).toBe('veto')
  })
})
