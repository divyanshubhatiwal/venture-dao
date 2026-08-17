import { beforeEach, describe, expect, it } from 'vitest'
import { withMongo } from './helpers/mongo.js'
import { useMongo } from '../storage/mongo.js'
import { findUserByEmail, listExchangeAccounts, saveExchangeAccount } from '../storage/db.js'
import {
  clearCookie,
  hashPassword,
  issueSession,
  login,
  parseCookies,
  publicUser,
  register,
  resolveSession,
  revokeSession,
  sessionCookie,
  validateEmail,
  validatePassword,
  verifyPassword,
} from '../identity/auth.js'

const PASSWORD = 'correct horse battery'
withMongo()

describe('password hashing', () => {
  it('never stores the password itself', () => {
    const stored = hashPassword(PASSWORD)
    expect(stored).not.toContain(PASSWORD)
    expect(stored.startsWith('scrypt$')).toBe(true)
  })

  it('salts, so the same password hashes differently for two users', () => {
    expect(hashPassword(PASSWORD)).not.toBe(hashPassword(PASSWORD))
  })

  it('verifies the right password and rejects the wrong one', () => {
    const stored = hashPassword(PASSWORD)
    expect(verifyPassword(PASSWORD, stored)).toBe(true)
    expect(verifyPassword(PASSWORD + 'x', stored)).toBe(false)
  })

  /* Cost parameters travel with the hash so they can be raised later without
     invalidating every existing password. */
  it('carries its own parameters', () => {
    expect(hashPassword(PASSWORD).split('$').slice(0, 4)).toEqual(['scrypt', '16384', '8', '1'])
  })

  it('fails closed on a malformed or foreign record', () => {
    for (const bad of ['', 'nonsense', 'bcrypt$x$y', 'scrypt$only$three']) {
      expect(verifyPassword(PASSWORD, bad)).toBe(false)
    }
  })
})

describe('validation', () => {
  it('requires a password long enough to matter', () => {
    expect(validatePassword('short')).toMatch(/at least 10/)
    expect(validatePassword(PASSWORD)).toBeNull()
  })

  it('rejects padded passwords that a copy-paste would mangle', () => {
    expect(validatePassword(' leading space pw')).toMatch(/space/)
  })

  it('checks email shape without pretending to parse RFC 5322', () => {
    expect(validateEmail('nope')).toBeTruthy()
    expect(validateEmail('a@b.co')).toBeNull()
  })
})

describe('register', () => {
  it('normalises email so Bob@X.com is not a second account', async () => {
    await register({ email: '  Bob@Example.COM ', password: PASSWORD })
    expect(await findUserByEmail('bob@example.com')).toBeTruthy()
    await expect(register({ email: 'bob@example.com', password: PASSWORD })).rejects.toThrow(/already exists/)
  })

  it('never returns the password hash', async () => {
    const user = await register({ email: 'a@b.com', password: PASSWORD })
    expect(JSON.stringify(user)).not.toMatch(/scrypt/)
    expect(user.passwordHash).toBeUndefined()
  })

  it('rejects a weak password before any row is written', async () => {
    await expect(register({ email: 'c@d.com', password: 'short' })).rejects.toThrow(/at least 10/)
    expect(await findUserByEmail('c@d.com')).toBeNull()
  })
})

describe('login', () => {
  beforeEach(() => register({ email: 'user@example.com', password: PASSWORD }))

  it('accepts the right credentials', async () => {
    expect((await login({ email: 'user@example.com', password: PASSWORD }))?.email).toBe('user@example.com')
  })

  /* Same answer either way — otherwise the form reveals who has an account. */
  it('gives nothing away for a wrong password or an unknown email', async () => {
    expect(await login({ email: 'user@example.com', password: 'wrong-password' })).toBeNull()
    expect(await login({ email: 'ghost@example.com', password: PASSWORD })).toBeNull()
  })

  it('survives non-string input without throwing', async () => {
    expect(await login({ email: null, password: null })).toBeNull()
    expect(await login({ email: {}, password: [] })).toBeNull()
  })
})

describe('sessions', () => {
  it('resolves a freshly issued token to its user', async () => {
    const user = await register({ email: 's@example.com', password: PASSWORD })
    const { token } = await issueSession(user.id)
    expect(publicUser(await resolveSession(token)).email).toBe('s@example.com')
  })

  /* A stolen database should not yield working sessions, for the same reason
     it should not yield passwords. */
  it('stores only a hash of the token', async () => {
    const user = await register({ email: 'h@example.com', password: PASSWORD })
    const { token } = await issueSession(user.id)
    const docs = await useMongo().collection('sessions').find().toArray()
    expect(docs[0]._id).not.toBe(token)
    expect(docs[0]._id).toHaveLength(64)
    expect(JSON.stringify(docs)).not.toContain(token)
  })

  it('refuses an expired session and removes the row', async () => {
    const user = await register({ email: 'e@example.com', password: PASSWORD })
    const { token } = await issueSession(user.id, { ttlMs: 1000, now: Date.now() })
    expect(await resolveSession(token, Date.now() + 5000)).toBeNull()
    expect(await useMongo().collection('sessions').countDocuments()).toBe(0)
  })

  it('refuses a revoked or forged token', async () => {
    const user = await register({ email: 'r@example.com', password: PASSWORD })
    const { token } = await issueSession(user.id)
    await revokeSession(token)
    expect(await resolveSession(token)).toBeNull()
    expect(await resolveSession('not-a-real-token')).toBeNull()
    expect(await resolveSession(undefined)).toBeNull()
  })
})

describe('cookies', () => {
  it('is httpOnly and SameSite=Lax so scripts cannot read it', () => {
    const cookie = sessionCookie('abc', { expiresAt: Date.now() + 1000 })
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Lax')
  })

  it('adds Secure only when asked, since it is dropped over local http', () => {
    expect(sessionCookie('a', { expiresAt: 1, secure: true })).toContain('Secure')
    expect(sessionCookie('a', { expiresAt: 1, secure: false })).not.toContain('Secure')
  })

  it('clears with an immediate expiry', () => {
    expect(clearCookie()).toContain('Max-Age=0')
  })

  it('parses a cookie header', () => {
    expect(parseCookies('a=1; vd_session=tok; b=2').vd_session).toBe('tok')
    expect(parseCookies('').vd_session).toBeUndefined()
  })
})

describe('per-user isolation', () => {
  it('never returns another user’s exchange accounts', async () => {
    const alice = await register({ email: 'alice@example.com', password: PASSWORD })
    const bob = await register({ email: 'bob@example.com', password: PASSWORD })
    await saveExchangeAccount({ id: 'acc-1', userId: alice.id, apiKey: 'k-alice', secretSealed: 'sealed-alice' })

    expect(await listExchangeAccounts(alice.id)).toHaveLength(1)
    expect(await listExchangeAccounts(bob.id)).toHaveLength(0)
  })

  it('does not expose the sealed secret in a listing', async () => {
    const user = await register({ email: 'z@example.com', password: PASSWORD })
    await saveExchangeAccount({ id: 'acc-2', userId: user.id, apiKey: 'k', secretSealed: 'SEALED' })
    expect(JSON.stringify(await listExchangeAccounts(user.id))).not.toContain('SEALED')
  })
})
