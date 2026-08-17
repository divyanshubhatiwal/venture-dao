import { describe, expect, it } from 'vitest'
import { achievableDaily, impliedLeverage, riskForCap, suggestConfig } from '../trading/suggestConfig.js'

describe('impliedLeverage', () => {
  /* The relationship that made this whole panel confusing: a tight stop turns
     a small risk budget into a large position. */
  it('grows as the stop tightens', () => {
    expect(impliedLeverage(1, 1)).toBeCloseTo(1, 5)
    expect(impliedLeverage(1, 0.5)).toBeCloseTo(2, 5)
    expect(impliedLeverage(1, 0.25)).toBeCloseTo(4, 5)
  })

  it('is infinite for a zero-width stop rather than dividing by zero', () => {
    expect(impliedLeverage(1, 0)).toBe(Infinity)
  })
})

describe('riskForCap', () => {
  it('solves for a risk budget whose position fits the cap', () => {
    const risk = riskForCap({ stopPercent: 0.5, maxPositionPercent: 20, safety: 1 })
    expect(impliedLeverage(risk, 0.5)).toBeCloseTo(0.2, 5)
  })

  it('leaves headroom below the boundary by default', () => {
    const withSafety = riskForCap({ stopPercent: 0.5, maxPositionPercent: 20 })
    const without = riskForCap({ stopPercent: 0.5, maxPositionPercent: 20, safety: 1 })
    expect(withSafety).toBeLessThan(without)
  })

  it('returns zero when no stop distance is known instead of guessing', () => {
    expect(riskForCap({ stopPercent: 0, maxPositionPercent: 20 })).toBe(0)
  })
})

describe('achievableDaily', () => {
  it('separates a perfect day from an expected one', () => {
    const d = achievableDaily({ riskPercent: 0.5, maxTradesPerDay: 5, rewardToRisk: 2, winRate: 0.4 })
    expect(d.perfectDayPercent).toBeCloseTo(5, 3)
    expect(d.expectedPercent).toBeLessThan(d.perfectDayPercent)
  })

  it('reports a negative expectation honestly rather than flooring it at zero', () => {
    const d = achievableDaily({ riskPercent: 1, maxTradesPerDay: 5, rewardToRisk: 1, winRate: 0.3 })
    expect(d.expectancyR).toBeLessThan(0)
    expect(d.expectedPercent).toBeLessThan(0)
  })
})

describe('suggestConfig', () => {
  const stops = [0.4, 0.5, 0.6, 0.9]

  it('refuses to suggest anything without a measurement', () => {
    expect(suggestConfig({ stopPercents: [] }).ok).toBe(false)
    expect(suggestConfig({ stopPercents: [0, -1, NaN] }).ok).toBe(false)
  })

  it('produces a risk budget that fits inside the cap it was given', () => {
    const s = suggestConfig({ stopPercents: stops, maxPositionPercent: 15 })
    const lev = impliedLeverage(s.config.riskPerTradePercent, s.measured.medianStopPercent)
    expect(lev).toBeLessThanOrEqual(0.15 + 1e-9)
  })

  it('uses the median so one volatile market cannot drag every setting', () => {
    const calm = suggestConfig({ stopPercents: [0.5, 0.5, 0.5, 0.5] })
    const withOutlier = suggestConfig({ stopPercents: [0.5, 0.5, 0.5, 12] })
    expect(withOutlier.config.riskPerTradePercent).toBe(calm.config.riskPerTradePercent)
  })

  it('sets the daily target below the expected day, never at the perfect one', () => {
    const s = suggestConfig({ stopPercents: stops })
    expect(s.config.dailyTargetPercent).toBeLessThan(s.expectation.perfectDayPercent)
  })

  it('sets a loss limit wider than a single losing trade', () => {
    const s = suggestConfig({ stopPercents: stops })
    expect(s.config.dailyLossLimitPercent).toBeGreaterThan(s.config.riskPerTradePercent)
  })

  it('never suggests leverage below 1x, which would forbid a fitting position', () => {
    expect(suggestConfig({ stopPercents: stops, maxPositionPercent: 5 }).config.maxLeverage).toBeGreaterThanOrEqual(1)
  })

  it('says out loud that this is arithmetic, not a forecast', () => {
    const s = suggestConfig({ stopPercents: stops })
    expect(s.notes.join(' ')).toMatch(/not (a )?prediction|no demonstrated edge/i)
  })
})
