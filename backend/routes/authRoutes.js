import { Router } from 'express'
import {
  clearCookie,
  issueSession,
  login as authLogin,
  register as authRegister,
  revokeSession,
  sessionCookie,
} from '../identity/auth.js'
import { asHandler } from '../middleware/asyncHelper.js'
import { loginThrottle } from '../middleware/throttleMiddleware.js'
import { registerRateLimit } from '../middleware/securityMiddleware.js'

const router = Router()

router.post(
  '/register',
  registerRateLimit,
  asHandler(async (req) => {
    const user = await authRegister({ email: req.body?.email, password: req.body?.password, name: req.body?.name })
    const { token, expiresAt } = await issueSession(user.id, { userAgent: req.headers['user-agent'] ?? null })
    req.res.setHeader('Set-Cookie', sessionCookie(token, { expiresAt }))
    return { user, token }
  }),
)

router.post('/login', loginThrottle, async (req, res, next) => {
  try {
    const user = await authLogin({ email: req.body?.email, password: req.body?.password })
    if (!user) {
      req.recordFailure()
      // One message for a wrong password and an unknown email alike; saying
      // which would turn this form into an account-discovery tool.
      return res.status(401).json({ ok: false, error: 'Email or password is incorrect.' })
    }
    req.clearFailures()
    const { token, expiresAt } = await issueSession(user.id, { userAgent: req.headers['user-agent'] ?? null })
    res.setHeader('Set-Cookie', sessionCookie(token, { expiresAt }))
    res.json({ ok: true, data: { user, token } })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', async (req, res) => {
  await revokeSession(req.sessionToken)
  res.setHeader('Set-Cookie', clearCookie())
  res.json({ ok: true, data: { ok: true } })
})

/** Who am I? Answers null rather than 401 so the UI can ask on every load. */
router.get('/me', (req, res) => res.json({ ok: true, data: { user: req.user } }))

export default router
