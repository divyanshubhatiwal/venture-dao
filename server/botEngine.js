import { decide } from '../src/lib/agent/decision.js'
import { computeGoalState, normaliseConfig } from '../src/lib/agent/goalManager.js'
import { dailyProgress, entriesBlocked } from './dailySession.js'

/**
 * The autonomous loop.
 *
 * This is the only place a trade is initiated. It owns the state machine, the
 * schedule, and the execution lock; the analysis it runs is the application's
 * existing pipeline, imported rather than reimplemented — `decide()` already
 * chains signal → critic → risk engine → sizing, and duplicating any of that
 * here would create a second strategy that could disagree with the one the UI
 * shows.
 *
 * It lives on the server because a bot that stops when a browser tab closes is
 * not a bot. That relocation is also what makes the guarantees below possible:
 * a single loop per account, an execution key that survives a reload, and a
 * kill switch the client cannot talk its way past.
 *
 * Every venue call goes through an injected adapter, so paper and Delta take
 * exactly the same code path. Paper is not a separate simulation of the
 * pipeline — it is the pipeline, with a different adapter at the end.
 */

export const BOT_STATES = {
  STOPPED: 'STOPPED',
  ANALYZING: 'ANALYZING',
  SIGNAL_DETECTED: 'SIGNAL_DETECTED',
  RISK_CHECK: 'RISK_CHECK',
  ORDER_APPROVED: 'ORDER_APPROVED',
  ORDER_SUBMITTED: 'ORDER_SUBMITTED',
  POSITION_OPEN: 'POSITION_OPEN',
  MANAGING_POSITION: 'MANAGING_POSITION',
  POSITION_CLOSED: 'POSITION_CLOSED',
  RECONCILING: 'RECONCILING',
  COOLDOWN: 'COOLDOWN',
  RISK_BLOCKED: 'RISK_BLOCKED',
  ERROR: 'ERROR',
  KILL_SWITCH: 'KILL_SWITCH',
}

/** Market data older than this is not worth trading on. */
export const MAX_DATA_AGE_MS = 90_000

/**
 * Identifies one intended trade. A restart, a double-click, or two overlapping
 * ticks all regenerate the same key, and the engine refuses to submit a key it
 * has already used — which is what stops one signal becoming two positions.
 * The time bucket lets a genuinely new setup on the same symbol through later.
 */
export function executionKey({ accountId, symbol, direction, at, bucketMs = 60_000 }) {
  return `${accountId}:${symbol}:${direction}:${Math.floor(at / bucketMs)}`
}

/**
 * The checks that must pass before an order is built. Deliberately separate
 * from the risk engine: these are preconditions about whether we are in a fit
 * state to trade at all, where the risk engine judges the trade itself.
 */
export function preflight({ decision, account, config, dataAt, now = Date.now(), killSwitch = false, openPositions = 0, positions = [], tradesToday = 0, emergencyStop = false }) {
  const fail = (code, detail) => ({ ok: false, code, detail })

  if (killSwitch) return fail('KILL_SWITCH', 'Server kill switch is engaged.')
  if (emergencyStop) return fail('EMERGENCY_STOP', 'Emergency stop is active until explicitly cleared.')
  if (!dataAt || now - dataAt > MAX_DATA_AGE_MS) return fail('STALE_DATA', `Market data is ${Math.round((now - (dataAt ?? 0)) / 1000)}s old.`)
  if (!decision?.approved) return fail('NOT_APPROVED', decision?.reason ?? 'Pipeline did not approve a trade.')
  if (!decision.levels?.stop) return fail('NO_STOP', 'A stop is mandatory; refusing an unprotected entry.')

  // Direction sanity. A long whose stop sits above entry would size to a
  // negative risk and inverts the whole calculation.
  const { entry, stop, target } = decision.levels
  const long = decision.action === 'BUY'
  if (long && !(stop < entry)) return fail('INVALID_STOP', 'Long stop must sit below entry.')
  if (!long && !(stop > entry)) return fail('INVALID_STOP', 'Short stop must sit above entry.')
  if (target != null && long && !(target > entry)) return fail('INVALID_TARGET', 'Long target must sit above entry.')
  if (target != null && !long && !(target < entry)) return fail('INVALID_TARGET', 'Short target must sit below entry.')

  if (!(decision.quantity > 0)) return fail('INVALID_QTY', 'Position size resolved to zero.')

  /* Notional and leverage.
     Risk-based sizing alone does not bound position size: risk ÷ stop-distance
     grows without limit as the stop tightens, so a 0.25%-away stop on a 1% risk
     budget asks for 4× the account. The risk number stays honest and the
     position is still ruinous, which is why these caps are separate checks
     rather than something the sizing formula is trusted to respect. */
  const equity = Number(account?.balance) || 0
  const notional = decision.notional ?? decision.quantity * entry
  if (equity > 0) {
    const leverage = notional / equity
    if (config.maxLeverage != null && leverage > config.maxLeverage + 1e-9) {
      return fail('MAX_LEVERAGE', `Position is ${leverage.toFixed(2)}× equity, limit ${config.maxLeverage}×.`)
    }
    if (config.maxPositionPercent != null && notional > equity * (config.maxPositionPercent / 100) + 1e-9) {
      return fail('MAX_POSITION', `Notional ${notional.toFixed(2)} exceeds ${config.maxPositionPercent}% of equity.`)
    }
  }
  if (config.maxOrderNotional != null && notional > config.maxOrderNotional) {
    return fail('MAX_NOTIONAL', `Notional ${notional.toFixed(2)} exceeds cap ${config.maxOrderNotional}.`)
  }
  if (config.minAvailableMargin != null && (account?.availableMargin ?? equity) < config.minAvailableMargin) {
    return fail('MIN_MARGIN', 'Available margin is below the configured floor.')
  }

  /* The trade must be able to pay for itself.
     A round trip costs two fills. If the whole distance to target is worth
     less than a small multiple of that cost, the trade is a fee transfer with
     a lottery ticket attached — it can only be profitable if it also gets
     lucky on slippage. This is the check that a 31-winners-and-still-down
     result is asking for: the losses were never directional, they were
     frictional. */
  if (config.feeBps != null && config.minRewardToCost != null && target != null) {
    const roundTripFee = notional * (config.feeBps / 10_000) * 2
    const rewardAtTarget = Math.abs(target - entry) * decision.quantity
    if (rewardAtTarget < roundTripFee * config.minRewardToCost) {
      return fail(
        'EDGE_BELOW_COST',
        `Target is worth ${rewardAtTarget.toFixed(2)} against ${roundTripFee.toFixed(2)} in fees (need ${config.minRewardToCost}×).`,
      )
    }
  }
  /* One position per symbol.
     The idempotency key alone does not give this: it includes the direction and
     a time bucket, so a long, then a short, then another long on the same
     symbol are three distinct keys and all three were allowed through. That
     produced a self-hedged book — a long and a short on the same instrument,
     paying both spreads to net nothing — and concentrated the whole position
     limit into one symbol. Exposure has to be checked against open positions,
     not against a count. */
  const onSymbol = positions.filter((p) => p.symbol === decision.symbol)
  if (onSymbol.length > 0) {
    const wanted = decision.action === 'BUY' ? 'long' : 'short'
    const opposing = onSymbol.find((p) => p.side !== wanted)
    if (opposing) return fail('OPPOSING_EXPOSURE', `Already ${opposing.side} ${decision.symbol}; refusing to hedge against it.`)
    return fail('SYMBOL_EXPOSURE', `Already holding ${decision.symbol}; not adding to an open position.`)
  }

  if (config.maxOpenPositions != null && openPositions >= config.maxOpenPositions) {
    return fail('MAX_POSITIONS', `${openPositions} open, limit ${config.maxOpenPositions}.`)
  }
  if (config.maxTradesPerDay != null && tradesToday >= config.maxTradesPerDay) {
    return fail('MAX_TRADES', `${tradesToday} today, limit ${config.maxTradesPerDay}.`)
  }

  const goal = computeGoalState(config, account)
  if (goal.drawdownBreached) return fail('DRAWDOWN', 'Drawdown limit reached.')
  if (goal.dayLossBreached) return fail('DAILY_LOSS', 'Daily loss limit reached.')

  return { ok: true }
}

export function createBotEngine({ adapter, marketData, config: rawConfig, accountId = 'default', symbols = ['ETH'], intervalMs = 60_000, logger = () => {}, now = () => Date.now() }) {
  const config = normaliseConfig(rawConfig)

  let state = BOT_STATES.STOPPED
  let timer = null
  let emergencyStop = false
  let running = false
  // Guards against a slow cycle overlapping the next tick. Without it a tick
  // fired while an order was still in flight could analyse pre-order state and
  // submit a second one.
  let cycleInFlight = false
  const usedKeys = new Set()
  const journal = []

  const setState = (next, detail) => {
    if (state === next) return
    state = next
    logger({ type: 'state', state: next, detail, at: now() })
  }

  const record = (entry) => {
    journal.unshift({ ...entry, at: now() })
    journal.length = Math.min(journal.length, 200)
    logger({ type: 'journal', ...entry })
  }

  async function runCycle() {
    if (cycleInFlight) return { skipped: 'cycle already running' }
    cycleInFlight = true
    try {
      if (emergencyStop) {
        setState(BOT_STATES.KILL_SWITCH, 'emergency stop')
        return { skipped: 'emergency stop' }
      }

      // Checked before any analysis, not only in preflight. The switch is a
      // hard stop on the whole cycle, so it must not depend on the pipeline
      // first happening to produce an approved trade.
      if (await adapter.killSwitchEngaged()) {
        setState(BOT_STATES.KILL_SWITCH, 'server kill switch')
        record({ kind: 'blocked', code: 'KILL_SWITCH', detail: 'Server kill switch is engaged.' })
        return { skipped: 'kill switch' }
      }

      setState(BOT_STATES.ANALYZING)
      const account = await adapter.getAccount()
      let open = await adapter.getPositions()

      /* Manage what is already open before looking for anything new.
         An unmanaged position is the worst state this engine can be in: it has
         risk on with nothing watching the stop. Exits therefore run first and
         are never skipped, including once entries are barred for the day. */
      if (open.length && adapter.markToMarket) {
        setState(BOT_STATES.MANAGING_POSITION)
        const closed = await adapter.markToMarket()
        for (const t of closed) {
          record({ kind: 'exit', symbol: t.symbol, detail: `${t.reason} @ ${t.exit} · pnl ${t.pnl}` })
        }
        if (closed.length) {
          setState(BOT_STATES.POSITION_CLOSED)
          open = await adapter.getPositions()
        }
      }

      /* Session gates. Checked after exits and before entries, so a bot that
         has hit its target or its loss limit still manages the book it has. */
      const progress = dailyProgress({
        startingEquity: account.startingBalance,
        realisedPnl: (account.balance ?? 0) - (account.startingBalance ?? 0),
        unrealisedPnl: account.unrealisedPnl ?? 0,
        config,
      })
      const barred = entriesBlocked({ at: now(), config, progress })
      if (barred) {
        /* Session-end flatten.
           Entries stopping is not the same as the book being closed: without
           this the bot simply stops trading and leaves positions running
           unattended overnight. Closes are issued and then *verified* by
           re-reading positions from the venue, because a submitted close is
           not a completed one — assuming it worked is how a position survives
           a session the operator believes ended flat. */
        if (barred === 'SESSION_ENDED' && config.flattenAtSessionEnd && open.length && adapter.closePosition) {
          setState(BOT_STATES.MANAGING_POSITION, 'flattening')
          for (const position of open) {
            try {
              const receipt = await adapter.closePosition(position, 'session end')
              record({ kind: 'flatten', symbol: position.symbol, detail: `closed @ ${receipt.exit} · pnl ${receipt.pnl}` })
            } catch (err) {
              record({ kind: 'error', symbol: position.symbol, message: `flatten failed: ${err.message}` })
            }
          }

          const remaining = await adapter.getPositions()
          if (remaining.length) {
            // Never report a clean session close that did not happen.
            setState(BOT_STATES.RECONCILING, 'flatten incomplete')
            record({ kind: 'error', code: 'FLATTEN_INCOMPLETE', detail: `${remaining.length} position(s) still open after session-end close.` })
            return { skipped: barred, flattened: false, remaining: remaining.length }
          }
          record({ kind: 'session', code: 'SESSION_COMPLETE', detail: 'All positions closed at session end.' })
        }

        setState(barred === 'DAILY_LOSS' ? BOT_STATES.RISK_BLOCKED : BOT_STATES.COOLDOWN, barred)
        record({ kind: 'blocked', code: barred, detail: `net ${progress.netPnl.toFixed(2)} of target ${progress.targetAmount.toFixed(2)}` })
        return { skipped: barred, progress }
      }

      /* Every market is scored before any is traded.
         Taking the first symbol that happens to pass makes the choice an
         accident of array order — it would buy ETH simply because ETH is
         listed first, while a stronger BTC setup waited for the next cycle.
         Ranking by conviction × reward-to-risk is what makes this a scanner
         rather than a loop. */
      const candidates = []
      for (const symbol of symbols) {
        const feed = await marketData(symbol)
        const decision = decide({
          symbol,
          candles: feed.candles,
          config,
          account,
          trades: account.trades ?? [],
          episodes: account.episodes ?? [],
          openPositions: open.length,
          regime: feed.regime ?? null,
        })

        if (!decision.approved) {
          record({ kind: 'no-trade', symbol, reason: decision.reason, signal: decision.signal?.bias })
          continue
        }
        candidates.push({ symbol, decision, feed, quality: (decision.confidence ?? 0) * (decision.riskReward ?? 1) })
      }

      candidates.sort((a, b) => b.quality - a.quality)
      if (candidates.length > 1) {
        record({ kind: 'ranked', detail: candidates.map((c) => `${c.symbol}:${Math.round(c.quality)}`).join(' > ') })
      }

      for (const { symbol, decision, feed } of candidates) {

        setState(BOT_STATES.SIGNAL_DETECTED, symbol)
        setState(BOT_STATES.RISK_CHECK, symbol)

        const check = preflight({
          decision,
          account,
          config,
          dataAt: feed.at,
          now: now(),
          killSwitch: await adapter.killSwitchEngaged(),
          openPositions: open.length,
          positions: open,
          tradesToday: account.tradesToday ?? 0,
          emergencyStop,
        })

        if (!check.ok) {
          setState(BOT_STATES.RISK_BLOCKED, check.code)
          record({ kind: 'blocked', symbol, code: check.code, detail: check.detail })
          continue
        }

        const key = executionKey({ accountId, symbol, direction: decision.action, at: now() })
        if (usedKeys.has(key)) {
          record({ kind: 'duplicate-suppressed', symbol, key })
          continue
        }

        setState(BOT_STATES.ORDER_APPROVED, symbol)
        // Reserved before the await, not after: an exception mid-flight must
        // not free the key, because the order may already be live.
        usedKeys.add(key)

        try {
          setState(BOT_STATES.ORDER_SUBMITTED, symbol)
          const receipt = await adapter.submitOrder({
            symbol,
            side: decision.action === 'BUY' ? 'buy' : 'sell',
            qty: decision.quantity,
            price: decision.levels.entry,
            stop: decision.levels.stop,
            target: decision.levels.target,
            clientOrderId: key,
          })
          setState(BOT_STATES.POSITION_OPEN, symbol)
          record({ kind: 'order', symbol, key, orderId: receipt.orderId ?? null, status: receipt.status ?? 'submitted', decision })
          return { submitted: true, symbol, receipt, decision }
        } catch (err) {
          // The order may or may not exist on the venue. Reconcile before the
          // next cycle rather than retrying into a possible duplicate.
          setState(BOT_STATES.RECONCILING, err.message)
          record({ kind: 'error', symbol, key, message: err.message })
          return { submitted: false, error: err.message, reconciling: true }
        }
      }

      return { submitted: false }
    } finally {
      cycleInFlight = false
      if (running && state !== BOT_STATES.KILL_SWITCH) setState(BOT_STATES.ANALYZING)
    }
  }

  return {
    getState: () => state,
    getJournal: () => [...journal],
    isRunning: () => running,
    runCycle,

    start() {
      if (running) return state
      if (emergencyStop) return BOT_STATES.KILL_SWITCH
      running = true
      setState(BOT_STATES.ANALYZING, 'started')
      timer = setInterval(() => {
        runCycle().catch((err) => {
          setState(BOT_STATES.ERROR, err.message)
          record({ kind: 'error', message: err.message })
        })
      }, intervalMs)
      timer.unref?.()
      return state
    },

    /** Stops new entries. Open positions remain monitored by the venue's own stop/target. */
    pause() {
      running = false
      clearInterval(timer)
      timer = null
      setState(BOT_STATES.STOPPED, 'paused')
      return state
    },

    /**
     * Overrides everything, including a cycle already deciding to trade. Stays
     * latched until explicitly cleared, so a restart cannot quietly resume.
     */
    engageEmergencyStop(reason = 'operator') {
      emergencyStop = true
      running = false
      clearInterval(timer)
      timer = null
      setState(BOT_STATES.KILL_SWITCH, reason)
      record({ kind: 'emergency-stop', reason })
      return state
    },

    clearEmergencyStop() {
      emergencyStop = false
      setState(BOT_STATES.STOPPED, 'emergency stop cleared')
      return state
    },

    isEmergencyStopped: () => emergencyStop,
  }
}
