import crypto from 'node:crypto'

/**
 * Encryption at rest for exchange API credentials.
 *
 * A Delta API secret with trading permission is drained within minutes of
 * leaking, so it must never sit in plaintext in a database, a backup, a log
 * line, or a stack trace. Everything stored goes through here first.
 *
 * AES-256-GCM rather than CBC: GCM authenticates the ciphertext, so a record
 * that has been tampered with fails to decrypt instead of silently yielding
 * altered bytes. A record's IV is random per encryption and stored alongside
 * it — reusing an IV under the same key is the one mistake that breaks GCM
 * completely, which is why nothing here ever accepts a caller-supplied IV.
 *
 * The key lives in the environment, never in the repo. This module refuses to
 * run without it rather than falling back to a default, because a hardcoded
 * fallback key is indistinguishable from no encryption at all.
 */

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const VERSION = 'v1'

/**
 * Resolve the master key. Accepts hex or base64 so operators can paste
 * whatever their secret manager emits, but the decoded length must be exactly
 * 32 bytes — a short key silently weakens every record encrypted with it.
 */
export function loadKey(env = process.env) {
  const raw = env.DELTA_VAULT_KEY
  if (!raw) {
    throw new Error(
      'DELTA_VAULT_KEY is not set. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }

  let key
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex')
  else key = Buffer.from(raw, 'base64')

  if (key.length !== KEY_BYTES) {
    throw new Error(`DELTA_VAULT_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}.`)
  }
  return key
}

/**
 * Encrypt a secret into a self-describing envelope.
 *
 * `aad` binds the ciphertext to the row it belongs to — pass something stable
 * and unique like `${userId}:${accountId}`. Without it, an attacker with write
 * access to the store could move another user's encrypted credential into their
 * own row and trade with it, and the decryption would succeed because the
 * bytes are perfectly valid. With it, that swap fails authentication.
 */
export function encryptSecret(plaintext, { aad, env = process.env } = {}) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Nothing to encrypt.')
  }
  if (!aad) throw new Error('An aad binding (e.g. "userId:accountId") is required.')

  const key = loadKey(env)
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.')
}

/** Reverse of encryptSecret. Throws if the envelope or its binding is wrong. */
export function decryptSecret(envelope, { aad, env = process.env } = {}) {
  if (typeof envelope !== 'string') throw new Error('Malformed credential record.')
  if (!aad) throw new Error('An aad binding is required.')

  const parts = envelope.split('.')
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('Malformed credential record.')

  const [, ivB64, tagB64, dataB64] = parts
  const key = loadKey(env)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAAD(Buffer.from(aad, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))

  // Throws on a wrong key, a wrong aad, or any tampering. Deliberately not
  // caught here: a failure to authenticate must reach the caller, never be
  // downgraded into an empty string that then gets used as a secret.
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}

/**
 * The only representation of a credential allowed to leave the server.
 *
 * The browser gets enough to recognise which key is connected and nothing that
 * helps reconstruct it. The secret is never included in any form.
 */
export function publicView({ apiKey, environment, label = null, connectedAt = null }) {
  return {
    apiKeyTail: apiKey ? `••••${apiKey.slice(-4)}` : null,
    environment,
    label,
    connectedAt,
  }
}

/** Patterns that must never reach a log sink or an API response. */
const SECRET_HINTS = /(api[_-]?secret|api[_-]?key|signature|authorization|delta[_-]?vault[_-]?key|password|token)/i

/** Machine-readable identifiers: error codes, symbols, IPs, enum values. */
const IDENTIFIER = /^[a-z0-9]+(?:[_.\-/][a-z0-9]+)+$/

/**
 * Value-level backstop for secrets that arrive under an innocuous key name.
 *
 * Tuned to keep diagnostics intact. An earlier version redacted anything long
 * enough, which swallowed `ip_not_whitelisted_for_api_key` — the one string
 * that tells an operator why their key is failing. Codes and symbols are
 * lowercase words joined by separators; credentials are high-entropy and mix
 * character classes, so that distinction is what is tested here.
 */
function looksSecret(value) {
  if (value.length < 20) return false
  if (IDENTIFIER.test(value)) return false
  if (!/^[A-Za-z0-9_\-+/=]+$/.test(value)) return false
  const mixedCase = /[a-z]/.test(value) && /[A-Z]/.test(value)
  const alphanumeric = /[a-zA-Z]/.test(value) && /[0-9]/.test(value)
  return mixedCase || alphanumeric
}

/**
 * Strip secrets from anything on its way to a log or an error payload.
 *
 * Applied to Delta's own error responses too: their payloads echo request
 * context, and an unfiltered dump of a failed authenticated call is how a
 * signature or key ends up in a log file nobody thought to protect.
 */
export function redact(value, depth = 0) {
  if (depth > 6 || value == null) return value
  if (typeof value === 'string') return looksSecret(value) ? '[redacted]' : value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value !== 'object') return value

  const out = {}
  for (const [k, v] of Object.entries(value)) {
    out[k] = SECRET_HINTS.test(k) ? '[redacted]' : redact(v, depth + 1)
  }
  return out
}
