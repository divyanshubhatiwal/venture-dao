import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, loadKey, publicView, redact } from '../vault'

const KEY_HEX = crypto.randomBytes(32).toString('hex')
const OTHER_HEX = crypto.randomBytes(32).toString('hex')
const env = { DELTA_VAULT_KEY: KEY_HEX }
const AAD = 'user-1:account-1'
// Obviously synthetic. Never use a real credential as a fixture: test files
// are committed, and a truncated secret is still secret material.
const SECRET = 'EXAMPLE-secret-DO-NOT-USE-0000000000000000'

describe('loadKey', () => {
  it('refuses to run without a key rather than using a default', () => {
    expect(() => loadKey({})).toThrow(/DELTA_VAULT_KEY is not set/)
  })

  it('rejects a key of the wrong length', () => {
    expect(() => loadKey({ DELTA_VAULT_KEY: 'abcd' })).toThrow(/32 bytes/)
  })

  it('accepts hex and base64 forms of the same key', () => {
    const hex = loadKey({ DELTA_VAULT_KEY: KEY_HEX })
    const b64 = loadKey({ DELTA_VAULT_KEY: Buffer.from(KEY_HEX, 'hex').toString('base64') })
    expect(hex.equals(b64)).toBe(true)
  })
})

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a secret', () => {
    const sealed = encryptSecret(SECRET, { aad: AAD, env })
    expect(decryptSecret(sealed, { aad: AAD, env })).toBe(SECRET)
  })

  it('never leaves the plaintext visible in the envelope', () => {
    const sealed = encryptSecret(SECRET, { aad: AAD, env })
    expect(sealed).not.toContain(SECRET)
    expect(sealed).not.toContain(SECRET.slice(0, 8))
  })

  it('uses a fresh IV every time, so identical secrets differ on disk', () => {
    const a = encryptSecret(SECRET, { aad: AAD, env })
    const b = encryptSecret(SECRET, { aad: AAD, env })
    expect(a).not.toBe(b)
    expect(decryptSecret(a, { aad: AAD, env })).toBe(decryptSecret(b, { aad: AAD, env }))
  })

  it("fails when another user's record is moved into this row", () => {
    const sealed = encryptSecret(SECRET, { aad: 'user-1:account-1', env })
    expect(() => decryptSecret(sealed, { aad: 'user-2:account-1', env })).toThrow()
  })

  it('fails under the wrong master key', () => {
    const sealed = encryptSecret(SECRET, { aad: AAD, env })
    expect(() => decryptSecret(sealed, { aad: AAD, env: { DELTA_VAULT_KEY: OTHER_HEX } })).toThrow()
  })

  it('fails when the ciphertext has been tampered with', () => {
    const sealed = encryptSecret(SECRET, { aad: AAD, env })
    const parts = sealed.split('.')
    const bytes = Buffer.from(parts[3], 'base64')
    bytes[0] ^= 0xff
    parts[3] = bytes.toString('base64')
    expect(() => decryptSecret(parts.join('.'), { aad: AAD, env })).toThrow()
  })

  it('fails when the auth tag has been tampered with', () => {
    const parts = encryptSecret(SECRET, { aad: AAD, env }).split('.')
    const tag = Buffer.from(parts[2], 'base64')
    tag[0] ^= 0xff
    parts[2] = tag.toString('base64')
    expect(() => decryptSecret(parts.join('.'), { aad: AAD, env })).toThrow()
  })

  it('rejects malformed records instead of returning an empty secret', () => {
    for (const bad of ['', 'nonsense', 'v2.a.b.c', 'v1.only.three']) {
      expect(() => decryptSecret(bad, { aad: AAD, env })).toThrow()
    }
  })

  it('requires an aad binding on both sides', () => {
    expect(() => encryptSecret(SECRET, { env })).toThrow(/aad/)
    expect(() => decryptSecret('v1.a.b.c', { env })).toThrow(/aad/)
  })

  it('refuses to encrypt nothing', () => {
    expect(() => encryptSecret('', { aad: AAD, env })).toThrow()
  })
})

describe('publicView', () => {
  it('exposes only a masked tail and never the secret', () => {
    const view = publicView({ apiKey: 'EXAMPLEkeyDONOTUSE000000000mxQf', environment: 'testnet' })
    expect(view.apiKeyTail).toBe('••••mxQf')
    expect(JSON.stringify(view)).not.toContain('EXAMPLEkey')
    expect(Object.keys(view)).not.toContain('apiSecret')
  })
})

describe('redact', () => {
  it('removes secret-shaped keys at any depth', () => {
    const out = redact({ ok: true, details: { api_secret: SECRET, headers: { signature: 'abc123' } } })
    expect(out.details.api_secret).toBe('[redacted]')
    expect(out.details.headers.signature).toBe('[redacted]')
    expect(out.ok).toBe(true)
  })

  it('redacts long token-shaped values even under an innocuous key', () => {
    expect(redact({ note: SECRET }).note).toBe('[redacted]')
  })

  it('leaves ordinary short values readable so errors stay useful', () => {
    const out = redact({ code: 'ip_not_whitelisted_for_api_key', client_ip: '122.167.98.193' })
    expect(out.code).toBe('ip_not_whitelisted_for_api_key')
    expect(out.client_ip).toBe('122.167.98.193')
  })

  it('survives arrays and deep nesting without throwing', () => {
    expect(() => redact({ a: [{ b: [{ c: { d: { e: { f: { g: 1 } } } } }] }] })).not.toThrow()
  })
})

describe('redact — credentials embedded in free text', () => {
  it('strips key=value pairs inside an error message', () => {
    const msg = 'auth failed for apiKey=AbCd1234EfGh5678IjKl signature=ZZZZ1111YYYY2222XXXX'
    const out = redact({ message: msg })
    expect(out.message).not.toContain('AbCd1234EfGh5678IjKl')
    expect(out.message).not.toContain('ZZZZ1111YYYY2222XXXX')
    expect(out.message).toContain('[redacted]')
  })

  it('keeps the surrounding message readable', () => {
    const out = redact({ message: 'auth failed for apiKey=SECRETVALUE1234567890' })
    expect(out.message).toMatch(/^auth failed for apiKey=/)
  })

  it('handles colon-separated and cased variants', () => {
    for (const m of ['API_SECRET: abcdef1234567890abcdef', 'Authorization: Bearer aaaaaaaaaaaaaaaaaaaa']) {
      expect(redact({ m }).m).toContain('[redacted]')
    }
  })

  it('leaves ordinary prose untouched', () => {
    expect(redact({ m: 'order rejected: insufficient margin' }).m).toBe('order rejected: insufficient margin')
  })
})
