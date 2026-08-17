import { collections } from './mongo.js'

/**
 * Storage, on MongoDB.
 *
 * Every query in the application goes through this file. That was true of the
 * SQLite version too, and it is the reason this migration touched three
 * callers rather than the whole server.
 *
 * Three guarantees SQLite gave for free do not exist in MongoDB, and each is
 * reimplemented rather than quietly dropped:
 *
 *   UNIQUE(email) — now a unique index, created in mongo.js. `register()`
 *   checks then inserts, so two concurrent signups can both pass the check;
 *   the index is what actually stops the duplicate. A duplicate-key error is
 *   translated below into the same 409 the check produces.
 *
 *   ON DELETE CASCADE — MongoDB has no foreign keys. `deleteUser` below does
 *   the cascade explicitly. Deleting a user any other way orphans their
 *   sessions, which means live tokens for an account that no longer exists.
 *
 *   Fixed columns — a document store accepts any shape, so field names are
 *   only ever written here.
 *
 * Documents use `_id` for what were primary keys: the user's id, the session's
 * token hash, the KYC record's user id. That keeps the uniqueness the schema
 * had, with no second index to maintain.
 *
 * Timestamps stay epoch milliseconds, as they were in SQLite, so nothing
 * downstream has to learn a new type. The one exception is `expiresAtDate` on
 * sessions, which exists solely because a TTL index requires a Date.
 */

/* Mongo's own field, stripped so callers see `id` as they always have. */
const clean = (doc, idField = 'id') => {
  if (!doc) return null
  const { _id, ...rest } = doc
  return { [idField]: _id, ...rest }
}

const DUPLICATE_KEY = 11000

/* ---------- users ---------- */

export async function createUser({ id, email, name, passwordHash, now = Date.now() }) {
  try {
    await collections.users().insertOne({
      _id: id,
      email: String(email).trim().toLowerCase(),
      name: name ?? null,
      passwordHash,
      createdAt: now,
      lastLoginAt: null,
    })
  } catch (err) {
    // The unique index firing means another request won the race. Same answer
    // the pre-insert check gives, so the caller cannot tell which caught it.
    if (err?.code === DUPLICATE_KEY) {
      throw Object.assign(new Error('An account with that email already exists.'), { status: 409 })
    }
    throw err
  }
  return findUserById(id)
}

/** Email is matched case-insensitively; nobody expects Bob@x.com to be a second account. */
export const findUserByEmail = async (email) =>
  clean(await collections.users().findOne({ email: String(email).trim().toLowerCase() }))

export const findUserById = async (id) => clean(await collections.users().findOne({ _id: id }))

export const touchLogin = (id, now = Date.now()) =>
  collections.users().updateOne({ _id: id }, { $set: { lastLoginAt: now } })

export const updatePasswordHash = (id, passwordHash) =>
  collections.users().updateOne({ _id: id }, { $set: { passwordHash } })

/**
 * Delete a user and everything belonging to them.
 *
 * This is the ON DELETE CASCADE the SQL schema declared. Sessions go first: if
 * a later step fails, the account is already unreachable rather than left
 * signed-in with its data half removed.
 */
export async function deleteUser(id) {
  await collections.sessions().deleteMany({ userId: id })
  await collections.exchangeAccounts().deleteMany({ userId: id })
  await collections.kycRecords().deleteOne({ _id: id })
  await collections.users().deleteOne({ _id: id })
}

/* ---------- sessions ---------- */

export async function createSession({ tokenHash, userId, expiresAt, userAgent = null, now = Date.now() }) {
  await collections.sessions().insertOne({
    _id: tokenHash,
    userId,
    createdAt: now,
    expiresAt,
    expiresAtDate: new Date(expiresAt), // for the TTL index only
    userAgent,
  })
}

/**
 * Resolve a session to its user, or null.
 *
 * An expired row is deleted on sight rather than merely ignored, so a stale
 * token cannot come back to life if a clock moves backwards. The TTL index
 * does the same job eventually; this makes it immediate for a token actually
 * being presented.
 */
export async function findSessionUser(tokenHash, now = Date.now()) {
  const row = await collections.sessions().findOne({ _id: tokenHash })
  if (!row) return null
  if (row.expiresAt <= now) {
    await deleteSession(tokenHash)
    return null
  }
  return findUserById(row.userId)
}

export const deleteSession = (tokenHash) => collections.sessions().deleteOne({ _id: tokenHash })

/** Used when a password changes: every other session must stop working. */
export const deleteUserSessions = (userId) => collections.sessions().deleteMany({ userId })

export const purgeExpiredSessions = (now = Date.now()) =>
  collections.sessions().deleteMany({ expiresAt: { $lte: now } })

/* ---------- exchange accounts ---------- */

export async function saveExchangeAccount({
  id,
  userId,
  label,
  exchange = 'delta',
  environment = 'testnet',
  apiKey,
  secretSealed,
  now = Date.now(),
}) {
  await collections.exchangeAccounts().insertOne({
    _id: id,
    userId,
    label: label ?? null,
    exchange,
    environment,
    apiKey,
    secretSealed,
    createdAt: now,
  })
}

/**
 * Always scoped by user id — never look an account up by its id alone.
 *
 * The sealed secret is projected away rather than filtered out afterwards, so
 * it is not in the result to begin with and cannot be logged by accident.
 */
export const listExchangeAccounts = async (userId) =>
  (await collections.exchangeAccounts().find({ userId }, { projection: { secretSealed: 0 } }).toArray()).map((doc) =>
    clean(doc),
  )

export const getExchangeAccount = async (userId, id) =>
  clean(await collections.exchangeAccounts().findOne({ _id: id, userId }))

export const deleteExchangeAccount = (userId, id) => collections.exchangeAccounts().deleteOne({ _id: id, userId })
