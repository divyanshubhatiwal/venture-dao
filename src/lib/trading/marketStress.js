import { atr, sma } from './indicators.js'

/**
 * Market stress detection.
 *
 * READ THIS FIRST, because the name of the feature invites a misunderstanding.
 *
 * This does not predict crashes. Nobody can. Crash *timing* is close to the
 * definition of an unpredictable event: if a fall were reliably foreseeable,
 * it would be sold into and would happen sooner, which is why the people who
 * "called" 2008 also called it in 2005, 2006 and 2010. A model that says
 * "a crash is coming" is either lucky or permanently bearish, and both are
 * indistinguishable from useless until well after the fact.
 *
 * What this measures instead is the market's *current state*: whether
 * conditions are calm or violent right now. That is a real, well-documented
 * property — volatility clusters, so violent days follow violent days — and it
 * is measured from what has already happened rather than guessed about what
 * has not. It answers "is this a dangerous time to be taking risk?", which is
 * a question that can actually be answered.
 *
 * The intended use is defensive and asymmetric: raise the stress reading and
 * the bot trades smaller or stops. It is never a reason to short, because
 * "things are violent" says nothing about direction — some of the largest
 * single-day *gains* in history happened during the worst crashes.
 */

export const STRESS_LEVEL = {
  CALM: 'CALM',
  ELEVATED: 'ELEVATED',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
}

/** Daily log returns. Log rather than simple: they add across time and treat a
 *  -50% move as the mirror of the +100% that undoes it. */
export function logReturns(candles) {
  const out = []
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close
    const now = candles[i].close
    if (prev > 0 && now > 0) out.push(Math.log(now / prev))
  }
  return out
}

/** Annualised standard deviation of returns over the last `window` bars. */
export function realisedVolatility(returns, window = 20, periodsPerYear = 365) {
  if (returns.length < window) return null
  const slice = returns.slice(-window)
  const mean = slice.reduce((s, r) => s + r, 0) / slice.length
  const variance = slice.reduce((s, r) => s + (r - mean) ** 2, 0) / (slice.length - 1)
  return Math.sqrt(variance) * Math.sqrt(periodsPerYear)
}

/** How far below the running peak price currently sits, as a positive percent. */
export function drawdownFromPeak(candles, lookback = 90) {
  if (!candles?.length) return null
  const slice = candles.slice(-lookback)
  const peak = Math.max(...slice.map((c) => c.high))
  const last = slice[slice.length - 1].close
  return peak > 0 ? ((peak - last) / peak) * 100 : null
}

/**
 * The individual readings behind a stress score.
 *
 * Each is a plain measurement of something that has already happened. None of
 * them is a forecast, and the naming avoids implying otherwise.
 */
export function stressFactors(candles, { volWindow = 20, baselineWindow = 100, periodsPerYear = 365 } = {}) {
  if (!candles || candles.length < baselineWindow + volWindow + 2) return null

  const returns = logReturns(candles)
  const current = realisedVolatility(returns, volWindow, periodsPerYear)
  const baseline = realisedVolatility(returns.slice(0, -volWindow), baselineWindow, periodsPerYear)
  if (!current || !baseline) return null

  const closes = candles.map((c) => c.close)
  const trend = sma(closes, 50)
  const last = candles[candles.length - 1]
  const atrs = atr(candles, 14)
  const atrNow = atrs[atrs.length - 1]

  // Worst single day in the recent window: a crash is usually announced by one
  // outsized day rather than by a steady drift.
  const recent = returns.slice(-volWindow)
  const worstDay = Math.min(...recent) * 100

  const recentVolume = candles.slice(-5).reduce((s, c) => s + (c.volume || 0), 0) / 5
  const priorVolume = candles.slice(-baselineWindow, -5).reduce((s, c) => s + (c.volume || 0), 0) / (baselineWindow - 5)

  return {
    // Vol relative to its own recent baseline, not an absolute threshold —
    // 60% annualised is ordinary for crypto and alarming for an index.
    volRatio: +(current / baseline).toFixed(2),
    volatilityAnnualised: +(current * 100).toFixed(1),
    baselineVolatility: +(baseline * 100).toFixed(1),
    drawdownPercent: +(drawdownFromPeak(candles) ?? 0).toFixed(2),
    worstDayPercent: +worstDay.toFixed(2),
    belowTrend: trend[trend.length - 1] != null ? last.close < trend[trend.length - 1] : null,
    volumeRatio: priorVolume > 0 ? +(recentVolume / priorVolume).toFixed(2) : null,
    atrPercent: atrNow && last.close ? +((atrNow / last.close) * 100).toFixed(2) : null,
  }
}

/**
 * Combine the factors into one reading.
 *
 * The weights are judgement, not fitted parameters — deliberately so. Fitting
 * them to past crashes would produce a detector that explains history
 * beautifully and generalises badly, which is the standard failure of every
 * crash model. Round numbers chosen up front are more honest about how much
 * precision is really here.
 */
export function assessStress(candles, options = {}) {
  const factors = stressFactors(candles, options)
  if (!factors) return { ok: false, reason: 'Not enough history to judge market state.' }

  let score = 0
  const reasons = []

  if (factors.volRatio >= 3) {
    score += 40
    reasons.push(`Volatility is ${factors.volRatio}× its own baseline`)
  } else if (factors.volRatio >= 2) {
    score += 25
    reasons.push(`Volatility is ${factors.volRatio}× its own baseline`)
  } else if (factors.volRatio >= 1.5) {
    score += 12
    reasons.push(`Volatility rising (${factors.volRatio}× baseline)`)
  }

  if (factors.drawdownPercent >= 30) {
    score += 25
    reasons.push(`Down ${factors.drawdownPercent}% from the recent peak`)
  } else if (factors.drawdownPercent >= 15) {
    score += 15
    reasons.push(`Down ${factors.drawdownPercent}% from the recent peak`)
  } else if (factors.drawdownPercent >= 8) {
    score += 7
    reasons.push(`Down ${factors.drawdownPercent}% from the recent peak`)
  }

  if (factors.worstDayPercent <= -10) {
    score += 20
    reasons.push(`A ${factors.worstDayPercent}% day in the last month`)
  } else if (factors.worstDayPercent <= -5) {
    score += 10
    reasons.push(`A ${factors.worstDayPercent}% day in the last month`)
  }

  if (factors.belowTrend) {
    score += 8
    reasons.push('Trading below its 50-period trend')
  }
  if (factors.volumeRatio != null && factors.volumeRatio >= 2) {
    score += 7
    reasons.push(`Volume ${factors.volumeRatio}× normal`)
  }

  score = Math.min(100, score)
  const level =
    score >= 70 ? STRESS_LEVEL.EXTREME : score >= 45 ? STRESS_LEVEL.HIGH : score >= 22 ? STRESS_LEVEL.ELEVATED : STRESS_LEVEL.CALM

  return {
    ok: true,
    score,
    level,
    factors,
    reasons,
    /**
     * What to do about it — size reductions, never a direction.
     *
     * A high reading means the market is moving violently. It does not mean
     * down: some of the largest single-day gains on record happened inside the
     * worst crashes, so trading this signal directionally would be inventing
     * information it does not contain.
     */
    sizeMultiplier: level === STRESS_LEVEL.EXTREME ? 0 : level === STRESS_LEVEL.HIGH ? 0.25 : level === STRESS_LEVEL.ELEVATED ? 0.6 : 1,
    /** Deliberately worded as a present-tense observation, not a forecast. */
    summary:
      level === STRESS_LEVEL.EXTREME
        ? 'Conditions are extreme. This is a state, not a forecast — new positions are halted.'
        : level === STRESS_LEVEL.HIGH
          ? 'Conditions are violent. Position sizes are cut sharply.'
          : level === STRESS_LEVEL.ELEVATED
            ? 'Conditions are unsettled. Position sizes are reduced.'
            : 'Conditions are normal by this market’s own standards.',
  }
}
