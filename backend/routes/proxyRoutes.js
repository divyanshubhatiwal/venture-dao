import { Router } from 'express'

const router = Router()

/**
 * World equities and indices proxy for Yahoo Finance in production.
 * Yahoo Finance sends no CORS headers, so browser requests proxy through here.
 */
router.use('/', async (req, res) => {
  try {
    const yfPath = req.originalUrl.replace(/^\/yf/, '')
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
