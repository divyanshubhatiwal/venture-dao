/**
 * Cost gate for short-horizon trading.
 *
 * WHY THIS EXISTS. A trade pays its cost twice — once to get in, once to get
 * out — before price has done anything. At retail rates that is 30 basis
 * points a round trip. Measured against 5,000 real five-minute bars across
 * five crypto symbols, the median five-minute move is 0.040%:
 *
 *     median 5-minute move   0.040%
 *     round-trip cost        0.300%
 *     bars that even cover cost   2.4%
 *
 * The cost is roughly seven times the typical move. A strategy that opens and
 * closes inside five minutes is therefore behind on almost every trade before
 * direction is even considered, and no signal quality fixes that — it is
 * arithmetic, not forecasting. This project already has the empirical version
 * of the same result: 31 winning trades out of 31, and the account still down
 * 6.16%, because fees came to four times the gross profit.
 *
 * WHAT THIS DOES ABOUT IT. It does not block fast trading. It measures each
 * market's own movement against that market's own costs and reports whether
 * the horizon you have chosen is survivable there. The spread between markets
 * is very large — over the same window, 7.2% of ARB's five-minute bars cleared
 * costs against 0.2% of BTC's — so "which markets can be traded this fast" is
 * a real question with a useful answer, and it is the one worth asking.
 *
 * Every figure here is computed from candles that are passed in. Nothing is
 * assumed and nothing is hard-coded per symbol.
 */

/** Both sides of a round trip: fee in, fee out, slippage in, slippage out. */
export function roundTripCostPercent({ feeBps = 10, slippageBps = 5 } = {}) {
  return ((feeBps + slippageBps) * 2) / 100
}

/**
 * A trade must beat costs by a margin, not merely match them.
 *
 * At exactly break-even, the expected outcome is zero and the variance is not,
 * so the position carries risk for no compensation. The default asks for twice
 * the cost, which is the level at which a roughly even win rate still leaves
 * something behind.
 */
export function requiredMovePercent(costPercent, marginMultiple = 2) {
  return costPercent * marginMultiple
}

/** Absolute percentage moves over `holdBars`, one per available window. */
export function moveDistribution(candles, holdBars = 1) {
  if (!Array.isArray(candles) || candles.length <= holdBars) return []
  const moves = []
  for (let i = holdBars; i < candles.length; i++) {
    const then = candles[i - holdBars]?.close ?? candles[i - holdBars]
    const now = candles[i]?.close ?? candles[i]
    if (!Number.isFinite(then) || !Number.isFinite(now) || then === 0) continue
    moves.push(Math.abs(((now - then) / then) * 100))
  }
  return moves
}

const median = (sorted) =>
  sorted.length === 0
    ? 0
    : sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2

/**
 * Can this market be traded on this horizon at all?
 *
 * Returns the measurement, not a verdict dressed up as one. `hitRate` is the
 * share of windows that cleared the required move — note it counts moves in
 * EITHER direction, so it is an upper bound on what a perfect-direction
 * strategy could reach, never a projection of returns.
 */
export function assessTradeability({
  symbol,
  candles,
  holdBars = 1,
  barMinutes = 5,
  feeBps = 10,
  slippageBps = 5,
  marginMultiple = 2,
  minSample = 100,
}) {
  const cost = roundTripCostPercent({ feeBps, slippageBps })
  const required = requiredMovePercent(cost, marginMultiple)
  const moves = moveDistribution(candles, holdBars)

  if (moves.length < minSample) {
    return {
      symbol,
      ok: false,
      tradeable: false,
      reason: `Not enough history to judge: ${moves.length} windows, need ${minSample}.`,
      cost,
      required,
    }
  }

  const sorted = [...moves].sort((a, b) => a - b)
  const medianMove = median(sorted)
  const hitRate = (moves.filter((m) => m >= required).length / moves.length) * 100
  const ratio = medianMove / required

  return {
    symbol,
    ok: true,
    holdMinutes: holdBars * barMinutes,
    cost,
    required,
    medianMove,
    ratio,
    hitRate,
    sample: moves.length,
    // The typical window must clear the bar, not just the lucky tail. A market
    // where only the top few percent of windows pay is one where the strategy
    // depends on rare events it cannot schedule.
    tradeable: medianMove >= required,
    reason: medianMove >= required
      ? `Typical ${holdBars * barMinutes}-minute move (${medianMove.toFixed(3)}%) clears the ${required.toFixed(2)}% needed.`
      : `Typical ${holdBars * barMinutes}-minute move is ${medianMove.toFixed(3)}%, but ${required.toFixed(2)}% is needed to beat costs. Only ${hitRate.toFixed(1)}% of windows move that far, in either direction.`,
  }
}

/**
 * The shortest horizon on which a market clears its own costs.
 *
 * This is the constructive half. Rather than answering "no", it answers "not
 * at five minutes — here is where it starts to work", which is the number
 * somebody actually needs in order to choose a holding period.
 */
export function shortestViableHold({ candles, candidates = [1, 2, 3, 6, 12, 24, 48, 96, 288], ...options }) {
  for (const holdBars of candidates) {
    const verdict = assessTradeability({ candles, holdBars, ...options })
    if (verdict.ok && verdict.tradeable) return verdict
  }
  return null
}

/**
 * Rank markets by how well they suit the chosen horizon.
 *
 * Sorted by ratio, so the markets where fast trading is least hopeless come
 * first. This is the honest reading of "use every market": not trade all of
 * them, but find the ones where the horizon is survivable.
 */
export function rankMarkets(entries, options = {}) {
  return entries
    .map(({ symbol, candles }) => assessTradeability({ symbol, candles, ...options }))
    .filter((r) => r.ok)
    .sort((a, b) => b.ratio - a.ratio)
}
