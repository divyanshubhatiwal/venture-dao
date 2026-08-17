import { describe, expect, it } from 'vitest'
import { withMongo } from './helpers/mongo.js'
import { useMongo } from '../storage/mongo.js'
import {
  createSession,
  createUser,
  deleteUser,
  findSessionUser,
  findUserByEmail,
  findUserById,
  getExchangeAccount,
  purgeExpiredSessions,
  saveExchangeAccount,
} from '../storage/db.js'

/**
 * The parts of the SQL schema MongoDB does not enforce on its own.
 *
 * SQLite guaranteed these through UNIQUE, ON DELETE CASCADE and a fixed column
 * list. In MongoDB each is code or an index that someone has to remember to
 * write, so each gets a test that fails if it is ever dropped.
 */

withMongo()

const user = (over = {}) => ({
  id: 'u1',
  email: 'a@example.com',
  passwordHash: 'scrypt$16384$8$1$salt$hash',
  name: null,
  ...over,
})

describe('unique email index', () => {
  it('refuses a second account on the same email', async () => {
    await createUser(user())
    await expect(createUser(user({ id: 'u2' }))).rejects.toThrow(/already exists/)
  })

  /* The reason the index exists rather than only the check in register():
     both callers can pass a pre-insert check before either has inserted. */
  it('stops a duplicate even when both inserts race', async () => {
    const results = await Promise.allSettled([
      createUser(user({ id: 'r1' })),
      createUser(user({ id: 'r2' })),
      createUser(user({ id: 'r3' })),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(await useMongo().collection('users').countDocuments()).toBe(1)
  })

  it('gives a 409, not a raw driver error', async () => {
    await createUser(user())
    await expect(createUser(user({ id: 'u2' }))).rejects.toMatchObject({ status: 409 })
  })

  it('normalises case, so Bob@X.com collides with bob@x.com', async () => {
    await createUser(user({ email: 'Bob@Example.COM' }))
    expect(await findUserByEmail('bob@example.com')).toBeTruthy()
    await expect(createUser(user({ id: 'u2', email: 'bob@example.com' }))).rejects.toThrow()
  })
})

describe('cascade delete', () => {
  it('takes sessions, accounts and the KYC record with the user', async () => {
    await createUser(user())
    await createSession({ tokenHash: 't1', userId: 'u1', expiresAt: Date.now() + 60_000 })
    await saveExchangeAccount({ id: 'acc1', userId: 'u1', apiKey: 'k', secretSealed: 's' })
    // Seeded directly: the KYC feature was removed, but its records were kept
    // and a deleted user must still take theirs with them rather than leaving
    // an encrypted PAN behind with no owner.
    await useMongo().collection('kycRecords').insertOne({ _id: 'u1', status: 'PENDING', panLast4: '234F' })

    await deleteUser('u1')

    const db = useMongo()
    expect(await findUserById('u1')).toBeNull()
    // The one that actually matters: an orphaned session is a live token for
    // an account that no longer exists.
    expect(await db.collection('sessions').countDocuments()).toBe(0)
    expect(await db.collection('exchangeAccounts').countDocuments()).toBe(0)
    expect(await db.collection('kycRecords').countDocuments()).toBe(0)
  })

  it('leaves another user untouched', async () => {
    await createUser(user())
    await createUser(user({ id: 'u2', email: 'b@example.com' }))
    await createSession({ tokenHash: 't2', userId: 'u2', expiresAt: Date.now() + 60_000 })

    await deleteUser('u1')

    expect(await findUserById('u2')).toBeTruthy()
    expect(await useMongo().collection('sessions').countDocuments()).toBe(1)
  })
})

describe('sessions', () => {
  it('writes a Date for the TTL index alongside the numeric expiry', async () => {
    // expireAfterSeconds only acts on a BSON date. A number here would mean
    // expired sessions are never reaped by the server.
    const expiresAt = Date.now() + 60_000
    await createSession({ tokenHash: 't', userId: 'u1', expiresAt })
    const doc = await useMongo().collection('sessions').findOne({ _id: 't' })
    expect(doc.expiresAt).toBe(expiresAt)
    expect(doc.expiresAtDate).toBeInstanceOf(Date)
    expect(doc.expiresAtDate.getTime()).toBe(expiresAt)
  })

  it('has the TTL index registered on the collection', async () => {
    const indexes = await useMongo().collection('sessions').indexes()
    expect(indexes.find((i) => i.name === 'ttl')?.expireAfterSeconds).toBe(0)
  })

  it('deletes an expired session on lookup instead of only ignoring it', async () => {
    await createUser(user())
    await createSession({ tokenHash: 'old', userId: 'u1', expiresAt: 1_000 })
    expect(await findSessionUser('old', 5_000)).toBeNull()
    expect(await useMongo().collection('sessions').countDocuments()).toBe(0)
  })

  it('purges only what has actually expired', async () => {
    await createSession({ tokenHash: 'a', userId: 'u1', expiresAt: 1_000 })
    await createSession({ tokenHash: 'b', userId: 'u1', expiresAt: 9_000 })
    await purgeExpiredSessions(5_000)
    const left = await useMongo().collection('sessions').find().toArray()
    expect(left.map((d) => d._id)).toEqual(['b'])
  })
})

describe('exchange accounts', () => {
  it('will not return an account to a user who does not own it', async () => {
    await saveExchangeAccount({ id: 'acc1', userId: 'owner', apiKey: 'k', secretSealed: 'SEALED' })
    expect(await getExchangeAccount('owner', 'acc1')).toBeTruthy()
    // Guessing the id must not be enough — scoping is by owner as well.
    expect(await getExchangeAccount('someone-else', 'acc1')).toBeNull()
  })
})
