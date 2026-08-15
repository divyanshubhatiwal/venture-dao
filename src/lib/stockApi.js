import { SNAPSHOT_CANDLES, SNAPSHOT_INDEX_QUOTES, SNAPSHOT_STOCK_QUOTES, STOCK_SNAPSHOT_CAPTURED_AT } from './stockSnapshot'

/**
 * World equity and index data from Yahoo Finance.
 *
 * Yahoo sends no CORS headers, so requests go through a same-origin path:
 * the Vite dev proxy in development (see vite.config.js), and the Express
 * backend in production. Set VITE_STOCK_PROXY if that path differs.
 *
 * Same contract as marketApi.js — live provider first, captured snapshot
 * second, and `source`/`stale` on every response so the UI can say which one
 * is on screen.
 */

const BASE = import.meta.env.VITE_STOCK_PROXY || '/yf'

export const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500', region: 'United States', currency: 'USD' },
  { symbol: '^IXIC', name: 'Nasdaq Composite', region: 'United States', currency: 'USD' },
  { symbol: '^DJI', name: 'Dow Jones', region: 'United States', currency: 'USD' },
  { symbol: '^FTSE', name: 'FTSE 100', region: 'United Kingdom', currency: 'GBP' },
  { symbol: '^GDAXI', name: 'DAX', region: 'Germany', currency: 'EUR' },
  { symbol: '^N225', name: 'Nikkei 225', region: 'Japan', currency: 'JPY' },
  { symbol: '^HSI', name: 'Hang Seng', region: 'Hong Kong', currency: 'HKD' },
  { symbol: '^BSESN', name: 'BSE Sensex', region: 'India', currency: 'INR' },
  { symbol: '^NSEI', name: 'Nifty 50', region: 'India', currency: 'INR' },
]

export const STOCKS = [
  { symbol: 'NVDA', name: 'NVIDIA', region: 'United States', currency: 'USD' },
  { symbol: 'AAPL', name: 'Apple', region: 'United States', currency: 'USD' },
  { symbol: 'MSFT', name: 'Microsoft', region: 'United States', currency: 'USD' },
  { symbol: 'GOOGL', name: 'Alphabet', region: 'United States', currency: 'USD' },
  { symbol: 'AMZN', name: 'Amazon', region: 'United States', currency: 'USD' },
  { symbol: 'META', name: 'Meta Platforms', region: 'United States', currency: 'USD' },
  { symbol: 'TSLA', name: 'Tesla', region: 'United States', currency: 'USD' },
  { symbol: 'COIN', name: 'Coinbase', region: 'United States', currency: 'USD' },
]

/**
 * Yahoo caps intraday history by interval: 1m only goes back ~7 days, 5m/15m
 * ~60 days. Each entry pairs an interval with the longest range it supports.
 */
export const STOCK_RANGES = [
  { key: '1m', label: '1m', range: '1d', interval: '1m', intraday: true },
  { key: '5m', label: '5m', range: '5d', interval: '5m', intraday: true },
  { key: '15m', label: '15m', range: '5d', interval: '15m', intraday: true },
  { key: '1h', label: '1H', range: '1mo', interval: '60m', intraday: true },
  { key: '1D', label: '1D', range: '6mo', interval: '1d', intraday: false },
  { key: '1W', label: '1W', range: '2y', interval: '1wk', intraday: false },
]

const TTL_MS = 60_000
/** Quotes are polled hard for a live feel; candles keep the longer TTL. */
const QUOTE_TTL_MS = 4_000
/** A market with no print in this long is treated as closed. */
const STALE_TICK_MS = 15 * 60_000
const cache = new Map()

async function getJson(url, timeout = 9000) {
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

const cached = (key, ttl = TTL_MS) => {
  const hit = cache.get(key)
  return hit && Date.now() - hit.at < ttl ? hit.value : null
}
const store = (key, value) => {
  cache.set(key, { at: Date.now(), value })
  return value
}

const META = new Map([...INDICES, ...STOCKS].map((s) => [s.symbol, s]))

/** Symbols like ^GSPC need encoding before they can sit in a URL. */
const enc = (s) => encodeURIComponent(s)

/* ---------- candles ---------- */

/**
 * OHLCV candles for one equity or index.
 * Yahoo returns parallel arrays with nulls on non-trading slots — those rows
 * are dropped rather than interpolated, so gaps stay honest.
 */
export async function getStockCandles(symbol = '^GSPC', rangeKey = '1D') {
  const range = STOCK_RANGES.find((r) => r.key === rangeKey) ?? STOCK_RANGES[4]
  const key = `sc:${symbol}:${rangeKey}`
  const hit = cached(key)
  if (hit) return hit

  try {
    const json = await getJson(`${BASE}/v8/finance/chart/${enc(symbol)}?range=${range.range}&interval=${range.interval}`)
    const result = json?.chart?.result?.[0]
    if (!result?.timestamp) throw new Error('empty chart payload')

    const q = result.indicators.quote[0]
    const candles = result.timestamp
      .map((t, i) => ({
        time: t * 1000,
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume?.[i] ? q.volume[i] / 1e6 : 0,
      }))
      .filter((c) => c.open != null && c.close != null && c.high != null && c.low != null)

    return store(key, {
      candles,
      source: 'Yahoo Finance',
      stale: false,
      intraday: range.intraday,
      currency: result.meta?.currency ?? META.get(symbol)?.currency ?? 'USD',
      exchange: result.meta?.fullExchangeName ?? '',
      marketTime: result.meta?.regularMarketTime ? result.meta.regularMarketTime * 1000 : null,
      previousClose: result.meta?.chartPreviousClose ?? null,
    })
  } catch {
    const fallback = SNAPSHOT_CANDLES[symbol] ?? []
    return store(key, {
      candles: fallback.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume })),
      source: 'Snapshot',
      stale: true,
      intraday: false,
      currency: META.get(symbol)?.currency ?? 'USD',
      exchange: '',
      marketTime: null,
      capturedAt: STOCK_SNAPSHOT_CAPTURED_AT,
    })
  }
}

/* ---------- quotes ---------- */

/**
 * Last price, session change and an intraday sparkline for many symbols in one
 * request. Yahoo's /v7/finance/quote now requires an authenticated crumb, so
 * this uses the spark endpoint, which does not.
 */
async function getQuotes(list, cacheKey, snapshot) {
  const hit = cached(cacheKey, QUOTE_TTL_MS)
  if (hit) return hit

  try {
    const symbols = list.map((s) => enc(s.symbol)).join(',')
    const json = await getJson(`${BASE}/v8/finance/spark?symbols=${symbols}&range=1d&interval=5m`)

    const rows = list
      .map((s) => {
        const entry = json[s.symbol]
        const closes = (entry?.close ?? []).filter((c) => c != null)
        if (!closes.length) return null
        const price = closes[closes.length - 1]
        const previousClose = entry.previousClose ?? entry.chartPreviousClose ?? closes[0]
        const step = Math.max(1, Math.floor(closes.length / 24))
        // Last print on the tape. If it is old, the exchange is shut and this
        // price is genuinely frozen — say so rather than implying it is live.
        const stamps = entry.timestamp ?? []
        const lastTick = stamps.length ? stamps[stamps.length - 1] * 1000 : null
        return {
          ...s,
          price,
          previousClose,
          change: ((price - previousClose) / previousClose) * 100,
          sparkline: closes.filter((_, i) => i % step === 0),
          lastTick,
          marketOpen: lastTick ? Date.now() - lastTick < STALE_TICK_MS : false,
        }
      })
      .filter(Boolean)

    if (!rows.length) throw new Error('no quotes returned')
    return store(cacheKey, { rows, source: 'Yahoo Finance', stale: false })
  } catch {
    const rows = snapshot.map((r) => ({ ...META.get(r.symbol), ...r }))
    return store(cacheKey, { rows, source: 'Snapshot', stale: true, capturedAt: STOCK_SNAPSHOT_CAPTURED_AT })
  }
}

export const getIndexQuotes = () => getQuotes(INDICES, 'indices', SNAPSHOT_INDEX_QUOTES)
export const getStockQuotes = () => getQuotes(STOCKS, 'stocks', SNAPSHOT_STOCK_QUOTES)

/** Currency-aware price formatting — the DAX is in EUR, the Sensex in INR. */
export function formatPrice(value, currency = 'USD') {
  if (value == null) return '—'
  const symbols = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', HKD: 'HK$', INR: '₹' }
  const prefix = symbols[currency] ?? ''
  const decimals = value >= 1000 ? 2 : value >= 1 ? 2 : 4
  return `${prefix}${value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}
