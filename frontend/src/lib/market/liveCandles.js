/**
 * Keeps the newest candle moving between REST fetches.
 *
 * The candle history is a one-shot REST call, so without this the chart is
 * frozen at page load while the header price ticks once a second — the mismatch
 * is what reads as "lag". Binance's `@ticker` stream is already open for the
 * price, so the forming candle can be rebuilt from it at no extra network cost:
 * its close follows the live price and its high/low stretch to contain it.
 *
 * What this deliberately does NOT do is invent history. Only the candle for the
 * current clock bucket is synthesised, and only from a real traded price. If
 * the gap is wider than one bucket — a laptop asleep, a tab backgrounded for an
 * hour — the series is left alone for the refetch to repair, because filling
 * that span would mean drawing candles for periods nobody observed.
 */

/** Bucket width per range key, matching RANGES in marketApi. */
export const INTERVAL_MS = {
  '1m': 60_000,
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
  '1D': 24 * 60 * 60_000,
}

export function mergeLiveCandle(candles, price, intervalMs, now = Date.now()) {
  if (!candles?.length || !Number.isFinite(price) || price <= 0 || !intervalMs) return candles

  const last = candles[candles.length - 1]
  const bucket = Math.floor(now / intervalMs) * intervalMs

  // Still inside the newest candle's window: extend it in place. Volume is
  // carried over untouched — the ticker frame reports a 24h total, not this
  // bucket's volume, so there is no honest per-candle figure to update it with.
  if (bucket <= last.time) {
    if (price === last.close) return candles
    return [
      ...candles.slice(0, -1),
      { ...last, close: price, high: Math.max(last.high, price), low: Math.min(last.low, price) },
    ]
  }

  // Exactly one bucket has turned over: open a new candle at the live price.
  // Drop the oldest so the window length — and the x-axis density — holds still.
  if (bucket - last.time === intervalMs) {
    return [...candles.slice(1), { time: bucket, open: price, high: price, low: price, close: price, volume: 0 }]
  }

  // A wider gap means real history is missing. Leave it for the refetch.
  return candles
}
