/**
 * Technical indicators, computed from real OHLCV candles.
 *
 * Standard textbook formulas — Wilder's smoothing for RSI/ATR, the usual
 * 12/26/9 MACD, 20/2 Bollinger. Each returns an array aligned to the input
 * series with `null` for the warm-up period, so nothing is plotted or scored
 * before the indicator has enough data to mean anything.
 */

export function sma(values, period) {
  const out = []
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    out.push(i >= period - 1 ? sum / period : null)
  }
  return out
}

export function ema(values, period) {
  const k = 2 / (period + 1)
  const out = []
  let prev = null
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      out.push(null)
      continue
    }
    if (prev == null) {
      // Seed with the simple average of the first full window.
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period
    } else {
      prev = values[i] * k + prev * (1 - k)
    }
    out.push(prev)
  }
  return out
}

/** Relative Strength Index using Wilder's smoothing. */
export function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null)
  if (closes.length <= period) return out

  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]
    if (diff >= 0) gain += diff
    else loss -= diff
  }
  gain /= period
  loss /= period
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1]
    gain = (gain * (period - 1) + Math.max(diff, 0)) / period
    loss = (loss * (period - 1) + Math.max(-diff, 0)) / period
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss)
  }
  return out
}

/** MACD line, signal line and histogram. */
export function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast)
  const emaSlow = ema(closes, slow)
  const line = closes.map((_, i) => (emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null))

  const defined = line.filter((v) => v != null)
  const signalDefined = ema(defined, signalPeriod)
  const offset = line.length - defined.length
  const signal = line.map((_, i) => (i >= offset ? signalDefined[i - offset] : null))
  const histogram = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null))

  return { line, signal, histogram }
}

/** Bollinger bands: SMA ± n standard deviations. */
export function bollinger(closes, period = 20, mult = 2) {
  const mid = sma(closes, period)
  const upper = []
  const lower = []
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) {
      upper.push(null)
      lower.push(null)
      continue
    }
    const window = closes.slice(i - period + 1, i + 1)
    const variance = window.reduce((acc, v) => acc + (v - mid[i]) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    upper.push(mid[i] + mult * sd)
    lower.push(mid[i] - mult * sd)
  }
  return { mid, upper, lower }
}

/** Average True Range — the basis for volatility-scaled stops. */
export function atr(candles, period = 14) {
  const out = new Array(candles.length).fill(null)
  if (candles.length <= period) return out

  const trueRanges = candles.map((c, i) => {
    if (i === 0) return c.high - c.low
    const prevClose = candles[i - 1].close
    return Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose))
  })

  let value = trueRanges.slice(1, period + 1).reduce((a, b) => a + b, 0) / period
  out[period] = value
  for (let i = period + 1; i < candles.length; i++) {
    value = (value * (period - 1) + trueRanges[i]) / period
    out[i] = value
  }
  return out
}

/**
 * Swing-based support and resistance: pivots that are the local extreme across
 * `lookback` bars either side, clustered so near-identical levels count once.
 */
export function swingLevels(candles, lookback = 5, maxLevels = 3) {
  const highs = []
  const lows = []

  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1)
    if (candles[i].high === Math.max(...window.map((c) => c.high))) highs.push(candles[i].high)
    if (candles[i].low === Math.min(...window.map((c) => c.low))) lows.push(candles[i].low)
  }

  const price = candles[candles.length - 1]?.close ?? 0
  const cluster = (levels) => {
    const merged = []
    for (const level of levels.sort((a, b) => a - b)) {
      const last = merged[merged.length - 1]
      // Levels within 0.4% of each other are the same level in practice.
      if (last && Math.abs(level - last) / last < 0.004) continue
      merged.push(level)
    }
    return merged
  }

  return {
    resistance: cluster(highs.filter((h) => h > price))
      .slice(0, maxLevels),
    support: cluster(lows.filter((l) => l < price))
      .reverse()
      .slice(0, maxLevels),
  }
}

/** Percentage position of price inside the recent range (0 = low, 100 = high). */
export function rangePosition(candles, period = 20) {
  const window = candles.slice(-period)
  if (!window.length) return null
  const high = Math.max(...window.map((c) => c.high))
  const low = Math.min(...window.map((c) => c.low))
  const last = window[window.length - 1].close
  return high === low ? 50 : ((last - low) / (high - low)) * 100
}
