import { describe, expect, it } from 'vitest'
import { runTrendFollow, summarise, walkForward } from '../trendFollow'

/** Deterministic series so these assertions never depend on live data. */
const build = (n, fn) =>
  Array.from({ length: n }, (_, i) => {
    const close = fn(i)
    // high === close on purpose: padding the high above the close means price
    // can never exceed the prior bar's high, so no breakout could ever fire.
    return { time: i * 86_400_000, open: close, high: close, low: close * 0.98, close, volume: 1 }
  })

describe('runTrendFollow', () => {
  it('refuses to run without enough history for the 200-bar filter', () => {
    expect(runTrendFollow(build(100, () => 100)).ok).toBe(false)
  })

  it('takes no trade in a flat market — no breakout, no trend', () => {
    const r = runTrendFollow(build(400, () => 100))
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
  })

  it('opens nothing below the trend filter, however hard price falls', () => {
    const r = runTrendFollow(build(600, (i) => 500 - i * 0.5))
    expect(r.count).toBe(0)
  })

  it('charges fees on both sides of every trade', () => {
    const r = runTrendFollow(build(600, (i) => 100 + i * 0.4))
    expect(r.count).toBeGreaterThan(0)
    for (const t of r.trades) expect(t.fees).toBeGreaterThan(0)
    expect(r.grossPnl).toBeGreaterThan(r.netPnl)
  })

  it('reports zero fees only when they are configured away', () => {
    expect(runTrendFollow(build(600, (i) => 100 + i * 0.4), { feeBps: 0, slippageBps: 0 }).fees).toBe(0)
  })

  it('never fills on the signal bar — entries take the next open', () => {
    const candles = build(600, (i) => 100 + i * 0.4)
    const r = runTrendFollow(candles, { feeBps: 0, slippageBps: 0 })
    for (const t of r.trades) {
      const bar = candles.find((c) => c.time === t.entryAt)
      expect(bar).toBeDefined()
      expect(t.entry).toBeCloseTo(bar.open, 6)
    }
  })
})

describe('summarise', () => {
  it('computes profit factor from gross win over gross loss', () => {
    const m = summarise([{ pnl: 200, fees: 2, bars: 5 }, { pnl: -100, fees: 2, bars: 5 }])
    expect(m.profitFactor).toBe(2)
    expect(m.winRate).toBe(50)
  })

  it('handles an empty set without dividing by zero', () => {
    const m = summarise([])
    expect(m.count).toBe(0)
    expect(m.profitFactor).toBe(0)
  })
})

describe('walkForward', () => {
  it('never lets an out-of-sample trade start before the split', () => {
    const candles = build(1400, (i) => 100 + Math.sin(i / 40) * 8 + i * 0.2)
    const { inSample, outOfSample } = walkForward(candles)
    expect(inSample.ok && outOfSample.ok).toBe(true)
    const cut = candles[Math.floor(1400 * 0.6)].time
    for (const t of outOfSample.trades) expect(t.entryAt).toBeGreaterThanOrEqual(cut)
    for (const t of inSample.trades) expect(t.entryAt).toBeLessThan(cut)
  })
})
