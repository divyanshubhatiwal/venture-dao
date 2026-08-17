/**
 * Live FX rates, for showing prices in the viewer's own currency.
 *
 * Crypto and US equities are quoted in USD by their exchanges. Someone in
 * India reading "$1,883" has to do the conversion in their head, so the app
 * offers to do it — but only ever at a real, fetched rate.
 *
 * The rate comes from Yahoo's `USDINR=X` pair through the proxy the app
 * already uses for equities, so this adds no new provider, key or CORS
 * problem. If that fetch fails there is deliberately no fallback constant:
 * a stale or invented exchange rate silently misprices every number on the
 * screen, which is worse than leaving the price in the currency it was
 * actually quoted in. Callers get `null` and keep showing USD.
 */

const BASE = import.meta.env?.VITE_STOCK_PROXY || '/yf'
const TTL_MS = 10 * 60_000

const cache = new Map()

/** Currencies we can convert USD into, and how to format them. */
export const SUPPORTED = {
  USD: { code: 'USD', symbol: '$', locale: 'en-US' },
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN' },
}

/**
 * The viewer's likely currency, from the browser's own timezone.
 *
 * Timezone rather than `navigator.language`: language says which language the
 * OS is set to, not where the person is — an en-US browser in Mumbai is the
 * common case, and guessing USD from it would defeat the point.
 */
export function detectCurrency() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
    if (tz === 'Asia/Kolkata' || tz === 'Asia/Calcutta') return 'INR'
  } catch {
    /* fall through to the quote currency */
  }
  return 'USD'
}

/** Live USD → `code` rate, or null if it cannot be fetched. Never guessed. */
export async function getRate(code) {
  if (code === 'USD') return 1
  if (!SUPPORTED[code]) return null

  const hit = cache.get(code)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.rate

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`${BASE}/v8/finance/chart/USD${code}=X?range=1d&interval=1d`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    }).finally(() => clearTimeout(timer))
    if (!res.ok) throw new Error(String(res.status))

    const json = await res.json()
    const rate = json?.chart?.result?.[0]?.meta?.regularMarketPrice
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('no rate in payload')

    cache.set(code, { at: Date.now(), rate })
    return rate
  } catch {
    // No fallback on purpose. See the note at the top of this file.
    return null
  }
}

/** Format an amount already denominated in `code`. */
export function formatIn(value, code) {
  if (value == null || !Number.isFinite(value)) return '—'
  const cfg = SUPPORTED[code] ?? SUPPORTED.USD
  const digits = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 2 : 4
  return cfg.symbol + value.toLocaleString(cfg.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
