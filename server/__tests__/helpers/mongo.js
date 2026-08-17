import { MongoMemoryServer } from 'mongodb-memory-server'
import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { closeMongo, ensureIndexes, useMongo } from '../../storage/mongo.js'

/**
 * A real mongod for tests.
 *
 * mongodb-memory-server downloads and runs an actual MongoDB binary, so these
 * tests exercise the real driver against the real server — unique indexes
 * really collide, TTL fields are really typed, projections really apply. A
 * hand-written fake would agree with whatever the code does, including when
 * the code is wrong, and the guarantees being checked here are precisely the
 * ones MongoDB enforces rather than the ones this codebase implements.
 *
 * One server per test file, wiped between tests: starting mongod is slow,
 * clearing collections is not.
 */
export function withMongo() {
  let server
  let client

  beforeAll(async () => {
    server = await MongoMemoryServer.create()
    client = new MongoClient(server.getUri())
    await client.connect()
    const db = client.db('venturedao_test')
    useMongo(db)
    await ensureIndexes(db)
    return undefined
  }, 120_000) // first run downloads the binary

  beforeEach(async () => {
    const db = useMongo()
    // deleteMany rather than dropping: dropping a collection drops its indexes
    // with it, and the unique-email index is the thing several tests rely on.
    for (const name of ['users', 'sessions', 'exchangeAccounts', 'kycRecords']) {
      await db.collection(name).deleteMany({})
    }
  })

  afterAll(async () => {
    await client?.close()
    await closeMongo()
    await server?.stop()
  })
}
