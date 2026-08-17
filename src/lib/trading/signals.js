import { atr, bollinger, ema, macd, rangePosition, rsi, sma, swingLevels } from './indicators.js'
import { modelOpinion } from '../agent/modelSignal.js'

/**
 * Signal engine: turns real candles into a transparent, auditable read.
 *
 * Deliberately NOT a black box. Every signal carries the individual checks that
 * produced it, each with its own weight and the number it fired on, so the
 * output can be argued with rather than obeyed. Levels are volatility-scaled
 * from ATR and confirmed against real swing highs and lows.
 *
 * This is technical analysis on price history. It has no knowledge of earnings,
 * news, filings or macro, it does not predict the future, and it is not
 * investment advice — see the disclaimer rendered with every signal.
 */

const BIAS = {
  STRONG_BUY: { label: 'Strong buy', tone: 'emerald', score: 2 },
  BUY: { label: 'Buy', tone: 'emerald', score: 1 },
  NEUTRAL: { label: 'Neutral', tone: 'slate', score: 0 },
  SELL: { label: 'Sell', tone: 'rose', score: -1 },
  STRONG_SELL: { label: 'Strong sell', tone: 'rose', score: -2 },
}

/** Minimum candles before any read is meaningful (slow EMA + signal line). */
export const MIN_CANDLES = 35

export function generateSignal(candles, { symbol = '', currency = 'USD', sentiment = null } = {}) {
  if (!candles || candles.length < MIN_CANDLES) {
    return { ok: false, reason: `Need at least ${MIN_CANDLES} candles for a read; got ${candles?.length ?? 0}.` }
  }

  const closes = candles.map((c) => c.close)
  const last = candles[candles.length - 1]
  const price = last.close

  const rsiSeries = rsi(closes, 14)
  const { line: macdLine, signal: macdSignal, histogram } = macd(closes)
  const ema20 = ema(closes, 20)
  const sma50 = sma(closes, 50)
  const bands = bollinger(closes, 20, 2)
  const atrSeries = atr(candles, 14)
  const levels = swingLevels(candles)
  const position = rangePosition(candles, 20)

  const i = candles.length - 1
  const rsiNow = rsiSeries[i]
  const atrNow = atrSeries[i] ?? (last.high - last.low)
  const macdNow = macdLine[i]
  const macdSigNow = macdSignal[i]
  const histNow = histogram[i]
  const histPrev = histogram[i - 1]

  /* ---- individual checks, each with an explicit weight ---- */
  const checks = []
  const add = (name, verdict, weight, detail) => checks.push({ name, verdict, weight, detail })

  /* The trained model, weighted above any single indicator because it is
     fitted to outcomes rather than chosen by hand — but only if it has proven
     itself out of sample. modelOpinion() returns no opinion when it has not,
     and today, on every market measured, it has not. The check below then
     records that refusal as a visible neutral row rather than silently
     omitting it, so the reader can see the model was consulted and declined. */
  /* News sentiment, on probation.
     It appears whether or not it has earned a vote, because a reader should be
     able to see that it was consulted. `skill.weight` is 0 until enough
     readings have been scored against real price moves, so until then this row
     is visible and inert — which is the honest state of an input nobody has
     measured yet. */
  if (sentiment?.ok) {
    const weight = sentiment.skill?.weight ?? 0
    add(
      'News sentiment',
      weight > 0 ? sentiment.sentiment : 'neutral',
      weight * (sentiment.strength ?? 0),
      weight > 0
        ? `${sentiment.sentiment} · ${sentiment.skill.reason}`
        : `${sentiment.sentiment} read, not voting — ${sentiment.skill?.reason ?? 'not yet measured'}`,
    )
  }

  const opinion = modelOpinion(candles, { symbol: symbol || '?' })
  if (opinion.ok) {
    add('Trained model', opinion.verdict, 2.5 * opinion.confidence, opinion.detail)
  } else if (opinion.validated === false) {
    add('Trained model', 'neutral', 0, opinion.reason)
  }

  if (rsiNow != null) {
    if (rsiNow < 30) add('RSI (14)', 'bullish', 1.5, `${rsiNow.toFixed(1)} — oversold`)
    else if (rsiNow > 70) add('RSI (14)', 'bearish', 1.5, `${rsiNow.toFixed(1)} — overbought`)
    else if (rsiNow > 55) add('RSI (14)', 'bullish', 0.5, `${rsiNow.toFixed(1)} — momentum up`)
    else if (rsiNow < 45) add('RSI (14)', 'bearish', 0.5, `${rsiNow.toFixed(1)} — momentum down`)
    else add('RSI (14)', 'neutral', 0, `${rsiNow.toFixed(1)} — mid-range`)
  }

  if (macdNow != null && macdSigNow != null) {
    const crossedUp = histPrev != null && histPrev <= 0 && histNow > 0
    const crossedDown = histPrev != null && histPrev >= 0 && histNow < 0
    if (crossedUp) add('MACD', 'bullish', 2, 'signal line crossed up this bar')
    else if (crossedDown) add('MACD', 'bearish', 2, 'signal line crossed down this bar')
    else if (histNow > 0) add('MACD', 'bullish', 1, `histogram +${histNow.toFixed(2)}`)
    else add('MACD', 'bearish', 1, `histogram ${histNow.toFixed(2)}`)
  }

  if (ema20[i] != null) {
    const above = price > ema20[i]
    add('Price vs EMA 20', above ? 'bullish' : 'bearish', 1, `${above ? 'above' : 'below'} ${ema20[i].toFixed(2)}`)
  }

  if (sma50[i] != null) {
    const above = price > sma50[i]
    add('Trend (SMA 50)', above ? 'bullish' : 'bearish', 1.5, `${above ? 'above' : 'below'} ${sma50[i].toFixed(2)}`)
  }

  if (bands.upper[i] != null) {
    if (price > bands.upper[i]) add('Bollinger (20,2)', 'bearish', 1, 'closed above the upper band — extended')
    else if (price < bands.lower[i]) add('Bollinger (20,2)', 'bullish', 1, 'closed below the lower band — extended')
    else add('Bollinger (20,2)', 'neutral', 0, 'inside the bands')
  }

  const recentVol = candles.slice(-5).reduce((s, c) => s + (c.volume || 0), 0) / 5
  const priorVol = candles.slice(-25, -5).reduce((s, c) => s + (c.volume || 0), 0) / 20
  if (priorVol > 0) {
    const ratio = recentVol / priorVol
    const rising = closes[i] > closes[i - 5]
    if (ratio > 1.3) add('Volume', rising ? 'bullish' : 'bearish', 1, `${ratio.toFixed(2)}× the 20-bar average — ${rising ? 'buying' : 'selling'} pressure`)
    else if (ratio < 0.7) add('Volume', 'neutral', 0, `${ratio.toFixed(2)}× average — participation thin`)
    else add('Volume', 'neutral', 0, `${ratio.toFixed(2)}× average`)
  }

  /* ---- combine ---- */
  const bullScore = checks.filter((c) => c.verdict === 'bullish').reduce((s, c) => s + c.weight, 0)
  const bearScore = checks.filter((c) => c.verdict === 'bearish').reduce((s, c) => s + c.weight, 0)
  const net = bullScore - bearScore
  const total = bullScore + bearScore

  const bias =
    net >= 3 ? BIAS.STRONG_BUY : net >= 1.5 ? BIAS.BUY : net <= -3 ? BIAS.STRONG_SELL : net <= -1.5 ? BIAS.SELL : BIAS.NEUTRAL

  // Confidence is agreement between the checks, not certainty about the future.
  const agreement = total === 0 ? 0 : Math.abs(net) / total
  const confidence = Math.round(Math.min(85, 35 + agreement * 55))

  /* ---- levels, scaled to actual volatility ---- */
  const long = bias.score > 0
  const nearestSupport = levels.support[0] ?? price - atrNow * 2
  const nearestResistance = levels.resistance[0] ?? price + atrNow * 2

  const stop = long ? Math.min(price - atrNow * 1.5, nearestSupport * 0.998) : Math.max(price + atrNow * 1.5, nearestResistance * 1.002)
  const risk = Math.abs(price - stop)
  const target = long ? price + risk * 2 : price - risk * 2
  const riskReward = risk > 0 ? Math.abs(target - price) / risk : null

  return {
    ok: true,
    symbol,
    currency,
    price,
    at: last.time,
    bias: bias.label,
    tone: bias.tone,
    direction: bias.score > 0 ? 'long' : bias.score < 0 ? 'short' : 'flat',
    confidence,
    checks,
    scores: { bull: +bullScore.toFixed(1), bear: +bearScore.toFixed(1), net: +net.toFixed(1) },
    levels: {
      entry: price,
      stop: +stop.toFixed(4),
      target: +target.toFixed(4),
      riskReward: riskReward ? +riskReward.toFixed(2) : null,
      support: levels.support.map((l) => +l.toFixed(4)),
      resistance: levels.resistance.map((l) => +l.toFixed(4)),
      atr: +atrNow.toFixed(4),
    },
    context: {
      rsi: rsiNow != null ? +rsiNow.toFixed(1) : null,
      macdHistogram: histNow != null ? +histNow.toFixed(3) : null,
      ema20: ema20[i] != null ? +ema20[i].toFixed(2) : null,
      sma50: sma50[i] != null ? +sma50[i].toFixed(2) : null,
      rangePosition: position != null ? Math.round(position) : null,
    },
    /** Shown with every signal. The engine reads price history and nothing else. */
    disclaimer:
      'Generated from price history by technical indicators. It knows nothing about earnings, news or filings, it cannot predict the future, and it is not investment advice.',
  }
}

/** Plain-English summary of why the engine landed where it did. */
export function explainSignal(signal) {
  if (!signal?.ok) return ''
  const supporting = signal.checks.filter((c) => c.verdict === (signal.direction === 'short' ? 'bearish' : 'bullish'))
  const against = signal.checks.filter((c) => c.verdict === (signal.direction === 'short' ? 'bullish' : 'bearish'))

  if (signal.direction === 'flat') {
    return `The checks cancel out — ${signal.scores.bull} of bullish weight against ${signal.scores.bear} bearish. No edge either way at this price.`
  }
  const lead = supporting.sort((a, b) => b.weight - a.weight)[0]
  return `${supporting.length} of ${signal.checks.length} checks lean ${signal.direction === 'short' ? 'bearish' : 'bullish'}, led by ${lead?.name} (${lead?.detail}). ${
    against.length ? `${against.length} disagree, so the position is sized against a ${signal.levels.riskReward}:1 reward-to-risk.` : 'Nothing disagrees, which is itself a reason to be careful.'
  }`
}
