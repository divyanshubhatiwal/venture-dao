/**
 * The Critic — a second pass whose only job is to argue against the trade.
 *
 * The trading agent is built to find reasons to act; left alone it will find
 * them. The critic asks the questions a sceptical risk manager would, and each
 * objection is a concrete check against real numbers rather than a vibe:
 *
 *   Is the stop survivable given current volatility?
 *   What evidence contradicts this?
 *   Is the reward worth the risk after costs?
 *   Have similar setups failed before?
 *   Does the macro backdrop argue the other way?
 *   Is positioning already crowded on this side?
 *   Is there any cost to simply waiting?
 *
 * Severity drives the verdict: any `critical` objection vetoes the trade, two
 * or more `major` objections halve the size.
 */

const SEVERITY = { CRITICAL: 'critical', MAJOR: 'major', MINOR: 'minor' }

export function critique({ signal, regime = null, episodes = [], volatilityPercent = null, atr = null }) {
  if (!signal?.ok || signal.direction === 'flat') {
    return { verdict: 'veto', objections: [{ severity: SEVERITY.CRITICAL, question: 'Is there a setup at all?', finding: 'No directional signal. Nothing to critique.' }], summary: 'No setup.' }
  }

  const objections = []
  const clears = []
  const long = signal.direction === 'long'
  const { entry, stop, target } = signal.levels ?? {}
  const add = (severity, question, finding) => objections.push({ severity, question, finding })

  /* Is the stop survivable? */
  if (atr && stop != null) {
    const stopDistance = Math.abs(entry - stop)
    const atrMultiple = stopDistance / atr
    if (atrMultiple < 1) {
      add(
        SEVERITY.CRITICAL,
        'Is the stop reasonable?',
        `The stop sits ${atrMultiple.toFixed(2)}× ATR away. Normal noise on this timeframe is a full ATR — this would be stopped out by nothing happening.`,
      )
    } else if (atrMultiple < 1.3) {
      add(SEVERITY.MAJOR, 'Is the stop reasonable?', `Stop is ${atrMultiple.toFixed(2)}× ATR — tight enough that ordinary noise reaches it.`)
    } else {
      clears.push(`Stop is ${atrMultiple.toFixed(2)}× ATR — outside routine noise.`)
    }
  }

  /* What contradicts this? */
  const dissent = signal.checks.filter((c) => c.verdict === (long ? 'bearish' : 'bullish'))
  const dissentWeight = dissent.reduce((s, c) => s + c.weight, 0)
  const supportWeight = signal.checks.filter((c) => c.verdict === (long ? 'bullish' : 'bearish')).reduce((s, c) => s + c.weight, 0)
  if (dissentWeight >= supportWeight * 0.6 && dissent.length) {
    add(
      SEVERITY.MAJOR,
      'What evidence contradicts the trade?',
      `${dissent.length} checks disagree with ${dissentWeight.toFixed(1)} of weight against ${supportWeight.toFixed(1)} for — the read is close to a coin flip.`,
    )
  } else if (!dissent.length) {
    add(
      SEVERITY.MINOR,
      'What evidence contradicts the trade?',
      'Nothing disagrees. Unanimous readings usually appear late in a move, once it is already obvious.',
    )
  } else {
    clears.push(`Dissent is ${dissentWeight.toFixed(1)} against ${supportWeight.toFixed(1)} — the balance favours the trade.`)
  }

  /* Is volatility too high to size sanely? */
  if (volatilityPercent != null) {
    if (volatilityPercent > 5) {
      add(SEVERITY.CRITICAL, 'Is volatility too high?', `ATR is ${volatilityPercent.toFixed(2)}% of price. Stops get run on noise alone at this level.`)
    } else if (volatilityPercent > 3) {
      add(SEVERITY.MAJOR, 'Is volatility too high?', `ATR is ${volatilityPercent.toFixed(2)}% of price — elevated. Size accordingly.`)
    } else {
      clears.push(`Volatility is ordinary at ${volatilityPercent.toFixed(2)}% ATR.`)
    }
  }

  /* Does the backdrop argue the other way? */
  if (regime) {
    const riskOff = regime.net <= -1
    const riskOn = regime.net >= 1
    if (long && riskOff) add(SEVERITY.MAJOR, 'Does macro contradict this?', `Backdrop is ${regime.label} while this is a long. The tide is against it.`)
    else if (!long && riskOn) add(SEVERITY.MAJOR, 'Does macro contradict this?', `Backdrop is ${regime.label} while this is a short.`)
    else clears.push(`Backdrop (${regime.label}) does not fight the direction.`)

    if (long && regime.crowding === 'crowded-long')
      add(SEVERITY.MAJOR, 'Is positioning already crowded?', 'Funding shows longs already paying to hold. Crowded longs unwind faster than they build.')
    if (!long && regime.crowding === 'crowded-short')
      add(SEVERITY.MAJOR, 'Is positioning already crowded?', 'Shorts are already paying. Squeeze risk is elevated.')
  }

  /* Have similar setups failed before? */
  const similar = episodes.filter((e) => e.symbol === signal.symbol && e.direction === signal.direction && e.outcome)
  if (similar.length >= 3) {
    const losses = similar.filter((e) => e.outcome.pnl <= 0).length
    const lossRate = losses / similar.length
    if (lossRate >= 0.6) {
      add(
        SEVERITY.MAJOR,
        'Have similar trades failed?',
        `${losses} of the last ${similar.length} ${signal.direction}s on ${signal.symbol} lost. This exact setup has a poor record.`,
      )
    } else {
      clears.push(`${similar.length - losses} of ${similar.length} similar setups on ${signal.symbol} worked.`)
    }
  }

  /* Is the reward worth it? */
  if (entry != null && stop != null && target != null) {
    const rr = Math.abs(target - entry) / Math.abs(entry - stop)
    if (rr < 1.5) add(SEVERITY.CRITICAL, 'Is the reward sufficient?', `Reward-to-risk is ${rr.toFixed(2)}. Below 1.5 the win rate required is unrealistic.`)
    else if (rr < 2) add(SEVERITY.MINOR, 'Is the reward sufficient?', `Reward-to-risk ${rr.toFixed(2)} is acceptable but not generous.`)
    else clears.push(`Reward-to-risk is ${rr.toFixed(2)}.`)
  }

  /* Is this trade necessary? */
  if (signal.confidence < 60) {
    add(
      SEVERITY.MAJOR,
      'Is this trade necessary, or can we wait?',
      `${signal.confidence}% agreement is thin. There is no cost to waiting for a clearer setup — the market will still be here.`,
    )
  }

  const criticals = objections.filter((o) => o.severity === SEVERITY.CRITICAL)
  const majors = objections.filter((o) => o.severity === SEVERITY.MAJOR)

  const verdict = criticals.length > 0 ? 'veto' : majors.length >= 2 ? 'reduce' : 'approve'

  const summary =
    verdict === 'veto'
      ? `Vetoed: ${criticals[0].finding}`
      : verdict === 'reduce'
        ? `${majors.length} significant objections — proceed at reduced size.`
        : objections.length
          ? 'Objections noted, none disqualifying.'
          : 'No material objection.'

  return { verdict, objections, clears, summary, counts: { critical: criticals.length, major: majors.length, minor: objections.length - criticals.length - majors.length } }
}
