import { atr, bollinger, ema, macd, rsi, sma } from '../trading/indicators.js'

/**
 * A trained model for directional prediction.
 *
 * WHAT IT IS: logistic regression, fitted by gradient descent on features
 * derived from real candles. The weights are learned from data rather than
 * chosen by hand, which is the only thing that separates this from the
 * weighted-indicator scoring the app already had.
 *
 * WHY NOT A LARGE LANGUAGE MODEL: an LLM cannot forecast a price series. It
 * has no access to the numbers except as text, no training objective related
 * to returns, and it will produce a confident paragraph either way. Wiring one
 * in would look far more impressive than this and predict strictly worse. If a
 * model here is going to claim an edge, it has to be measurable, and this one
 * is: features in, probability out, scored against outcomes it never saw.
 *
 * WHY LOGISTIC REGRESSION AND NOT SOMETHING DEEPER: with a few thousand noisy
 * samples and a signal-to-noise ratio this low, a deeper model mostly gains
 * capacity to memorise. A linear model in a handful of engineered features is
 * roughly the complexity the data supports, and its weights can be read and
 * argued with, which matters more here than a fraction of a percent.
 *
 * WHAT IT DOES NOT DO: it does not decide trades. It produces one probability
 * that gets weighed alongside everything else, and the risk gates still run
 * last and can still refuse. A model output is an opinion, not an instruction.
 */

/** Order matters: weights are positional, so this list defines the contract. */
export const FEATURES = [
  'return1',      // last bar's return
  'return5',      // five-bar return — short momentum
  'return20',     // twenty-bar return — the wider trend
  'rsiNorm',      // RSI, centred on 50 and scaled
  'macdHist',     // MACD histogram, scaled by price
  'emaGap',       // how far price sits above/below its own EMA
  'smaGap',       // same against the slower SMA
  'bandPos',      // position inside the Bollinger band, -1..1
  'volatility',   // ATR as a share of price
  'volumeRatio',  // volume against its own recent average
]

const safeDiv = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : 0)
const clean = (n) => (Number.isFinite(n) ? n : 0)

/**
 * Turn candles into one feature row per bar.
 *
 * Every feature is a RATIO or a normalised distance, never a raw price. A model
 * trained on absolute prices learns the price range of its training period and
 * becomes useless the moment the market leaves it — the classic way a backtest
 * looks brilliant and live trading does not.
 */
export function buildFeatures(candles, index) {
  if (!Array.isArray(candles) || index < 50 || index >= candles.length) return null

  // Only bars up to `index` — never past it. Letting a single future bar into
  // the window is the most common way a backtest quietly cheats.
  const window = candles.slice(0, index + 1)
  const closes = window.map((c) => c.close)
  const price = closes[closes.length - 1]
  if (!Number.isFinite(price) || price <= 0) return null

  const rsiSeries = rsi(closes, 14)
  const { histogram } = macd(closes)
  const ema20 = ema(closes, 20)
  const sma50 = sma(closes, 50)
  const bands = bollinger(closes, 20, 2)
  const atrSeries = atr(window, 14)
  const i = closes.length - 1

  const volumes = window.slice(-20).map((c) => c.volume ?? 0)
  const avgVolume = volumes.reduce((s, v) => s + v, 0) / (volumes.length || 1)

  const band = bands?.[i]
  const bandWidth = band ? band.upper - band.lower : null

  return {
    return1: clean(safeDiv(price - closes[i - 1], closes[i - 1]) * 100),
    return5: clean(safeDiv(price - closes[i - 5], closes[i - 5]) * 100),
    return20: clean(safeDiv(price - closes[i - 20], closes[i - 20]) * 100),
    rsiNorm: clean(((rsiSeries[i] ?? 50) - 50) / 50),
    macdHist: clean(safeDiv(histogram[i], price) * 100),
    emaGap: clean(safeDiv(price - (ema20[i] ?? price), price) * 100),
    smaGap: clean(safeDiv(price - (sma50[i] ?? price), price) * 100),
    bandPos: clean(band && bandWidth ? ((price - band.mid) / (bandWidth / 2)) : 0),
    volatility: clean(safeDiv(atrSeries[i], price) * 100),
    volumeRatio: clean(safeDiv((window[i].volume ?? 0) - avgVolume, avgVolume)),
  }
}

/**
 * The label: did price rise by more than `costPercent` over `horizon` bars?
 *
 * The threshold is deliberately the round-trip cost rather than zero. A model
 * trained to predict "up at all" happily learns to call moves too small to pay
 * for themselves — which is precisely how this project produced 31 winning
 * trades and still lost money.
 */
export function buildLabel(candles, index, horizon = 12, costPercent = 0.3) {
  const now = candles[index]?.close
  const later = candles[index + horizon]?.close
  if (!Number.isFinite(now) || !Number.isFinite(later) || now <= 0) return null
  return ((later - now) / now) * 100 > costPercent ? 1 : 0
}

/** Feature rows and labels for every usable bar in a series. */
export function buildDataset(candles, { horizon = 12, costPercent = 0.3 } = {}) {
  const rows = []
  for (let i = 50; i < candles.length - horizon; i++) {
    const features = buildFeatures(candles, i)
    const label = buildLabel(candles, i, horizon, costPercent)
    if (features && label !== null) rows.push({ features, label, index: i })
  }
  return rows
}

const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))

/**
 * Standardise each feature to mean 0, standard deviation 1.
 *
 * Gradient descent on raw features lets whichever one happens to have the
 * largest units dominate the step size. The scaler is fitted on TRAINING data
 * only and then applied unchanged to test data — fitting it on everything
 * leaks the test set's distribution into training.
 */
export function fitScaler(rows) {
  const scaler = {}
  for (const name of FEATURES) {
    const values = rows.map((r) => r.features[name])
    const mean = values.reduce((s, v) => s + v, 0) / (values.length || 1)
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length || 1)
    scaler[name] = { mean, std: Math.sqrt(variance) || 1 }
  }
  return scaler
}

const applyScaler = (features, scaler) =>
  FEATURES.map((name) => (features[name] - scaler[name].mean) / scaler[name].std)

/**
 * Fit by gradient descent with L2 regularisation.
 *
 * The penalty is not decoration: with ten correlated technical features and a
 * weak signal, unregularised weights grow large and fit noise confidently.
 */
export function train(rows, { epochs = 300, learningRate = 0.05, l2 = 0.01 } = {}) {
  if (rows.length < 100) return { ok: false, reason: `Need at least 100 samples, got ${rows.length}.` }

  const scaler = fitScaler(rows)
  const X = rows.map((r) => applyScaler(r.features, scaler))
  const y = rows.map((r) => r.label)

  let weights = new Array(FEATURES.length).fill(0)
  let bias = 0

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(FEATURES.length).fill(0)
    let gradB = 0

    for (let i = 0; i < X.length; i++) {
      const error = sigmoid(X[i].reduce((s, x, j) => s + x * weights[j], bias)) - y[i]
      for (let j = 0; j < weights.length; j++) gradW[j] += error * X[i][j]
      gradB += error
    }

    for (let j = 0; j < weights.length; j++) {
      weights[j] -= learningRate * (gradW[j] / X.length + l2 * weights[j])
    }
    bias -= learningRate * (gradB / X.length)
  }

  return {
    ok: true,
    weights,
    bias,
    scaler,
    trainedOn: rows.length,
    baseRate: y.reduce((s, v) => s + v, 0) / y.length,
  }
}

/** Probability that price clears costs over the horizon. */
export function predict(model, features) {
  if (!model?.ok || !features) return null
  const x = applyScaler(features, model.scaler)
  return sigmoid(x.reduce((s, v, j) => s + v * model.weights[j], model.bias))
}

/**
 * Score a model on data it was not trained on.
 *
 * Accuracy alone is misleading when the classes are unbalanced — if only 30% of
 * bars clear costs, a model that always says "no" scores 70% and is useless. So
 * `baseline` (always predicting the majority class) is reported alongside, and
 * `lift` is the only number worth reading.
 */
export function evaluate(model, rows, threshold = 0.5) {
  if (!model?.ok || rows.length === 0) return { ok: false }

  let tp = 0, fp = 0, tn = 0, fn = 0
  for (const row of rows) {
    const p = predict(model, row.features)
    const predicted = p >= threshold ? 1 : 0
    if (predicted === 1 && row.label === 1) tp++
    else if (predicted === 1 && row.label === 0) fp++
    else if (predicted === 0 && row.label === 0) tn++
    else fn++
  }

  const positives = rows.filter((r) => r.label === 1).length
  const majority = Math.max(positives, rows.length - positives) / rows.length
  const accuracy = (tp + tn) / rows.length
  // Of the trades it would actually take, how many worked. This is the number
  // that decides whether the model makes money, not accuracy.
  const precision = tp + fp > 0 ? tp / (tp + fp) : null

  return {
    ok: true,
    samples: rows.length,
    accuracy,
    baseline: majority,
    lift: accuracy - majority,
    precision,
    signalRate: (tp + fp) / rows.length,
    positiveRate: positives / rows.length,
    confusion: { tp, fp, tn, fn },
  }
}

/**
 * Walk-forward validation: train on the past, test on the future, repeat.
 *
 * A single random train/test split is meaningless for time series — shuffling
 * lets the model see next week while learning about this one. Each fold here
 * only ever tests on bars that come after everything it trained on, which is
 * the only arrangement that resembles live trading.
 */
export function walkForward(rows, { folds = 4, minTrain = 200 } = {}) {
  if (rows.length < minTrain * 2) return { ok: false, reason: 'Not enough data for walk-forward.' }

  const results = []
  const testSize = Math.floor((rows.length - minTrain) / folds)

  for (let f = 0; f < folds; f++) {
    const trainEnd = minTrain + f * testSize
    const testEnd = Math.min(trainEnd + testSize, rows.length)
    if (testEnd - trainEnd < 30) break

    const model = train(rows.slice(0, trainEnd))
    if (!model.ok) continue
    const scored = evaluate(model, rows.slice(trainEnd, testEnd))
    if (scored.ok) results.push({ fold: f + 1, trainedOn: trainEnd, ...scored })
  }

  if (!results.length) return { ok: false, reason: 'No fold produced a usable model.' }

  const mean = (key) => results.reduce((s, r) => s + (r[key] ?? 0), 0) / results.length
  return {
    ok: true,
    folds: results,
    meanAccuracy: mean('accuracy'),
    meanBaseline: mean('baseline'),
    meanLift: mean('lift'),
    // The honest headline. Beating a majority-class guess out of sample is the
    // minimum bar; anything less means the model has learned nothing usable.
    beatsBaseline: mean('lift') > 0,
  }
}
