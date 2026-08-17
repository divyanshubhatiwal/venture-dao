import { afterEach, describe, expect, it, vi } from 'vitest'
import { usdtToUsd } from '../market/peg'

describe('usdtToUsd', () => {
  /* The measured case: Binance 63,103.29 USDT at a 0.99882 peg lands within
     a dollar of TradingView's 63,029.71 USD print. */
  it('closes the gap to a true-USD reference', () => {
    const converted = usdtToUsd(63103.29, 0.99882)
    expect(Math.abs(converted - 63029.71)).toBeLessThan(2)
  })

  it('leaves the value alone when the peg is unknown rather than assuming 1.00', () => {
    // Assuming parity is the bug: it looks right and is wrong by a fixed 0.1%.
    expect(usdtToUsd(63103.29, null)).toBe(63103.29)
    expect(usdtToUsd(63103.29, undefined)).toBe(63103.29)
    expect(usdtToUsd(63103.29, NaN)).toBe(63103.29)
  })

  it('passes non-numeric input straight through', () => {
    expect(usdtToUsd(null, 0.999)).toBeNull()
    expect(usdtToUsd(undefined, 0.999)).toBeUndefined()
  })

  it('is a no-op at an exact peg', () => {
    expect(usdtToUsd(100, 1)).toBe(100)
  })
})

/* fetch is injected, never stubbed globally: a global stub outlives this file
   inside a shared test worker and breaks whatever runs next. */
describe('getUsdtPeg', () => {
  afterEach(() => vi.resetModules())

  const fresh = async () => (await import('../market/peg')).getUsdtPeg
  const ok = (price) => vi.fn(async () => ({ ok: true, json: async () => ({ price }) }))

  it('returns null rather than a guess when the source fails', async () => {
    const getUsdtPeg = await fresh()
    expect(await getUsdtPeg(vi.fn(async () => { throw new Error('offline') }))).toBeNull()
  })

  it('rejects an implausible peg, which is far likelier to be a bad read', async () => {
    const getUsdtPeg = await fresh()
    expect(await getUsdtPeg(ok('0.42'))).toBeNull()
  })

  it('accepts a plausible peg', async () => {
    const getUsdtPeg = await fresh()
    expect(await getUsdtPeg(ok('0.99882'))).toBeCloseTo(0.99882, 5)
  })

  it('caches, so many components asking does not mean many requests', async () => {
    const getUsdtPeg = await fresh()
    const spy = ok('0.9988')
    await Promise.all([getUsdtPeg(spy), getUsdtPeg(spy), getUsdtPeg(spy)])
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
