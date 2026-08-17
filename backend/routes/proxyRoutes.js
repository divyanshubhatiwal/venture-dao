import { Router } from 'express'
import { proxyRateLimit } from '../middleware/securityMiddleware.js'

const router = Router()

// Whitelist of valid Yahoo Finance path prefixes
const ALLOWED_PATH_PATTERNS = [
  /^\/v8\/finance\/chart\/[a-zA-Z0-9^.%=-]+/,
  /^\/v7\/finance\/quote/,
  /^\/v1\/finance\/search/,
]

/**
 * Hardened Yahoo Finance proxy with rate limiting and path whitelisting.
 */
router.use('/', proxyRateLimit, async (req, res) => {
  try {
    const yfPath = req.originalUrl.replace(/^\/yf/, '')
    const isAllowed = ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(yfPath))

    if (!isAllowed) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden: Proxy endpoint path is restricted to financial charts and quotes.',
      })
    }

    const targetUrl = `https://query1.finance.yahoo.com${yfPath}`
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VentureDAO/1.0)',
        Accept: 'application/json',
      },
    })
    const data = await response.json().catch(() => null)
    if (!data) return res.status(response.status).send(await response.text())
    res.status(response.status).json(data)
  } catch (err) {
    res.status(502).json({ ok: false, error: `Yahoo Finance proxy failed: ${err.message}` })
  }
})

export default router
