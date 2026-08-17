import { describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { sessionCookie } from '../identity/auth.js'
import { globalRateLimit, registerRateLimit, securityHeaders } from '../middleware/securityMiddleware.js'

describe('Security Middleware & Headers', () => {
  it('sets defensive HTTP security headers', () => {
    const headers = {}
    const res = {
      setHeader: (key, val) => {
        headers[key] = val
      },
    }
    const req = {}
    let nextCalled = false
    securityHeaders(req, res, () => {
      nextCalled = true
    })

    expect(nextCalled).toBe(true)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
  })

  it('rate limiter permits requests under threshold', () => {
    const req = { headers: { 'x-forwarded-for': '192.168.1.10' } }
    const res = { setHeader: () => {}, status: () => ({ json: () => {} }) }
    let calls = 0
    for (let i = 0; i < 5; i++) {
      globalRateLimit(req, res, () => {
        calls++
      })
    }
    expect(calls).toBe(5)
  })

  it('generates SameSite=None; Secure cookies when secure is true', () => {
    const cookie = sessionCookie('test-token', { expiresAt: Date.now() + 10000, secure: true })
    expect(cookie).toContain('SameSite=None')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('HttpOnly')
  })
})
