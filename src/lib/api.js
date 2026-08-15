import axios from 'axios'
import {
  ACCURACY_TREND,
  ACTIVITY,
  DAO_STATS,
  INVESTMENTS,
  MONTHLY_PNL,
  PERFORMANCE,
  RISK_DISTRIBUTION,
  RISK_MULTIPLIERS,
  SECTOR_ACCURACY,
  SECTOR_ALLOCATION,
  SCORING_WEIGHTS,
  mockChatReply,
} from './mockData.js'

const BASE_URL = import.meta.env?.VITE_API_URL || ''
/** Set VITE_USE_MOCKS=false once the Express backend is running. */
const FORCE_MOCKS = (import.meta.env?.VITE_USE_MOCKS ?? 'true') !== 'false'

export const http = axios.create({
  baseURL: BASE_URL,
  timeout: 45_000,
  headers: { 'Content-Type': 'application/json' },
})

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Try the real backend; fall back to the demo dataset when it is absent or
 * erroring. Keeps the demo alive at a hackathon booth with flaky wifi —
 * every call resolves with `{ data, source }` so the UI can say which it used.
 */
async function withFallback(request, fallback, { minDelay = 0 } = {}) {
  const started = Date.now()
  const settle = async (data, source) => {
    const remaining = minDelay - (Date.now() - started)
    if (remaining > 0) await wait(remaining)
    return { data, source }
  }

  if (FORCE_MOCKS || !BASE_URL) return settle(await fallback(), 'mock')

  try {
    const res = await request()
    return settle(res.data, 'live')
  } catch (err) {
    if (import.meta.env?.DEV) console.warn('[api] falling back to mock data:', err.message)
    return settle(await fallback(), 'mock')
  }
}

/* ---------- M3 Portfolio ---------- */

export function fetchPortfolio() {
  return withFallback(
    () => http.get('/api/portfolio'),
    () => ({
      stats: DAO_STATS,
      investments: INVESTMENTS,
      performance: PERFORMANCE,
      monthlyPnl: MONTHLY_PNL,
      sectors: SECTOR_ALLOCATION,
      risk: RISK_DISTRIBUTION,
    }),
    { minDelay: 350 },
  )
}

export function fetchOverview() {
  return withFallback(
    () => http.get('/api/overview'),
    () => ({ stats: DAO_STATS, activity: ACTIVITY, performance: PERFORMANCE, accuracy: ACCURACY_TREND }),
    { minDelay: 300 },
  )
}

/* ---------- M4 Learning engine ---------- */

export function fetchLearning() {
  return withFallback(
    () => http.get('/api/learning'),
    () => ({
      trend: ACCURACY_TREND,
      sectors: SECTOR_ACCURACY,
      weights: SCORING_WEIGHTS,
      multipliers: RISK_MULTIPLIERS,
      resolved: 51,
      accuracy: DAO_STATS.aiAccuracy,
    }),
    { minDelay: 350 },
  )
}

/* ---------- M5 Chatbot ---------- */

export function askChat({ message, history }) {
  return withFallback(
    () => http.post('/api/chat', { message, history }),
    () => mockChatReply(message),
    { minDelay: 900 },
  )
}

export const usingMocks = FORCE_MOCKS || !BASE_URL
