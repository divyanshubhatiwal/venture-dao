import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
/* Imported lazily, and guarded.
   This comes from mongodb-memory-server, a devDependency, so a production
   image built with --omit=dev does not have it. A bare import would fail
   there with a module-resolution error that says nothing about the real
   problem: this script is local tooling, and in production you point
   MONGODB_URI at a real server instead.

   The extension is required — ESM does not resolve extensionless deep paths
   the way CommonJS does. */
let MongoBinary
try {
  ;({ MongoBinary } = await import('mongodb-memory-server-core/lib/util/MongoBinary.js'))
} catch {
  console.error('\n  This script needs mongodb-memory-server, a development dependency.')
  console.error('  In production, set MONGODB_URI to a real MongoDB server instead.\n')
  process.exit(1)
}

/**
 * Start a local MongoDB for development.
 *
 * This runs a real mongod — the same binary `mongodb-memory-server` downloads
 * for the test suite — against a directory on disk, so data survives restarts.
 * It exists because this machine has no MongoDB installed and no Docker, and
 * asking someone to install a database server before they can run the app is a
 * poor first five minutes.
 *
 * IT IS NOT A PRODUCTION SETUP. There is no authentication, it listens only on
 * 127.0.0.1, and it dies with this terminal. For anything real, install MongoDB
 * Community Server or point MONGODB_URI at Atlas — the application does not
 * know or care which of the three it is talking to.
 *
 *   npm run db
 */

const DB_PATH = resolve(process.cwd(), 'server/data/mongo')
const PORT = Number(process.env.MONGO_PORT || 27017)

const binary = await MongoBinary.getPath({}).catch((err) => {
  console.error(`\n  ✗ Could not find a mongod binary: ${err.message}`)
  console.error('    Run "npm install" first — it is fetched as a dev dependency.\n')
  process.exit(1)
})

mkdirSync(DB_PATH, { recursive: true })

console.log(`\n  MongoDB   →  mongodb://127.0.0.1:${PORT}`)
console.log(`  Data      →  ${DB_PATH}`)
console.log('  Local development only — no auth, bound to localhost.\n')

const mongod = spawn(
  binary,
  [
    '--dbpath',
    DB_PATH,
    '--port',
    String(PORT),
    // Never 0.0.0.0. An unauthenticated database on a public interface is how
    // these end up in the news.
    '--bind_ip',
    '127.0.0.1',
  ],
  { stdio: 'inherit' },
)

mongod.on('exit', (code) => process.exit(code ?? 0))

// Ctrl-C should stop the database rather than orphan it holding a lock on the
// data directory, which then blocks the next start with an unhelpful error.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => mongod.kill(signal))
}
