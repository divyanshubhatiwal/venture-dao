/**
 * Derive settings that actually fit the market the bot is scanning.
 *
 * These numbers are not independent, and treating them as independent is what
 * has made the panel so hard to configure. Position size is risk ÷ stop
 * distance, so the risk percentage and the position cap are two ends of one
 * equation: pick them separately and the cap silently rejects every trade the
 * risk budget asks for. That is exactly the state this bot spent a long time
 * in, blocking everything on MAX_POSITION while the settings looked reasonable.
 *
 * So the suggestion starts from something measured — how far the current ATR
 * puts a stop from entry — and solves for the rest.
 */

/** Position as a fraction of equity, given a risk budget and a stop distance. */
export function impliedLeverage(riskPercent, stopPercent) {
  if (!(stopPercent > 0)) return Infinity
  return riskPercent / (stopPercent / 100) / 100
}

/**
 * The largest risk per trade whose position still fits inside the cap.
 *
 *   notional / equity = riskPercent / stopPercent
 *
 * so riskPercent = maxPositionPercent × stopPercent / 100. The safety factor
 * keeps a trade off the exact boundary, where a tick of extra volatility
 * between the decision and the fill would tip it over the cap.
 */
export function riskForCap({ stopPercent, maxPositionPercent, safety = 0.9 }) {
  if (!(stopPercent > 0)) return 0
  return (maxPositionPercent * (stopPercent / 100) * safety)
}

/**
 * What a day could plausibly produce, given how many trades are allowed and
 * how often this kind of setup actually wins.
 *
 * `winRate` defaults to 0.4 because that is roughly what the measured strategy
 * does, not because it is flattering. Reported alongside the perfect-day
 * figure so the difference between "possible" and "expected" stays visible —
 * a daily target set from the perfect day is a target that needs every trade
 * to win.
 */
export function achievableDaily({ riskPercent, maxTradesPerDay, rewardToRisk = 2, winRate = 0.4 }) {
  const perfect = maxTradesPerDay * riskPercent * rewardToRisk
  const expectancyR = winRate * rewardToRisk - (1 - winRate)
  const expected = maxTradesPerDay * riskPercent * expectancyR
  return {
    perfectDayPercent: +perfect.toFixed(3),
    expectedPercent: +expected.toFixed(3),
    expectancyR: +expectancyR.toFixed(3),
  }
}

/**
 * Turn measured stop distances into a coherent configuration.
 *
 * `stopPercents` is one entry per scanned market. The median is used rather
 * than the mean so a single unusually volatile symbol does not drag every
 * setting toward it.
 */
export function suggestConfig({ stopPercents = [], equity = 100_000, maxPositionPercent = 15, maxTradesPerDay = 5, maxOpenPositions = 3, rewardToRisk = 2 } = {}) {
  const clean = stopPercents.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b)
  if (!clean.length) return { ok: false, reason: 'No live stop distances could be measured.' }

  const median = clean[Math.floor(clean.length / 2)]
  const widest = clean[clean.length - 1]

  const riskPercent = +riskForCap({ stopPercent: median, maxPositionPercent }).toFixed(3)
  const daily = achievableDaily({ riskPercent, maxTradesPerDay, rewardToRisk })

  // Half the expected day, floored at something visible. A target set at the
  // full expectation is met only on an average-or-better day, which means it
  // usually is not met — and an unmet target reads as a broken bot.
  const dailyTargetPercent = +Math.max(0.1, daily.expectedPercent * 0.5).toFixed(2)

  // Two full losing trades' worth, so one bad trade never ends the session but
  // a genuine run of them does.
  const dailyLossLimitPercent = +Math.max(0.2, riskPercent * 2.5).toFixed(2)

  return {
    ok: true,
    measured: {
      medianStopPercent: +median.toFixed(3),
      widestStopPercent: +widest.toFixed(3),
      markets: clean.length,
    },
    config: {
      riskPerTradePercent: riskPercent,
      maxPositionPercent,
      // Never below 1×: the cap must not itself forbid a position that fits.
      maxLeverage: Math.max(1, Math.ceil(maxPositionPercent / 100)),
      maxOpenPositions,
      maxTradesPerDay,
      dailyTargetPercent,
      dailyLossLimitPercent,
    },
    expectation: daily,
    notes: [
      `Stops currently sit about ${median.toFixed(2)}% from entry, so a ${riskPercent}% risk budget produces a position near ${maxPositionPercent}% of equity — inside the cap rather than blocked by it.`,
      `A perfect day (every trade winning) would be about ${daily.perfectDayPercent}%. At a realistic ${Math.round(0.4 * 100)}% win rate the expectation is ${daily.expectedPercent}%, which is what the target is set from.`,
      'These are objectives derived from current volatility, not predictions. The strategy has no demonstrated edge, so a positive expectation here is arithmetic, not a forecast.',
    ],
  }
}
