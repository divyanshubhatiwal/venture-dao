import { describe, expect, it } from 'vitest'
import {
  assessTradeability,
  moveDistribution,
  rankMarkets,
  requiredMovePercent,
  roundTripCostPercent,
  shortestViableHold,
} from '../trading/costGate'

/** Candles that move by a fixed percentage each bar, alternating direction. */
const chop = (percent, n = 400, start = 100) => {
  const out = [{ close: start }]
  for (let i = 1; i < n; i++) {
    const prev = out[i - 1].close
    out.push({ close: i % 2 ? prev * (1 + percent / 100) : prev * (1 - percent / 100) })
  }
  return out
}

/** Candles that trend steadily one way. */
const trend = (percentPerBar, n = 400, start = 100) => {
  const out = [{ close: start }]
  for (let i = 1; i < n; i++) out.push({ close: out[i - 1].close * (1 + percentPerBar / 100) })
  return out
}

describe('costs', () => {
  it('charges both sides of the round trip', () => {
    // 10bps fee + 5bps slippage, in and out again.
    expect(roundTripCostPercent({ feeBps: 10, slippageBps: 5 })).toBeCloseTo(0.3, 6)
  })

  it('asks for a margin above break-even, not merely break-even', () => {
    // At exactly cost the expected value is zero but the risk is not, so the
    // position is taken for nothing.
    expect(requiredMovePercent(0.3, 2)).toBeCloseTo(0.6, 6)
  })

  it('costs nothing only when both fee and slippage are zero', () => {
    expect(roundTripCostPercent({ feeBps: 0, slippageBps: 0 })).toBe(0)
  })
})

describe('moveDistribution', () => {
  it('measures the move across the whole holding period, not one bar', () => {
    const moves = moveDistribution(trend(1, 10), 3)
    // Three bars of +1% compounding is ~3.03%.
    expect(moves[0]).toBeCloseTo(3.0301, 3)
  })

  it('returns nothing when there is less history than the holding period', () => {
    expect(moveDistribution([{ close: 1 }, { close: 2 }], 5)).toEqual([])
  })

  it('accepts bare numbers as well as candle objects', () => {
    expect(moveDistribution([100, 101], 1)[0]).toBeCloseTo(1, 6)
  })

  it('skips windows with an unusable price rather than emitting Infinity', () => {
    const moves = moveDistribution([{ close: 0 }, { close: 50 }, { close: 55 }], 1)
    expect(moves.every(Number.isFinite)).toBe(true)
  })
})

describe('assessTradeability', () => {
  const base = { symbol: 'TEST', feeBps: 10, slippageBps: 5, marginMultiple: 2 }

  /* The finding this module exists for. A market whose typical move is well
     under the round-trip cost cannot be traded on that horizon, however good
     the signal is — the shortfall is arithmetic, not forecasting. */
  it('rejects a horizon where the typical move cannot cover costs', () => {
    const verdict = assessTradeability({ ...base, candles: chop(0.04), holdBars: 1 })
    expect(verdict.tradeable).toBe(false)
    expect(verdict.required).toBeCloseTo(0.6, 6)
    expect(verdict.reason).toMatch(/needed to beat costs/)
  })

  it('accepts a horizon where the typical move clears the bar', () => {
    const verdict = assessTradeability({ ...base, candles: chop(1.5), holdBars: 1 })
    expect(verdict.tradeable).toBe(true)
    expect(verdict.medianMove).toBeGreaterThan(verdict.required)
  })

  it('reports the hit rate as an either-direction bound, never as a return', () => {
    // chop(1.5) moves 1.5% every bar in one direction or the other, so every
    // window clears 0.6% — but half of them go the wrong way. 100% here must
    // not be read as a 100% win rate.
    const verdict = assessTradeability({ ...base, candles: chop(1.5), holdBars: 1 })
    expect(verdict.hitRate).toBe(100)
    expect(verdict).not.toHaveProperty('expectedReturn')
    expect(verdict).not.toHaveProperty('projectedProfit')
  })

  it('refuses to judge on a sample too small to mean anything', () => {
    const verdict = assessTradeability({ ...base, candles: chop(1, 40), holdBars: 1 })
    expect(verdict.ok).toBe(false)
    expect(verdict.tradeable).toBe(false)
    expect(verdict.reason).toMatch(/Not enough history/)
  })

  it('lowering fees lowers the bar a trade has to clear', () => {
    const retail = assessTradeability({ ...base, candles: chop(0.2), holdBars: 1 })
    const cheap = assessTradeability({ ...base, feeBps: 1, slippageBps: 1, candles: chop(0.2), holdBars: 1 })
    expect(retail.tradeable).toBe(false)
    expect(cheap.tradeable).toBe(true)
    expect(cheap.required).toBeLessThan(retail.required)
  })

  it('a longer hold on the same market clears what a short one cannot', () => {
    const short = assessTradeability({ ...base, candles: trend(0.05), holdBars: 1 })
    const long = assessTradeability({ ...base, candles: trend(0.05), holdBars: 24 })
    expect(short.tradeable).toBe(false)
    expect(long.tradeable).toBe(true)
  })

  it('states the holding period it judged, in minutes', () => {
    const verdict = assessTradeability({ ...base, candles: chop(1), holdBars: 6, barMinutes: 5 })
    expect(verdict.holdMinutes).toBe(30)
  })
})

describe('shortestViableHold', () => {
  it('finds where a slow market starts to work instead of just saying no', () => {
    const verdict = shortestViableHold({
      candles: trend(0.05),
      symbol: 'SLOW',
      feeBps: 10,
      slippageBps: 5,
      marginMultiple: 2,
    })
    expect(verdict).not.toBeNull()
    expect(verdict.tradeable).toBe(true)
    // 0.05%/bar needs ~12 bars to compound past the 0.6% required.
    expect(verdict.holdMinutes).toBeGreaterThanOrEqual(60)
  })

  it('returns null when no horizon on offer works', () => {
    expect(
      shortestViableHold({ candles: chop(0.001), symbol: 'FLAT', feeBps: 10, slippageBps: 5 }),
    ).toBeNull()
  })
})

describe('rankMarkets', () => {
  it('puts the markets that best suit the horizon first', () => {
    const ranked = rankMarkets(
      [
        { symbol: 'SLOW', candles: chop(0.03) },
        { symbol: 'FAST', candles: chop(2.0) },
        { symbol: 'MID', candles: chop(0.5) },
      ],
      { holdBars: 1, feeBps: 10, slippageBps: 5 },
    )
    expect(ranked.map((r) => r.symbol)).toEqual(['FAST', 'MID', 'SLOW'])
    expect(ranked[0].tradeable).toBe(true)
    expect(ranked.at(-1).tradeable).toBe(false)
  })

  it('drops markets it could not measure rather than ranking them last', () => {
    const ranked = rankMarkets(
      [
        { symbol: 'GOOD', candles: chop(1) },
        { symbol: 'NO_DATA', candles: [] },
      ],
      { holdBars: 1 },
    )
    expect(ranked.map((r) => r.symbol)).toEqual(['GOOD'])
  })
})
