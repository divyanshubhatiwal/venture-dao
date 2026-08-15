import { ETH_DAILY_CANDLES, SNAPSHOT_CAPTURED_AT, SNAPSHOT_TICKERS } from './marketSnapshot.js'

/**
 * Live market data for the treasury's asset class.
 *
 * Two independent public providers, then a captured snapshot:
 *   Binance    — OHLC + volume in one call, generous rate limits
 *   CoinGecko  — market caps, 7d sparklines, broader coverage
 *   Snapshot   — real data captured 2026-08-12, so the demo survives a dead
 *                venue connection
 *
 * Every response carries `source`, and the UI shows which one produced the
 * numbers on screen. A snapshot is never presented as live.
 */

const BINANCE = 'https://api.binance.com/api/v3'
const COINGECKO = 'https://api.coingecko.com/api/v3'

export const WATCHLIST = [
  { id: 'ethereum', symbol: 'ETH', binance: 'ETHUSDT', name: 'Ethereum' },
  { id: 'bitcoin', symbol: 'BTC', binance: 'BTCUSDT', name: 'Bitcoin' },
  { id: 'solana', symbol: 'SOL', binance: 'SOLUSDT', name: 'Solana' },
  { id: 'chainlink', symbol: 'LINK', binance: 'LINKUSDT', name: 'Chainlink' },
  { id: 'uniswap', symbol: 'UNI', binance: 'UNIUSDT', name: 'Uniswap' },
  { id: 'aave', symbol: 'AAVE', binance: 'AAVEUSDT', name: 'Aave' },
  { id: 'arbitrum', symbol: 'ARB', binance: 'ARBUSDT', name: 'Arbitrum' },
  { id: 'optimism', symbol: 'OP', binance: 'OPUSDT', name: 'Optimism' },
]

export const RANGES = [
  { key: '1m', label: '1m', interval: '1m', limit: 180, days: 1 },
  { key: '5m', label: '5m', interval: '5m', limit: 200, days: 1 },
  { key: '15m', label: '15m', interval: '15m', limit: 200, days: 7 },
  { key: '1h', label: '1H', interval: '1h', limit: 200, days: 30 },
  { key: '4h', label: '4H', interval: '4h', limit: 180, days: 30 },
  { key: '1D', label: '1D', interval: '1d', limit: 180, days: 180 },
]

const TTL_MS = 60_000
/**
 * Live prices come from the websocket, so the REST snapshot only needs to
 * supply the slow-moving fields (market cap, 7d sparkline). CoinGecko's free
 * tier is strict — and answers a rate-limit by dropping CORS headers, which
 * surfaces as an opaque CORS error — so poll it gently.
 */
const TICKER_TTL_MS = 5 * 60_000
const cache = new Map()

async function getJson(url, timeout = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function cached(key, ttl = TTL_MS) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  return null
}

function store(key, value) {
  cache.set(key, { at: Date.now(), value })
  return value
}

/* ---------- candles ---------- */

const toCandle = ([time, open, high, low, close, volume]) => ({
  time,
  open: +open,
  high: +high,
  low: +low,
  close: +close,
  volume: +volume,
})

/**
 * OHLCV candles for one asset. Returns `{ candles, source, stale }`.
 * CoinGecko's OHLC endpoint carries no volume, so volume is omitted rather
 * than faked when that provider is used.
 */
export async function getCandles(symbol = 'ETH', rangeKey = '1D', { fresh = false } = {}) {
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[5]
  const asset = WATCHLIST.find((c) => c.symbol === symbol) ?? WATCHLIST[0]
  const key = `candles:${symbol}:${rangeKey}`
  // The chart's background refresh passes `fresh`: it runs on a shorter period
  // than the cache TTL, so without this it would keep being handed the very
  // snapshot it is trying to replace.
  const hit = fresh ? null : cached(key)
  if (hit) return hit

  try {
    const raw = await getJson(`${BINANCE}/klines?symbol=${asset.binance}&interval=${range.interval}&limit=${range.limit}`)
    const candles = raw.map((k) => toCandle([k[0], k[1], k[2], k[3], k[4], +k[7] / 1e6]))
    return store(key, { candles, source: 'Binance', stale: false, hasVolume: true })
  } catch {
    /* fall through to CoinGecko */
  }

  try {
    const raw = await getJson(`${COINGECKO}/coins/${asset.id}/ohlc?vs_currency=usd&days=${range.days}`)
    const candles = raw.map(([t, o, h, l, c]) => toCandle([t, o, h, l, c, 0]))
    return store(key, { candles, source: 'CoinGecko', stale: false, hasVolume: false })
  } catch {
    /* fall through to snapshot */
  }

  // Snapshot only covers ETH daily; other assets degrade to an empty series
  // rather than showing one asset's prices under another's name.
  const candles = symbol === 'ETH' ? ETH_DAILY_CANDLES.map(toCandle).slice(-range.limit) : []
  return store(key, { candles, source: 'Snapshot', stale: true, hasVolume: symbol === 'ETH', capturedAt: SNAPSHOT_CAPTURED_AT })
}

/* ---------- tickers ---------- */

/** Watchlist rows with 24h/7d change, market cap and a 7d sparkline. */
export async function getTickers() {
  const key = 'tickers'
  const hit = cached(key, TICKER_TTL_MS)
  if (hit) return hit

  const ids = WATCHLIST.map((c) => c.id).join(',')
  try {
    const raw = await getJson(
      `${COINGECKO}/coins/markets?vs_currency=usd&ids=${ids}&sparkline=true&price_change_percentage=24h,7d`,
    )
    const order = new Map(WATCHLIST.map((c, i) => [c.id, i]))
    const rows = raw
      .map((c) => ({
        id: c.id,
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        change24h: c.price_change_percentage_24h_in_currency ?? 0,
        change7d: c.price_change_percentage_7d_in_currency ?? 0,
        marketCap: c.market_cap,
        volume: c.total_volume,
        // 168 hourly points is more than a 60px sparkline can show — thin it out.
        sparkline: (c.sparkline_in_7d?.price ?? []).filter((_, i) => i % 7 === 0),
      }))
      .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
    return store(key, { rows, source: 'CoinGecko', stale: false })
  } catch {
    /* fall through to Binance */
  }

  try {
    const symbols = encodeURIComponent(JSON.stringify(WATCHLIST.map((c) => c.binance)))
    const raw = await getJson(`${BINANCE}/ticker/24hr?symbols=${symbols}`)
    const bySymbol = new Map(raw.map((r) => [r.symbol, r]))
    const rows = WATCHLIST.map((c) => {
      const r = bySymbol.get(c.binance)
      return {
        id: c.id,
        symbol: c.symbol,
        name: c.name,
        price: r ? +r.lastPrice : null,
        change24h: r ? +r.priceChangePercent : 0,
        change7d: null, // Binance's 24h endpoint has no 7d window
        marketCap: null,
        volume: r ? +r.quoteVolume : null,
        sparkline: [],
      }
    })
    return store(key, { rows, source: 'Binance', stale: false })
  } catch {
    /* fall through to snapshot */
  }

  return store(key, { rows: SNAPSHOT_TICKERS, source: 'Snapshot', stale: true, capturedAt: SNAPSHOT_CAPTURED_AT })
}

/** Spot ETH price — used to value the treasury at the real market rate. */
export async function getEthPrice() {
  const { rows, source, stale } = await getTickers()
  const eth = rows.find((r) => r.symbol === 'ETH')
  return { price: eth?.price ?? null, change24h: eth?.change24h ?? 0, source, stale }
}

/* ---------- indicators ---------- */

/** Simple moving average, aligned to the candle series (null until warm). */
export function sma(candles, period) {
  const out = []
  let sum = 0
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close
    if (i >= period) sum -= candles[i - period].close
    out.push(i >= period - 1 ? +(sum / period).toFixed(2) : null)
  }
  return out
}
