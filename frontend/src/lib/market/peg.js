/**
 * USDT → USD, so quoted prices match a true-USD reference.
 *
 * Binance quotes crypto against USDT, a stablecoin that is close to a dollar
 * but never exactly one. TradingView's CRYPTO:BTCUSD is a real-USD index, so
 * the two disagree by whatever the peg happens to be — measured here at 0.99882,
 * which put BTC $73.58 (0.117%) above the TradingView print. Multiplying by the
 * live peg closed that to $0.88, about a thousandth of a percent.
 *
 * Treating USDT as exactly $1.00 is the bug this exists to remove, so there is
 * deliberately no `?? 1` fallback: if the peg cannot be read, callers get null
 * and show the honest USDT-quoted price with a label, rather than a dollar
 * figure that is quietly wrong by a tenth of a percent in a fixed direction.
 * A small consistent bias is worse than a visible gap — it looks correct.
 */

const SOURCE = 'https://api.exchange.coinbase.com/products/USDT-USD/ticker'
const TTL_MS = 60_000

let cache = { at: 0, rate: null }
let inFlight = null

/**
 * Live USDT/USD, or null if it cannot be read. Never guessed.
 *
 * `fetchImpl` is injectable so tests can supply a stub instead of replacing
 * the global fetch — a global stub leaks into whatever else shares the test
 * worker, which is exactly how an unrelated suite started failing.
 */
export async function getUsdtPeg(fetchImpl = globalThis.fetch) {
  if (cache.rate != null && Date.now() - cache.at < TTL_MS) return cache.rate
  // One request in flight at a time; several components ask on the same tick.
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 6000)
      const res = await fetchImpl(SOURCE, { signal: controller.signal }).finally(() => clearTimeout(timer))
      if (!res.ok) throw new Error(String(res.status))

      const rate = Number((await res.json()).price)
      // A peg that has wandered this far is far likelier to be a bad read than
      // a real depeg, and acting on it would misprice everything on screen.
      if (!Number.isFinite(rate) || rate < 0.9 || rate > 1.1) throw new Error(`implausible peg ${rate}`)

      cache = { at: Date.now(), rate }
      return rate
    } catch {
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Last known peg without triggering a fetch. */
export function peekUsdtPeg() {
  return cache.rate
}

/** Convert a USDT-quoted figure to USD. Returns the input unchanged if unknown. */
export function usdtToUsd(value, rate) {
  if (value == null || !Number.isFinite(value)) return value
  if (rate == null || !Number.isFinite(rate)) return value
  return value * rate
}
