import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import {
  cancelOrder,
  getBalances,
  getOrders,
  getPositions,
  getProducts,
  getTicker,
  placeOrder,
  resolveConfig,
} from './delta.js'

/**
 * VentureDAO backend.
 *
 * Its whole reason to exist is that Delta requires HMAC signing with an API
 * secret, and a secret in a browser bundle is a published secret. Keys stay in
 * this process, in environment variables, and never travel to the client.
 *
 * Order-placing routes are guarded here rather than in the frontend, because
 * guards the client can edit are not guards.
 */

const app = express()
app.use(express.json({ limit: '256kb' }))
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }))

const PORT = Number(process.env.PORT || 5000)

const asHandler = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req) })
  } catch (err) {
    const status = err.status || 500
    if (status >= 500) console.error('[delta]', err.message)
    res.status(status).json({ ok: false, error: err.message, code: err.code ?? null, details: err.details ?? null })
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'venturedao-backend', at: new Date().toISOString() }))

/**
 * Status: everything the UI needs to describe the connection, and nothing that
 * could reconstruct a credential. The key is reported only as a masked tail.
 */
app.get(
  '/api/venues/delta/status',
  asHandler(async () => {
    const config = resolveConfig()
    let reachable = false
    let productCount = null
    try {
      const products = await getProducts(config)
      reachable = true
      productCount = Array.isArray(products) ? products.length : null
    } catch {
      reachable = false
    }

    return {
      environment: config.environment.name,
      baseUrl: config.environment.baseUrl,
      live: config.environment.live,
      region: config.region,
      quote: config.environment.quote,
      console: config.environment.console,
      symbols: config.symbols,
      requestedEnv: config.requestedEnv,
      downgraded: config.downgraded,
      hasCredentials: config.hasCredentials,
      apiKeyTail: config.apiKey ? `…${config.apiKey.slice(-4)}` : null,
      maxOrderNotional: config.maxOrderNotional,
      killSwitch: config.killSwitch,
      reachable,
      productCount,
    }
  }),
)

app.get('/api/venues/delta/ticker/:symbol', asHandler((req) => getTicker(resolveConfig(), req.params.symbol)))
app.get('/api/venues/delta/products', asHandler(() => getProducts(resolveConfig())))
app.get('/api/venues/delta/balances', asHandler(() => getBalances(resolveConfig())))
app.get('/api/venues/delta/positions', asHandler(() => getPositions(resolveConfig())))
app.get('/api/venues/delta/orders', asHandler(() => getOrders(resolveConfig())))

app.post(
  '/api/venues/delta/order',
  asHandler(async (req) => {
    const config = resolveConfig()
    const { symbol, asset, side, size, assetQty, orderType, limitPrice, reduceOnly } = req.body ?? {}

    const result = await placeOrder(config, {
      symbol,
      asset,
      side,
      size: size != null ? Number(size) : null,
      assetQty: assetQty != null ? Number(assetQty) : null,
      orderType,
      limitPrice,
      reduceOnly: Boolean(reduceOnly),
    })

    console.log(
      `[delta:${config.environment.name}] ${side} ${result.contracts} ${symbol} → order ${result.id ?? 'n/a'} (notional ${result.notional?.toFixed?.(2)})`,
    )
    return result
  }),
)

app.delete(
  '/api/venues/delta/order',
  asHandler((req) => cancelOrder(resolveConfig(), { id: req.body?.id, productId: req.body?.productId })),
)

app.listen(PORT, () => {
  const config = resolveConfig()
  console.log(`\n  VentureDAO backend  →  http://localhost:${PORT}`)
  console.log(`  Delta environment   →  ${config.environment.name.toUpperCase()} (${config.environment.baseUrl})`)
  console.log(`  Credentials         →  ${config.hasCredentials ? `loaded (…${config.apiKey.slice(-4)})` : 'NOT SET — public routes only'}`)
  console.log(`  Max order notional  →  ${config.maxOrderNotional}`)
  if (config.downgraded) {
    console.log('\n  ⚠  DELTA_ENV=live was requested but DELTA_ALLOW_LIVE is not "true".')
    console.log('     Falling back to TESTNET. Live trading needs both switches set deliberately.')
  }
  if (config.environment.live) {
    console.log('\n  ⚠  LIVE MODE — orders placed here move real funds.\n')
  } else {
    console.log('  Mode                →  testnet, virtual funds\n')
  }
})
