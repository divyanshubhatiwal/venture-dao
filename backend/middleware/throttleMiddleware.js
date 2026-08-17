/**
 * Login throttle.
 *
 * Password checks are deliberately slow, so an unthrottled login form is both
 * a guessing oracle and a cheap way to pin the CPU. Keyed by IP and email
 * together: keying on IP alone lets one attacker lock out a shared office,
 * and on email alone lets anyone lock a victim out of their own account.
 */
const attempts = new Map()
const MAX_ATTEMPTS = 8
const WINDOW_MS = 10 * 60_000

export function loginThrottle(req, res, next) {
  const key = `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`
  const now = Date.now()
  const entry = attempts.get(key)
  if (entry && now - entry.first > WINDOW_MS) attempts.delete(key)

  const current = attempts.get(key)
  if (current && current.count >= MAX_ATTEMPTS) {
    const waitSeconds = Math.ceil((WINDOW_MS - (now - current.first)) / 1000)
    return res.status(429).json({ ok: false, error: `Too many attempts. Try again in ${waitSeconds}s.` })
  }
  req.recordFailure = () => {
    const existing = attempts.get(key)
    attempts.set(key, existing ? { ...existing, count: existing.count + 1 } : { first: now, count: 1 })
  }
  req.clearFailures = () => attempts.delete(key)
  next()
}
