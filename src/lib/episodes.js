/**
 * Episodes: one complete decision cycle, from reasoning to verdict.
 *
 *   decide → execute → outcome → review → feed back
 *
 * The point is not to log trades — the paper engine already does that. It is to
 * capture *why* a decision was made at the moment it was made (every indicator
 * check, the macro regime, the levels, the thesis) so the reasoning can be
 * graded afterwards, separately from whether it made money.
 *
 * That separation matters. A profitable trade taken for a reason that never
 * materialised is luck, and treating it as skill is how a strategy quietly
 * decays. The review below distinguishes the two.
 */

export const GRADES = {
  CONFIRMED: {
    key: 'confirmed',
    label: 'Right, thesis held',
    tone: 'emerald',
    note: 'The move went where the reasoning said, far enough to reach the target.',
  },
  PARTIAL: {
    key: 'partial',
    label: 'Right, thesis incomplete',
    tone: 'sky',
    note: 'Closed in profit, but the move never reached the level the thesis argued for.',
  },
  LUCKY: {
    key: 'lucky',
    label: 'Right for the wrong reason',
    tone: 'amber',
    note: 'Profitable, yet the signals that justified it were contradicted by the price path. Do not bank this as skill.',
  },
  STOPPED_NOISE: {
    key: 'stopped-noise',
    label: 'Wrong exit, right idea',
    tone: 'sky',
    note: 'Stopped out, then price went where the thesis said. The read was fine; the stop was too tight for the volatility.',
  },
  WRONG: {
    key: 'wrong',
    label: 'Wrong, thesis broke',
    tone: 'rose',
    note: 'Price went against the reasoning and kept going. The signals were misread or the context overrode them.',
  },
  OPEN: { key: 'open', label: 'In progress', tone: 'slate', note: 'Still running — no verdict until it closes.' },
}

const uid = () => Math.random().toString(36).slice(2, 10)

/** Snapshot the full decision at the moment it is taken. */
export function createEpisode({ symbol, assetClass, direction, signal, regime, qty, entry, source = 'manual', venue = 'paper' }) {
  return {
    id: uid(),
    symbol,
    assetClass,
    direction,
    source,
    venue,
    openedAt: Date.now(),
    closedAt: null,
    decision: {
      price: signal?.price ?? entry,
      bias: signal?.bias ?? 'Manual',
      confidence: signal?.confidence ?? null,
      checks: signal?.checks ?? [],
      levels: signal?.levels ?? null,
      thesis: signal ? buildThesis(signal, regime) : 'Manual discretionary entry with no signal attached.',
      regime: regime ? { label: regime.label, net: regime.net, summary: regime.summary, crowding: regime.crowding } : null,
    },
    execution: { qty, entry, venue },
    outcome: null,
    review: null,
  }
}

/** The written reasoning: technicals, then the backdrop they were taken into. */
function buildThesis(signal, regime) {
  const supporting = signal.checks.filter((c) => c.verdict === (signal.direction === 'short' ? 'bearish' : 'bullish'))
  const against = signal.checks.filter((c) => c.verdict === (signal.direction === 'short' ? 'bullish' : 'bearish'))
  const lead = [...supporting].sort((a, b) => b.weight - a.weight)[0]

  const technical = lead
    ? `${supporting.length} of ${signal.checks.length} checks lean ${signal.direction === 'short' ? 'bearish' : 'bullish'}, led by ${lead.name} (${lead.detail}).`
    : 'No dominant technical driver.'

  const risk = against.length
    ? `${against.length} check${against.length > 1 ? 's' : ''} disagree, so the position is sized to a ${signal.levels?.riskReward ?? '2'}:1 reward-to-risk with the stop at ${signal.levels?.stop}.`
    : 'Nothing disagrees, which is itself a reason for caution — one-sided readings are often late.'

  const macro = regime
    ? ` Backdrop is ${regime.label.toLowerCase()}${
        regime.crowding === 'crowded-long'
          ? ', with positioning crowded long — downside moves tend to be faster here'
          : regime.crowding === 'crowded-short'
            ? ', with positioning crowded short — squeezes are possible'
            : ''
      }.`
    : ''

  return `${technical} ${risk}${macro}`
}

/**
 * Grade a closed episode. `forwardCandles` are the bars *after* the exit — they
 * are what separates "stopped out by noise" from "the read was simply wrong".
 */
export function reviewEpisode(episode, forwardCandles = []) {
  if (!episode.outcome) return { ...GRADES.OPEN, checkAccuracy: [], moveAfterExit: null }

  const { pnl, exit, reason } = episode.outcome
  const long = episode.direction === 'long'
  const won = pnl > 0

  // Did price keep going the way the thesis argued, after we were out?
  let moveAfterExit = null
  if (forwardCandles.length && exit) {
    const last = forwardCandles[forwardCandles.length - 1].close
    moveAfterExit = ((last - exit) / exit) * 100 * (long ? 1 : -1)
  }

  // Was the price path consistent with the direction we argued?
  const pathAgreed = episode.outcome.pnlPct > 0

  let grade
  if (won && reason === 'target') grade = GRADES.CONFIRMED
  else if (won && moveAfterExit != null && moveAfterExit < -1) grade = GRADES.LUCKY
  else if (won) grade = GRADES.PARTIAL
  else if (!won && moveAfterExit != null && moveAfterExit > 1) grade = GRADES.STOPPED_NOISE
  else grade = GRADES.WRONG

  // Attribute the result to the individual checks: a check is vindicated when
  // its verdict matched what price actually did.
  const realisedDirection = pathAgreed ? episode.direction : long ? 'short' : 'long'
  const checkAccuracy = (episode.decision.checks ?? [])
    .filter((c) => c.verdict !== 'neutral')
    .map((c) => {
      const impliedLong = c.verdict === 'bullish'
      const correct = impliedLong === (realisedDirection === 'long')
      return { name: c.name, verdict: c.verdict, weight: c.weight, correct }
    })

  return { ...grade, checkAccuracy, moveAfterExit: moveAfterExit != null ? +moveAfterExit.toFixed(2) : null }
}

/**
 * Roll episodes up into the numbers that should influence the next decision:
 * which checks actually earn their weight, and which regimes we trade well.
 */
export function aggregateEpisodes(episodes) {
  const closed = episodes.filter((e) => e.outcome && e.review)
  if (!closed.length) {
    return { closed: 0, hitRate: null, byCheck: [], byRegime: [], bySymbol: [], netPnl: 0, grades: {} }
  }

  const checkStats = new Map()
  const regimeStats = new Map()
  const symbolStats = new Map()
  const grades = {}

  closed.forEach((e) => {
    grades[e.review.key] = (grades[e.review.key] ?? 0) + 1

    e.review.checkAccuracy?.forEach((c) => {
      const s = checkStats.get(c.name) ?? { name: c.name, total: 0, correct: 0 }
      s.total += 1
      if (c.correct) s.correct += 1
      checkStats.set(c.name, s)
    })

    const regime = e.decision.regime?.label ?? 'Unknown'
    const r = regimeStats.get(regime) ?? { regime, total: 0, wins: 0, pnl: 0 }
    r.total += 1
    if (e.outcome.pnl > 0) r.wins += 1
    r.pnl += e.outcome.pnl
    regimeStats.set(regime, r)

    const sym = symbolStats.get(e.symbol) ?? { symbol: e.symbol, total: 0, wins: 0, pnl: 0 }
    sym.total += 1
    if (e.outcome.pnl > 0) sym.wins += 1
    sym.pnl += e.outcome.pnl
    symbolStats.set(e.symbol, sym)
  })

  const rate = (correct, total) => (total ? +((correct / total) * 100).toFixed(1) : null)

  return {
    closed: closed.length,
    hitRate: rate(closed.filter((e) => e.outcome.pnl > 0).length, closed.length),
    netPnl: +closed.reduce((s, e) => s + e.outcome.pnl, 0).toFixed(2),
    grades,
    byCheck: [...checkStats.values()]
      .map((s) => ({ ...s, accuracy: rate(s.correct, s.total) }))
      .sort((a, b) => b.accuracy - a.accuracy),
    byRegime: [...regimeStats.values()].map((s) => ({ ...s, winRate: rate(s.wins, s.total), pnl: +s.pnl.toFixed(2) })),
    bySymbol: [...symbolStats.values()].map((s) => ({ ...s, winRate: rate(s.wins, s.total), pnl: +s.pnl.toFixed(2) })),
  }
}

/**
 * Feed the record back: reweight a fresh signal's confidence by how the checks
 * behind it have actually performed. Only applied once a check has a real
 * sample — below that, the prior stands unchanged.
 */
export function adjustConfidence(signal, aggregates, { minSample = 5 } = {}) {
  if (!signal?.ok || !aggregates?.byCheck?.length) return { confidence: signal?.confidence ?? null, adjustment: 0, basis: [] }

  const lookup = new Map(aggregates.byCheck.map((c) => [c.name, c]))
  const basis = []
  let weighted = 0
  let totalWeight = 0

  signal.checks
    .filter((c) => c.verdict !== 'neutral')
    .forEach((c) => {
      const record = lookup.get(c.name)
      if (!record || record.total < minSample) return
      // 50% accuracy is a coin flip and earns no adjustment either way.
      const edge = record.accuracy - 50
      weighted += edge * c.weight
      totalWeight += c.weight
      basis.push({ name: c.name, accuracy: record.accuracy, sample: record.total })
    })

  if (!totalWeight) return { confidence: signal.confidence, adjustment: 0, basis: [] }

  // Cap the swing: a short track record should nudge, not overrule.
  const adjustment = Math.max(-15, Math.min(15, Math.round((weighted / totalWeight) * 0.6)))
  return {
    confidence: Math.max(20, Math.min(90, signal.confidence + adjustment)),
    adjustment,
    basis,
  }
}
