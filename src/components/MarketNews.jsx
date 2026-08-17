import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ExternalLink, Loader2, Newspaper, RefreshCw, Sparkles } from 'lucide-react'
import { Card, EmptyState, SectionTitle, Skeleton } from './ui'
import { relativeTime } from '../lib/format'

/**
 * Live market news.
 *
 * Headlines, sources and timestamps come straight from the publishers' RSS via
 * the backend — nothing here is generated, summarised or re-ordered by model
 * output. Every row links to the publisher's own page, because a snippet is a
 * pointer to reporting, not a replacement for it.
 *
 * Two things it refuses to do quietly: it never shows a stale payload without
 * labelling its age, and it names any source that failed rather than presenting
 * a thinner list as if it were the whole picture. On a trading screen, silently
 * missing news reads as no news.
 */

const REFRESH_MS = 5 * 60_000


/**
 * Sentiment read from the headlines by Gemini.
 *
 * Rendered under the header rather than beside a price, and captioned as a
 * read of the news rather than a call on the market. Sentiment shown next to a
 * number is one small step from being taken as a forecast, and the wording is
 * the only thing standing in the way.
 */
const SENTIMENT_TONE = {
  bullish: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
  bearish: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-200',
  neutral: 'border-white/10 bg-white/[0.03] text-slate-300',
}

function Sentiment({ data }) {
  // Absent or unconfigured: show nothing at all. An empty state for a feature
  // that is simply switched off is noise.
  if (!data?.ok) return null
  return (
    <div className={`mb-3 rounded-xl border p-3 ${SENTIMENT_TONE[data.sentiment] ?? SENTIMENT_TONE.neutral}`}>
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="shrink-0" />
        <p className="text-[11px] font-semibold uppercase tracking-wide">
          Headlines read as {data.sentiment}
        </p>
        <span className="ml-auto text-[10px] opacity-70">{Math.round(data.strength * 100)}% lean</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed opacity-95">{data.summary}</p>
      {data.themes?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {data.themes.map((t) => (
            <span key={t} className="rounded-md border border-current/20 px-1.5 py-0.5 text-[10px] opacity-80">
              {t}
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] leading-relaxed opacity-60">{data.caveat}</p>
    </div>
  )
}

const SOURCE_TONE = {
  'Business Standard': 'text-sky-300',
  'Economic Times': 'text-amber-300',
  Moneycontrol: 'text-violet-300',
}

export default function MarketNews() {
  const [news, setNews] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch('/api/news/markets')
      const json = await res.json()
      if (!mounted.current) return
      if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setNews(json.data)
      setError(null)
    } catch (err) {
      if (mounted.current) setError(err.message)
    } finally {
      if (mounted.current) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => clearInterval(timer)
  }, [load])

  const failed = news?.sources?.filter((s) => !s.ok) ?? []

  return (
    <Card className="p-5" data-demo="news">
      <SectionTitle
        icon={Newspaper}
        title="Live market news"
        hint={
          news?.sources
            ? `${news.sources.filter((s) => s.ok).map((s) => s.source).join(' · ')}`
            : 'Business Standard · Economic Times · Moneycontrol'
        }
        action={
          <button onClick={load} disabled={refreshing} className="btn-ghost btn-sm">
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Refresh
          </button>
        }
      />

      <Sentiment data={news?.sentiment} />

      {/* Age is stated whenever the payload is not fresh, so nobody reads an
          hour-old list as the last five minutes. */}
      {news?.stale && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-2.5 text-[11px] text-amber-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Feeds are not responding. Showing the last headlines received, {relativeTime(Date.now() - news.ageMs)}.
        </p>
      )}

      {failed.length > 0 && !news?.stale && (
        <p className="mb-3 text-[11px] text-slate-500">
          {failed.map((s) => `${s.source} (${s.error})`).join(', ')} unavailable — this list is incomplete.
        </p>
      )}

      {error && !news && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3 text-xs text-rose-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Could not load news: {error}
        </p>
      )}

      {!news && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {news && news.items.length === 0 && (
        <EmptyState icon={Newspaper} title="No headlines" description="The feeds returned nothing just now." />
      )}

      {news && news.items.length > 0 && (
        <ul className="-my-1 max-h-[26rem] divide-y divide-white/[0.06] overflow-y-auto pr-1">
          {news.items.map((item) => (
            <li key={item.id}>
              <a
                href={item.link}
                target="_blank"
                // noreferrer as well as noopener: the target window should not
                // be handed the page it was opened from.
                rel="noopener noreferrer"
                className="group block py-3 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium leading-snug text-slate-100 group-hover:text-white">{item.title}</p>
                  <ExternalLink size={13} className="mt-0.5 shrink-0 text-slate-600 group-hover:text-slate-400" />
                </div>
                {item.summary && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.summary}</p>}
                <div className="mt-1.5 flex items-center gap-2 text-[10px]">
                  <span className={`font-semibold ${SOURCE_TONE[item.source] ?? 'text-slate-400'}`}>{item.source}</span>
                  <span className="text-slate-700">·</span>
                  {/* Publisher's own timestamp, not fetch time. */}
                  <span className="text-slate-600">
                    {item.publishedAt ? relativeTime(item.publishedAt) : 'undated'}
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-slate-600">
        Headlines are published by the outlets named and link to their pages. They are shown for context only — none of
        this is a signal, and the bot does not read them.
      </p>
    </Card>
  )
}
