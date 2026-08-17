import { collections } from '../storage/mongo.js'

/**
 * Sentiment, on probation.
 *
 * THE PROBLEM THIS SOLVES. The numeric model could be walk-forward validated
 * because price history is free — train on the past, test on the future, and
 * you have an honest score before it ever touches a decision. News sentiment
 * cannot be validated that way here: there is no archive of headlines
 * timestamped against prices to replay. So the only truthful way to find out
 * whether Gemini's read has any predictive value is to write down each reading
 * with the price at that moment, wait, and score it against what actually
 * happened.
 *
 * Until that evidence exists, sentiment votes with weight ZERO. It is
 * recorded, displayed, and completely ignored by the trade decision. That is
 * the honest state of an input nobody has measured yet, and it is the whole
 * design: an unvalidated signal wired into live orders is worse than no signal
 * at all, because it feels like information.
 *
 * A reading is "confirmed" when price moved more than the round-trip cost in
 * the direction the sentiment leaned. A move too small to pay for a trade is
 * not a hit, however correct the direction — which is the mistake that
 * produced 31 winning trades and a losing account.
 */

/** Hours to wait before a reading can be scored. */
const HORIZON_MS = 4 * 60 * 60_000
/** A move under the round trip is not a win, whichever way it went. */
const COST_PERCENT = 0.3
/** Readings needed before the vote is even considered. */
const MIN_SAMPLES = 30
/** Hit rate that must be beaten. Directional calls are roughly a coin flip. */
const MIN_HIT_RATE = 0.55

/** Write down what was read, and the price it was read at. */
export async function recordReading({ symbol, sentiment, strength, price, readAt = Date.now() }) {
  if (!symbol || !sentiment || !Number.isFinite(price)) return null
  // Neutral makes no directional claim, so there is nothing to score.
  if (sentiment === 'neutral') return null

  const doc = { symbol, sentiment, strength, price, readAt, scored: false, confirmed: null, movePercent: null }
  await collections.sentimentReadings().insertOne(doc)
  return doc
}

/**
 * Score every reading old enough to judge.
 *
 * Called with a price lookup rather than fetching itself, so the scoring rule
 * can be tested without a network.
 */
export async function scoreDueReadings({ priceOf, now = Date.now() } = {}) {
  const due = await collections
    .sentimentReadings()
    .find({ scored: false, readAt: { $lte: now - HORIZON_MS } })
    .toArray()

  let confirmed = 0
  for (const reading of due) {
    const later = await priceOf(reading.symbol)
    if (!Number.isFinite(later) || !reading.price) continue

    const movePercent = ((later - reading.price) / reading.price) * 100
    // Direction must match AND the move must clear costs.
    const hit =
      reading.sentiment === 'bullish' ? movePercent > COST_PERCENT : movePercent < -COST_PERCENT

    await collections
      .sentimentReadings()
      .updateOne({ _id: reading._id }, { $set: { scored: true, confirmed: hit, movePercent } })
    if (hit) confirmed++
  }

  return { scored: due.length, confirmed }
}

/**
 * Has sentiment earned a vote yet?
 *
 * Returns the evidence either way, so the answer can be shown rather than
 * merely obeyed. `weight` is what the decision pipeline multiplies by, and it
 * is 0 until the hit rate clears MIN_HIT_RATE over enough samples.
 */
export async function sentimentSkill({ symbol = null } = {}) {
  const query = { scored: true, ...(symbol ? { symbol } : {}) }
  const rows = await collections.sentimentReadings().find(query).toArray()

  const samples = rows.length
  const hits = rows.filter((r) => r.confirmed).length
  const hitRate = samples ? hits / samples : null

  if (samples < MIN_SAMPLES) {
    return {
      validated: false,
      weight: 0,
      samples,
      hitRate,
      needed: MIN_SAMPLES,
      reason:
        `Sentiment is being recorded but has not been measured yet: ${samples} of ${MIN_SAMPLES} ` +
        `scored readings. It does not affect any trade until it has earned that.`,
    }
  }

  if (hitRate < MIN_HIT_RATE) {
    return {
      validated: false,
      weight: 0,
      samples,
      hitRate,
      reason:
        `Sentiment has been measured and does not predict: ${(hitRate * 100).toFixed(0)}% of ` +
        `${samples} readings were followed by a move its own way, against the ` +
        `${(MIN_HIT_RATE * 100).toFixed(0)}% needed. Not voting.`,
    }
  }

  return {
    validated: true,
    // Scaled by how far past the bar it is, so a marginal result gets a
    // marginal say rather than a full one.
    weight: Math.min(1.5, (hitRate - 0.5) * 6),
    samples,
    hitRate,
    reason: `Sentiment called ${(hitRate * 100).toFixed(0)}% of ${samples} readings correctly.`,
  }
}

export const SENTIMENT_RULES = { HORIZON_MS, COST_PERCENT, MIN_SAMPLES, MIN_HIT_RATE }
