import { COOKIE_NAME, parseCookies, publicUser, resolveSession } from '../identity/auth.js'

/**
 * Attach the signed-in user, if any, to every request.
 *
 * The identity comes from the session cookie and a database lookup — never
 * from anything the client asserts. A userId in a request body is a claim, not
 * a fact, and this is the only place the app is allowed to decide who is
 * calling.
 */
export async function sessionMiddleware(req, _res, next) {
  let token = null

  // 1. Check Authorization: Bearer <token> header (standard for decoupled cross-site apps)
  const authHeader = req.headers.authorization || req.headers.Authorization
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim()
  }

  // 2. Fall back to Cookie
  if (!token && req.headers.cookie) {
    token = parseCookies(req.headers.cookie)[COOKIE_NAME] || null
  }

  req.sessionToken = token ?? null
  try {
    req.user = token ? publicUser(await resolveSession(token)) : null
    next()
  } catch (err) {
    // A database that is down must not be reported as "signed out" — that
    // sends people to re-enter a password that was never the problem.
    next(err)
  }
}

/** Guard for anything that must not be reachable anonymously. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Sign in to continue.' })
  next()
}
