import { MongoClient } from 'mongodb'

/**
 * MongoDB connection.
 *
 * The URI is read from the environment and never hard-coded, because a
 * connection string for anything but a local server carries a username and
 * password. It must not be prefixed VITE_ — that prefix compiles a value into
 * the browser bundle, which for a database credential means publishing it.
 *
 * One client for the process. The driver keeps its own connection pool, so
 * opening a client per request would build pools that never get reused and
 * exhaust the server's connection limit under load.
 */

const DEFAULT_URI = 'mongodb://127.0.0.1:27017'
const DEFAULT_DB = 'venture-dao'

let client = null
let database = null
let connecting = null

/**
 * Indexes.
 *
 * The unique index on email is not a nicety. `register()` checks for an
 * existing account and then inserts, and two requests can pass that check
 * before either inserts. In SQLite the UNIQUE constraint was what actually
 * stopped the duplicate; this index is that guarantee, and losing it in the
 * move to Mongo would leave a race with nothing behind it.
 *
 * Sessions carry a TTL index so Mongo reaps expired ones on its own. Session
 * rows are also deleted on sight when resolved, but that only ever runs for a
 * token someone still holds — a session abandoned at sign-out would otherwise
 * sit in the collection indefinitely.
 */
const INDEXES = {
  users: [{ key: { email: 1 }, unique: true, name: 'email_unique' }],
  sessions: [
    { key: { userId: 1 }, name: 'user' },
    // expireAfterSeconds: 0 means "expire at the time in this field", so the
    // field must be a Date. `expiresAt` stays a number for the application;
    // `expiresAtDate` exists only for this index.
    { key: { expiresAtDate: 1 }, expireAfterSeconds: 0, name: 'ttl' },
  ],
  exchangeAccounts: [{ key: { userId: 1 }, name: 'user' }],
  kycRecords: [{ key: { status: 1 }, name: 'status' }],
  sentimentReadings: [
    { key: { symbol: 1, readAt: 1 }, name: 'symbol_time' },
    { key: { scored: 1 }, name: 'scored' },
  ],
  botSessions: [{ key: { userId: 1 }, unique: true, name: 'user_bot_unique' }],
}

export function mongoUri() {
  return process.env.MONGODB_URI || DEFAULT_URI
}

export function mongoDbName() {
  return process.env.MONGODB_DB || DEFAULT_DB
}

/**
 * Connect and ensure indexes.
 *
 * Concurrent callers share one in-flight attempt rather than each opening a
 * client; without that, the first few requests after boot would each start
 * their own connection.
 */
export async function connectMongo({ uri = mongoUri(), dbName = mongoDbName() } = {}) {
  if (database) return database
  if (connecting) return connecting

  connecting = (async () => {
    const isAtlas = uri.startsWith('mongodb+srv://') || uri.includes('mongodb.net')
    const options = {
      serverSelectionTimeoutMS: 30_000,
      connectTimeoutMS: 30_000,
    }
    if (isAtlas) {
      options.tls = true
    }
    client = new MongoClient(uri, options)
    await client.connect()
    database = client.db(dbName)
    await ensureIndexes(database)
    return database
  })()

  try {
    return await connecting
  } catch (err) {
    // Leave nothing half-connected behind, or the next call returns a client
    // that was never usable.
    client = null
    database = null
    throw new Error(
      `Could not connect to MongoDB at ${uri.replace(/\/\/[^@]*@/, '//***@')}: ${err.message}. ` +
        'Start mongod, or set MONGODB_URI.',
    )
  } finally {
    connecting = null
  }
}

export async function ensureIndexes(db) {
  for (const [collection, specs] of Object.entries(INDEXES)) {
    await db.collection(collection).createIndexes(specs)
  }
}

/** Throws rather than connecting implicitly: a query that silently opens a
 *  connection hides startup failures until the first request. */
export function getDatabase() {
  if (!database) throw new Error('MongoDB is not connected. Call connectMongo() during startup.')
  return database
}

/** Test seam. Passing a database swaps it in; no argument reads the current one. */
export function useMongo(instance) {
  if (instance === undefined) return getDatabase()
  database = instance
  return database
}

export async function closeMongo() {
  await client?.close()
  client = null
  database = null
  connecting = null
}

export const collections = {
  users: () => getDatabase().collection('users'),
  sessions: () => getDatabase().collection('sessions'),
  exchangeAccounts: () => getDatabase().collection('exchangeAccounts'),
  kycRecords: () => getDatabase().collection('kycRecords'),
  // Sentiment readings kept so they can be scored against what price actually
  // did afterwards. Evidence has to accumulate somewhere durable.
  sentimentReadings: () => getDatabase().collection('sentimentReadings'),
  botSessions: () => getDatabase().collection('botSessions'),
}
