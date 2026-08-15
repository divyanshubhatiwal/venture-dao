import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getVenue } from '../lib/venues'

const TradingContext = createContext(null)

export function useTrading() {
  const ctx = useContext(TradingContext)
  if (!ctx) throw new Error('useTrading must be used inside <TradingProvider>')
  return ctx
}

const STORAGE_KEY = 'venturedao.paper.v1'
const STARTING_CASH = 100_000

const emptyState = () => ({
  cash: STARTING_CASH,
  startingCash: STARTING_CASH,
  positions: [],
  orders: [],
  trades: [],
  equityCurve: [{ t: Date.now(), equity: STARTING_CASH }],
})

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw)
    return { ...emptyState(), ...parsed }
  } catch {
    return emptyState()
  }
}

const uid = () => Math.random().toString(36).slice(2, 10)

/**
 * Paper-trading execution engine.
 *
 * Orders fill against real live prices through a venue adapter, with slippage
 * and fees charged on every fill, and stops/targets checked on each price tick.
 * The account persists in localStorage so a session survives a reload.
 *
 * Nothing here touches a real exchange or real funds — see src/lib/venues.js
 * for why live execution belongs on the server, not in the browser.
 */
export function TradingProvider({ children }) {
  const [state, setState] = useState(load)
  const [prices, setPrices] = useState({})
  const [log, setLog] = useState([])
  const pricesRef = useRef(prices)
  pricesRef.current = prices
  // Order checks run outside render, so they read state through a ref rather
  // than a closure that may be a tick behind.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const note = useCallback((kind, text) => {
    setLog((l) => [{ id: uid(), kind, text, at: Date.now() }, ...l].slice(0, 60))
  }, [])

  /** Feed the engine the latest marks; drives fills, stops and targets. */
  const updatePrices = useCallback((map) => {
    setPrices((prev) => ({ ...prev, ...map }))
  }, [])

  const priceOf = useCallback((symbol) => pricesRef.current[symbol] ?? null, [])

  /* ---------- order entry ---------- */

  const placeOrder = useCallback(
    async ({ symbol, assetClass = 'crypto', side, type = 'market', qty, limitPrice, stop, target, venue = 'paper', source = 'manual' }) => {
      const mark = pricesRef.current[symbol]
      if (!mark) throw new Error(`No live price for ${symbol} yet.`)
      if (!qty || qty <= 0) throw new Error('Quantity must be greater than zero.')

      // Buying power: a cash account cannot spend more than it holds. Closing
      // an existing position is always allowed — it releases capital.
      const stateNow = stateRef.current
      const closing = stateNow.positions.some(
        (p) => p.symbol === symbol && ((p.side === 'long' && side === 'sell') || (p.side === 'short' && side === 'buy')),
      )
      if (side === 'buy' && !closing && mark * qty > stateNow.cash) {
        throw new Error(`Insufficient buying power: order needs ${(mark * qty).toFixed(2)}, account holds ${stateNow.cash.toFixed(2)}.`)
      }

      const order = {
        id: uid(),
        symbol,
        assetClass,
        side,
        type,
        qty,
        limitPrice: type === 'limit' ? limitPrice : null,
        stop: stop ?? null,
        target: target ?? null,
        venue,
        source,
        status: type === 'market' ? 'filling' : 'working',
        createdAt: Date.now(),
      }

      if (type === 'limit') {
        setState((s) => ({ ...s, orders: [order, ...s.orders] }))
        note('order', `${side.toUpperCase()} ${qty} ${symbol} limit @ ${limitPrice}`)
        return order
      }

      const adapter = getVenue(venue)
      // Symbol is passed through because exchange adapters need it to resolve a
      // product; the paper adapter ignores it.
      const receipt = await adapter.submit({ side, qty, price: mark, symbol })
      // An exchange market order may not report a fill price synchronously —
      // fall back to the mark so the position is not booked at zero.
      applyFill(order, { ...receipt, fillPrice: receipt.fillPrice ?? mark, fee: receipt.fee ?? 0 })
      return { ...order, ...receipt }
    },
    // applyFill is stable via useCallback below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note],
  )

  const applyFill = useCallback(
    (order, receipt) => {
      setState((s) => {
        const filled = { ...order, status: 'filled', fillPrice: receipt.fillPrice, fee: receipt.fee, filledAt: receipt.filledAt }

        // Closing an existing opposite position rather than opening a new one?
        const existing = s.positions.find((p) => p.symbol === order.symbol)
        if (existing && ((existing.side === 'long' && order.side === 'sell') || (existing.side === 'short' && order.side === 'buy'))) {
          const closeQty = Math.min(existing.qty, order.qty)
          const pnl =
            existing.side === 'long'
              ? (receipt.fillPrice - existing.entry) * closeQty - receipt.fee - existing.fee
              : (existing.entry - receipt.fillPrice) * closeQty - receipt.fee - existing.fee

          const remaining = existing.qty - closeQty
          const trade = {
            ...existing,
            exit: receipt.fillPrice,
            exitAt: receipt.filledAt,
            qty: closeQty,
            pnl: +pnl.toFixed(2),
            pnlPct: +((pnl / (existing.entry * closeQty)) * 100).toFixed(2),
            reason: order.reason || (order.source === 'agent' ? 'agent close' : 'manual close'),
          }

          // Selling a long credits cash; buying back a short debits it.
          const proceeds = existing.side === 'long' ? receipt.fillPrice * closeQty : -(receipt.fillPrice * closeQty)

          return {
            ...s,
            cash: s.cash + proceeds - receipt.fee,
            positions: remaining > 0 ? s.positions.map((p) => (p.id === existing.id ? { ...p, qty: remaining } : p)) : s.positions.filter((p) => p.id !== existing.id),
            orders: [filled, ...s.orders.filter((o) => o.id !== order.id)],
            trades: [trade, ...s.trades],
          }
        }

        // Otherwise open a position.
        const position = {
          id: uid(),
          symbol: order.symbol,
          assetClass: order.assetClass,
          side: order.side === 'buy' ? 'long' : 'short',
          qty: order.qty,
          entry: receipt.fillPrice,
          stop: order.stop,
          target: order.target,
          fee: receipt.fee,
          venue: order.venue,
          source: order.source,
          openedAt: receipt.filledAt,
        }
        const notional = receipt.fillPrice * order.qty
        return {
          ...s,
          cash: s.cash + (order.side === 'buy' ? -notional : notional) - receipt.fee,
          positions: [position, ...s.positions],
          orders: [filled, ...s.orders.filter((o) => o.id !== order.id)],
        }
      })
      note('fill', `${order.side.toUpperCase()} ${order.qty} ${order.symbol} filled @ ${receipt.fillPrice}`)
    },
    [note],
  )

  const closePosition = useCallback(
    async (positionId, reason = 'manual close') => {
      const position = state.positions.find((p) => p.id === positionId)
      if (!position) return null
      const mark = pricesRef.current[position.symbol]
      if (!mark) throw new Error(`No live price for ${position.symbol}.`)

      const adapter = getVenue(position.venue ?? 'paper')
      const side = position.side === 'long' ? 'sell' : 'buy'
      const receipt = await adapter.submit({ side, qty: position.qty, price: mark })
      applyFill(
        { id: uid(), symbol: position.symbol, assetClass: position.assetClass, side, type: 'market', qty: position.qty, venue: position.venue, source: 'manual', reason },
        receipt,
      )
      return receipt
    },
    [state.positions, applyFill],
  )

  const cancelOrder = useCallback(
    (orderId) => {
      setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' } : o)) }))
      note('order', 'Order cancelled')
    },
    [note],
  )

  const reset = useCallback(() => {
    setState(emptyState())
    setLog([])
    note('system', 'Paper account reset to $100,000')
  }, [note])

  /* ---------- engine tick: limit fills, stops, targets ---------- */

  useEffect(() => {
    const working = state.orders.filter((o) => o.status === 'working')
    working.forEach(async (order) => {
      const mark = prices[order.symbol]
      if (!mark) return
      const crossed = order.side === 'buy' ? mark <= order.limitPrice : mark >= order.limitPrice
      if (!crossed) return
      const adapter = getVenue(order.venue ?? 'paper')
      const receipt = await adapter.submit({ side: order.side, qty: order.qty, price: order.limitPrice })
      applyFill(order, receipt)
    })

    state.positions.forEach(async (position) => {
      const mark = prices[position.symbol]
      if (!mark) return
      const hitStop = position.stop != null && (position.side === 'long' ? mark <= position.stop : mark >= position.stop)
      const hitTarget = position.target != null && (position.side === 'long' ? mark >= position.target : mark <= position.target)
      if (!hitStop && !hitTarget) return

      const adapter = getVenue(position.venue ?? 'paper')
      const side = position.side === 'long' ? 'sell' : 'buy'
      const receipt = await adapter.submit({ side, qty: position.qty, price: mark })
      applyFill(
        {
          id: uid(),
          symbol: position.symbol,
          assetClass: position.assetClass,
          side,
          type: 'market',
          qty: position.qty,
          venue: position.venue,
          source: position.source,
          reason: hitStop ? 'stop hit' : 'target hit',
        },
        receipt,
      )
      note(hitStop ? 'stop' : 'target', `${position.symbol} ${hitStop ? 'stopped out' : 'hit target'} @ ${mark}`)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prices])

  /* ---------- derived ---------- */

  const marked = useMemo(() => {
    const positions = state.positions.map((p) => {
      const mark = prices[p.symbol] ?? p.entry
      const unrealised = p.side === 'long' ? (mark - p.entry) * p.qty : (p.entry - mark) * p.qty
      return { ...p, mark, unrealised: +unrealised.toFixed(2), unrealisedPct: +((unrealised / (p.entry * p.qty)) * 100).toFixed(2) }
    })
    // Opening a long spends cash for stock; opening a short credits cash and
    // owes stock. Equity nets the market value of both against cash.
    const longValue = positions.filter((p) => p.side === 'long').reduce((s, p) => s + p.mark * p.qty, 0)
    const shortValue = positions.filter((p) => p.side === 'short').reduce((s, p) => s + p.mark * p.qty, 0)
    const equity = state.cash + longValue - shortValue

    const openPnl = positions.reduce((s, p) => s + p.unrealised, 0)
    const realised = state.trades.reduce((s, t) => s + t.pnl, 0)
    const wins = state.trades.filter((t) => t.pnl > 0).length

    return {
      positions,
      exposure: +(longValue + shortValue).toFixed(2),
      openPnl: +openPnl.toFixed(2),
      realised: +realised.toFixed(2),
      equity: +equity.toFixed(2),
      totalReturn: +(((equity - state.startingCash) / state.startingCash) * 100).toFixed(2),
      winRate: state.trades.length ? +((wins / state.trades.length) * 100).toFixed(0) : null,
      closedCount: state.trades.length,
    }
  }, [state, prices])

  // Sample the equity curve at most once a minute to keep it light.
  useEffect(() => {
    const timer = setInterval(() => {
      setState((s) => ({ ...s, equityCurve: [...s.equityCurve, { t: Date.now(), equity: marked.equity }].slice(-240) }))
    }, 60_000)
    return () => clearInterval(timer)
  }, [marked.equity])

  const value = useMemo(
    () => ({
      ...state,
      ...marked,
      prices,
      log,
      updatePrices,
      priceOf,
      placeOrder,
      closePosition,
      cancelOrder,
      reset,
    }),
    [state, marked, prices, log, updatePrices, priceOf, placeOrder, closePosition, cancelOrder, reset],
  )

  return <TradingContext.Provider value={value}>{children}</TradingContext.Provider>
}
