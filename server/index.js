import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import { botStatus, getBot } from './botService.js'
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

/* ---------- autonomous bot ----------
   The engine lives in the server process, so these routes command a bot that
   keeps running with every browser closed. Paper mode is the only mode wired
   here: the Delta adapter is not yet verified against the exchange, and an
   unverified execution path must not be reachable from an HTTP route. */

app.get('/api/bot/status', asHandler(() => botStatus()))

app.post(
  '/api/bot/start',
  asHandler(() => {
    const { engine } = getBot()
    if (engine.isEmergencyStopped()) {
      const err = new Error('Emergency stop is latched. Clear it explicitly before starting.')
      err.status = 409
      throw err
    }
    engine.start()
    return botStatus()
  }),
)

app.post(
  '/api/bot/pause',
  asHandler(() => {
    getBot().engine.pause()
    return botStatus()
  }),
)

/** Runs exactly one cycle. Lets the dashboard prove the pipeline without waiting. */
app.post(
  '/api/bot/step',
  asHandler(async () => {
    const result = await getBot().engine.runCycle()
    return { result, status: botStatus() }
  }),
)

app.post(
  '/api/bot/emergency-stop',
  asHandler((req) => {
    getBot().engine.engageEmergencyStop(req.body?.reason || 'dashboard')
    return botStatus()
  }),
)

/** Deliberately a separate route from pause: clearing a latch is its own act. */
app.post(
  '/api/bot/resume',
  asHandler(() => {
    getBot().engine.clearEmergencyStop()
    return botStatus()
  }),
)

app.put(
  '/api/bot/config',
  asHandler((req) => {
    const allowed = [
      'startingBalance',
      'targetBalance',
      'riskPerTradePercent',
      'maxDrawdownPercent',
      'dailyLossLimitPercent',
      'maxOpenPositions',
      'maxTradesPerDay',
      'maxLeverage',
      'maxPositionPercent',
      'dailyTargetPercent',
      'dailyLossLimitPercent',
      'entryCutoffMinutes',
      'minRewardToCost',
    ]
    const patch = {}
    for (const key of allowed) {
      if (req.body?.[key] == null) continue
      const value = Number(req.body[key])
      // Reject rather than coerce: a NaN risk limit silently becomes no limit.
      if (!Number.isFinite(value) || value <= 0) {
        const err = new Error(`${key} must be a positive number.`)
        err.status = 400
        throw err
      }
      patch[key] = value
    }

    // Session fields are not numbers, so they need their own validation rather
    // than being dropped by the numeric loop above — which is what silently
    // made the trading window unconfigurable.
    for (const key of ['sessionStart', 'sessionEnd']) {
      if (req.body?.[key] == null) continue
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(req.body[key]))) {
        const err = new Error(`${key} must be HH:MM in 24-hour form.`)
        err.status = 400
        throw err
      }
      patch[key] = String(req.body[key])
    }
    if (req.body?.timeZone != null) {
      try {
        new Intl.DateTimeFormat('en-GB', { timeZone: String(req.body.timeZone) })
      } catch {
        const err = new Error('timeZone is not a recognised IANA zone.')
        err.status = 400
        throw err
      }
      patch.timeZone = String(req.body.timeZone)
    }
    if (req.body?.continueAfterTarget != null) patch.continueAfterTarget = Boolean(req.body.continueAfterTarget)
    if (req.body?.flattenAtSessionEnd != null) patch.flattenAtSessionEnd = Boolean(req.body.flattenAtSessionEnd)

    getBot('default', patch)
    return botStatus()
  }),
)

/**
 * Switch the venue the bot trades through.
 *
 * The venue is probed before it is adopted: a bot pointed at an exchange it
 * cannot authenticate against would sit in ANALYZING forever, failing every
 * cycle for a reason nobody sees. Better to refuse the switch and say why.
 */
app.put(
  '/api/bot/venue',
  asHandler(async (req) => {
    const mode = String(req.body?.venue ?? '').toLowerCase()
    if (!['paper', 'ccxt'].includes(mode)) {
      const err = new Error('venue must be "paper" or "ccxt".')
      err.status = 400
      throw err
    }

    const running = getBot().engine.isRunning()
    if (running) {
      // Changing venue under a running bot would strand any open position on
      // the old one, unmanaged and unwatched.
      const err = new Error('Pause the bot before changing venue.')
      err.status = 409
      throw err
    }

    if (mode === 'ccxt') {
      const probe = getBot('default', null, 'ccxt')
      try {
        await probe.adapter.getAccount()
      } catch (probeErr) {
        // Fall back to paper so a failed switch cannot leave the bot pointed
        // at an unusable venue.
        getBot('default', null, 'paper')
        const err = new Error(`Venue unreachable, staying on paper: ${probeErr.message}`)
        err.status = 502
        throw err
      }
      return botStatus()
    }

    getBot('default', null, 'paper')
    return botStatus()
  }),
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
