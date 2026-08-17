import { MongoClient } from 'mongodb'
import 'dotenv/config'

/**
 * Copy a MongoDB database under a new name.
 *
 * MongoDB has no rename operation for a database, so this copies every
 * collection document by document and leaves the original completely
 * untouched. Nothing is dropped: if anything here is wrong, the old database
 * is still the source of truth and this can simply be run again.
 *
 * Indexes are recreated on the target, because a copy without them is a
 * database that works until it is busy. In particular the unique index on
 * email is a correctness guarantee, not a performance one — losing it would
 * let two accounts share an address.
 *
 * Writes are idempotent: documents are upserted on their own _id, so a second
 * run produces the same result rather than duplicates.
 *
 *   node server/scripts/renameDatabase.js --from venturedao --to venture-dao [--dry-run]
 */

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

const FROM = flag('from', 'venturedao')
const TO = flag('to', 'venture-dao')
const dryRun = args.includes('--dry-run')
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017'

async function main() {
  if (FROM === TO) {
    console.log('Source and target are the same. Nothing to do.')
    return
  }

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5_000 })
  await client.connect()

  const source = client.db(FROM)
  const target = client.db(TO)
  const collections = await source.listCollections().toArray()

  if (!collections.length) {
    console.log(`Database "${FROM}" has no collections — nothing to copy.`)
    await client.close()
    return
  }

  console.log(`${dryRun ? 'DRY RUN — ' : ''}copying "${FROM}" to "${TO}"`)
  console.log(`  ${uri.replace(/\/\/[^@]*@/, '//***@')}\n`)

  let total = 0
  for (const { name } of collections) {
    const docs = await source.collection(name).find().toArray()
    const indexes = (await source.collection(name).indexes()).filter((i) => i.name !== '_id_')

    if (!dryRun && docs.length) {
      await target.collection(name).bulkWrite(
        docs.map((doc) => {
          const { _id, ...rest } = doc
          return { updateOne: { filter: { _id }, update: { $set: rest }, upsert: true } }
        }),
      )
    }
    if (!dryRun && indexes.length) {
      // Strip fields the driver rejects on creation but returns on read.
      await target.collection(name).createIndexes(
        indexes.map(({ v, ns, ...spec }) => spec),
      )
    }

    console.log(`  ${name.padEnd(20)} ${String(docs.length).padStart(4)} docs, ${indexes.length} indexes`)
    total += docs.length
  }

  if (!dryRun) {
    // Compare counts rather than trusting the writes. A silent short copy of a
    // users collection is the kind of thing you discover at the worst moment.
    console.log('\n  verifying:')
    let mismatch = false
    for (const { name } of collections) {
      const a = await source.collection(name).countDocuments()
      const b = await target.collection(name).countDocuments()
      const ok = a === b
      if (!ok) mismatch = true
      console.log(`    ${name.padEnd(20)} ${a} → ${b}  ${ok ? 'ok' : 'MISMATCH'}`)
    }
    if (mismatch) {
      console.error('\n  Counts do not match. The original is untouched — investigate before switching over.')
      await client.close()
      process.exit(1)
    }
  }

  console.log(`\n${dryRun ? 'Would copy' : 'Copied'} ${total} documents.`)
  if (!dryRun) {
    console.log(`\nNext: set MONGODB_DB=${TO} in .env and restart the server.`)
    console.log(`The old database "${FROM}" is untouched. Drop it only once you are satisfied:`)
    console.log(`  mongosh --eval 'db.getSiblingDB("${FROM}").dropDatabase()'`)
  }

  await client.close()
}

main().catch((err) => {
  console.error(`\nCopy failed: ${err.message}`)
  console.error('Nothing was removed from the source database.')
  process.exit(1)
})
