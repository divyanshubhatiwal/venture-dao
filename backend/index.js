import 'dotenv/config'
import { createApp } from './app.js'
import { purgeExpiredSessions } from './storage/db.js'
import { connectMongo, mongoDbName, mongoUri } from './storage/mongo.js'
import { hasGeminiKey } from './market/gemini.js'
import { scoreDueReadings } from './market/sentimentTrack.js'
import { getTicker, resolveConfig } from './trading/delta.js'

/**
 * VentureDAO Backend Bootstrapper.
 *
 * Connects to MongoDB, sets up background cleanup intervals,
 * and starts the HTTP server.
 */

const PORT = Number(process.env.PORT || 5000)
const app = createApp()

// Score sentiment readings whose horizon has elapsed
setInterval(() => {
  scoreDueReadings({
    priceOf: async (symbol) => {
      const ticker = await getTicker(resolveConfig(), `${symbol}USD`)
      return Number(ticker?.mark_price ?? ticker?.close ?? NaN)
    },
  }).catch((err) => console.error('  sentiment scoring failed:', err.message))
}, 60 * 60_000).unref?.()

// Purge expired sessions
setInterval(() => {
  purgeExpiredSessions().catch((err) => console.error('  session purge failed:', err.message))
}, 60 * 60_000).unref?.()

await connectMongo()
  .then(() => app.listen(PORT, onListening))
  .catch((err) => {
    // Refusing to start is the honest outcome. A server that boots without its
    // database answers every sign-in with a 500 and looks like a broken app.
    console.error(`\n  ✗ ${err.message}\n`)
    process.exit(1)
  })

function onListening() {
  const config = resolveConfig()
  console.log(`\n  Venture DAO backend →  http://localhost:${PORT}`)
  console.log(`  Delta environment   →  ${config.environment.name.toUpperCase()} (${config.environment.baseUrl})`)
  console.log(`  Credentials         →  ${config.hasCredentials ? `loaded (…${config.apiKey.slice(-4)})` : 'NOT SET — public routes only'}`)
  console.log(`  Max order notional  →  ${config.maxOrderNotional}`)
  // Credentials stripped: a connection string is printed at every boot and
  // ends up in logs and screen shares.
  console.log(`  MongoDB             →  ${mongoUri().replace(/\/\/[^@]*@/, '//***@')} · db "${mongoDbName()}"`)
  console.log(`  Gemini              →  ${hasGeminiKey() ? 'key loaded — news sentiment on' : 'no key — news sentiment off'}`)
  if (config.downgraded) {
    console.log('\n  ⚠  DELTA_ENV=live was requested but DELTA_ALLOW_LIVE is not "true".')
    console.log('     Falling back to TESTNET. Live trading needs both switches set deliberately.')
  }
  if (config.environment.live) {
    console.log('\n  ⚠  LIVE MODE — orders placed here move real funds.\n')
  } else {
    console.log('  Mode                →  testnet, virtual funds\n')
  }
}
