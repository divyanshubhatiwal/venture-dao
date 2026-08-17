/**
 * Security middleware: Defensive HTTP Headers & Sliding-Window Rate Limiters.
 */

/**
 * Defensive Security Headers Middleware.
 */
export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('X-XSS-Protection', '0')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
  next()
}

/**
 * Factory for memory-efficient IP-based sliding window rate limiters.
 */
function createRateLimiter({ windowMs, max, message }) {
  const requests = new Map()

  // Clean expired windows every 5 minutes
  setInterval(() => {
    const now = Date.now()
    for (const [ip, data] of requests.entries()) {
      if (now > data.resetTime) {
        requests.delete(ip)
      }
    }
  }, 5 * 60 * 1000).unref()

  return function rateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || '127.0.0.1'
    const now = Date.now()

    let record = requests.get(ip)
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs }
      requests.set(ip, record)
      return next()
    }

    record.count += 1
    if (record.count > max) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000)
      res.setHeader('Retry-After', String(retryAfterSeconds))
      return res.status(429).json({
        ok: false,
        error: message || 'Too many requests. Please try again later.',
        retryAfter: retryAfterSeconds,
      })
    }

    next()
  }
}

export const globalRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  message: 'API rate limit exceeded. Please slow down.',
})

export const registerRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many account registrations from this IP. Please try again in an hour.',
})

export const proxyRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  message: 'Financial data proxy rate limit exceeded.',
})
