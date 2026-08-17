import { WATCHLIST } from './marketApi.js'

/**
 * Real-time crypto prices over Binance's public WebSocket.
 *
 * Polling a REST endpoint every 30 seconds is not live — marks sit still and
 * P&L looks frozen. This streams roughly one tick per second per symbol, with
 * no API key, and reconnects with backoff if the socket drops.
 *
 * Equities have no comparable public stream, so those stay on a fast poll (see
 * MarketContext). When a stock market is closed the price genuinely does not
 * move; the UI says so rather than inventing movement.
 */

const ENDPOINT = 'wss://stream.binance.com:9443/stream'
const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000

let socket = null
let subscribers = new Set()
let reconnectAttempt = 0
let reconnectTimer = null
let closedByUs = false

const symbolFor = new Map(WATCHLIST.map((c) => [c.binance.toUpperCase(), c.symbol]))

function streamPath() {
  return WATCHLIST.map((c) => `${c.binance.toLowerCase()}@ticker`).join('/')
}

function emit(payload) {
  subscribers.forEach((fn) => {
    try {
      fn(payload)
    } catch (err) {
      if (import.meta.env?.DEV) console.warn('[priceStream] subscriber threw:', err)
    }
  })
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return
  closedByUs = false

  try {
    socket = new WebSocket(`${ENDPOINT}?streams=${streamPath()}`)
  } catch {
    scheduleReconnect()
    return
  }

  socket.onopen = () => {
    reconnectAttempt = 0
    emit({ type: 'status', connected: true })
  }

  socket.onmessage = (event) => {
    try {
      const frame = JSON.parse(event.data)
      const t = frame?.data
      if (!t?.s) return
      const symbol = symbolFor.get(t.s.toUpperCase())
      if (!symbol) return
      emit({
        type: 'tick',
        symbol,
        price: +t.c,
        change24h: +t.P,
        high24h: +t.h,
        low24h: +t.l,
        at: t.E ?? Date.now(),
      })
    } catch {
      /* malformed frame — ignore rather than kill the socket */
    }
  }

  socket.onclose = () => {
    emit({ type: 'status', connected: false })
    if (!closedByUs) scheduleReconnect()
  }

  socket.onerror = () => {
    try {
      socket.close()
    } catch {
      /* already closing */
    }
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer)
  const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt)
  reconnectAttempt += 1
  reconnectTimer = setTimeout(connect, delay)
}

/** Subscribe to live ticks. Returns an unsubscribe function. */
export function subscribePrices(callback) {
  subscribers.add(callback)
  connect()

  return () => {
    subscribers.delete(callback)
    if (subscribers.size === 0) {
      closedByUs = true
      clearTimeout(reconnectTimer)
      try {
        socket?.close()
      } catch {
        /* nothing to close */
      }
      socket = null
    }
  }
}

export function streamConnected() {
  return socket?.readyState === WebSocket.OPEN
}
