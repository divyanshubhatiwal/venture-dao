import { beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetNewsCache, fetchMarketNews, getMarketNews, parseFeed } from '../market/news.js'

const feed = (items) => `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>Test</title>${items}</channel></rss>`

const item = ({ title = 'Sensex ends lower', link = 'https://example.com/a', date = 'Sun, 16 Aug 2026 18:06:44 +0530', desc = 'Short body.' } = {}) =>
  `<item><title><![CDATA[${title}]]></title><link>${link}</link><pubDate>${date}</pubDate><description><![CDATA[${desc}]]></description></item>`

const ok = (body) => ({ ok: true, status: 200, text: async () => body })

describe('parseFeed', () => {
  const meta = { source: 'Test Wire', id: 't' }

  it('pulls title, link, source and published time', () => {
    const [parsed] = parseFeed(feed(item()), meta)
    expect(parsed.title).toBe('Sensex ends lower')
    expect(parsed.link).toBe('https://example.com/a')
    expect(parsed.source).toBe('Test Wire')
    expect(new Date(parsed.publishedAt).toISOString()).toBe('2026-08-16T12:36:44.000Z')
  })

  it('unwraps CDATA and decodes entities', () => {
    const [parsed] = parseFeed(feed(item({ title: 'M&amp;M up 4%; Q1 &quot;beat&quot;' })), meta)
    expect(parsed.title).toBe('M&M up 4%; Q1 "beat"')
  })

  it('decodes &amp; last, so escaped markup does not become a tag', () => {
    const [parsed] = parseFeed(feed(item({ title: 'Tag &amp;lt;b&amp;gt; stays text' })), meta)
    expect(parsed.title).toBe('Tag &lt;b&gt; stays text')
  })

  it('strips embedded HTML out of summaries', () => {
    const [parsed] = parseFeed(feed(item({ desc: '<p>Nifty <b>fell</b> 0.8%</p>' })), meta)
    expect(parsed.summary).toBe('Nifty fell 0.8%')
  })

  it('leaves an unreadable date null rather than stamping it now', () => {
    // The failure that matters: an undated item shown as fresh is a week-old
    // article presented as breaking news on a trading screen.
    const [parsed] = parseFeed(feed(item({ date: 'not a date' })), meta)
    expect(parsed.publishedAt).toBeNull()
  })

  it('skips items with no title or no link', () => {
    const broken = '<item><description>orphan</description></item>'
    expect(parseFeed(feed(broken + item()), meta)).toHaveLength(1)
  })

  it('truncates long summaries on a word boundary', () => {
    const [parsed] = parseFeed(feed(item({ desc: 'word '.repeat(200) })), meta)
    expect(parsed.summary.length).toBeLessThanOrEqual(181)
    expect(parsed.summary.endsWith('…')).toBe(true)
    expect(parsed.summary).not.toMatch(/wor…$/)
  })

  it('returns nothing for markup with no items', () => {
    expect(parseFeed('<rss><channel><title>Empty</title></channel></rss>', meta)).toEqual([])
  })
})

describe('fetchMarketNews', () => {
  const feeds = [
    { id: 'a', source: 'Source A', url: 'https://a.test/rss' },
    { id: 'b', source: 'Source B', url: 'https://b.test/rss' },
  ]

  it('merges feeds newest first', async () => {
    const fetchImpl = vi.fn(async (url) =>
      ok(
        url.includes('a.test')
          ? feed(item({ title: 'Older', link: 'https://a.test/1', date: 'Sun, 16 Aug 2026 09:00:00 +0530' }))
          : feed(item({ title: 'Newer', link: 'https://b.test/1', date: 'Sun, 16 Aug 2026 18:00:00 +0530' })),
      ),
    )
    const { items } = await fetchMarketNews({ fetchImpl, feeds })
    expect(items.map((i) => i.title)).toEqual(['Newer', 'Older'])
  })

  it('drops the same wire story running in two papers', async () => {
    const headline = 'RBI holds repo rate at 5.5%'
    const fetchImpl = vi.fn(async (url) =>
      ok(feed(item({ title: headline, link: url.includes('a.test') ? 'https://a.test/1' : 'https://b.test/1' }))),
    )
    const { items } = await fetchMarketNews({ fetchImpl, feeds })
    expect(items).toHaveLength(1)
  })

  it('keeps working when one publisher is down, and says which', async () => {
    const fetchImpl = vi.fn(async (url) =>
      url.includes('a.test') ? { ok: false, status: 503 } : ok(feed(item({ title: 'Still here' }))),
    )
    const { items, sources } = await fetchMarketNews({ fetchImpl, feeds })
    expect(items).toHaveLength(1)
    expect(sources).toEqual([
      { source: 'Source A', ok: false, error: 'HTTP 503' },
      { source: 'Source B', ok: true, count: 1 },
    ])
  })

  it('reports a thrown request as a failed source, not a crash', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    })
    const { items, sources } = await fetchMarketNews({ fetchImpl, feeds })
    expect(items).toEqual([])
    expect(sources.every((s) => !s.ok)).toBe(true)
  })

  it('identifies itself rather than posing as a browser', async () => {
    const fetchImpl = vi.fn(async () => ok(feed(item())))
    await fetchMarketNews({ fetchImpl, feeds })
    const agent = fetchImpl.mock.calls[0][1].headers['User-Agent']
    expect(agent).toMatch(/VentureDAO/)
    expect(agent).not.toMatch(/Mozilla/)
  })
})

describe('getMarketNews cache', () => {
  const feeds = [{ id: 'a', source: 'Source A', url: 'https://a.test/rss' }]
  beforeEach(_resetNewsCache)

  it('serves the second call from cache instead of refetching', async () => {
    const fetchImpl = vi.fn(async () => ok(feed(item())))
    const first = await getMarketNews({ fetchImpl, now: 1_000, feeds })
    const second = await getMarketNews({ fetchImpl, now: 60_000, feeds })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(true)
    expect(second.ageMs).toBe(59_000)
  })

  it('refetches once the cache expires', async () => {
    const fetchImpl = vi.fn(async () => ok(feed(item())))
    await getMarketNews({ fetchImpl, now: 0, feeds })
    await getMarketNews({ fetchImpl, now: 6 * 60_000, feeds })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('labels a fallback payload stale rather than passing it off as fresh', async () => {
    let body = feed(item({ title: 'Last good headline' }))
    const fetchImpl = vi.fn(async () => ok(body))
    await getMarketNews({ fetchImpl, now: 0, feeds })

    body = feed('') // every upstream now returning nothing
    const result = await getMarketNews({ fetchImpl, now: 10 * 60_000, feeds })

    expect(result.items[0].title).toBe('Last good headline')
    expect(result.stale).toBe(true)
    expect(result.ageMs).toBe(10 * 60_000)
  })

  it('force bypasses the cache', async () => {
    const fetchImpl = vi.fn(async () => ok(feed(item())))
    await getMarketNews({ fetchImpl, now: 0, feeds })
    await getMarketNews({ fetchImpl, now: 1_000, feeds, force: true })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
