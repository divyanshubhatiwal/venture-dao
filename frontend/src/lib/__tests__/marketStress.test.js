import { describe, expect, it } from 'vitest'
import { assessStress, drawdownFromPeak, logReturns, realisedVolatility, STRESS_LEVEL } from '../trading/marketStress'

const series = (closes) =>
  closes.map((c, i) => ({ time: i * 86_400_000, open: c, high: c * 1.005, low: c * 0.995, close: c, volume: 100 }))

const calm = series(Array.from({ length: 400 }, (_, i) => 100 + Math.sin(i / 9) * 0.5))
const violent = series([
  ...Array.from({ length: 300 }, (_, i) => 100 + Math.sin(i / 9) * 0.5),
  ...Array.from({ length: 60 }, (_, i) => 100 * (1 - i * 0.012) * (1 + (i % 2 ? 0.03 : -0.03))),
])

describe('building blocks', () => {
  it('computes log returns that add across time', () => {
    const r = logReturns(series([100, 110, 121]))
    expect(r[0]).toBeCloseTo(r[1], 6)
  })

  it('reports higher volatility for a wilder series', () => {
    const calmVol = realisedVolatility(logReturns(calm))
    const wildVol = realisedVolatility(logReturns(violent))
    expect(wildVol).toBeGreaterThan(calmVol)
  })

  it('measures drawdown from the running peak', () => {
    expect(drawdownFromPeak(series([100, 120, 60]))).toBeCloseTo(50, 0)
  })
})

describe('assessStress', () => {
  it('declines to judge without enough history', () => {
    expect(assessStress(series([100, 101, 102])).ok).toBe(false)
  })

  it('reads a quiet market as calm', () => {
    expect(assessStress(calm).level).toBe(STRESS_LEVEL.CALM)
  })

  it('raises the level when a market turns violent', () => {
    const s = assessStress(violent)
    expect(s.score).toBeGreaterThan(assessStress(calm).score)
    expect(s.reasons.length).toBeGreaterThan(0)
  })

  /* The whole point of the integration: it may shrink a position, never grow
     one, and it never expresses a direction. */
  it('can only ever reduce position size', () => {
    for (const candles of [calm, violent]) {
      const s = assessStress(candles)
      if (s.ok) expect(s.sizeMultiplier).toBeLessThanOrEqual(1)
    }
  })

  it('halts entirely only at the extreme level', () => {
    const s = assessStress(violent)
    if (s.level === STRESS_LEVEL.EXTREME) expect(s.sizeMultiplier).toBe(0)
    else expect(s.sizeMultiplier).toBeGreaterThan(0)
  })

  /* A reading of "violent" says nothing about which way — some of the biggest
     up days in history landed inside the worst crashes. */
  it('never claims a direction or a forecast', () => {
    const text = `${assessStress(violent).summary} ${assessStress(calm).summary}`.toLowerCase()
    for (const word of ['will fall', 'crash is coming', 'predict', 'forecast']) {
      expect(text).not.toContain(word)
    }
  })
})
