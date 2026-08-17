/**
 * Macro and flow context — the information a price chart cannot show you.
 *
 * Everything here is real and free:
 *   CoinGecko /global   — total crypto market cap, BTC dominance
 *   Yahoo (via /yf)     — VIX, dollar index, 10-year yield, gold, oil
 *   Binance futures     — funding rate and open interest (positioning)
 *   World indices       — breadth, i.e. how many markets are actually up
 *
 * The regime read combines them into risk-on / risk-off with every component
 * shown and weighted. It is context for a decision, not a prediction: a
 * risk-off reading does not mean price falls, it means the conditions that
 * historically accompany drawdowns are present.
 */

import { INDICES } from './stockApi.js'

const YF = import.meta.env?.VITE_STOCK_PROXY || '/yf'
const COINGECKO = 'https://api.coingecko.com/api/v3'
const BINANCE_FUTURES = 'https://fapi.binance.com'
const ALTERNATIVE_ME = 'https://api.alternative.me'
const HYPERLIQUID = 'https://api.hyperliquid.xyz/info'

const TTL_MS = 60_000
/** CoinGecko aggregates move slowly and its free tier throttles hard. */
const GLOBAL_TTL_MS = 5 * 60_000
const cache = new Map()

async function getJson(url, timeout = 9000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    if (!res.ok) throw new Error(`${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Yahoo symbols for the macro complex. */
export const MACRO_SYMBOLS = [
  { symbol: '^VIX', name: 'VIX', label: 'Volatility', hint: 'Equity fear gauge — high means stress' },
  { symbol: 'DX-Y.NYB', name: 'DXY', label: 'US dollar', hint: 'A strong dollar drains risk assets' },
  { symbol: '^TNX', name: 'US 10Y', label: 'Rates', hint: 'Higher yields compete with risk assets' },
  { symbol: 'GC=F', name: 'Gold', label: 'Haven', hint: 'Bid when capital wants safety' },
  { symbol: 'CL=F', name: 'Crude', label: 'Growth', hint: 'Demand proxy for the real economy' },
]

export async function getMacro() {
  const hit = cache.get('macro')
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value

  const [rates, crypto, flow, breadth, sentiment] = await Promise.all([
    getRates(),
    getCryptoAggregates(),
    getFlow(),
    getBreadth(),
    getSentiment(),
  ])
  // Divergence needs both venues from this same cycle, so it is computed here
  // rather than inside either fetcher.
  const withDivergence = { ...sentiment, divergence: computeDivergence(flow, sentiment.hyperliquid) }

  const value = {
    rates,
    crypto,
    flow,
    breadth,
    sentiment: withDivergence,
    regime: readRegime({ rates, crypto, flow, breadth, sentiment: withDivergence }),
    at: Date.now(),
  }
  cache.set('macro', { at: Date.now(), value })
  return value
}

/**
 * Sentiment and cross-venue positioning.
 *
 * Fear & Greed is a contrarian input, not a directional one: extreme fear marks
 * the conditions in which lows have historically formed, which is not the same
 * as calling a low. Cross-venue funding divergence is the more actionable
 * signal — when two venues disagree on what leverage costs, positioning is
 * lopsided somewhere.
 */
async function getSentiment() {
  const [fng, hyper] = await Promise.all([getFearGreed(), getHyperliquid()])
  return { ok: fng.ok || hyper.ok, fearGreed: fng, hyperliquid: hyper, divergence: null }
}

/**
 * Binance quotes funding per 8-hour period, Hyperliquid per hour. Comparing the
 * raw rates is meaningless — only the annualised figures share a basis.
 */
export function computeDivergence(flow, hyper) {
  if (!flow?.ok || !hyper?.ok) return null
  const spread = flow.fundingAnnualised - hyper.fundingAnnualised
  return {
    binanceAnnualised: flow.fundingAnnualised,
    hyperliquidAnnualised: hyper.fundingAnnualised,
    spreadPercent: +spread.toFixed(2),
  }
}

async function getFearGreed() {
  try {
    const json = await getJson(`${ALTERNATIVE_ME}/fng/?limit=30`)
    const series = (json.data ?? []).map((d) => ({
      value: +d.value,
      label: d.value_classification,
      at: +d.timestamp * 1000,
    }))
    if (!series.length) throw new Error('empty')
    const [latest, previous] = series
    return {
      ok: true,
      value: latest.value,
      label: latest.label,
      previous: previous?.value ?? null,
      change: previous ? latest.value - previous.value : 0,
      // Oldest first, so the chart reads left to right.
      history: [...series].reverse(),
      source: 'Alternative.me',
    }
  } catch {
    return { ok: false }
  }
}

/**
 * Hyperliquid publishes funding and open interest for 200+ perps with no key.
 * Its `info` endpoint is POST-only.
 */
async function getHyperliquid(coin = 'ETH') {
  try {
    const res = await fetch(HYPERLIQUID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const [meta, contexts] = await res.json()
    const index = (meta?.universe ?? []).findIndex((u) => u.name === coin)
    if (index < 0) throw new Error('coin not listed')
    const ctx = contexts[index]
    return {
      ok: true,
      coin,
      funding: +ctx.funding,
      // Hyperliquid quotes funding hourly; annualise for comparability.
      fundingAnnualised: +ctx.funding * 24 * 365 * 100,
      openInterestCoins: +ctx.openInterest,
      markPrice: +ctx.markPx,
      openInterestUsd: +ctx.openInterest * +ctx.markPx,
      universeSize: meta.universe.length,
      source: 'Hyperliquid',
    }
  } catch {
    return { ok: false }
  }
}

async function getRates() {
  try {
    const symbols = MACRO_SYMBOLS.map((s) => encodeURIComponent(s.symbol)).join(',')
    const json = await getJson(`${YF}/v8/finance/spark?symbols=${symbols}&range=1d&interval=5m`)
    const rows = MACRO_SYMBOLS.map((meta) => {
      const entry = json[meta.symbol]
      const closes = (entry?.close ?? []).filter((c) => c != null)
      if (!closes.length) return { ...meta, price: null, change: null }
      const price = closes[closes.length - 1]
      const previousClose = entry.previousClose ?? entry.chartPreviousClose ?? closes[0]
      return {
        ...meta,
        price,
        previousClose,
        change: ((price - previousClose) / previousClose) * 100,
        sparkline: closes.filter((_, i) => i % Math.max(1, Math.floor(closes.length / 24)) === 0),
      }
    })
    return { ok: rows.some((r) => r.price != null), rows, source: 'Yahoo Finance' }
  } catch {
    return { ok: false, rows: MACRO_SYMBOLS.map((m) => ({ ...m, price: null, change: null })), source: null }
  }
}

async function getCryptoAggregates() {
  const hit = cache.get('global')
  if (hit && Date.now() - hit.at < GLOBAL_TTL_MS) return hit.value

  try {
    const json = await getJson(`${COINGECKO}/global`)
    const d = json.data
    const value = {
      ok: true,
      totalMarketCap: d.total_market_cap.usd,
      change24h: d.market_cap_change_percentage_24h_usd,
      btcDominance: d.market_cap_percentage.btc,
      ethDominance: d.market_cap_percentage.eth,
      volume24h: d.total_volume.usd,
      source: 'CoinGecko',
    }
    cache.set('global', { at: Date.now(), value })
    return value
  } catch {
    // Serve the last good reading rather than blanking the panel on a throttle.
    return hit?.value ? { ...hit.value, stale: true } : { ok: false }
  }
}

/**
 * Derivatives positioning. Funding is what longs pay shorts each period —
 * persistently positive funding means the long side is crowded and paying for
 * the privilege, which is a crowding signal rather than a direction signal.
 */
async function getFlow() {
  try {
    const [premium, oi] = await Promise.all([
      getJson(`${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=ETHUSDT`),
      getJson(`${BINANCE_FUTURES}/futures/data/openInterestHist?symbol=ETHUSDT&period=1h&limit=24`),
    ])
    const series = Array.isArray(oi) ? oi.map((p) => +p.sumOpenInterestValue) : []
    const latest = series[series.length - 1] ?? null
    const first = series[0] ?? null
    return {
      ok: true,
      fundingRate: +premium.lastFundingRate,
      // Annualised from the 8-hour funding period, which is how it is quoted.
      fundingAnnualised: +premium.lastFundingRate * 3 * 365 * 100,
      markPrice: +premium.markPrice,
      openInterest: latest,
      openInterestChange24h: first && latest ? ((latest - first) / first) * 100 : null,
      openInterestSeries: series,
      source: 'Binance futures',
    }
  } catch {
    return { ok: false }
  }
}

/** Breadth: the share of world indices trading up on the session. */
async function getBreadth() {
  try {
    const symbols = INDICES.map((i) => encodeURIComponent(i.symbol)).join(',')
    const json = await getJson(`${YF}/v8/finance/spark?symbols=${symbols}&range=1d&interval=5m`)
    const rows = INDICES.map((meta) => {
      const entry = json[meta.symbol]
      const closes = (entry?.close ?? []).filter((c) => c != null)
      if (!closes.length) return { ...meta, change: null }
      const price = closes[closes.length - 1]
      const prev = entry.previousClose ?? entry.chartPreviousClose ?? closes[0]
      return { ...meta, price, change: ((price - prev) / prev) * 100 }
    })
    const scored = rows.filter((r) => r.change != null)
    const advancing = scored.filter((r) => r.change > 0).length
    return {
      ok: scored.length > 0,
      rows,
      advancing,
      total: scored.length,
      pct: scored.length ? (advancing / scored.length) * 100 : null,
      source: 'Yahoo Finance',
    }
  } catch {
    return { ok: false, rows: [], advancing: 0, total: 0, pct: null }
  }
}

/**
 * Combine the inputs into a regime read. Each factor votes with a weight and
 * carries the number it fired on, so the conclusion can be inspected rather
 * than taken on faith.
 */
export function readRegime({ rates, crypto, flow, breadth, sentiment }) {
  const factors = []
  const add = (name, verdict, weight, detail) => factors.push({ name, verdict, weight, detail })

  const vix = rates?.rows?.find((r) => r.symbol === '^VIX')
  if (vix?.price != null) {
    if (vix.price < 16) add('Volatility (VIX)', 'risk-on', 1.5, `${vix.price.toFixed(2)} — calm`)
    else if (vix.price > 25) add('Volatility (VIX)', 'risk-off', 2, `${vix.price.toFixed(2)} — stressed`)
    else add('Volatility (VIX)', 'neutral', 0, `${vix.price.toFixed(2)} — ordinary`)
  }

  const dxy = rates?.rows?.find((r) => r.symbol === 'DX-Y.NYB')
  if (dxy?.change != null) {
    if (dxy.change > 0.3) add('US dollar', 'risk-off', 1, `+${dxy.change.toFixed(2)}% — dollar bid drains risk assets`)
    else if (dxy.change < -0.3) add('US dollar', 'risk-on', 1, `${dxy.change.toFixed(2)}% — dollar soft`)
    else add('US dollar', 'neutral', 0, `${dxy.change.toFixed(2)}% — flat`)
  }

  const tnx = rates?.rows?.find((r) => r.symbol === '^TNX')
  if (tnx?.change != null) {
    if (tnx.change > 1) add('10-year yield', 'risk-off', 1, `+${tnx.change.toFixed(2)}% — rates pressing`)
    else if (tnx.change < -1) add('10-year yield', 'risk-on', 1, `${tnx.change.toFixed(2)}% — rates easing`)
    else add('10-year yield', 'neutral', 0, `${tnx.change.toFixed(2)}%`)
  }

  if (breadth?.pct != null) {
    if (breadth.pct >= 66) add('Global breadth', 'risk-on', 1.5, `${breadth.advancing}/${breadth.total} indices up`)
    else if (breadth.pct <= 33) add('Global breadth', 'risk-off', 1.5, `${breadth.advancing}/${breadth.total} indices up`)
    else add('Global breadth', 'neutral', 0, `${breadth.advancing}/${breadth.total} indices up — mixed`)
  }

  if (crypto?.ok) {
    if (crypto.change24h > 1.5) add('Crypto market cap', 'risk-on', 1, `+${crypto.change24h.toFixed(2)}% in 24h`)
    else if (crypto.change24h < -1.5) add('Crypto market cap', 'risk-off', 1, `${crypto.change24h.toFixed(2)}% in 24h`)
    else add('Crypto market cap', 'neutral', 0, `${crypto.change24h.toFixed(2)}% in 24h`)

    // Capital hiding in BTC is defensive behaviour inside crypto.
    if (crypto.btcDominance > 58) add('BTC dominance', 'risk-off', 1, `${crypto.btcDominance.toFixed(1)}% — capital defensive`)
    else if (crypto.btcDominance < 50) add('BTC dominance', 'risk-on', 1, `${crypto.btcDominance.toFixed(1)}% — appetite for altcoins`)
    else add('BTC dominance', 'neutral', 0, `${crypto.btcDominance.toFixed(1)}%`)
  }

  if (flow?.ok) {
    const annual = flow.fundingAnnualised
    if (annual > 20) add('Perp funding', 'crowded-long', 1.5, `${annual.toFixed(1)}% annualised — longs paying up`)
    else if (annual < -10) add('Perp funding', 'crowded-short', 1.5, `${annual.toFixed(1)}% annualised — shorts paying`)
    else add('Perp funding', 'neutral', 0, `${annual.toFixed(1)}% annualised — balanced`)

    if (flow.openInterestChange24h != null) {
      const oi = flow.openInterestChange24h
      if (Math.abs(oi) > 5) add('Open interest', 'neutral', 0, `${oi > 0 ? '+' : ''}${oi.toFixed(1)}% in 24h — leverage ${oi > 0 ? 'building' : 'unwinding'}`)
      else add('Open interest', 'neutral', 0, `${oi > 0 ? '+' : ''}${oi.toFixed(1)}% in 24h — steady`)
    }
  }

  // Sentiment reads contrarian: crowds are most confident at the wrong moments.
  const fng = sentiment?.fearGreed
  if (fng?.ok) {
    if (fng.value <= 25) add('Fear & Greed', 'risk-on', 1, `${fng.value} (${fng.label}) — capitulation conditions, contrarian bullish`)
    else if (fng.value >= 75) add('Fear & Greed', 'risk-off', 1, `${fng.value} (${fng.label}) — euphoria, contrarian bearish`)
    else add('Fear & Greed', 'neutral', 0, `${fng.value} (${fng.label})`)
  }

  // Two venues disagreeing on the price of leverage means positioning is
  // lopsided on one of them.
  const div = sentiment?.divergence
  if (div) {
    // Below ~3 percentage points annualised the two venues agree in practice.
    if (Math.abs(div.spreadPercent) > 3) {
      add(
        'Venue funding spread',
        'neutral',
        0,
        `${div.spreadPercent > 0 ? 'Binance' : 'Hyperliquid'} longs paying more — ${Math.abs(div.spreadPercent).toFixed(1)}pp apart annualised`,
      )
    } else {
      add('Venue funding spread', 'neutral', 0, `venues agree within ${Math.abs(div.spreadPercent).toFixed(1)}pp — positioning balanced`)
    }
  }

  const on = factors.filter((f) => f.verdict === 'risk-on').reduce((s, f) => s + f.weight, 0)
  const off = factors.filter((f) => f.verdict === 'risk-off').reduce((s, f) => s + f.weight, 0)
  const net = on - off

  const label = net >= 2.5 ? 'Risk-on' : net >= 1 ? 'Leaning risk-on' : net <= -2.5 ? 'Risk-off' : net <= -1 ? 'Leaning risk-off' : 'Mixed'
  const tone = net >= 1 ? 'emerald' : net <= -1 ? 'rose' : 'slate'
  const crowding = factors.find((f) => f.verdict === 'crowded-long' || f.verdict === 'crowded-short')

  return {
    label,
    tone,
    net: +net.toFixed(1),
    riskOn: +on.toFixed(1),
    riskOff: +off.toFixed(1),
    factors,
    crowding: crowding?.verdict ?? null,
    summary: buildSummary(label, factors, crowding),
  }
}

function buildSummary(label, factors, crowding) {
  const leading = factors
    .filter((f) => f.weight > 0 && (f.verdict === 'risk-on' || f.verdict === 'risk-off'))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 2)

  if (!leading.length) return `${label}. No factor is pulling hard in either direction right now.`

  const parts = leading.map((f) => `${f.name.toLowerCase()} (${f.detail})`).join(' and ')
  const crowdNote =
    crowding === 'crowded-long'
      ? ' Positioning is crowded long, which historically makes downside moves faster than upside ones.'
      : crowding === 'crowded-short'
        ? ' Positioning is crowded short, which can fuel a squeeze higher.'
        : ''

  return `${label}, driven by ${parts}.${crowdNote} This is the backdrop a trade is taken into — it does not predict the next move.`
}
