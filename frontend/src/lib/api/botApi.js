import { getAuthHeaders } from './authHeader.js'

const API = import.meta.env?.VITE_API_URL || ''

/**
 * Client for the server-side bot.
 *
 * Thin on purpose: the browser issues commands and renders status, and every
 * decision about whether a command is allowed is made on the server. Nothing
 * here caches state or infers it locally, because a second copy of "is the bot
 * running" is a second source of truth that can disagree with the engine.
 */
async function call(path, { method = 'GET', body } = {}) {
  const headers = getAuthHeaders(body ? { 'Content-Type': 'application/json' } : {})
  const res = await fetch(`${API}/api/bot${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data
}

/**
 * One poller, many subscribers.
 *
 * The control panel and the status bar both want bot status every few seconds,
 * and each running its own interval meant two identical requests per tick and
 * two copies of the same state that could briefly disagree. Subscribers now
 * share a single timer and a single answer; the poll stops when the last one
 * unsubscribes so a backgrounded page is not still asking.
 */
const listeners = new Set()
let pollTimer = null
let lastStatus = null

async function pollOnce() {
  try {
    lastStatus = await call('/status')
    listeners.forEach((fn) => fn(lastStatus, null))
  } catch (err) {
    listeners.forEach((fn) => fn(null, err))
  }
}

export function subscribeBotStatus(fn, intervalMs = 5000) {
  listeners.add(fn)
  if (lastStatus) fn(lastStatus, null)
  if (!pollTimer) {
    pollOnce()
    pollTimer = setInterval(pollOnce, intervalMs)
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }
}

export const botApi = {
  status: () => call('/status'),
  suggest: () => call('/suggest'),
  start: () => call('/start', { method: 'POST' }),
  pause: () => call('/pause', { method: 'POST' }),
  // Unwrapped deliberately: /step answers { result, status } so a caller can
  // see what the cycle did, but every other command resolves to a status
  // object. Returning the wrapper here would hand the panel a shape with no
  // `journal` or `config`, and those sections would quietly disappear.
  step: async () => (await call('/step', { method: 'POST' })).status,
  emergencyStop: (reason = 'dashboard') => call('/emergency-stop', { method: 'POST', body: { reason } }),
  resume: () => call('/resume', { method: 'POST' }),
  updateConfig: (patch) => call('/config', { method: 'PUT', body: patch }),
}
