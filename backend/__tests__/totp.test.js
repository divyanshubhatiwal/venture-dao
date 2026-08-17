import { describe, expect, it } from 'vitest'
import { generateTotpCode, generateTotpSecret, getTotpUri, verifyTotpCode } from '../identity/totp.js'

describe('TOTP 2FA Module', () => {
  it('generates valid base32 secrets', () => {
    const secret = generateTotpSecret()
    expect(typeof secret).toBe('string')
    expect(secret.length).toBeGreaterThan(16)
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true)
  })

  it('generates a 6-digit numeric token and verifies it', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    const code = generateTotpCode(secret, now)

    expect(typeof code).toBe('string')
    expect(code).toMatch(/^\d{6}$/)
    expect(verifyTotpCode(code, secret, now)).toBe(true)
  })

  it('rejects wrong or invalid length tokens', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    expect(verifyTotpCode('000000', secret, now)).toBe(false)
    expect(verifyTotpCode('123', secret, now)).toBe(false)
    expect(verifyTotpCode(null, secret, now)).toBe(false)
  })

  it('generates valid otpauth URI for QR codes', () => {
    const secret = 'JBSWY3DPEHPK3PXP'
    const uri = getTotpUri({ account: 'user@venturedao.io', issuer: 'VentureDAO', secret })
    expect(uri).toContain('otpauth://totp/VentureDAO:user%40venturedao.io')
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP')
  })
})
