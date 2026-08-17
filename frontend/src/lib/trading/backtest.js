import { DEFAULT_FEE_BPS, DEFAULT_SLIPPAGE_BPS } from './venues.js'
import { MIN_CANDLES, generateSignal } from './signals.js'

/**
 * Walk-forward backtest of the signal engine.
 *
 * Rules that keep the result honest rather than flattering:
 *
 *  - No look-ahead. The signal at bar i is computed from candles[0..i] only,
 *    and the position is entered at the OPEN of bar i+1 — the price you could
 *    actually have got, not the close you already knew.
 *  - Pessimistic intrabar fills. If a bar's range touches both the stop and the
 *    target, the stop is assumed to have hit first. Real life is rarely kinder.
 *  - Costs on both sides. Fee and slippage are charged on entry and exit, which
 *    is what turns many "profitable" strategies into losing ones.
 *
 * It still cannot tell you the future: one symbol over a few hundred bars is a
 * small sample, and a strategy that worked in this window can fail in the next.
 */
export function backtest(candles, options = {}) {
  const {
    startingCash = 10_000,
    riskPct = 1,
    maxNotionalPct = 20,
    minConfidence = 65,
    feeBps = DEFAULT_FEE_BPS,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    maxHoldBars = 48,
    trailing = false,
  } = options

  if (!candles || candles.length < MIN_CANDLES + 10) {
    return { ok: false, reason: `Need at least ${MIN_CANDLES + 10} candles to backtest; got ${candles?.length ?? 0}.` }
  }

  const cost = (price, side) => price * (1 + (side === 'buy' ? 1 : -1) * (slippageBps / 10_000))
  const fee = (notional) => (notional * feeBps) / 10_000

  let cash = startingCash
  let position = null
  const trades = []
  const equityCurve = []

  for (let i = MIN_CANDLES; i < candles.length - 1; i++) {
    const bar = candles[i]
    const next = candles[i + 1]

    /* ---- manage an open position on this bar ---- */
    if (position) {
      position.barsHeld += 1

      if (trailing) {
        // Ratchet the stop behind price, never loosening it.
        const trail = position.risk
        if (position.side === 'long') position.stop = Math.max(position.stop, bar.close - trail)
        else position.stop = Math.min(position.stop, bar.close + trail)
      }

      const hitStop = position.side === 'long' ? bar.low <= position.stop : bar.high >= position.stop
      const hitTarget = position.side === 'long' ? bar.high >= position.target : bar.low <= position.target
      const expired = position.barsHeld >= maxHoldBars

      let exitPrice = null
      let reason = null
      // Stop is checked first on purpose — the pessimistic assumption.
      if (hitStop) {
        exitPrice = position.stop
        reason = 'stop'
      } else if (hitTarget) {
        exitPrice = position.target
        reason = 'target'
      } else if (expired) {
        exitPrice = bar.close
        reason = 'time'
      }

      if (exitPrice != null) {
        const exitSide = position.side === 'long' ? 'sell' : 'buy'
        const fill = cost(exitPrice, exitSide)
        const notional = fill * position.qty
        const gross = position.side === 'long' ? (fill - position.entry) * position.qty : (position.entry - fill) * position.qty
        const pnl = gross - fee(notional) - position.entryFee

        cash += pnl
        trades.push({
          symbol: position.symbol,
          side: position.side,
          entry: +position.entry.toFixed(4),
          exit: +fill.toFixed(4),
          qty: +position.qty.toFixed(6),
          pnl: +pnl.toFixed(2),
          pnlPct: +((pnl / (position.entry * position.qty)) * 100).toFixed(2),
          bars: position.barsHeld,
          reason,
          openedAt: position.openedAt,
          closedAt: bar.time,
        })
        position = null
      }
    }

    /* ---- look for a new entry ---- */
    if (!position) {
      const signal = generateSignal(candles.slice(0, i + 1))
      if (signal.ok && signal.direction !== 'flat' && signal.confidence >= minConfidence) {
        const side = signal.direction === 'long' ? 'buy' : 'sell'
        // Entry at the next bar's open — the first price actually tradeable.
        const entry = cost(next.open, side)
        const perUnitRisk = Math.abs(entry - signal.levels.stop)

        if (perUnitRisk > 0) {
          let qty = (cash * (riskPct / 100)) / perUnitRisk
          const maxNotional = cash * (maxNotionalPct / 100)
          if (qty * entry > maxNotional) qty = maxNotional / entry

          if (qty > 0) {
            const entryFee = fee(entry * qty)
            position = {
              symbol: signal.symbol,
              side: signal.direction,
              entry,
              qty,
              stop: signal.levels.stop,
              target: signal.levels.target,
              risk: perUnitRisk,
              entryFee,
              barsHeld: 0,
              openedAt: next.time,
            }
          }
        }
      }
    }

    const openPnl = position
      ? (position.side === 'long' ? bar.close - position.entry : position.entry - bar.close) * position.qty
      : 0
    equityCurve.push({ t: bar.time, equity: +(cash + openPnl).toFixed(2) })
  }

  return { ok: true, ...summarise(trades, equityCurve, startingCash, candles) }
}

function summarise(trades, equityCurve, startingCash, candles) {
  const wins = trades.filter((t) => t.pnl > 0)
  const losses = trades.filter((t) => t.pnl <= 0)
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0)

  // Maximum peak-to-trough decline in account equity.
  let peak = startingCash
  let maxDrawdown = 0
  equityCurve.forEach(({ equity }) => {
    peak = Math.max(peak, equity)
    maxDrawdown = Math.max(maxDrawdown, ((peak - equity) / peak) * 100)
  })

  // Buy and hold over the same window, as the benchmark that matters.
  const first = candles[MIN_CANDLES]
  const last = candles[candles.length - 1]
  const buyHold = ((last.close - first.close) / first.close) * 100

  return {
    trades,
    equityCurve,
    metrics: {
      tradeCount: trades.length,
      winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : null,
      netPnl: +netPnl.toFixed(2),
      totalReturn: +((netPnl / startingCash) * 100).toFixed(2),
      buyHoldReturn: +buyHold.toFixed(2),
      // Gross profit ÷ gross loss. Below 1.0 means the strategy loses money.
      profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? Infinity : 0,
      // Average P&L per trade — the number that decides whether to trade at all.
      expectancy: trades.length ? +(netPnl / trades.length).toFixed(2) : 0,
      avgWin: wins.length ? +(grossWin / wins.length).toFixed(2) : 0,
      avgLoss: losses.length ? +(grossLoss / losses.length).toFixed(2) : 0,
      maxDrawdown: +maxDrawdown.toFixed(2),
      avgBars: trades.length ? +(trades.reduce((s, t) => s + t.bars, 0) / trades.length).toFixed(1) : 0,
      stopped: trades.filter((t) => t.reason === 'stop').length,
      targeted: trades.filter((t) => t.reason === 'target').length,
      timedOut: trades.filter((t) => t.reason === 'time').length,
    },
  }
}

/**
 * Verdict on whether a backtest justifies trading the strategy live.
 * Deliberately strict: the default answer is no.
 */
export function verdict(metrics) {
  if (!metrics || metrics.tradeCount === 0) {
    return { pass: false, tone: 'slate', label: 'No trades', detail: 'The filters never triggered in this window. Nothing to judge.' }
  }
  if (metrics.tradeCount < 10) {
    return {
      pass: false,
      tone: 'amber',
      label: 'Sample too small',
      detail: `${metrics.tradeCount} trades cannot separate skill from luck. Thirty-plus is a starting point, and even that is thin.`,
    }
  }
  if (metrics.profitFactor < 1) {
    return {
      pass: false,
      tone: 'rose',
      label: 'Loses money',
      detail: `Profit factor ${metrics.profitFactor} — gross losses exceed gross wins. Trading this live would burn the account.`,
    }
  }
  if (metrics.expectancy <= 0) {
    return { pass: false, tone: 'rose', label: 'Negative expectancy', detail: 'The average trade loses money after costs.' }
  }
  if (metrics.totalReturn < metrics.buyHoldReturn) {
    return {
      pass: false,
      tone: 'amber',
      label: 'Beaten by buy and hold',
      detail: `${metrics.totalReturn}% against ${metrics.buyHoldReturn}% for doing nothing — all that trading added risk, not return.`,
    }
  }
  return {
    pass: true,
    tone: 'emerald',
    label: 'Positive in this window',
    detail: `Profit factor ${metrics.profitFactor}, expectancy ${metrics.expectancy} per trade, max drawdown ${metrics.maxDrawdown}%. One window is not proof — it held here, which is all this says.`,
  }
}
