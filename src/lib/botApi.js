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
  const res = await fetch(`${API}/api/bot${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  if (!json.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json.data
}

export const botApi = {
  status: () => call('/status'),
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
