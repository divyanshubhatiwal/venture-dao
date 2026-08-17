/**
 * Monte Carlo robustness test.
 *
 * A single backtest is one path through history — it tells you what happened,
 * not what is likely. This resamples the strategy's own realised trades
 * (bootstrap with replacement), shuffles their order, and runs the account
 * forward thousands of times to answer the only question that matters for a
 * goal-based agent:
 *
 *   How often does this reach the target, and how often does it hit the
 *   drawdown limit first?
 *
 * The trade outcomes are real. What is simulated is the ORDER they arrive in,
 * which is the part nobody can predict. If a strategy only works in one
 * particular sequence, that shows up here as a wide spread and a low success
 * rate.
 *
 * This describes the distribution implied by past trades. It is not a forecast:
 * future trades can be worse than any sample drawn here.
 */

/** Deterministic PRNG so a reported run can be reproduced exactly. */
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function monteCarlo({
  trades = [],
  startingBalance = 100,
  targetBalance = 200,
  maxDrawdownPercent = 5,
  riskPerTradePercent = 0.75,
  maxTrades = 500,
  runs = 2000,
  seed = 12345,
}) {
  const settled = trades.filter((t) => typeof t.pnl === 'number' && typeof t.pnlPct === 'number')
  if (settled.length < 5) {
    return { ok: false, reason: `Need at least 5 resolved trades to resample; got ${settled.length}.` }
  }

  // Express each historical trade as a multiple of the risk taken (R), so it
  // can be replayed at any account size rather than only the one it happened at.
  const rMultiples = settled.map((t) => {
    const r = t.pnlPct / riskPerTradePercent
    // Clamp absurd outliers from tiny denominators; they distort resampling.
    return Math.max(-5, Math.min(10, r))
  })

  const rand = mulberry32(seed)
  const outcomes = []
  let reachedTarget = 0
  let hitDrawdown = 0
  let ranOut = 0

  for (let run = 0; run < runs; run++) {
    let balance = startingBalance
    let peak = startingBalance
    let maxDd = 0
    let tradeCount = 0
    let result = 'exhausted'

    while (tradeCount < maxTrades) {
      const r = rMultiples[Math.floor(rand() * rMultiples.length)]
      // Risk is a fraction of the CURRENT balance, so losses compound down and
      // wins compound up — the same way the live risk engine sizes.
      balance += balance * (riskPerTradePercent / 100) * r
      tradeCount += 1

      if (balance > peak) peak = balance
      const dd = ((peak - balance) / peak) * 100
      if (dd > maxDd) maxDd = dd

      if (dd >= maxDrawdownPercent) {
        result = 'drawdown'
        break
      }
      if (balance >= targetBalance) {
        result = 'target'
        break
      }
      if (balance <= startingBalance * 0.05) {
        result = 'drawdown'
        break
      }
    }

    if (result === 'target') reachedTarget += 1
    else if (result === 'drawdown') hitDrawdown += 1
    else ranOut += 1

    outcomes.push({ balance, maxDd, tradeCount, result })
  }

  const balances = outcomes.map((o) => o.balance).sort((a, b) => a - b)
  const pct = (p) => balances[Math.min(balances.length - 1, Math.floor((p / 100) * balances.length))]
  const targetRuns = outcomes.filter((o) => o.result === 'target')

  const round = (n) => Math.round(n * 100) / 100

  return {
    ok: true,
    runs,
    sampleTrades: settled.length,
    probabilityOfTarget: round((reachedTarget / runs) * 100),
    probabilityOfDrawdownStop: round((hitDrawdown / runs) * 100),
    probabilityInconclusive: round((ranOut / runs) * 100),
    best: round(balances[balances.length - 1]),
    worst: round(balances[0]),
    median: round(pct(50)),
    p5: round(pct(5)),
    p95: round(pct(95)),
    medianMaxDrawdown: round([...outcomes.map((o) => o.maxDd)].sort((a, b) => a - b)[Math.floor(runs / 2)]),
    medianTradesToTarget: targetRuns.length
      ? Math.round([...targetRuns.map((o) => o.tradeCount)].sort((a, b) => a - b)[Math.floor(targetRuns.length / 2)])
      : null,
    // Distribution buckets for the histogram.
    histogram: buildHistogram(balances, startingBalance, targetBalance),
  }
}

function buildHistogram(sorted, start, target, buckets = 24) {
  const min = Math.min(sorted[0], start * 0.5)
  const max = Math.max(sorted[sorted.length - 1], target * 1.05)
  const width = (max - min) / buckets || 1
  const bins = Array.from({ length: buckets }, (_, i) => ({
    from: +(min + i * width).toFixed(2),
    to: +(min + (i + 1) * width).toFixed(2),
    count: 0,
  }))
  sorted.forEach((v) => {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((v - min) / width)))
    bins[idx].count += 1
  })
  return bins.map((b) => ({ ...b, label: `${Math.round(b.from)}` }))
}
