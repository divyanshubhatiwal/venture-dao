import { describe, expect, it } from 'vitest'
import { INTERVAL_MS, mergeLiveCandle } from '../market/liveCandles'

const MIN = INTERVAL_MS['1m']
const base = (time) => ({ time, open: 100, high: 105, low: 95, close: 102, volume: 7 })

describe('mergeLiveCandle', () => {
  it('extends the forming candle to follow the live price', () => {
    const candles = [base(0), base(MIN)]
    const out = mergeLiveCandle(candles, 103, MIN, MIN + 30_000)
    expect(out[1].close).toBe(103)
    expect(out).toHaveLength(2)
  })

  it('stretches the high when price trades above it', () => {
    const out = mergeLiveCandle([base(MIN)], 120, MIN, MIN + 1000)
    expect(out[0].high).toBe(120)
    expect(out[0].low).toBe(95)
  })

  it('stretches the low when price trades below it', () => {
    const out = mergeLiveCandle([base(MIN)], 80, MIN, MIN + 1000)
    expect(out[0].low).toBe(80)
    expect(out[0].high).toBe(105)
  })

  it('never invents volume for the forming candle', () => {
    const out = mergeLiveCandle([base(MIN)], 110, MIN, MIN + 1000)
    expect(out[0].volume).toBe(7)
  })

  it('opens a new candle at the live price when the bucket turns over', () => {
    const out = mergeLiveCandle([base(0), base(MIN)], 108, MIN, 2 * MIN + 5)
    expect(out).toHaveLength(2) // window length held steady
    const fresh = out[out.length - 1]
    expect(fresh).toMatchObject({ time: 2 * MIN, open: 108, high: 108, low: 108, close: 108, volume: 0 })
  })

  it('refuses to fabricate history across a gap wider than one bucket', () => {
    const candles = [base(0), base(MIN)]
    // Ten minutes elapsed — a slept tab. The refetch owns this, not the merge.
    expect(mergeLiveCandle(candles, 108, MIN, 11 * MIN)).toBe(candles)
  })

  it('returns the same array reference when the price has not moved', () => {
    const candles = [base(MIN)]
    expect(mergeLiveCandle(candles, 102, MIN, MIN + 1000)).toBe(candles)
  })

  it('ignores absent or nonsensical prices', () => {
    const candles = [base(MIN)]
    const now = MIN + 1000
    expect(mergeLiveCandle(candles, null, MIN, now)).toBe(candles)
    expect(mergeLiveCandle(candles, NaN, MIN, now)).toBe(candles)
    expect(mergeLiveCandle(candles, 0, MIN, now)).toBe(candles)
    expect(mergeLiveCandle(candles, -5, MIN, now)).toBe(candles)
  })

  it('tolerates an empty series', () => {
    expect(mergeLiveCandle([], 100, MIN, 0)).toEqual([])
    expect(mergeLiveCandle(undefined, 100, MIN, 0)).toBeUndefined()
  })

  it('does not mutate the input', () => {
    const candles = [base(MIN)]
    const snapshot = JSON.parse(JSON.stringify(candles))
    mergeLiveCandle(candles, 130, MIN, MIN + 1000)
    expect(candles).toEqual(snapshot)
  })

  it('handles an exchange candle stamped ahead of local time', () => {
    // Local clocks run fast; the newest candle can legitimately sit in the
    // future. That must update in place, not append a duplicate bucket.
    const candles = [base(10 * MIN)]
    const out = mergeLiveCandle(candles, 107, MIN, 9 * MIN)
    expect(out).toHaveLength(1)
    expect(out[0].close).toBe(107)
  })
})
