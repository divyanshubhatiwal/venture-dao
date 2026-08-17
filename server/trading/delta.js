import crypto from 'node:crypto'

/**
 * Delta Exchange REST client.
 *
 * Signing happens here, on the server, because it needs the API secret. A
 * secret in a browser bundle is a secret you have published — anyone with
 * devtools can read it and drain the account. That is why this file exists at
 * all rather than the frontend calling Delta directly.
 *
 * Signature format (Delta v2):
 *   payload   = method + timestamp + path + queryString + body
 *   signature = hex(HMAC_SHA256(api_secret, payload))
 * sent as `api-key`, `timestamp`, `signature` headers.
 */

/**
 * Delta runs two separate universes and they are NOT interchangeable — an
 * account and its API keys exist in exactly one of them, and the products are
 * quoted differently:
 *
 *   global  demo.delta.exchange   → USDT-quoted   (ETHUSDT, BTCUSDT)
 *   india   india.delta.exchange  → USD-quoted    (ETHUSD, BTCUSD)
 *
 * Pointing a key at the wrong region fails authentication with an error that
 * looks like a bad signature, which is why this is explicit configuration
 * rather than a guess.
 */
export const ENVIRONMENTS = {
  'global:testnet': {
    name: 'demo (global testnet)',
    region: 'global',
    baseUrl: 'https://testnet-api.delta.exchange',
    live: false,
    quote: 'USDT',
    console: 'demo.delta.exchange',
  },
  'global:live': {
    name: 'live (global)',
    region: 'global',
    baseUrl: 'https://api.delta.exchange',
    live: true,
    quote: 'USDT',
    console: 'delta.exchange',
  },
  'india:testnet': {
    name: 'testnet (india)',
    region: 'india',
    baseUrl: 'https://cdn-ind.testnet.deltaex.org',
    live: false,
    quote: 'USD',
    console: 'testnet.delta.exchange',
  },
  'india:live': {
    name: 'live (india)',
    region: 'india',
    baseUrl: 'https://api.india.delta.exchange',
    live: true,
    quote: 'USD',
    console: 'india.delta.exchange',
  },
}

/** Perpetual symbols per region, keyed by the app's internal asset symbol. */
export const SYMBOL_MAP = {
  global: { ETH: 'ETHUSDT', BTC: 'BTCUSDT', SOL: 'SOLUSDT' },
  india: { ETH: 'ETHUSD', BTC: 'BTCUSD', SOL: 'SOLUSD' },
}

export function resolveConfig(env = process.env) {
  const requested = (env.DELTA_ENV || 'testnet').toLowerCase()
  const region = (env.DELTA_REGION || 'global').toLowerCase() === 'india' ? 'india' : 'global'
  const allowLive = env.DELTA_ALLOW_LIVE === 'true'

  // Live requires TWO deliberate switches, not one. Setting DELTA_ENV=live on
  // its own is treated as a mistake and falls back to testnet.
  const useLive = requested === 'live' && allowLive
  const environment = ENVIRONMENTS[`${region}:${useLive ? 'live' : 'testnet'}`]

  return {
    environment,
    region,
    symbols: SYMBOL_MAP[region],
    requestedEnv: requested,
    allowLive,
    downgraded: requested === 'live' && !allowLive,
    apiKey: env.DELTA_API_KEY || '',
    apiSecret: env.DELTA_API_SECRET || '',
    hasCredentials: Boolean(env.DELTA_API_KEY && env.DELTA_API_SECRET),
    /** Hard ceiling on a single order's notional, enforced server-side. */
    maxOrderNotional: Number(env.DELTA_MAX_ORDER_NOTIONAL || 100),
    /** Operator kill switch — blocks every order-placing route. */
    killSwitch: env.DELTA_KILL_SWITCH === 'true',
  }
}

/**
 * Delta rejects any signature whose timestamp drifts more than a few seconds
 * from its own clock, and Windows hosts routinely run several seconds fast.
 * Every authenticated request would fail with `expired_signature` — which reads
 * like a bad key but is not one. Delta reports its own clock in that error, so
 * the first rejection teaches us the offset and every later request applies it.
 */
let clockSkewSeconds = 0

function sign({ secret, method, path, query = '', body = '' }) {
  const timestamp = (Math.floor(Date.now() / 1000) + clockSkewSeconds).toString()
  const payload = `${method}${timestamp}${path}${query}${body}`
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return { timestamp, signature }
}

export async function deltaRequest(options) {
  try {
    return await sendRequest(options)
  } catch (err) {
    // Re-sign once against Delta's reported clock. Only ever retried for a
    // clock complaint, and only once, so a genuinely bad key still fails fast.
    if (err.details?.code !== 'expired_signature') throw err
    const { request_time: sent, server_time: actual } = err.details.context ?? {}
    if (!sent || !actual) throw err
    clockSkewSeconds += actual - sent
    console.warn(`[delta] clock drift ${sent - actual}s vs exchange — correcting and retrying`)
    return sendRequest(options)
  }
}

async function sendRequest({ config, method = 'GET', path, query = {}, body = null, authenticated = true }) {
  const queryString = Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : ''
  const bodyString = body ? JSON.stringify(body) : ''
  const url = `${config.environment.baseUrl}${path}${queryString}`

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    // Delta rejects requests without a User-Agent.
    'User-Agent': 'VentureDAO-Agent/1.0',
  }

  if (authenticated) {
    if (!config.hasCredentials) {
      const err = new Error('Delta API credentials are not configured on the server.')
      err.status = 503
      err.code = 'NO_CREDENTIALS'
      throw err
    }
    const { timestamp, signature } = sign({
      secret: config.apiSecret,
      method,
      path,
      query: queryString,
      body: bodyString,
    })
    headers['api-key'] = config.apiKey
    headers.timestamp = timestamp
    headers.signature = signature
  }

  const res = await fetch(url, {
    method,
    headers,
    body: bodyString || undefined,
    signal: AbortSignal.timeout(15_000),
  })

  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    const err = new Error(`Delta returned a non-JSON response (${res.status}).`)
    err.status = res.status
    throw err
  }

  if (!res.ok || json.success === false) {
    const err = new Error(json?.error?.code || json?.message || `Delta request failed (${res.status})`)
    err.status = res.status
    err.details = json?.error ?? json
    throw err
  }

  return json.result ?? json
}

/* ---------- public market data (no signing needed) ---------- */

export const getProducts = (config) =>
  deltaRequest({ config, path: '/v2/products', query: { contract_types: 'perpetual_futures', page_size: 100 }, authenticated: false })

export const getTicker = (config, symbol) => deltaRequest({ config, path: `/v2/tickers/${symbol}`, authenticated: false })

/* ---------- authenticated account routes ---------- */

export const getBalances = (config) => deltaRequest({ config, path: '/v2/wallet/balances' })
export const getPositions = (config) => deltaRequest({ config, path: '/v2/positions/margined' })
export const getOrders = (config) => deltaRequest({ config, path: '/v2/orders', query: { states: 'open' } })

/**
 * Place an order. Every guard below runs on the server, so nothing the browser
 * sends can bypass them.
 */
export async function placeOrder(
  config,
  { symbol, asset = null, side, size, assetQty = null, orderType = 'market_order', limitPrice = null, reduceOnly = false },
) {
  // Callers send the internal asset ("ETH") and the region decides whether that
  // means ETHUSDT or ETHUSD. Keeping that mapping here means the client never
  // has to know which universe the account lives in.
  if (asset && !symbol) {
    symbol = config.symbols[asset.toUpperCase()]
    if (!symbol) {
      const err = new Error(
        `${asset} is not mapped to a Delta perpetual in the ${config.region} region. Available: ${Object.keys(config.symbols).join(', ')}.`,
      )
      err.status = 400
      err.code = 'UNMAPPED_ASSET'
      throw err
    }
  }

  if (config.killSwitch) {
    const err = new Error('Server kill switch is engaged — no orders will be placed.')
    err.status = 423
    err.code = 'KILL_SWITCH'
    throw err
  }
  if (!['buy', 'sell'].includes(side)) {
    const err = new Error(`Invalid side "${side}".`)
    err.status = 400
    throw err
  }

  const ticker = await getTicker(config, symbol)
  const productId = ticker.product_id
  const mark = Number(ticker.mark_price)
  if (!productId) {
    const err = new Error(`Unknown Delta symbol "${symbol}".`)
    err.status = 400
    throw err
  }

  // Contract value varies by product — 1 ETHUSD is 0.01 ETH, 1 SOLUSD is 1 SOL.
  const contractValue = Number(ticker.contract_value ?? 1)

  // Callers that size in the underlying asset (the agent does) send assetQty
  // and the conversion to whole contracts happens here, next to the contract
  // data, rather than being duplicated in the client.
  if (assetQty != null) {
    const converted = Math.round(Number(assetQty) / contractValue)
    if (!Number.isFinite(converted) || converted < 1) {
      const err = new Error(
        `Position of ${assetQty} rounds to less than one ${symbol} contract (1 contract = ${contractValue}). Increase the risk budget or pick a smaller-denomination product.`,
      )
      err.status = 400
      err.code = 'BELOW_MIN_CONTRACT'
      throw err
    }
    size = converted
  }

  if (!Number.isInteger(size) || size <= 0) {
    const err = new Error('Size must be a positive integer number of contracts.')
    err.status = 400
    throw err
  }

  const notional = size * contractValue * mark
  if (notional > config.maxOrderNotional) {
    const err = new Error(
      `Order notional ${notional.toFixed(2)} exceeds the server cap of ${config.maxOrderNotional}. Raise DELTA_MAX_ORDER_NOTIONAL deliberately if this is intended.`,
    )
    err.status = 400
    err.code = 'NOTIONAL_CAP'
    throw err
  }

  const body = {
    product_id: productId,
    size,
    side,
    order_type: orderType,
    reduce_only: reduceOnly,
  }
  if (orderType === 'limit_order') {
    if (limitPrice == null) {
      const err = new Error('A limit order needs a limit price.')
      err.status = 400
      throw err
    }
    body.limit_price = String(limitPrice)
  }

  const result = await deltaRequest({ config, method: 'POST', path: '/v2/orders', body })
  return {
    ...result,
    environment: config.environment.name,
    live: config.environment.live,
    notional,
    contracts: size,
    contractValue,
    markPrice: mark,
  }
}

export const cancelOrder = (config, { id, productId }) =>
  deltaRequest({ config, method: 'DELETE', path: '/v2/orders', body: { id, product_id: productId } })
