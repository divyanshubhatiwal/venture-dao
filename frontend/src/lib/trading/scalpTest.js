import { DEFAULT_FEE_BPS, DEFAULT_SLIPPAGE_BPS } from './venues.js'

/**
 * Simulates the "take a tiny profit, never take a loss" strategy.
 *
 * Buy, exit the moment price is up `takeProfitPercent`, repeat. If
 * `allowStop` is false, a position that goes the wrong way is simply held
 * until it comes back — the "never sell at a loss" rule.
 *
 * This exists to be measured, not recommended. Two costs decide the outcome:
 *
 *   1. Fees are charged on BOTH sides of every round trip. At a 0.1% take
 *      profit and 0.1% round-trip cost, a winning trade nets roughly zero
 *      before slippage — the strategy is behind before price moves.
 *   2. Refusing to sell at a loss does not remove the loss. It converts a
 *      realised loss into an open one, which keeps growing while capital sits
 *      trapped. `maxOpenLossPercent` and `barsStuck` below are where that shows.
 */
export function scalpTest(candles, options = {}) {
  const {
    takeProfitPercent = 0.1,
    allowStop = false,
    stopPercent = 0.5,
    feeBps = DEFAULT_FEE_BPS,
    slippageBps = DEFAULT_SLIPPAGE_BPS,
    startingCash = 100,
  } = options

  if (!candles || candles.length < 20) {
    return { ok: false, reason: `Need at least 20 candles; got ${candles?.length ?? 0}.` }
  }

  const fee = (notional) => (notional * feeBps) / 10_000
  const slip = (price, side) => price * (1 + (side === 'buy' ? 1 : -1) * (slippageBps / 10_000))

  let cash = startingCash
  let position = null
  const trades = []
  let feesPaid = 0
  let maxOpenLossPercent = 0
  let longestStuck = 0

  for (let i = 1; i < candles.length; i++) {
    const bar = candles[i]

    if (position) {
      position.bars += 1
      const openLoss = ((position.entry - bar.low) / position.entry) * 100
      if (openLoss > maxOpenLossPercent) maxOpenLossPercent = openLoss
      if (position.bars > longestStuck) longestStuck = position.bars

      const hitTarget = bar.high >= position.target
      const hitStop = allowStop && bar.low <= position.stop

      // Pessimistic: if a bar covers both, assume the stop filled first.
      if (hitStop || hitTarget) {
        const exitPrice = hitStop ? position.stop : position.target
        const fill = slip(exitPrice, 'sell')
        const exitFee = fee(fill * position.qty)
        const gross = (fill - position.entry) * position.qty
        const net = gross - exitFee - position.entryFee

        cash += position.entry * position.qty + net
        feesPaid += exitFee + position.entryFee
        trades.push({
          entry: +position.entry.toFixed(4),
          exit: +fill.toFixed(4),
          gross: +gross.toFixed(4),
          net: +net.toFixed(4),
          bars: position.bars,
          reason: hitStop ? 'stop' : 'target',
        })
        position = null
      }
    }

    if (!position) {
      const entry = slip(bar.close, 'buy')
      const qty = cash / entry
      const entryFee = fee(entry * qty)
      cash -= entry * qty
      position = {
        entry,
        qty,
        entryFee,
        target: entry * (1 + takeProfitPercent / 100),
        stop: entry * (1 - stopPercent / 100),
        bars: 0,
      }
    }
  }

  // Whatever is still open at the end is marked to the last price — an unsold
  // loser is still a loss, it just has not been admitted yet.
  const last = candles[candles.length - 1].close
  let openValue = 0
  let openPnl = 0
  if (position) {
    openValue = last * position.qty
    openPnl = (last - position.entry) * position.qty
  }

  const equity = cash + openValue
  const wins = trades.filter((t) => t.net > 0)

  return {
    ok: true,
    startingCash,
    equity: +equity.toFixed(4),
    netPnl: +(equity - startingCash).toFixed(4),
    returnPercent: +(((equity - startingCash) / startingCash) * 100).toFixed(3),
    tradeCount: trades.length,
    winRate: trades.length ? +((wins.length / trades.length) * 100).toFixed(1) : null,
    feesPaid: +feesPaid.toFixed(4),
    grossPnl: +trades.reduce((s, t) => s + t.gross, 0).toFixed(4),
    avgNetPerTrade: trades.length ? +(trades.reduce((s, t) => s + t.net, 0) / trades.length).toFixed(4) : 0,
    stillHolding: Boolean(position),
    openPnl: +openPnl.toFixed(4),
    openLossPercentNow: position ? +(((position.entry - last) / position.entry) * 100).toFixed(2) : 0,
    maxOpenLossPercent: +maxOpenLossPercent.toFixed(2),
    longestStuckBars: longestStuck,
    trades,
  }
}
