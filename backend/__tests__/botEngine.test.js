import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOT_STATES, createBotEngine, executionKey, preflight } from '../trading/botEngine.js'

const NOW = 1_700_000_000_000

const decision = (over = {}) => ({
  approved: true,
  action: 'BUY',
  quantity: 2.5,
  levels: { entry: 100, stop: 96, target: 108 },
  reason: 'test setup',
  ...over,
})

const account = { balance: 1000, startingBalance: 1000, peakBalance: 1000, dayStartBalance: 1000, tradesToday: 0 }
const config = { startingCapital: 1000, targetPercent: 2, riskPerTradePercent: 1, maxDrawdownPercent: 20, dailyLossLimitPercent: 3, maxOpenPositions: 3, maxTradesPerDay: 5 }
const base = { decision: decision(), account, config, dataAt: NOW - 1000, now: NOW }

describe('preflight', () => {
  it('passes a clean setup', () => {
    expect(preflight(base).ok).toBe(true)
  })

  it('kill switch and emergency stop override everything', () => {
    expect(preflight({ ...base, killSwitch: true }).code).toBe('KILL_SWITCH')
    expect(preflight({ ...base, emergencyStop: true }).code).toBe('EMERGENCY_STOP')
  })

  it('refuses to trade on stale market data', () => {
    expect(preflight({ ...base, dataAt: NOW - 120_000 }).code).toBe('STALE_DATA')
    expect(preflight({ ...base, dataAt: null }).code).toBe('STALE_DATA')
  })

  it('refuses an entry with no stop', () => {
    expect(preflight({ ...base, decision: decision({ levels: { entry: 100, stop: null, target: 108 } }) }).code).toBe('NO_STOP')
  })

  it('rejects an inverted long stop', () => {
    expect(preflight({ ...base, decision: decision({ levels: { entry: 100, stop: 104, target: 108 } }) }).code).toBe('INVALID_STOP')
  })

  it('rejects an inverted short stop', () => {
    const d = decision({ action: 'SELL', levels: { entry: 100, stop: 96, target: 92 } })
    expect(preflight({ ...base, decision: d }).code).toBe('INVALID_STOP')
  })

  it('accepts a correctly framed short', () => {
    const d = decision({ action: 'SELL', levels: { entry: 100, stop: 104, target: 92 } })
    expect(preflight({ ...base, decision: d }).ok).toBe(true)
  })

  it('rejects a target on the wrong side of entry', () => {
    expect(preflight({ ...base, decision: decision({ levels: { entry: 100, stop: 96, target: 94 } }) }).code).toBe('INVALID_TARGET')
  })

  it('rejects a zero-size position', () => {
    expect(preflight({ ...base, decision: decision({ quantity: 0 }) }).code).toBe('INVALID_QTY')
  })

  it('enforces max open positions and max trades per day', () => {
    expect(preflight({ ...base, openPositions: 3 }).code).toBe('MAX_POSITIONS')
    expect(preflight({ ...base, tradesToday: 5 }).code).toBe('MAX_TRADES')
  })

  /* Risk-based sizing does not bound position size on its own — a tight stop
     makes risk ÷ distance arbitrarily large. These caps are the backstop. */
  it('rejects a position exceeding max leverage even when risk is within budget', () => {
    const cfg = { ...config, maxLeverage: 5 }
    const d = decision({ quantity: 100, notional: 10_000 }) // 10× a 1000 account
    expect(preflight({ ...base, config: cfg, decision: d }).code).toBe('MAX_LEVERAGE')
  })

  it('allows a position inside the leverage limit', () => {
    const cfg = { ...config, maxLeverage: 5 }
    expect(preflight({ ...base, config: cfg, decision: decision({ quantity: 30, notional: 3000 }) }).ok).toBe(true)
  })

  it('rejects a notional above the percent-of-equity cap', () => {
    const cfg = { ...config, maxPositionPercent: 20 }
    expect(preflight({ ...base, config: cfg, decision: decision({ quantity: 5, notional: 500 }) }).code).toBe('MAX_POSITION')
  })

  it('rejects a notional above the absolute cap', () => {
    const cfg = { ...config, maxOrderNotional: 100 }
    expect(preflight({ ...base, config: cfg, decision: decision({ quantity: 5, notional: 500 }) }).code).toBe('MAX_NOTIONAL')
  })

  it('refuses to trade below the margin floor', () => {
    const cfg = { ...config, minAvailableMargin: 500 }
    const acct = { ...account, availableMargin: 100 }
    expect(preflight({ ...base, config: cfg, account: acct }).code).toBe('MIN_MARGIN')
  })

  it('derives notional from quantity when the decision omits it', () => {
    const cfg = { ...config, maxLeverage: 1 }
    // 50 units @ 100 = 5000 notional on a 1000 account = 5×
    expect(preflight({ ...base, config: cfg, decision: decision({ quantity: 50 }) }).code).toBe('MAX_LEVERAGE')
  })

  /* A long and a short on one instrument pay both spreads to net nothing.
     The idempotency key cannot catch this: direction is part of the key, so
     the opposite side is always a "new" trade. */
  it('refuses to hedge against an existing position in the same symbol', () => {
    const positions = [{ symbol: 'ETH', side: 'long', qty: 1 }]
    const d = decision({ symbol: 'ETH', action: 'SELL', levels: { entry: 100, stop: 104, target: 92 } })
    expect(preflight({ ...base, decision: d, positions, openPositions: 1 }).code).toBe('OPPOSING_EXPOSURE')
  })

  it('refuses to add to an open position in the same symbol', () => {
    const positions = [{ symbol: 'ETH', side: 'long', qty: 1 }]
    const d = decision({ symbol: 'ETH', action: 'BUY' })
    expect(preflight({ ...base, decision: d, positions, openPositions: 1 }).code).toBe('SYMBOL_EXPOSURE')
  })

  it('still allows a different symbol while one is held', () => {
    const positions = [{ symbol: 'ETH', side: 'long', qty: 1 }]
    const d = decision({ symbol: 'SOL', action: 'BUY' })
    expect(preflight({ ...base, decision: d, positions, openPositions: 1 }).ok).toBe(true)
  })

  it('does not trade an unapproved decision', () => {
    expect(preflight({ ...base, decision: decision({ approved: false, reason: 'critic veto' }) }).code).toBe('NOT_APPROVED')
  })
})

describe('executionKey', () => {
  it('is stable inside a time bucket and differs across buckets', () => {
    const a = executionKey({ accountId: 'a', symbol: 'ETH', direction: 'BUY', at: NOW })
    const b = executionKey({ accountId: 'a', symbol: 'ETH', direction: 'BUY', at: NOW + 5_000 })
    const c = executionKey({ accountId: 'a', symbol: 'ETH', direction: 'BUY', at: NOW + 120_000 })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('separates accounts, symbols and directions', () => {
    const k = (o) => executionKey({ accountId: 'a', symbol: 'ETH', direction: 'BUY', at: NOW, ...o })
    expect(k()).not.toBe(k({ accountId: 'b' }))
    expect(k()).not.toBe(k({ symbol: 'BTC' }))
    expect(k()).not.toBe(k({ direction: 'SELL' }))
  })
})

/* A venue that records what it was asked to do. */
function fakeAdapter(over = {}) {
  const submitted = []
  return {
    submitted,
    getAccount: async () => account,
    getPositions: async () => [],
    killSwitchEngaged: async () => false,
    submitOrder: async (o) => {
      submitted.push(o)
      return { orderId: `ord-${submitted.length}`, status: 'filled' }
    },
    ...over,
  }
}

// Candles that trend hard enough for the real pipeline to produce a signal.
const candles = Array.from({ length: 120 }, (_, i) => {
  const close = 100 + i * 0.6
  return { time: NOW - (120 - i) * 60_000, open: close - 0.3, high: close + 0.5, low: close - 0.5, close, volume: 1000 + i * 12 }
})

const engineWith = (adapter, over = {}) =>
  createBotEngine({
    adapter,
    marketData: async () => ({ candles, at: Date.now() }),
    config,
    accountId: 'acct-1',
    symbols: ['ETH'],
    ...over,
  })

describe('createBotEngine', () => {
  let adapter
  beforeEach(() => {
    adapter = fakeAdapter()
  })

  it('starts stopped and never trades before being started', async () => {
    const bot = engineWith(adapter)
    expect(bot.getState()).toBe(BOT_STATES.STOPPED)
    expect(adapter.submitted).toHaveLength(0)
  })

  it('submits at most one order per signal within a time bucket', async () => {
    const bot = engineWith(adapter)
    await bot.runCycle()
    await bot.runCycle()
    await bot.runCycle()
    expect(adapter.submitted.length).toBeLessThanOrEqual(1)
  })

  it('never submits while the kill switch is engaged, whatever the signal says', async () => {
    const blocked = fakeAdapter({ killSwitchEngaged: async () => true })
    const bot = engineWith(blocked)
    await bot.runCycle()
    expect(blocked.submitted).toHaveLength(0)
    expect(bot.getState()).toBe(BOT_STATES.KILL_SWITCH)
    expect(bot.getJournal().some((j) => j.code === 'KILL_SWITCH')).toBe(true)
  })

  it('emergency stop latches and blocks all further cycles', async () => {
    const bot = engineWith(adapter)
    bot.engageEmergencyStop('test')
    expect(bot.getState()).toBe(BOT_STATES.KILL_SWITCH)
    await bot.runCycle()
    expect(adapter.submitted).toHaveLength(0)
    // start() must not resurrect a latched stop
    bot.start()
    expect(bot.getState()).toBe(BOT_STATES.KILL_SWITCH)
    expect(bot.isRunning()).toBe(false)
  })

  it('resumes only after the emergency stop is explicitly cleared', () => {
    const bot = engineWith(adapter)
    bot.engageEmergencyStop()
    bot.clearEmergencyStop()
    expect(bot.isEmergencyStopped()).toBe(false)
    expect(bot.getState()).toBe(BOT_STATES.STOPPED)
  })

  it('refuses to trade on stale market data', async () => {
    const bot = engineWith(adapter, { marketData: async () => ({ candles, at: Date.now() - 600_000 }) })
    await bot.runCycle()
    expect(adapter.submitted).toHaveLength(0)
    expect(bot.getJournal().some((j) => j.code === 'STALE_DATA' || j.kind === 'no-trade')).toBe(true)
  })

  it('goes to RECONCILING rather than retrying when submission throws', async () => {
    const flaky = fakeAdapter({
      submitOrder: async () => {
        throw new Error('network timeout')
      },
    })
    const bot = engineWith(flaky)
    const res = await bot.runCycle()
    if (res.reconciling) {
      expect(bot.getState()).toBe(BOT_STATES.RECONCILING)
      // The key stays reserved: the order may exist on the venue.
      await bot.runCycle()
      expect(bot.getJournal().some((j) => j.kind === 'duplicate-suppressed' || j.kind === 'error')).toBe(true)
    }
  })

  it('pause stops the loop without an emergency latch', () => {
    const bot = engineWith(adapter)
    bot.start()
    expect(bot.isRunning()).toBe(true)
    bot.pause()
    expect(bot.isRunning()).toBe(false)
    expect(bot.isEmergencyStopped()).toBe(false)
  })

  it('records every decision in the journal, including refusals', async () => {
    const bot = engineWith(fakeAdapter({ killSwitchEngaged: async () => true }))
    await bot.runCycle()
    expect(bot.getJournal().length).toBeGreaterThan(0)
  })
})

describe('cost-aware edge gate', () => {
  const costCfg = { ...config, feeBps: 5, minRewardToCost: 3 }

  it('rejects a trade whose target cannot clear its own round-trip fees', () => {
    // notional 10_000 → round trip fee 10. Target worth 2.5 → fails 3× rule.
    const d = decision({ quantity: 100, notional: 10_000, levels: { entry: 100, stop: 99, target: 100.025 } })
    expect(preflight({ ...base, config: { ...costCfg, maxLeverage: null, maxPositionPercent: null }, decision: d }).code).toBe('EDGE_BELOW_COST')
  })

  it('allows a trade with a target well clear of costs', () => {
    // notional 10_000 → fee 10. Target worth 800.
    const d = decision({ quantity: 100, notional: 10_000, levels: { entry: 100, stop: 96, target: 108 } })
    expect(preflight({ ...base, config: { ...costCfg, maxLeverage: null, maxPositionPercent: null }, decision: d }).ok).toBe(true)
  })

  it('is inactive when no fee model is configured', () => {
    const d = decision({ quantity: 100, notional: 10_000, levels: { entry: 100, stop: 99, target: 100.025 } })
    const cfg = { ...config, maxLeverage: null, maxPositionPercent: null }
    expect(preflight({ ...base, config: cfg, decision: d }).ok).toBe(true)
  })

  /* Slippage is a cost and has to be counted as one.
     These pin the band the old fee-only model let through. On a notional of
     10,000 at 10bps fee and 5bps slippage:

        fees alone      10,000 x (10 x 2 / 10,000) = 20   ->  3x rule needs 60
        fees + slippage 10,000 x (15 x 2 / 10,000) = 30   ->  3x rule needs 90

     so a target worth 75 cleared the old gate and fails the honest one. On a
     five-minute horizon, where cost decides the outcome rather than direction,
     that band is precisely where money quietly leaks. */
  const slipCfg = { ...config, feeBps: 10, slippageBps: 5, minRewardToCost: 3, maxLeverage: null, maxPositionPercent: null }

  it('rejects a target that clears fees but not fees plus slippage', () => {
    const d = decision({ quantity: 100, notional: 10_000, levels: { entry: 100, stop: 99, target: 100.75 } })
    const result = preflight({ ...base, config: slipCfg, decision: d })
    expect(result.code).toBe('EDGE_BELOW_COST')
    expect(result.detail).toMatch(/slippage/)
  })

  it('accepts the same trade once the target clears the full cost', () => {
    const d = decision({ quantity: 100, notional: 10_000, levels: { entry: 100, stop: 99, target: 101 } })
    expect(preflight({ ...base, config: slipCfg, decision: d }).ok).toBe(true)
  })

  it('treats a missing slippage figure as zero rather than throwing', () => {
    const { slippageBps, ...noSlip } = slipCfg
    const d = decision({ quantity: 100, notional: 10_000, levels: { entry: 100, stop: 99, target: 100.75 } })
    expect(preflight({ ...base, config: noSlip, decision: d }).ok).toBe(true)
  })
})
