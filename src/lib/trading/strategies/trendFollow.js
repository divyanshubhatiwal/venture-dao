import { atr, sma } from '../indicators.js'

/**
 * Donchian breakout with a long-term trend filter — classic time-series
 * momentum, long only.
 *
 * Why this one rather than another indicator blend: it rests on a documented
 * economic effect (trend persistence from under-reaction and herding) instead
 * of on six oscillators re-reading the same price series. The existing signal
 * engine failed because its checks were not independent — MACD, EMA and SMA
 * all measure the same move three ways, so "agreement" was never confirmation.
 * This asks one question with a reason behind it.
 *
 * Every parameter below is a published default, fixed BEFORE any result was
 * looked at. That constraint is the entire point: a strategy tuned until the
 * backtest smiles will always print a good number and rarely survive contact
 * with new data. If these values happen to be bad ones, that is a real result
 * and it stays in the report.
 *
 *   entryLookback 20   Donchian breakout length (Turtle system)
 *   exitLookback  10   Donchian exit length     (Turtle system)
 *   trendFilter  200   the standard long-term regime line
 *   atrStopMult  2.0   conventional volatility stop
 *
 * Long only. Shorting a trend filter needs its own borrow, funding and squeeze
 * assumptions, and pretending those are free would flatter the result.
 */

export const DEFAULT_PARAMS = {
  entryLookback: 20,
  exitLookback: 10,
  trendFilter: 200,
  atrStopMult: 2,
  atrPeriod: 14,
}

/** Highest high / lowest low over the previous `n` bars, excluding this one. */
function channel(candles, i, n, key, pick) {
  if (i - n < 0) return null
  let best = candles[i - n][key]
  for (let k = i - n + 1; k < i; k++) best = pick(best, candles[k][key])
  return best
}

/**
 * Walk the series and produce closed trades.
 *
 * Signals are evaluated on bar i and filled at the open of bar i+1, never at
 * the close that generated them. Filling on the signal bar is the most common
 * way a backtest invents profit that could not have been captured.
 */
export function runTrendFollow(candles, { params = DEFAULT_PARAMS, feeBps = 5, slippageBps = 3 } = {}) {
  const p = { ...DEFAULT_PARAMS, ...params }
  const need = Math.max(p.trendFilter, p.entryLookback, p.atrPeriod) + 5
  if (!candles || candles.length < need) {
    return { ok: false, reason: `Need ${need} bars, got ${candles?.length ?? 0}.` }
  }

  const closes = candles.map((c) => c.close)
  const trend = sma(closes, p.trendFilter)
  const atrs = atr(candles, p.atrPeriod)

  const slip = (price, side) => price * (1 + (side === 'buy' ? 1 : -1) * (slippageBps / 10_000))
  const fee = (notional) => (notional * feeBps) / 10_000

  const trades = []
  let position = null

  for (let i = need; i < candles.length - 1; i++) {
    const next = candles[i + 1]

    if (position) {
      const exitLine = channel(candles, i, p.exitLookback, 'low', Math.min)
      const stopHit = candles[i].low <= position.stop
      const exitHit = exitLine != null && candles[i].close <= exitLine

      if (stopHit || exitHit) {
        // A stop that gapped is filled at the open, not at the stop price —
        // assuming the stop price always fills is free money that the market
        // does not hand out.
        const raw = stopHit ? Math.min(position.stop, next.open) : next.open
        const exit = slip(raw, 'sell')
        const gross = (exit - position.entry) * position.qty
        const exitFee = fee(exit * position.qty)
        trades.push({
          entryAt: position.at,
          exitAt: next.time,
          entry: position.entry,
          exit,
          qty: position.qty,
          gross: +gross.toFixed(4),
          fees: +(position.entryFee + exitFee).toFixed(4),
          pnl: +(gross - position.entryFee - exitFee).toFixed(4),
          bars: i - position.i,
          reason: stopHit ? 'stop' : 'channel exit',
        })
        position = null
      }
      continue
    }

    if (trend[i] == null || atrs[i] == null) continue
    const breakout = channel(candles, i, p.entryLookback, 'high', Math.max)
    if (breakout == null) continue

    const inUptrend = candles[i].close > trend[i]
    const brokeOut = candles[i].close > breakout
    if (!inUptrend || !brokeOut) continue

    const entry = slip(next.open, 'buy')
    // Constant notional per trade keeps the comparison about the signal rather
    // than about a compounding schedule.
    const qty = 1000 / entry
    position = { entry, qty, at: next.time, i, stop: entry - atrs[i] * p.atrStopMult, entryFee: fee(entry * qty) }
  }

  /* Mark out anything still open at the last bar.
     Dropping it would quietly bias the result: a trend follower is usually
     still holding its best position when the data ends, so discarding that
     trade removes the winners the approach exists to capture — and equally
     hides a loss if the series ends mid-drawdown. Flagged so it can be
     excluded deliberately rather than by accident. */
  if (position) {
    const last = candles[candles.length - 1]
    const exit = slip(last.close, 'sell')
    const gross = (exit - position.entry) * position.qty
    const exitFee = fee(exit * position.qty)
    trades.push({
      entryAt: position.at,
      exitAt: last.time,
      entry: position.entry,
      exit,
      qty: position.qty,
      gross: +gross.toFixed(4),
      fees: +(position.entryFee + exitFee).toFixed(4),
      pnl: +(gross - position.entryFee - exitFee).toFixed(4),
      bars: candles.length - 1 - position.i,
      reason: 'open at end',
      openAtEnd: true,
    })
  }

  return { ok: true, trades, ...summarise(trades) }
}

export function summarise(trades) {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const net = trades.reduce((s, t) => s + t.pnl, 0)
  const fees = trades.reduce((s, t) => s + t.fees, 0)

  return {
    count: trades.length,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? Infinity : 0,
    winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : 0,
    netPnl: +net.toFixed(2),
    fees: +fees.toFixed(2),
    grossPnl: +(net + fees).toFixed(2),
    avgBars: trades.length ? Math.round(trades.reduce((s, t) => s + t.bars, 0) / trades.length) : 0,
    expectancy: trades.length ? +(net / trades.length).toFixed(2) : 0,
  }
}

/**
 * Split the series and report both halves.
 *
 * The out-of-sample half is the only number that means anything, and it means
 * something only because nothing was chosen after seeing it. Reported next to
 * in-sample so the gap between them is visible: a strategy that looks strong
 * in-sample and collapses out-of-sample was fitted, not discovered.
 */
export function walkForward(candles, options = {}, splitAt = 0.6) {
  const cut = Math.floor(candles.length * splitAt)
  return {
    inSample: runTrendFollow(candles.slice(0, cut), options),
    outOfSample: runTrendFollow(candles.slice(cut), options),
  }
}
