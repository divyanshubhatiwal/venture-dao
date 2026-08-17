import { Router } from 'express'
import {
  cancelOrder,
  getBalances,
  getOrders,
  getPositions,
  getProducts,
  getTicker,
  placeOrder,
  resolveConfig,
} from '../trading/delta.js'
import { asHandler } from '../middleware/asyncHelper.js'

const router = Router()

/**
 * Status: everything the UI needs to describe the connection, and nothing that
 * could reconstruct a credential. The key is reported only as a masked tail.
 */
router.get(
  '/delta/status',
  asHandler(async () => {
    const config = resolveConfig()
    let reachable = false
    let productCount = null
    try {
      const products = await getProducts(config)
      reachable = true
      productCount = Array.isArray(products) ? products.length : null
    } catch {
      reachable = false
    }

    return {
      environment: config.environment.name,
      baseUrl: config.environment.baseUrl,
      live: config.environment.live,
      region: config.region,
      quote: config.environment.quote,
      console: config.environment.console,
      symbols: config.symbols,
      requestedEnv: config.requestedEnv,
      downgraded: config.downgraded,
      hasCredentials: config.hasCredentials,
      apiKeyTail: config.apiKey ? `…${config.apiKey.slice(-4)}` : null,
      maxOrderNotional: config.maxOrderNotional,
      killSwitch: config.killSwitch,
      reachable,
      productCount,
    }
  }),
)

router.get('/delta/ticker/:symbol', asHandler((req) => getTicker(resolveConfig(), req.params.symbol)))
router.get('/delta/products', asHandler(() => getProducts(resolveConfig())))
router.get('/delta/balances', asHandler(() => getBalances(resolveConfig())))
router.get('/delta/positions', asHandler(() => getPositions(resolveConfig())))
router.get('/delta/orders', asHandler(() => getOrders(resolveConfig())))

router.post(
  '/delta/order',
  asHandler(async (req) => {
    const config = resolveConfig()
    const { symbol, asset, side, size, assetQty, orderType, limitPrice, reduceOnly } = req.body ?? {}

    const result = await placeOrder(config, {
      symbol,
      asset,
      side,
      size: size != null ? Number(size) : null,
      assetQty: assetQty != null ? Number(assetQty) : null,
      orderType,
      limitPrice,
      reduceOnly: Boolean(reduceOnly),
    })

    console.log(
      `[delta:${config.environment.name}] ${side} ${result.contracts} ${symbol} → order ${result.id ?? 'n/a'} (notional ${result.notional?.toFixed?.(2)})`,
    )
    return result
  }),
)

router.delete(
  '/delta/order',
  asHandler((req) => cancelOrder(resolveConfig(), { id: req.body?.id, productId: req.body?.productId })),
)

export default router
