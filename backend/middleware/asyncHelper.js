/**
 * Wrapper for async route handlers.
 * Catches errors, formats consistent JSON responses, and sets appropriate HTTP status codes.
 */
export const asHandler = (fn) => async (req, res) => {
  try {
    res.json({ ok: true, data: await fn(req) })
  } catch (err) {
    const status = err.status || 500
    if (status >= 500) console.error('[api]', err.message)
    res.status(status).json({ ok: false, error: err.message, code: err.code ?? null, details: err.details ?? null })
  }
}
