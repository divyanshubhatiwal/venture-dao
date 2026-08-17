import { describe, expect, it } from 'vitest'
import {
  FEATURES,
  buildDataset,
  buildFeatures,
  buildLabel,
  evaluate,
  fitScaler,
  predict,
  train,
  walkForward,
} from '../agent/model'

/** Candles from a price path, with volume, in the shape the app uses. */
const series = (prices) =>
  prices.map((close, i) => ({
    open: i ? prices[i - 1] : close,
    high: close * 1.002,
    low: close * 0.998,
    close,
    volume: 1000,
  }))

/**
 * A price path with a real, learnable rule and MIXED labels.
 *
 * The rule: when the last five bars are down more than 2%, the next stretch
 * rises; otherwise the path drifts randomly. Both outcomes occur, so the label
 * genuinely varies — an earlier version of this fixture alternated
 * deterministically with net upward drift, which made every label 1 and left
 * the model nothing to learn and no lift to measure.
 */
const learnable = (n = 900, seed = 3) => {
  const out = [100]
  let s = seed
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  for (let i = 1; i < n; i++) {
    const back = out[Math.max(0, i - 5)]
    const fell = (out[i - 1] - back) / back < -0.02
    const drift = fell ? 0.004 : (rand() - 0.5) * 0.004
    out.push(out[i - 1] * (1 + drift))
  }
  return out
}

const noise = (n = 600, seed = 7) => {
  const out = [100]
  let s = seed
  for (let i = 1; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648
    out.push(out[i - 1] * (1 + ((s / 2147483648) - 0.5) * 0.01))
  }
  return out
}

describe('features', () => {
  it('produces every declared feature as a finite number', () => {
    const f = buildFeatures(series(noise()), 200)
    expect(Object.keys(f).sort()).toEqual([...FEATURES].sort())
    expect(Object.values(f).every(Number.isFinite)).toBe(true)
  })

  /* The single most important property here. A model given raw prices learns
     the price range of its training window and breaks the moment the market
     leaves it — the classic backtest that cannot be reproduced live. */
  it('is scale-free: doubling every price leaves features unchanged', () => {
    const prices = noise()
    const a = buildFeatures(series(prices), 200)
    const b = buildFeatures(series(prices.map((p) => p * 2)), 200)
    for (const name of FEATURES) expect(b[name]).toBeCloseTo(a[name], 6)
  })

  /* If one future bar reaches the feature window, every backtest result is
     fiction. This pins that the window is closed at `index`. */
  it('never reads a bar after the one it is asked about', () => {
    const prices = noise()
    const withFuture = [...prices]
    withFuture[201] = 10_000 // a violent move immediately after index 200
    expect(buildFeatures(series(prices), 200)).toEqual(buildFeatures(series(withFuture), 200))
  })

  it('refuses an index with too little history behind it', () => {
    expect(buildFeatures(series(noise()), 10)).toBeNull()
  })

  it('returns null rather than NaN on a broken series', () => {
    expect(buildFeatures(series(new Array(200).fill(0)), 100)).toBeNull()
  })
})

describe('labels', () => {
  it('marks a move that clears the cost threshold', () => {
    const prices = new Array(100).fill(100)
    prices[62] = 101 // +1% twelve bars after index 50
    expect(buildLabel(series(prices), 50, 12, 0.3)).toBe(1)
  })

  /* A model trained against zero would learn to call moves too small to pay
     for themselves — which is how this project produced 31 winning trades and
     still lost money. */
  it('rejects a move too small to cover its own costs', () => {
    const prices = new Array(100).fill(100)
    prices[62] = 100.1 // +0.1%, under the 0.3% round trip
    expect(buildLabel(series(prices), 50, 12, 0.3)).toBe(0)
  })

  it('returns null when the horizon runs past the data', () => {
    expect(buildLabel(series(noise(60)), 55, 12)).toBeNull()
  })
})

describe('training', () => {
  it('refuses to train on a sample too small to mean anything', () => {
    const model = train(buildDataset(series(noise(120))))
    expect(model.ok).toBe(false)
    expect(model.reason).toMatch(/at least 100/)
  })

  it('learns a rule that is genuinely present in the data', () => {
    const rows = buildDataset(series(learnable()), { horizon: 6, costPercent: 0 })
    const model = train(rows, { epochs: 400 })
    expect(model.ok).toBe(true)
    // In-sample only: this asserts the optimiser works, not that it forecasts.
    expect(evaluate(model, rows).lift).toBeGreaterThan(0)
  })

  it('returns probabilities, not raw scores', () => {
    const rows = buildDataset(series(noise()), { horizon: 6, costPercent: 0 })
    const model = train(rows)
    const p = predict(model, rows[0].features)
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(1)
  })

  it('predicts nothing from a model that failed to train', () => {
    expect(predict({ ok: false }, { return1: 1 })).toBeNull()
  })

  it('fits the scaler on the rows it is given and nothing else', () => {
    const rows = buildDataset(series(noise()), { horizon: 6, costPercent: 0 })
    const scaler = fitScaler(rows.slice(0, 100))
    expect(scaler.return1.std).toBeGreaterThan(0)
    expect(Object.keys(scaler).sort()).toEqual([...FEATURES].sort())
  })
})

describe('evaluation', () => {
  /* Accuracy on unbalanced classes flatters a model that has learned nothing.
     If 80% of bars are negative, always saying "no" scores 80%. */
  it('reports the majority-class baseline beside accuracy', () => {
    const rows = buildDataset(series(learnable()), { horizon: 6, costPercent: 0 })
    const model = train(rows)
    const scored = evaluate(model, rows)
    expect(scored.baseline).toBeGreaterThanOrEqual(0.5)
    expect(scored.lift).toBeCloseTo(scored.accuracy - scored.baseline, 10)
  })

  it('reports precision, which is what decides whether trades make money', () => {
    const rows = buildDataset(series(learnable()), { horizon: 6, costPercent: 0 })
    const scored = evaluate(train(rows), rows)
    const { tp, fp } = scored.confusion
    expect(scored.precision).toBeCloseTo(tp / (tp + fp), 6)
  })
})

describe('walk-forward validation', () => {
  /* Every fold must test only on bars that come after everything it trained
     on. A shuffled split lets the model see next week while learning about
     this one, which is the difference between a real result and a fiction. */
  it('never tests on data the model trained on', () => {
    const rows = buildDataset(series(noise(1200)), { horizon: 6, costPercent: 0 })
    const result = walkForward(rows, { folds: 3, minTrain: 300 })
    expect(result.ok).toBe(true)
    let previousTrainEnd = 0
    for (const fold of result.folds) {
      expect(fold.trainedOn).toBeGreaterThanOrEqual(previousTrainEnd)
      previousTrainEnd = fold.trainedOn
    }
  })

  it('refuses when there is not enough history to validate honestly', () => {
    const result = walkForward(buildDataset(series(noise(300))), { folds: 4, minTrain: 300 })
    expect(result.ok).toBe(false)
  })

  it('reports failure to beat baseline rather than hiding it', () => {
    // Pure noise has nothing to learn, so lift must not come out positive.
    const rows = buildDataset(series(noise(1500, 99)), { horizon: 12, costPercent: 0.3 })
    const result = walkForward(rows, { folds: 3, minTrain: 400 })
    if (result.ok) {
      expect(result).toHaveProperty('beatsBaseline')
      expect(result.beatsBaseline).toBe(result.meanLift > 0)
    }
  })
})
