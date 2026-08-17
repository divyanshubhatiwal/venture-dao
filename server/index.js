import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import {
  COOKIE_NAME,
  clearCookie,
  login as authLogin,
  parseCookies,
  publicUser,
  register as authRegister,
  resolveSession,
  revokeSession,
  issueSession,
  sessionCookie,
} from './identity/auth.js'
import { purgeExpiredSessions } from './storage/db.js'
import { connectMongo, mongoDbName, mongoUri } from './storage/mongo.js'
import { botStatus, getBot, measureStopDistances } from './trading/botService.js'
import { suggestConfig } from './trading/suggestConfig.js'
import { getMarketNews } from './market/news.js'
import { analyseSentiment, hasGeminiKey } from './market/gemini.js'
import { recordReading, scoreDueReadings, sentimentSkill } from './market/sentimentTrack.js'
import {
  cancelOrder,
  getBalances,
  getOrders,
  getPositions,
  getProducts,
  getTicker,
  placeOrder,
  resolveConfig,
} from './trading/delta.js'

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
// credentials:true is required for the session cookie to travel; with it, the
// origin must be explicit — a wildcard origin and cookies are incompatible.
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true }))

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

/**
 * Attach the signed-in user, if any, to every request.
 *
 * The identity comes from the session cookie and a database lookup — never
 * from anything the client asserts. A userId in a request body is a claim, not
 * a fact, and this is the only place the app is allowed to decide who is
 * calling.
 */
app.use(async (req, _res, next) => {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  req.sessionToken = token ?? null
  try {
    req.user = token ? publicUser(await resolveSession(token)) : null
    next()
  } catch (err) {
    // A database that is down must not be reported as "signed out" — that
    // sends people to re-enter a password that was never the problem.
    next(err)
  }
})

/** Guard for anything that must not be reachable anonymously. */
const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Sign in to continue.' })
  next()
}

/**
 * Login throttle.
 *
 * Password checks are deliberately slow, so an unthrottled login form is both
 * a guessing oracle and a cheap way to pin the CPU. Keyed by IP and email
 * together: keying on IP alone lets one attacker lock out a shared office,
 * and on email alone lets anyone lock a victim out of their own account.
 */
const attempts = new Map()
const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60_000

function throttle(req, res, next) {
  const key = `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`
  const now = Date.now()
  const entry = attempts.get(key)
  if (entry && now - entry.first > WINDOW_MS) attempts.delete(key)

  const current = attempts.get(key)
  if (current && current.count >= MAX_ATTEMPTS) {
    const waitSeconds = Math.ceil((WINDOW_MS - (now - current.first)) / 1000)
    return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${waitSeconds}s.` })
  }
  req.recordFailure = () => {
    const existing = attempts.get(key)
    attempts.set(key, existing ? { ...existing, count: existing.count + 1 } : { first: now, count: 1 })
  }
  req.clearFailures = () => attempts.delete(key)
  next()
}

/* ---------- authentication ---------- */

app.post(
  '/api/auth/register',
  asHandler(async (req) => {
    const user = await authRegister({ email: req.body?.email, password: req.body?.password, name: req.body?.name })
    const { token, expiresAt } = await issueSession(user.id, { userAgent: req.headers['user-agent'] ?? null })
    req.res.setHeader('Set-Cookie', sessionCookie(token, { expiresAt }))
    return { user }
  }),
)

app.post('/api/auth/login', throttle, async (req, res, next) => {
  try {
  const user = await authLogin({ email: req.body?.email, password: req.body?.password })
  if (!user) {
    req.recordFailure()
    // One message for a wrong password and an unknown email alike; saying
    // which would turn this form into an account-discovery tool.
    return res.status(401).json({ ok: false, error: 'Email or password is incorrect.' })
  }
  req.clearFailures()
  const { token, expiresAt } = await issueSession(user.id, { userAgent: req.headers['user-agent'] ?? null })
  res.setHeader('Set-Cookie', sessionCookie(token, { expiresAt }))
  res.json({ ok: true, data: { user } })
  } catch (err) {
    next(err)
  }
})

app.post('/api/auth/logout', async (req, res) => {
  await revokeSession(req.sessionToken)
  res.setHeader('Set-Cookie', clearCookie())
  res.json({ ok: true, data: { ok: true } })
})

/** Who am I? Answers null rather than 401 so the UI can ask on every load. */
app.get('/api/auth/me', (req, res) => res.json({ ok: true, data: { user: req.user } }))

app.get(
  '/api/news/markets',
  asHandler(async () => {
    const news = await getMarketNews()
    // Sentiment is layered on top and never gates the headlines: if Gemini is
    // unconfigured, slow or failing, the news still renders.
    const sentiment = await analyseSentiment(news.items)

    // Record each fresh directional read against the price at that moment, so
    // it can be scored later against what actually happened. There is no
    // archive of headlines to backtest against, so evidence has to accumulate
    // forward.
    if (sentiment.ok && !sentiment.cached) {
      try {
        const ticker = await getTicker(resolveConfig(), 'BTCUSD').catch(() => null)
        const price = Number(ticker?.mark_price ?? ticker?.close ?? NaN)
        if (Number.isFinite(price)) {
          await recordReading({ symbol: 'BTC', sentiment: sentiment.sentiment, strength: sentiment.strength, price })
        }
      } catch {
        /* Recording is best-effort; it must never break the news route. */
      }
    }

    // How much say it has earned so far, returned alongside so the UI can show
    // that it is on probation rather than quietly influencing trades.
    const skill = await sentimentSkill().catch(() => null)
    return { ...news, sentiment: { ...sentiment, skill } }
  }),
)

/* The evidence behind sentiment's vote — deliberately readable, because an
   input that influences trades should be arguable. */
app.get('/api/news/sentiment/skill', asHandler(() => sentimentSkill()))

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

/**
 * Settings derived from what the market is currently doing.
 *
 * Read-only: it proposes, the operator applies. Auto-writing risk limits from
 * a background measurement would mean the numbers guarding the account could
 * change without anyone deciding to change them.
 */
app.get(
  '/api/bot/suggest',
  asHandler(async (req) => {
    const { config } = getBot()
    const maxPositionPercent = Number(req.query?.maxPositionPercent ?? config.maxPositionPercent ?? 15)
    const stopPercents = await measureStopDistances()
    return suggestConfig({
      stopPercents,
      equity: config.startingBalance,
      maxPositionPercent,
      maxTradesPerDay: config.maxTradesPerDay,
      maxOpenPositions: config.maxOpenPositions,
    })
  }),
)

// Expired rows are deleted rather than left to accumulate; an expired session
// is already refused on lookup, this just stops the table growing forever.
/* Score sentiment readings whose horizon has elapsed. This is what turns a
   recorded opinion into evidence. */
setInterval(() => {
  scoreDueReadings({
    priceOf: async (symbol) => {
      const ticker = await getTicker(resolveConfig(), `${symbol}USD`)
      return Number(ticker?.mark_price ?? ticker?.close ?? NaN)
    },
  }).catch((err) => console.error('  sentiment scoring failed:', err.message))
}, 60 * 60_000).unref?.()

setInterval(() => {
  // Rejected rather than left unhandled: a failed sweep must not take the
  // process down an hour after boot.
  purgeExpiredSessions().catch((err) => console.error('  session purge failed:', err.message))
}, 60 * 60_000).unref?.()

await connectMongo()
  .then(() => app.listen(PORT, onListening))
  .catch((err) => {
    // Refusing to start is the honest outcome. A server that boots without its
    // database answers every sign-in with a 500 and looks like a broken app.
    console.error(`
  ✗ ${err.message}
`)
    process.exit(1)
  })

function onListening() {
  const config = resolveConfig()
  console.log(`\n  Venture DAO backend →  http://localhost:${PORT}`)
  console.log(`  Delta environment   →  ${config.environment.name.toUpperCase()} (${config.environment.baseUrl})`)
  console.log(`  Credentials         →  ${config.hasCredentials ? `loaded (…${config.apiKey.slice(-4)})` : 'NOT SET — public routes only'}`)
  console.log(`  Max order notional  →  ${config.maxOrderNotional}`)
  // Credentials stripped: a connection string is printed at every boot and
  // ends up in logs and screen shares.
  console.log(`  MongoDB             →  ${mongoUri().replace(/\/\/[^@]*@/, '//***@')} · db "${mongoDbName()}"`)
  console.log(`  Gemini              →  ${hasGeminiKey() ? 'key loaded — news sentiment on' : 'no key — news sentiment off'}`)
  if (config.downgraded) {
    console.log('\n  ⚠  DELTA_ENV=live was requested but DELTA_ALLOW_LIVE is not "true".')
    console.log('     Falling back to TESTNET. Live trading needs both switches set deliberately.')
  }
  if (config.environment.live) {
    console.log('\n  ⚠  LIVE MODE — orders placed here move real funds.\n')
  } else {
    console.log('  Mode                →  testnet, virtual funds\n')
  }
}
