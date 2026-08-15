import ccxt from 'ccxt'
import { redact } from '../vault.js'

/**
 * Exchange access through CCXT.
 *
 * The hand-rolled Delta client in server/delta.js works, but every exchange
 * integration re-solves the same unglamorous problems — request signing, clock
 * skew, rate limits, symbol naming, tick and lot rounding, per-venue order
 * semantics — and this project already lost time to two of them: a signature
 * rejected for a 15-second clock drift, and a key that only authenticated
 * against one region. CCXT is a maintained library that has solved those for
 * ~100 venues, and it is MIT licensed, so using it carries no obligation on
 * this codebase. (Titan, where the idea came from, is GPL-3.0 — its code is
 * not copied here for exactly that reason.)
 *
 * delta.js is deliberately left in place. It is proven against the testnet and
 * ripping it out to prove a point would trade working code for unproven code.
 * This is an additional venue adapter, chosen by configuration.
 */

/**
 * Delta runs two separate universes and a key is only valid in the one it was
 * created in — a fact that cost real debugging time here. CCXT ships the
 * global hosts, so the India ones are supplied explicitly.
 */
const REGION_HOSTS = {
  india: { testnet: 'https://cdn-ind.testnet.deltaex.org', live: 'https://api.india.delta.exchange' },
  global: { testnet: null, live: null }, // null = use CCXT's own defaults
}

export function createExchange({ region = 'india', live = false, apiKey = '', secret = '', timeout = 15_000 } = {}) {
  const exchange = new ccxt.delta({
    apiKey,
    secret,
    timeout,
    // Never disable this. CCXT queues requests to stay inside the venue's
    // published limits; without it a scanning loop earns a ban, not an error.
    enableRateLimit: true,
  })

  if (!live) exchange.setSandboxMode(true)

  const host = REGION_HOSTS[region]?.[live ? 'live' : 'testnet']
  if (host) {
    // urls.api is a string on some exchanges and a map on others; rewrite
    // whichever shape this build uses rather than assuming one.
    exchange.urls.api = typeof exchange.urls.api === 'string' ? host : Object.fromEntries(Object.keys(exchange.urls.api).map((k) => [k, host]))
  }

  return exchange
}

/**
 * Align the signing clock with the venue's.
 *
 * Delta rejects any signature whose timestamp drifts more than a few seconds
 * from its own clock, and this machine runs ~20s fast. CCXT measures the
 * difference but does not apply it to Delta's signing path — setting
 * `adjustForTimeDifference` alone still produced `expired_signature` — so the
 * timestamp source is overridden directly. Without this every authenticated
 * call fails with an error that reads exactly like a bad key.
 *
 * Returns the measured drift in milliseconds, or null if it could not be read;
 * a failure here is not fatal, it just leaves the clock uncorrected.
 */
export async function syncClock(exchange) {
  try {
    const driftMs = await exchange.loadTimeDifference()
    if (!Number.isFinite(driftMs)) return null
    const base = exchange.seconds.bind(exchange)
    const offset = Math.ceil(driftMs / 1000)
    exchange.seconds = () => base() - offset
    return driftMs
  } catch {
    return null
  }
}

/** Errors are re-thrown with secrets stripped — CCXT echoes request context. */
function safeError(err, action) {
  const detail = typeof err?.message === 'string' ? err.message : String(err)
  const clean = JSON.stringify(redact({ detail })).slice(0, 400)
  const out = new Error(`${action} failed: ${clean}`)
  out.kind = err?.constructor?.name ?? 'Error'
  // Authentication and permission failures must not look like transient
  // network trouble, or a caller will retry them forever.
  out.retryable = err instanceof ccxt.NetworkError && !(err instanceof ccxt.AuthenticationError)
  return out
}

/**
 * A venue adapter with the interface the bot engine already expects, so
 * swapping paper for a real exchange changes one object and nothing else.
 */
export function createCcxtVenue({ region = 'india', live = false, apiKey = '', secret = '', killSwitch = () => false, maxOrderNotional = null } = {}) {
  const exchange = createExchange({ region, live, apiKey, secret })
  let markets = null
  let clockSynced = null

  // Synced once, lazily, before the first authenticated call.
  const ensureClock = async () => {
    if (clockSynced === null) clockSynced = await syncClock(exchange)
    return clockSynced
  }

  const loadMarkets = async () => {
    if (!markets) markets = await exchange.loadMarkets()
    return markets
  }

  /**
   * Resolve a plain symbol to a real contract, and size it in the venue's own
   * units. Contract size, tick and lot rules come from exchange metadata —
   * hardcoding "1 ETHUSD = 0.01 ETH" is right until the day the exchange
   * changes it and every order is silently 100× wrong.
   */
  const resolve = async (symbol) => {
    const all = await loadMarkets()
    const quote = live || region === 'india' ? 'USD' : 'USDT'
    const perp = `${symbol}/${quote}:${quote}`
    const market = all[perp] ?? all[`${symbol}/${quote}`]
    if (!market) throw new Error(`${symbol} is not tradable here (looked for ${perp}).`)
    return market
  }

  /**
   * Stops and targets the engine intended when it opened each position.
   *
   * The exchange reports size and entry, not our thesis, so the protective
   * levels have to be remembered here. This is deliberately in-memory and
   * therefore lost on restart — see markToMarket, which refuses to manage a
   * position it has no recorded intent for rather than inventing one.
   */
  const intents = new Map()

  return {
    exchange,
    loadMarkets,
    resolve,
    ensureClock,
    intents,

    /** Contracts for a desired quantity of the underlying, venue-rounded. */
    async toContracts(symbol, assetQty) {
      const market = await resolve(symbol)
      const size = market.contractSize ?? 1
      const raw = assetQty / size
      const rounded = Number(exchange.amountToPrecision(market.symbol, raw))
      const min = market.limits?.amount?.min
      if (min != null && rounded < min) throw new Error(`Size ${rounded} is below the venue minimum of ${min} contracts.`)
      return { market, contracts: rounded, contractSize: size }
    },

    async getAccount() {
      try {
        await ensureClock()
        const balance = await exchange.fetchBalance()
        const quote = region === 'india' ? 'USD' : 'USDT'
        const cash = balance[quote] ?? balance.total?.[quote] ?? {}
        return {
          balance: Number(cash.total ?? 0),
          availableMargin: Number(cash.free ?? 0),
          currency: quote,
          raw: undefined, // deliberately not surfaced; it echoes request context
        }
      } catch (err) {
        throw safeError(err, 'fetchBalance')
      }
    },

    async getPositions() {
      try {
        await ensureClock()
        const positions = await exchange.fetchPositions()
        return positions
          .filter((p) => Number(p.contracts ?? 0) !== 0)
          .map((p) => ({
            symbol: p.symbol,
            side: p.side,
            qty: Number(p.contracts),
            entry: Number(p.entryPrice),
            mark: Number(p.markPrice),
            liquidation: p.liquidationPrice != null ? Number(p.liquidationPrice) : null,
            leverage: p.leverage != null ? Number(p.leverage) : null,
            unrealised: p.unrealizedPnl != null ? Number(p.unrealizedPnl) : null,
          }))
      } catch (err) {
        throw safeError(err, 'fetchPositions')
      }
    },

    async killSwitchEngaged() {
      return Boolean(killSwitch())
    },

    /**
     * Place an order. The notional cap is re-checked here even though the
     * engine already checked it: this is the last point before money moves,
     * and a guard is worth more at the boundary than upstream.
     */
    async submitOrder({ symbol, side, qty, price, stop = null, target = null, clientOrderId, reduceOnly = false, type = 'market' }) {
      if (killSwitch()) throw new Error('Kill switch engaged; refusing to submit.')
      try {
        await ensureClock()
        const { market, contracts } = await this.toContracts(symbol, qty)
        const notional = contracts * (market.contractSize ?? 1) * price
        if (maxOrderNotional != null && notional > maxOrderNotional) {
          throw new Error(`Notional ${notional.toFixed(2)} exceeds the server cap of ${maxOrderNotional}.`)
        }

        const params = { reduce_only: reduceOnly }
        if (clientOrderId) params.client_order_id = clientOrderId
        const order = await exchange.createOrder(market.symbol, type, side, contracts, type === 'limit' ? price : undefined, params)

        // Remember the protective levels for this position; markToMarket has
        // no other source for them.
        if (!reduceOnly && (stop != null || target != null)) intents.set(market.symbol, { stop, target })

        // The venue's own id and status, never an assumption that it filled.
        return {
          orderId: order.id,
          status: order.status ?? 'open',
          filled: Number(order.filled ?? 0),
          remaining: Number(order.remaining ?? contracts),
          fillPrice: order.average ?? order.price ?? null,
          fee: order.fee?.cost ?? null,
          contracts,
          symbol: market.symbol,
        }
      } catch (err) {
        throw safeError(err, 'createOrder')
      }
    },

    async getOrder(id, symbol) {
      try {
        const market = await resolve(symbol)
        const order = await exchange.fetchOrder(id, market.symbol)
        return { orderId: order.id, status: order.status, filled: Number(order.filled ?? 0), remaining: Number(order.remaining ?? 0), average: order.average ?? null }
      } catch (err) {
        throw safeError(err, 'fetchOrder')
      }
    },

    async cancelOrder(id, symbol) {
      try {
        const market = await resolve(symbol)
        return await exchange.cancelOrder(id, market.symbol)
      } catch (err) {
        throw safeError(err, 'cancelOrder')
      }
    },

    /**
     * Check open positions against their intended stop and target, and close
     * any that breached, mirroring the paper adapter so the engine needs no
     * branch. Exits are reduce-only.
     *
     * A position with no recorded intent is reported, not closed and not
     * silently ignored: it may predate a restart or have been opened by hand,
     * and guessing a stop for someone else's position is worse than saying so.
     */
    async markToMarket() {
      const closed = []
      const unmanaged = []
      const positions = await this.getPositions()

      for (const position of positions) {
        const intent = intents.get(position.symbol)
        if (!intent) {
          unmanaged.push(position.symbol)
          continue
        }
        const mark = Number(position.mark)
        if (!Number.isFinite(mark) || mark <= 0) continue

        const long = position.side === 'long'
        const hitStop = intent.stop != null && (long ? mark <= intent.stop : mark >= intent.stop)
        const hitTarget = intent.target != null && (long ? mark >= intent.target : mark <= intent.target)
        if (!hitStop && !hitTarget) continue

        const receipt = await this.closePosition(position, hitStop ? 'stop hit' : 'target hit')
        intents.delete(position.symbol)
        closed.push({ symbol: position.symbol, exit: receipt.fillPrice ?? mark, reason: hitStop ? 'stop hit' : 'target hit', orderId: receipt.orderId })
      }

      if (unmanaged.length) this.lastUnmanaged = unmanaged
      return closed
    },

    /** Closes with reduce-only, so a race can never flip the position short. */
    async closePosition(position, reason = 'close') {
      const side = position.side === 'long' ? 'sell' : 'buy'
      return this.submitOrder({ symbol: position.symbol.split('/')[0], side, qty: position.qty, price: position.mark, reduceOnly: true, clientOrderId: `close-${position.symbol}-${Date.now()}`, type: 'market' })
    },
  }
}
