/**
 * Market news feeds.
 *
 * Runs on the server for two reasons. Publishers do not send CORS headers on
 * their RSS, so a browser cannot read these at all; and the cache below means
 * a hundred people opening the trading page cost the publisher one request
 * every five minutes rather than a hundred requests at once.
 *
 * WHAT IS SHOWN: headline, source, timestamp, and a short trimmed snippet,
 * each linking back to the publisher's own page. The full article text is
 * theirs, arrives in the feed, and is deliberately not reproduced here — a
 * reader that keeps people from ever clicking through is taking something it
 * was not given.
 *
 * The published `pubDate` is passed through untouched. Re-stamping items with
 * fetch time would make week-old analysis look like a headline that just broke,
 * which on a trading screen is not a cosmetic difference.
 */

const CACHE_MS = 5 * 60_000
const FETCH_TIMEOUT_MS = 8_000
const SNIPPET_CHARS = 180
const MAX_ITEMS = 24

/**
 * Identifies itself honestly. Every one of these serves this feed to `User-agent: *`,
 * so there is nothing to work around by pretending to be a browser.
 */
const USER_AGENT = 'VentureDAO/1.0 (market news reader; personal dashboard)'

export const FEEDS = [
  { id: 'bs', source: 'Business Standard', url: 'https://www.business-standard.com/rss/markets-106.rss' },
  { id: 'et', source: 'Economic Times', url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms' },
  { id: 'mc', source: 'Moneycontrol', url: 'https://www.moneycontrol.com/rss/marketreports.xml' },
]

let cache = { at: 0, payload: null }

const stripCdata = (value) => value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')

const decodeEntities = (value) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&') // last, so "&amp;lt;" does not become "<"

/** First occurrence of <tag>…</tag>, CDATA unwrapped and entities decoded. */
function tagText(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))
  if (!match) return ''
  return decodeEntities(stripCdata(match[1]))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Trim on a word boundary; a snippet cut mid-word reads as a bug. */
function snippet(text) {
  if (text.length <= SNIPPET_CHARS) return text
  const cut = text.slice(0, SNIPPET_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 80 ? lastSpace : SNIPPET_CHARS).trimEnd()}…`
}

export function parseFeed(xml, { source, id }) {
  const items = []
  for (const block of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
    const title = tagText(block, 'title')
    const link = tagText(block, 'link') || tagText(block, 'guid')
    if (!title || !link) continue

    const published = Date.parse(tagText(block, 'pubDate'))
    items.push({
      id: `${id}:${link}`,
      title,
      link,
      source,
      // NaN rather than Date.now(): an item whose date we could not read is
      // better shown as undated than as breaking news.
      publishedAt: Number.isFinite(published) ? published : null,
      summary: snippet(tagText(block, 'description')),
    })
  }
  return items
}

/**
 * Merge every feed. One publisher being down must not blank the panel, so
 * failures are collected and reported alongside whatever did arrive.
 */
export async function fetchMarketNews({ now = Date.now(), fetchImpl = fetch, feeds = FEEDS } = {}) {
  const results = await Promise.all(
    feeds.map(async (feed) => {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        const res = await fetchImpl(feed.url, {
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
        }).finally(() => clearTimeout(timer))

        if (!res.ok) return { feed, error: `HTTP ${res.status}` }
        return { feed, items: parseFeed(await res.text(), feed) }
      } catch (err) {
        return { feed, error: err?.name === 'AbortError' ? 'timed out' : (err?.message ?? 'failed') }
      }
    }),
  )

  const seen = new Set()
  const items = results
    .flatMap((r) => r.items ?? [])
    // Wire copy runs in several papers at once; the same headline twice looks
    // like two events.
    .filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
    .slice(0, MAX_ITEMS)

  return {
    items,
    fetchedAt: now,
    sources: results.map((r) => ({
      source: r.feed.source,
      ok: !r.error,
      ...(r.error ? { error: r.error } : { count: r.items.length }),
    })),
  }
}

/** Cached read. Serves a stale payload if every upstream is failing, saying so. */
export async function getMarketNews({ now = Date.now(), fetchImpl = fetch, feeds = FEEDS, force = false } = {}) {
  if (!force && cache.payload && now - cache.at < CACHE_MS) {
    return { ...cache.payload, cached: true, ageMs: now - cache.at }
  }

  const payload = await fetchMarketNews({ now, fetchImpl, feeds })

  // An empty result usually means transient upstream trouble. Last known
  // headlines, labelled with their real age, beat an empty panel — but they
  // are never passed off as fresh.
  if (!payload.items.length && cache.payload?.items.length) {
    return { ...cache.payload, cached: true, stale: true, ageMs: now - cache.at, sources: payload.sources }
  }

  cache = { at: now, payload }
  return { ...payload, cached: false, ageMs: 0 }
}

export function _resetNewsCache() {
  cache = { at: 0, payload: null }
}
