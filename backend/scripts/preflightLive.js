import 'dotenv/config'
import { resolveConfig } from '../trading/delta.js'
import { getBalances, getPositions, getProducts } from '../trading/delta.js'

/**
 * Check a live-trading setup before any real order exists.
 *
 * Every call this makes is READ-ONLY. It places nothing, cancels nothing and
 * moves nothing. Its whole job is to surface a misconfiguration now, rather
 * than at the moment the first real order goes out — which is otherwise where
 * you find out the IP is not whitelisted, or the notional cap is still at its
 * default, or the key belongs to testnet.
 *
 *   node server/scripts/preflightLive.js
 */

const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const warn = (m) => console.log(`  \x1b[33m!\x1b[0m ${m}`)
const fail = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`)

async function main() {
  const config = resolveConfig()
  const live = config.environment.live
  let blocking = 0

  console.log(`\n  Environment\n`)
  console.log(`    requested       ${config.requestedEnv}`)
  console.log(`    DELTA_ALLOW_LIVE ${config.allowLive}`)
  console.log(`    running on      ${config.environment.name.toUpperCase()}`)
  console.log(`    region          ${config.region}\n`)

  if (config.downgraded) {
    fail('DELTA_ENV=live is set but DELTA_ALLOW_LIVE is not "true" — this is running on TESTNET.')
    fail('Both switches are required. That is deliberate: one typo should not move real money.')
    blocking++
  } else if (live) {
    warn('LIVE MODE. Orders placed from this configuration move real funds.')
  } else {
    pass('Testnet. Nothing here can touch real money.')
  }

  console.log(`\n  Credentials\n`)
  if (!config.hasCredentials) {
    fail('DELTA_API_KEY / DELTA_API_SECRET are not both set.')
    blocking++
  } else {
    pass(`Key loaded (…${config.apiKey.slice(-4)}). Secret never leaves this process.`)
  }

  console.log(`\n  Connectivity — read-only calls, nothing is placed\n`)
  try {
    const products = await getProducts(config)
    pass(`Public data reachable (${products?.length ?? 0} products).`)
  } catch (err) {
    fail(`Cannot reach Delta at all: ${err.message}`)
    blocking++
  }

  if (config.hasCredentials) {
    try {
      const balances = await getBalances(config)
      const rows = Array.isArray(balances) ? balances : balances?.result ?? []
      pass('Authenticated call succeeded — the API key works and this IP is whitelisted.')
      const funded = rows.filter((b) => Number(b.available_balance ?? b.balance ?? 0) > 0)
      if (live && funded.length === 0) {
        warn('No funded balance found. A live account with nothing in it cannot trade.')
      } else if (funded.length) {
        for (const b of funded.slice(0, 4)) {
          console.log(`      ${(b.asset_symbol ?? b.asset?.symbol ?? '?').padEnd(6)} ${b.available_balance ?? b.balance}`)
        }
      }
    } catch (err) {
      // The single most common live failure, and the message Delta returns for
      // it reads like a bad key rather than a network rule.
      if (/ip_not_whitelisted/i.test(err.message)) {
        fail('This machine\'s IP is NOT whitelisted on the API key.')
        fail('Add the IP of the machine that will run the server — not your laptop — in Delta → Settings → API Keys.')
      } else {
        fail(`Authenticated call failed: ${err.message}`)
      }
      blocking++
    }

    try {
      const positions = await getPositions(config)
      const open = (Array.isArray(positions) ? positions : positions?.result ?? []).filter(
        (p) => Number(p.size ?? 0) !== 0,
      )
      if (open.length) warn(`${open.length} position(s) already open on this account.`)
      else pass('No positions currently open.')
    } catch {
      /* Already reported above if authentication is the problem. */
    }
  }

  console.log(`\n  Safety limits\n`)

  if (config.killSwitch) {
    warn('DELTA_KILL_SWITCH=true — every order-placing route is blocked. Nothing will trade until you unset it.')
  } else {
    pass('Kill switch is off. Set DELTA_KILL_SWITCH=true to halt all orders instantly.')
  }

  // The default exists so an unconfigured deployment cannot place a large
  // order. Running live on the default usually means nobody chose it.
  if (config.maxOrderNotional === 100) {
    if (live) warn('DELTA_MAX_ORDER_NOTIONAL is still the default 100. Set it deliberately for a live account.')
    else pass('Max order notional 100 (default).')
  } else {
    pass(`Max order notional ${config.maxOrderNotional}, set deliberately.`)
  }

  if (live && config.maxOrderNotional > 1000) {
    warn(`A cap of ${config.maxOrderNotional} allows a single order that large. Confirm that is intended.`)
  }

  console.log(`\n  ${'-'.repeat(64)}`)
  if (blocking) {
    console.log(`\n  \x1b[31m${blocking} blocking problem(s).\x1b[0m Fix these before trading.\n`)
    process.exit(1)
  }

  if (live) {
    console.log(`
  \x1b[33mThis configuration will trade with real money.\x1b[0m

  Before you start it, know what this project measured on its own data:
    profit factor 0.94        below 1.0 loses money
    31 winners out of 31      account still down 6.16% — fees were 4x gross
    0 of 2,000 runs           reached the goal; every one hit the loss limit

  Nothing here has demonstrated an edge. Size accordingly.
`)
  } else {
    console.log(`\n  Testnet configuration is sound. Nothing can touch real funds.\n`)
  }
}

main().catch((err) => {
  console.error(`\n  Preflight failed to run: ${err.message}\n`)
  process.exit(1)
})
