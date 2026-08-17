import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getTickers } from '../lib/market/marketApi'
import { subscribePrices } from '../lib/market/priceStream'

const MarketContext = createContext(null)

export function useMarket() {
  const ctx = useContext(MarketContext)
  if (!ctx) throw new Error('useMarket must be used inside <MarketProvider>')
  return ctx
}

/**
 * REST refresh for the fields the stream does not carry (market cap, 7d).
 * Prices arrive on the websocket, so this only needs to be occasional —
 * polling CoinGecko harder just gets the free tier rate-limited.
 */
const REFRESH_MS = 5 * 60_000

/**
 * One shared poll of live prices for the whole app, so the treasury value on
 * the dashboard and the chart on the markets page always agree — and so we
 * make one request a minute instead of one per component.
 */
export function MarketProvider({ children }) {
  const [tickers, setTickers] = useState([])
  const [meta, setMeta] = useState({ source: null, stale: false, updatedAt: null })
  const [loading, setLoading] = useState(true)
  const [streaming, setStreaming] = useState(false)
  const [tickAt, setTickAt] = useState(null)
  const mounted = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const { rows, source, stale, capturedAt } = await getTickers()
      if (!mounted.current) return
      setTickers(rows)
      setMeta({ source, stale, updatedAt: Date.now(), capturedAt })
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  // Live ticks overwrite the polled price in place, leaving market cap and the
  // 7d sparkline (which the stream does not carry) from the REST snapshot.
  useEffect(() => {
    const off = subscribePrices((event) => {
      if (!mounted.current) return
      if (event.type === 'status') {
        setStreaming(event.connected)
        return
      }
      setTickers((rows) =>
        rows.map((r) => (r.symbol === event.symbol ? { ...r, price: event.price, change24h: event.change24h } : r)),
      )
      setTickAt(Date.now())
    })
    return off
  }, [])

  useEffect(() => {
    mounted.current = true
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    // Catch up immediately when a backgrounded tab comes back.
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      mounted.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const eth = tickers.find((t) => t.symbol === 'ETH')

  const value = useMemo(
    () => ({
      tickers,
      loading,
      ethPrice: eth?.price ?? null,
      ethChange24h: eth?.change24h ?? 0,
      source: streaming ? 'Binance stream' : meta.source,
      stale: meta.stale,
      capturedAt: meta.capturedAt,
      updatedAt: tickAt ?? meta.updatedAt,
      streaming,
      refresh,
      /** Value an ETH amount at the live rate, falling back to a given USD figure. */
      valueEth: (amount, fallbackUsd = null) => (eth?.price ? amount * eth.price : fallbackUsd),
    }),
    [tickers, loading, eth, meta, refresh, streaming, tickAt],
  )

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
}
