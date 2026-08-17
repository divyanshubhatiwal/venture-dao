import crypto from 'node:crypto'
import {
  createSession,
  createUser,
  deleteSession,
  deleteUserSessions,
  findSessionUser,
  findUserByEmail,
  findUserById,
  touchLogin,
  updatePasswordHash,
} from '../storage/db.js'

/**
 * Authentication.
 *
 * This replaces the localStorage "session" the app shipped with, which stored a
 * profile in the browser and treated its presence as proof of identity. Anyone
 * could forge it from the devtools console. That was acceptable while nothing
 * behind it mattered; it stops being acceptable the moment exchange
 * credentials are stored per user, which is what the database is now for.
 *
 * Choices worth stating:
 *
 *  - scrypt, from node:crypto. Memory-hard, no native dependency to compile,
 *    and the cost parameters are stored per record so they can be raised later
 *    without invalidating existing passwords.
 *
 *  - Session tokens are random, and only their SHA-256 is stored. A leaked
 *    database therefore yields no usable sessions — the same reasoning that
 *    stops us storing passwords.
 *
 *  - The cookie is httpOnly and SameSite=Lax, so page JavaScript cannot read
 *    the token and it does not ride along on cross-site requests.
 */

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const COOKIE_NAME = 'vd_session'

/* ---------- passwords ---------- */

/**
 * Rules kept modest on purpose. Length does far more for real-world strength
 * than symbol classes, which mostly push people toward "Password1!".
 */
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters.'
  if (password.length > 200) return 'Password must be under 200 characters.'
  if (/^\s|\s$/.test(password)) return 'Password must not start or end with a space.'
  return null
}

export function validateEmail(email) {
  if (typeof email !== 'string') return 'Email is required.'
  const trimmed = email.trim()
  // Deliberately loose: enough to catch a typo, not an attempt at RFC 5322.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || trimmed.length > 254) return 'Enter a valid email address.'
  return null
}

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  // Parameters travel with the hash so a future cost increase stays verifiable.
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`
}

/** Constant-time verification. Any malformed record fails closed. */
export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, salt, hash] = String(stored).split('$')
    if (scheme !== 'scrypt') return false
    const expected = Buffer.from(hash, 'base64')
    const actual = crypto.scryptSync(password, Buffer.from(salt, 'base64'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    })
    // Length check first: timingSafeEqual throws on a mismatch rather than
    // returning false, and a throw here would read as a server error.
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

/* ---------- sessions ---------- */

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

export async function issueSession(userId, { userAgent = null, now = Date.now(), ttlMs = SESSION_TTL_MS } = {}) {
  const token = crypto.randomBytes(32).toString('base64url')
  await createSession({ tokenHash: hashToken(token), userId, expiresAt: now + ttlMs, userAgent, now })
  return { token, expiresAt: now + ttlMs }
}

export const resolveSession = async (token, now = Date.now()) =>
  token ? findSessionUser(hashToken(token), now) : null
export const revokeSession = async (token) => (token ? deleteSession(hashToken(token)) : null)

/* ---------- registration and login ---------- */

/** The only shape of a user allowed out of this module. */
export const publicUser = (row) =>
  row ? { id: row.id, email: row.email, name: row.name ?? null, createdAt: row.createdAt } : null

export async function register({ email, password, name, now = Date.now() }) {
  const emailError = validateEmail(email)
  if (emailError) throw Object.assign(new Error(emailError), { status: 400 })
  const passwordError = validatePassword(password)
  if (passwordError) throw Object.assign(new Error(passwordError), { status: 400 })

  const normalised = email.trim().toLowerCase()
  if (await findUserByEmail(normalised)) {
    throw Object.assign(new Error('An account with that email already exists.'), { status: 409 })
  }

  // The unique index in mongo.js is the real guard — two concurrent signups
  // can both clear the check above, and createUser turns that collision into
  // this same 409.
  return publicUser(
    await createUser({
      id: crypto.randomUUID(),
      email: normalised,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
      passwordHash: hashPassword(password),
      now,
    }),
  )
}

/**
 * Verify a login.
 *
 * Returns null for both an unknown email and a wrong password, and the caller
 * gives one message for both. Telling someone which half was wrong turns the
 * login form into a tool for discovering who has an account.
 *
 * A dummy hash is computed when the email is unknown so the two paths take
 * comparable time — otherwise a fast rejection reveals the same thing.
 */
const DUMMY_HASH = hashPassword('a-password-that-is-never-valid')

export async function login({ email, password, now = Date.now() }) {
  const user = typeof email === 'string' ? await findUserByEmail(email) : null
  if (!user) {
    verifyPassword(typeof password === 'string' ? password : '', DUMMY_HASH)
    return null
  }
  if (!verifyPassword(password, user.passwordHash)) return null
  await touchLogin(user.id, now)
  return publicUser(user)
}

/** Changing a password ends every other session, which is the point of it. */
export async function changePassword({ userId, currentPassword, newPassword }) {
  const user = await findUserById(userId)
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    throw Object.assign(new Error('Current password is incorrect.'), { status: 403 })
  }
  const error = validatePassword(newPassword)
  if (error) throw Object.assign(new Error(error), { status: 400 })

  await updatePasswordHash(userId, hashPassword(newPassword))
  await deleteUserSessions(userId)
}

/* ---------- cookies ---------- */

export function parseCookies(header = '') {
  const out = {}
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

/**
 * Session cookie.
 *
 * httpOnly keeps it away from page scripts, SameSite=Lax keeps it off
 * cross-site requests, and Secure is set whenever the deployment is not plain
 * local HTTP — a Secure cookie is simply dropped over http://localhost, which
 * would make development look broken for no security gain.
 */
export function sessionCookie(token, { expiresAt, secure = process.env.NODE_ENV === 'production' } = {}) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export const clearCookie = () => `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
