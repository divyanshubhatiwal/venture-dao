import { Router } from 'express'
import { botStatus, getBot, measureStopDistances } from '../trading/botService.js'
import { suggestConfig } from '../trading/suggestConfig.js'
import { asHandler } from '../middleware/asyncHelper.js'

const router = Router()

/* ---------- autonomous bot ----------
   The engine lives in the server process, so these routes command a bot that
   keeps running with every browser closed. Paper mode is the only mode wired
   here: the Delta adapter is not yet verified against the exchange, and an
   unverified execution path must not be reachable from an HTTP route. */

router.get('/status', asHandler(() => botStatus()))

router.post(
  '/start',
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

router.post(
  '/pause',
  asHandler(() => {
    getBot().engine.pause()
    return botStatus()
  }),
)

/** Runs exactly one cycle. Lets the dashboard prove the pipeline without waiting. */
router.post(
  '/step',
  asHandler(async () => {
    const result = await getBot().engine.runCycle()
    return { result, status: botStatus() }
  }),
)

router.post(
  '/emergency-stop',
  asHandler((req) => {
    getBot().engine.engageEmergencyStop(req.body?.reason || 'dashboard')
    return botStatus()
  }),
)

/** Deliberately a separate route from pause: clearing a latch is its own act. */
router.post(
  '/resume',
  asHandler(() => {
    getBot().engine.clearEmergencyStop()
    return botStatus()
  }),
)

router.put(
  '/config',
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
router.put(
  '/venue',
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
router.get(
  '/suggest',
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

export default router
