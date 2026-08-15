import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTrading } from './TradingContext'
import { aggregateEpisodes, createEpisode, reviewEpisode } from '../lib/episodes'
import { getCandles } from '../lib/marketApi'
import { getStockCandles } from '../lib/stockApi'

const EpisodeContext = createContext(null)

export function useEpisodes() {
  const ctx = useContext(EpisodeContext)
  if (!ctx) throw new Error('useEpisodes must be used inside <EpisodeProvider>')
  return ctx
}

const STORAGE_KEY = 'venturedao.episodes.v1'
/** How long to wait after an exit before judging whether the read was right. */
const REVIEW_DELAY_MS = 3 * 60_000
const SWEEP_MS = 60_000

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

/**
 * Tracks decision cycles end to end. Episodes open when a reasoned order is
 * placed, close automatically when the paper engine books the round trip, and
 * are graded a few minutes later once there is forward price action to judge
 * the reasoning against.
 */
export function EpisodeProvider({ children }) {
  const trading = useTrading()
  const [episodes, setEpisodes] = useState(load)
  const episodesRef = useRef(episodes)
  episodesRef.current = episodes
  const seenTrades = useRef(new Set())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(episodes.slice(0, 100)))
  }, [episodes])

  const open = useCallback((payload) => {
    const episode = createEpisode(payload)
    setEpisodes((list) => [episode, ...list])
    return episode
  }, [])

  // Close the matching episode whenever the engine books a new round trip.
  useEffect(() => {
    trading.trades.forEach((trade) => {
      const key = `${trade.id}-${trade.exitAt}`
      if (seenTrades.current.has(key)) return
      seenTrades.current.add(key)

      setEpisodes((list) => {
        const idx = list.findIndex((e) => e.symbol === trade.symbol && !e.outcome)
        if (idx === -1) return list
        const next = [...list]
        next[idx] = {
          ...next[idx],
          closedAt: trade.exitAt,
          outcome: {
            exit: trade.exit,
            pnl: trade.pnl,
            pnlPct: trade.pnlPct,
            reason: trade.reason?.includes('stop') ? 'stop' : trade.reason?.includes('target') ? 'target' : 'manual',
            heldMs: trade.exitAt - next[idx].openedAt,
          },
          review: null,
        }
        return next
      })
    })
  }, [trading.trades])

  // Grade closed episodes once enough forward price action exists to judge them.
  const sweep = useCallback(async () => {
    const pending = episodesRef.current.filter((e) => e.outcome && !e.review && Date.now() - e.closedAt > REVIEW_DELAY_MS)
    if (!pending.length) return

    for (const episode of pending) {
      try {
        const res =
          episode.assetClass === 'crypto' ? await getCandles(episode.symbol, '5m') : await getStockCandles(episode.symbol, '5m')
        const forward = res.candles.filter((c) => c.time > episode.closedAt)
        const review = reviewEpisode(episode, forward)
        setEpisodes((list) => list.map((e) => (e.id === episode.id ? { ...e, review } : e)))
      } catch {
        /* leave it pending — it will be picked up on the next sweep */
      }
    }
  }, [])

  useEffect(() => {
    sweep()
    const timer = setInterval(sweep, SWEEP_MS)
    return () => clearInterval(timer)
  }, [sweep])

  const clear = useCallback(() => {
    setEpisodes([])
    seenTrades.current = new Set()
  }, [])

  const aggregates = useMemo(() => aggregateEpisodes(episodes), [episodes])

  const value = useMemo(
    () => ({
      episodes,
      aggregates,
      open,
      clear,
      openCount: episodes.filter((e) => !e.outcome).length,
      awaitingReview: episodes.filter((e) => e.outcome && !e.review).length,
    }),
    [episodes, aggregates, open, clear],
  )

  return <EpisodeContext.Provider value={value}>{children}</EpisodeContext.Provider>
}
