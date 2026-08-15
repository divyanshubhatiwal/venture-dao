import { createBotEngine, BOT_STATES } from './botEngine.js'
import { resolveConfig } from './delta.js'
import { dailyProgress, dailyReport, inWindow, isAroundTheClock, minutesToClose } from './dailySession.js'
import { createCcxtVenue } from './venues/ccxtVenue.js'

/**
 * Owns the running bot and the ledger it trades against.
 *
 * There is one engine per account id and it lives here, in the server process,
 * so a closed browser tab cannot stop it and two open tabs cannot start two of
 * them. `engines` is that registry; today it holds a single default account,
 * but the shape is what multi-account will slot into once real per-user auth
 * exists to key it by.
 *
 * The paper ledger below is deliberately thin. The browser already has a full
 * manual paper account in TradingContext, and this is not a second copy of it
 * for the user to trade by hand — it is the minimum bookkeeping the autonomous
 * loop needs to size its next position when nobody is watching. Swapping to
 * Delta replaces this object and nothing else.
 */

const BINANCE = 'https://api.binance.com/api/v3'
const FEE_BPS = 5 // round-trip taker cost, charged on every paper exit
const SYMBOL_MAP = { ETH: 'ETHUSDT', BTC: 'BTCUSDT', SOL: 'SOLUSDT', LINK: 'LINKUSDT' }

const DEFAULT_CONFIG = {
  startingBalance: 100_000,
  targetBalance: 102_000,
  riskPerTradePercent: 1,
  maxDrawdownPercent: 20,
  maxOpenPositions: 3,
  maxTradesPerDay: 5,
  maxLeverage: 5,
  maxPositionPercent: 20,
  // Daily session. Crypto has no natural close, so the window is configured.
  dailyTargetPercent: 2,
  dailyLossLimitPercent: 3,
  // Crypto never closes; identical start and end means a 24-hour session.
  sessionStart: '00:00',
  sessionEnd: '00:00',
  timeZone: 'Asia/Kolkata',
  continueAfterTarget: false,
  // Do not leave unintended positions running past the session.
  flattenAtSessionEnd: true,
  // No new entries this close to the bell — see entriesBlocked().
  entryCutoffMinutes: 20,
  // A trade must clear its own round-trip cost by this multiple.
  feeBps: FEE_BPS,
  minRewardToCost: 3,
}

/** Real candles from the same public endpoint the frontend chart uses. */
async function marketData(symbol) {
  const pair = SYMBOL_MAP[symbol]
  if (!pair) throw new Error(`No Binance pair mapped for ${symbol}`)
  const res = await fetch(`${BINANCE}/klines?symbol=${pair}&interval=15m&limit=200`)
  if (!res.ok) throw new Error(`Binance ${res.status}`)
  const raw = await res.json()
  return {
    candles: raw.map((k) => ({ time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[7] / 1e6 })),
    at: Date.now(),
  }
}

function createPaperAdapter(config) {
  const ledger = {
    balance: config.startingBalance,
    startingBalance: config.startingBalance,
    peakBalance: config.startingBalance,
    dayStartBalance: config.startingBalance,
    tradesToday: 0,
    positions: [],
    fills: [],
    trades: [],
    episodes: [],
  }

  /** Latest traded price, from the same public feed the analysis uses. */
  async function lastPrice(symbol) {
    const res = await fetch(`${BINANCE}/ticker/price?symbol=${SYMBOL_MAP[symbol]}`)
    if (!res.ok) throw new Error(`Binance ${res.status}`)
    return Number((await res.json()).price)
  }

  return {
    ledger,

    /**
     * Marks open positions against live prices and closes any that reached
     * their stop or target, booking the realised P&L.
     *
     * Without this the bot only ever opens: positions accumulate, nothing is
     * realised, and the daily P&L stays at zero no matter what the market
     * does. Fills are charged a fee so paper results are not flattered — a
     * frictionless simulation is what makes a losing strategy look viable.
     */
    async markToMarket() {
      const closed = []
      let unrealised = 0

      for (const position of [...ledger.positions]) {
        let mark
        try {
          mark = await lastPrice(position.symbol)
        } catch {
          continue // leave the position open rather than exit on a bad read
        }

        const long = position.side === 'long'
        const hitStop = long ? mark <= position.stop : mark >= position.stop
        const hitTarget = position.target != null && (long ? mark >= position.target : mark <= position.target)

        if (!hitStop && !hitTarget) {
          unrealised += (long ? mark - position.entry : position.entry - mark) * position.qty
          continue
        }

        // Filled at the level, not at the mark: a stop that gapped through is
        // still modelled as filling at the stop. Slippage is not simulated, so
        // paper results are optimistic by exactly that amount.
        const exit = hitStop ? position.stop : position.target
        const gross = (long ? exit - position.entry : position.entry - exit) * position.qty
        const fee = Math.abs(exit * position.qty) * (FEE_BPS / 10_000)
        const pnl = gross - fee

        ledger.balance += pnl
        ledger.positions = ledger.positions.filter((p) => p.id !== position.id)
        const trade = { ...position, exit, pnl: +pnl.toFixed(2), fee: +fee.toFixed(2), reason: hitStop ? 'stop hit' : 'target hit', closedAt: Date.now() }
        ledger.trades.unshift(trade)
        closed.push(trade)
      }

      ledger.unrealisedPnl = +unrealised.toFixed(2)
      return closed
    },

    /**
     * Closes a position at the live mark, booking realised P&L and fees.
     * Used by the session-end flatten; the engine re-reads positions
     * afterwards rather than trusting this return value.
     */
    async closePosition(position, reason = 'manual close') {
      const mark = await lastPrice(position.symbol)
      const long = position.side === 'long'
      const gross = (long ? mark - position.entry : position.entry - mark) * position.qty
      const fee = Math.abs(mark * position.qty) * (FEE_BPS / 10_000)
      const pnl = gross - fee

      ledger.balance += pnl
      ledger.positions = ledger.positions.filter((p) => p.id !== position.id)
      const trade = { ...position, exit: mark, pnl: +pnl.toFixed(2), fee: +fee.toFixed(2), reason, closedAt: Date.now() }
      ledger.trades.unshift(trade)
      return trade
    },

    getAccount: async () => ({ ...ledger, availableMargin: ledger.balance }),
    getPositions: async () => [...ledger.positions],
    // Paper still honours the server kill switch: the switch is an operator
    // control over the bot, not merely a guard on the exchange connection.
    killSwitchEngaged: async () => resolveConfig().killSwitch,
    submitOrder: async ({ symbol, side, qty, price, stop, target, clientOrderId }) => {
      const position = {
        id: clientOrderId,
        symbol,
        side: side === 'buy' ? 'long' : 'short',
        qty,
        entry: price,
        stop,
        target,
        openedAt: Date.now(),
      }
      ledger.positions.push(position)
      ledger.tradesToday += 1
      ledger.fills.push({ orderId: clientOrderId, symbol, side, qty, price, at: Date.now() })
      return { orderId: clientOrderId, status: 'filled', fillPrice: price, simulated: true }
    },
  }
}

/**
 * Build the venue the bot will trade through.
 *
 * Paper is the default and stays the default. Selecting a real venue is an
 * explicit act, and live remains gated by the same two environment switches as
 * everywhere else — a venue choice made over HTTP must never be able to
 * promote testnet to live.
 */
function createVenue(mode, config) {
  if (mode !== 'ccxt') return createPaperAdapter(config)

  const delta = resolveConfig()
  if (!delta.hasCredentials) throw new Error('No Delta credentials configured; cannot use the ccxt venue.')

  return createCcxtVenue({
    region: delta.region,
    // Not `delta.live` alone: live requires both switches, and resolveConfig
    // has already collapsed that decision. Reusing its answer keeps one source
    // of truth for whether real money is reachable.
    live: delta.environment.live === true,
    apiKey: delta.apiKey,
    secret: delta.apiSecret,
    killSwitch: () => resolveConfig().killSwitch,
    maxOrderNotional: delta.maxOrderNotional,
  })
}

const engines = new Map()

export function getBot(accountId = 'default', overrides = null, venueMode = null) {
  let entry = engines.get(accountId)
  const switchingVenue = venueMode != null && venueMode !== entry?.mode
  if (!entry || overrides || switchingVenue) {
    // A config change rebuilds the engine, which is also how a running bot is
    // prevented from having its risk limits altered underneath it mid-cycle.
    entry?.engine.pause()
    const config = { ...DEFAULT_CONFIG, ...(entry?.config ?? {}), ...(overrides ?? {}) }
    // The ledger survives a config change. Rebuilding it would silently discard
    // open positions and their realised P&L — on a real venue the positions
    // would still exist while the bot forgot about them, which is the worst
    // possible outcome of editing a risk limit.
    const mode = venueMode ?? entry?.mode ?? 'paper'
    // A venue change builds a fresh adapter; a mere config change keeps the
    // existing ledger so open positions are not forgotten.
    const adapter = switchingVenue || !entry?.adapter ? createVenue(mode, config) : entry.adapter
    const logger = (event) => {
      entry2.events.unshift(event)
      entry2.events.length = Math.min(entry2.events.length, 100)
    }
    const entry2 = { config, adapter, events: [], mode }
    entry2.engine = createBotEngine({
      adapter,
      marketData,
      config,
      accountId,
      symbols: ['ETH', 'BTC', 'SOL', 'LINK'],
      intervalMs: 60_000,
      logger,
    })
    entry = entry2
    engines.set(accountId, entry)
  }
  return entry
}

/** Everything the dashboard needs, with nothing sensitive in it. */
export function botStatus(accountId = 'default') {
  const { engine, config, adapter, events, mode } = getBot(accountId)
  const delta = resolveConfig()
  return {
    accountId,
    mode,
    state: engine.getState(),
    running: engine.isRunning(),
    emergencyStop: engine.isEmergencyStopped(),
    killSwitch: delta.killSwitch,
    deltaEnvironment: delta.live ? 'live' : 'testnet',
    liveTradingAllowed: delta.allowLive === true && delta.live === true,
    config,
    account: {
      balance: adapter.ledger.balance,
      startingBalance: adapter.ledger.startingBalance,
      openPositions: adapter.ledger.positions.length,
      tradesToday: adapter.ledger.tradesToday,
    },
    positions: adapter.ledger.positions,
    session: {
      open: inWindow(Date.now(), config),
      aroundTheClock: isAroundTheClock(config),
      minutesToClose: minutesToClose(Date.now(), config),
      start: config.sessionStart,
      end: config.sessionEnd,
      timeZone: config.timeZone,
    },
    progress: dailyProgress({
      startingEquity: adapter.ledger.startingBalance,
      realisedPnl: adapter.ledger.balance - adapter.ledger.startingBalance,
      unrealisedPnl: adapter.ledger.unrealisedPnl ?? 0,
      config,
    }),
    report: dailyReport({
      startingEquity: adapter.ledger.startingBalance,
      endingEquity: adapter.ledger.balance,
      trades: adapter.ledger.trades,
      config,
      markets: adapter.ledger.trades.map((t) => t.symbol),
    }),
    trades: adapter.ledger.trades.slice(0, 20),
    journal: engine.getJournal().slice(0, 25),
    events: events.slice(0, 25),
  }
}

export { BOT_STATES }
