import crypto from 'node:crypto'

/**
 * Standard RFC 6238 Time-Based One-Time Password (TOTP) Implementation.
 * Dependency-free, compatible with Google Authenticator, Authy, 1Password.
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateTotpSecret(bytes = 20) {
  const buffer = crypto.randomBytes(bytes)
  let base32 = ''
  let bits = 0
  let value = 0

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      base32 += BASE32_CHARS[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    base32 += BASE32_CHARS[(value << (5 - bits)) & 31]
  }
  return base32
}

function base32ToBuffer(base32) {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bytes = []
  let bits = 0
  let value = 0

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean[i])
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

/**
 * Generate a 6-digit TOTP code for a secret at a specific epoch timestamp.
 */
export function generateTotpCode(secret, timeMs = Date.now(), stepSeconds = 30, digits = 6) {
  const key = base32ToBuffer(secret)
  const counter = Math.floor(timeMs / 1000 / stepSeconds)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0)

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  return String(code % 10 ** digits).padStart(digits, '0')
}

/**
 * Verify a user-provided 6-digit code with +/- 1 step window drift tolerance.
 */
export function verifyTotpCode(token, secret, timeMs = Date.now(), stepSeconds = 30) {
  if (typeof token !== 'string' || token.trim().length !== 6) return false
  const cleanToken = token.trim()

  for (let drift = -1; drift <= 1; drift++) {
    const checkTime = timeMs + drift * stepSeconds * 1000
    if (generateTotpCode(secret, checkTime, stepSeconds) === cleanToken) {
      return true
    }
  }
  return false
}

/**
 * Generate otpauth:// URI for authenticator apps (QR code generation).
 */
export function getTotpUri({ account, issuer = 'VentureDAO', secret }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
