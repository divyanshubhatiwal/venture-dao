import { DatabaseSync } from 'node:sqlite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import 'dotenv/config'
import { closeMongo, connectMongo } from '../storage/mongo.js'

/**
 * Copy an existing SQLite database into MongoDB.
 *
 * Run once when moving over. The old file is opened read-only and is never
 * written to or deleted — if anything here is wrong, the original is still the
 * source of truth and the import can simply be run again.
 *
 * Writes are idempotent: every record is upserted on its own id, so running
 * this twice produces the same result as running it once rather than a second
 * copy of every account.
 *
 * Encrypted fields (`pan_sealed`, `secret_sealed`) are moved as-is. They are
 * sealed with AES-256-GCM bound to `userId:kyc` / `userId:accountId`, so the
 * ciphertext stays valid as long as the ids and KEY_MATERIAL are unchanged.
 * Changing the encryption key makes every one of them undecryptable, which is
 * why this script does not touch them.
 *
 *   node server/scripts/migrateSqliteToMongo.js [--dry-run]
 */

const SQLITE_FILE = process.env.DB_FILE || resolve(process.cwd(), 'server/data/venturedao.db')
const dryRun = process.argv.includes('--dry-run')

/** SQLite column → Mongo field. Only listed fields are copied. */
const MAPPINGS = [
  {
    table: 'users',
    collection: 'users',
    idColumn: 'id',
    fields: {
      email: 'email',
      name: 'name',
      password_hash: 'passwordHash',
      created_at: 'createdAt',
      last_login_at: 'lastLoginAt',
    },
  },
  {
    table: 'sessions',
    collection: 'sessions',
    idColumn: 'token_hash',
    fields: { user_id: 'userId', created_at: 'createdAt', expires_at: 'expiresAt', user_agent: 'userAgent' },
    // The TTL index needs a Date; the numeric field alone would never expire.
    derive: (doc) => ({ expiresAtDate: new Date(doc.expiresAt) }),
  },
  {
    table: 'exchange_accounts',
    collection: 'exchangeAccounts',
    idColumn: 'id',
    fields: {
      user_id: 'userId',
      label: 'label',
      exchange: 'exchange',
      environment: 'environment',
      api_key: 'apiKey',
      secret_sealed: 'secretSealed',
      created_at: 'createdAt',
    },
  },
  {
    table: 'kyc_records',
    collection: 'kycRecords',
    idColumn: 'user_id',
    fields: {
      status: 'status',
      method: 'method',
      full_name: 'fullName',
      dob: 'dob',
      pan_sealed: 'panSealed',
      pan_last4: 'panLast4',
      address_sealed: 'addressSealed',
      submitted_at: 'submittedAt',
      reviewed_at: 'reviewedAt',
      reviewed_by: 'reviewedBy',
      reason: 'reason',
      liveness_at: 'livenessAt',
      liveness_note: 'livenessNote',
    },
  },
]

function readTable(sqlite, { table, idColumn, fields, derive }) {
  // A database from before a migration may not have every table.
  const exists = sqlite.prepare(`SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name=?`).get(table).c
  if (!exists) return []

  return sqlite
    .prepare(`SELECT * FROM ${table}`)
    .all()
    .map((row) => {
      const doc = { _id: row[idColumn] }
      for (const [column, field] of Object.entries(fields)) doc[field] = row[column] ?? null
      return derive ? { ...doc, ...derive(doc) } : doc
    })
}

async function main() {
  if (!existsSync(SQLITE_FILE)) {
    console.log(`No SQLite database at ${SQLITE_FILE} — nothing to migrate.`)
    return
  }

  const sqlite = new DatabaseSync(SQLITE_FILE, { readOnly: true })
  const db = dryRun ? null : await connectMongo()
  console.log(`${dryRun ? 'DRY RUN — ' : ''}migrating ${SQLITE_FILE}\n`)

  let total = 0
  for (const mapping of MAPPINGS) {
    const docs = readTable(sqlite, mapping)
    if (!docs.length) {
      console.log(`  ${mapping.table.padEnd(18)} 0 rows`)
      continue
    }

    if (!dryRun) {
      await db.collection(mapping.collection).bulkWrite(
        // Upsert on _id: re-running replaces a record rather than duplicating it.
        docs.map((doc) => {
          const { _id, ...rest } = doc
          return { updateOne: { filter: { _id }, update: { $set: rest }, upsert: true } }
        }),
      )
    }
    total += docs.length
    console.log(`  ${mapping.table.padEnd(18)} ${docs.length} → ${mapping.collection}`)
  }

  sqlite.close()
  console.log(`\n${dryRun ? 'Would copy' : 'Copied'} ${total} records.`)
  if (!dryRun) {
    console.log('The SQLite file was not modified. Keep it until you have confirmed the app works.')
    await closeMongo()
  }
}

main().catch((err) => {
  console.error(`\nMigration failed: ${err.message}`)
  console.error('Nothing was removed from SQLite; fix the cause and run it again.')
  process.exit(1)
})
