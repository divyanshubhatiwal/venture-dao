import { buildDataset, buildFeatures, predict, train, walkForward } from './model.js'

/**
 * The model's vote — earned, not granted.
 *
 * A prediction is only released if the model first demonstrates skill on data
 * it has never seen. It trains, walk-forward validates on held-out future
 * bars, and if mean lift over the majority-class baseline is not positive it
 * returns no opinion at all and says why.
 *
 * That gate is the entire point. Measured on real hourly candles across BTC,
 * ETH, SOL and LINK, this model does NOT currently beat baseline — lift ran
 * from -1.9 to -17.1 percentage points. A model wired in unconditionally would
 * therefore be actively voting against the truth while looking sophisticated.
 * Gating it means the feature is real, the plumbing works the moment an edge
 * exists, and nothing pretends to knowledge it has not shown.
 *
 * It also never decides anything by itself. It contributes one weighted vote
 * beside the indicator checks, and the risk gates still run last and can still
 * refuse. A model output is an opinion, not an instruction.
 */

/** Minimum out-of-sample lift, in percentage points, before a vote is allowed. */
const MIN_LIFT = 0.01

/** Retraining every call would be wasteful; keyed by symbol and bar count. */
const cache = new Map()

export function modelOpinion(candles, { symbol = '?', horizon = 12, costPercent = 0.3, now = Date.now() } = {}) {
  if (!Array.isArray(candles) || candles.length < 400) {
    return { ok: false, reason: `Not enough history to train or validate: ${candles?.length ?? 0} bars, need 400.` }
  }

  const key = `${symbol}:${candles.length}:${horizon}:${costPercent}`
  const hit = cache.get(key)
  if (hit && now - hit.at < 10 * 60_000) return hit.value

  const rows = buildDataset(candles, { horizon, costPercent })
  const validation = walkForward(rows, { folds: 4, minTrain: 300 })

  let value
  if (!validation.ok) {
    value = { ok: false, reason: validation.reason }
  } else if (validation.meanLift <= MIN_LIFT) {
    // Stated in full rather than softened. This is the honest outcome today.
    value = {
      ok: false,
      validated: false,
      lift: validation.meanLift,
      accuracy: validation.meanAccuracy,
      baseline: validation.meanBaseline,
      reason:
        `Model has no demonstrated edge on ${symbol}: ${(validation.meanAccuracy * 100).toFixed(1)}% out-of-sample ` +
        `against a ${(validation.meanBaseline * 100).toFixed(1)}% baseline ` +
        `(${validation.meanLift >= 0 ? '+' : ''}${(validation.meanLift * 100).toFixed(1)}pp). Not voting.`,
    }
  } else {
    const model = train(rows)
    const features = buildFeatures(candles, candles.length - 1)
    const probability = model.ok && features ? predict(model, features) : null

    value = probability == null
      ? { ok: false, reason: 'Model trained but produced no usable prediction for the latest bar.' }
      : {
          ok: true,
          validated: true,
          probability,
          verdict: probability >= 0.5 ? 'bullish' : 'bearish',
          // Confidence is distance from a coin flip, scaled to 0..1 — a
          // probability of 0.52 is a shrug, not a signal.
          confidence: Math.abs(probability - 0.5) * 2,
          lift: validation.meanLift,
          accuracy: validation.meanAccuracy,
          baseline: validation.meanBaseline,
          detail:
            `${(probability * 100).toFixed(0)}% chance of clearing ${costPercent}% in ${horizon} bars ` +
            `(validated: ${(validation.meanAccuracy * 100).toFixed(1)}% vs ${(validation.meanBaseline * 100).toFixed(1)}% baseline)`,
        }
  }

  cache.set(key, { at: now, value })
  return value
}

export function _clearModelCache() {
  cache.clear()
}
