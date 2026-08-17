/**
 * Venue adapters.
 *
 * The execution engine talks to this interface, never to an exchange directly.
 * Today one adapter is implemented — the paper venue, which fills against real
 * live prices with simulated slippage and fees.
 *
 * Binance and Delta are described but NOT implemented, deliberately. Two hard
 * reasons, independent of each other:
 *
 *  1. An exchange API key with trade permission cannot live in a React bundle.
 *     Anything the browser can read, a user (or an extension, or anyone with
 *     devtools) can read too. Real order placement has to run server-side with
 *     the key in the backend environment, IP-allowlisted at the exchange.
 *  2. Placing real orders with real funds is not something this app should do
 *     on its own. Live trading needs an explicit, reviewed decision by the
 *     account owner — plus, in most jurisdictions, attention to whether
 *     automated advice and execution is a regulated activity.
 *
 * If you build the live path later: implement it in the Express backend behind
 * `/api/venues/:venue/order`, develop against the exchange testnets first
 * (testnet.binance.vision, Delta's testnet), and keep a hard kill switch plus
 * per-order and per-day notional caps on the server side.
 */

export const VENUES = [
  {
    id: 'paper',
    name: 'Paper',
    kind: 'simulated',
    assetClasses: ['crypto', 'stocks', 'indices'],
    implemented: true,
    note: 'Fills against live market prices with simulated slippage and fees. No funds at risk.',
  },
  {
    id: 'binance',
    name: 'Binance',
    kind: 'exchange',
    assetClasses: ['crypto'],
    implemented: false,
    note: 'Spot venue. Requires server-side keys; develop against testnet.binance.vision first.',
  },
  {
    id: 'delta',
    name: 'Delta Exchange',
    kind: 'exchange',
    assetClasses: ['crypto'],
    implemented: true,
    requiresBackend: true,
    note: 'Perpetual futures. Orders are signed by the backend, which holds the keys. Defaults to testnet.',
  },
  {
    id: 'broker',
    name: 'Equity broker',
    kind: 'broker',
    assetClasses: ['stocks'],
    implemented: false,
    note: 'Equities need a licensed broker API (Zerodha Kite, Upstox, Alpaca). Yahoo is data only — it cannot execute.',
  },
]

export const DEFAULT_FEE_BPS = 10 // 0.10% per side, a realistic retail taker fee
export const DEFAULT_SLIPPAGE_BPS = 5 // 0.05% adverse fill

/**
 * Paper adapter. Deterministic, synchronous, and honest about costs: every
 * fill pays fee and slippage, so simulated results are not flattered.
 */
export const paperVenue = {
  id: 'paper',
  async submit({ side, qty, price, feeBps = DEFAULT_FEE_BPS, slippageBps = DEFAULT_SLIPPAGE_BPS }) {
    const slip = price * (slippageBps / 10_000)
    const fillPrice = side === 'buy' ? price + slip : price - slip
    const notional = fillPrice * qty
    return {
      accepted: true,
      fillPrice: +fillPrice.toFixed(6),
      fee: +((notional * feeBps) / 10_000).toFixed(4),
      filledAt: Date.now(),
      venue: 'paper',
      simulated: true,
    }
  },
}

const API = import.meta.env?.VITE_API_URL || ''

/**
 * Delta adapter. Sends the order to our own backend, which signs it with the
 * API secret and forwards it to Delta. The browser never sees a credential and
 * cannot reach Delta's private endpoints directly.
 *
 * Delta trades whole contracts, so `size` is an integer contract count rather
 * than a fractional quantity.
 */
/** Internal asset symbols → Delta perpetual products. */
export const DELTA_ASSETS = ['ETH', 'BTC', 'SOL']

export const deltaTradable = (symbol) => DELTA_ASSETS.includes(symbol)

export const deltaVenue = {
  id: 'delta',

  async status() {
    const res = await fetch(`${API}/api/venues/delta/status`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'Delta status unavailable')
    return json.data
  },

  async submit({ side, qty, symbol, orderType = 'market_order', limitPrice = null, reduceOnly = false }) {
    if (!deltaTradable(symbol)) throw new Error(`${symbol} is not routable to Delta. Available: ${DELTA_ASSETS.join(', ')}.`)

    const res = await fetch(`${API}/api/venues/delta/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Size is sent in the underlying asset; the backend converts to whole
      // contracts using the product's own contract_value.
      // The backend maps asset → product for its configured region.
      body: JSON.stringify({ asset: symbol, side, assetQty: qty, orderType, limitPrice, reduceOnly }),
    })
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'Delta rejected the order')

    const order = json.data
    return {
      accepted: true,
      orderId: order.id,
      fillPrice: Number(order.average_fill_price ?? order.limit_price ?? order.markPrice ?? 0) || null,
      fee: null,
      filledAt: Date.now(),
      venue: 'delta',
      environment: order.environment,
      contracts: order.contracts,
      simulated: !order.live,
      raw: order,
    }
  },

  async positions() {
    const res = await fetch(`${API}/api/venues/delta/positions`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'Could not read Delta positions')
    return json.data
  },

  async balances() {
    const res = await fetch(`${API}/api/venues/delta/balances`)
    const json = await res.json()
    if (!json.ok) throw new Error(json.error || 'Could not read Delta balances')
    return json.data
  },
}

export function getVenue(id) {
  if (id === 'paper') return paperVenue
  if (id === 'delta') return deltaVenue
  const meta = VENUES.find((v) => v.id === id)
  throw new Error(
    `Venue "${meta?.name ?? id}" is not implemented. Live order placement must run server-side — see src/lib/venues.js.`,
  )
}
