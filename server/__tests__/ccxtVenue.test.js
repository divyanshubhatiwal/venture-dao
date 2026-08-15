import { describe, expect, it, vi } from 'vitest'
import { createCcxtVenue, createExchange } from '../venues/ccxtVenue'

/**
 * These exercise our adapter, not CCXT. The exchange is stubbed so the tests
 * are deterministic and never touch the network — an integration test that
 * silently passes because a venue was unreachable is worse than no test.
 */
function stubVenue(over = {}) {
  const venue = createCcxtVenue({ region: 'india', apiKey: 'k', secret: 's', ...over.opts })
  const market = {
    symbol: 'ETH/USD:USD',
    id: 'ETHUSD',
    contractSize: 0.01,
    precision: { amount: 1, price: 0.05 },
    limits: { amount: { min: 1, max: 4000 } },
  }
  venue.exchange.loadMarkets = vi.fn(async () => ({ 'ETH/USD:USD': market }))
  venue.exchange.amountToPrecision = (_s, n) => String(Math.round(n))
  venue.exchange.createOrder = over.createOrder ?? vi.fn(async () => ({ id: '999', status: 'closed', filled: 5, remaining: 0, average: 1880, fee: { cost: 0.01 } }))
  venue.exchange.fetchBalance = over.fetchBalance ?? vi.fn(async () => ({ USD: { total: 100, free: 90 } }))
  venue.exchange.fetchPositions = over.fetchPositions ?? vi.fn(async () => [])
  return { venue, market }
}

describe('createExchange', () => {
  it('points at the India host, which is where the key is valid', () => {
    const ex = createExchange({ region: 'india', live: false })
    const url = typeof ex.urls.api === 'string' ? ex.urls.api : Object.values(ex.urls.api)[0]
    expect(url).toContain('cdn-ind.testnet.deltaex.org')
  })

  it('uses CCXT defaults for the global region rather than inventing a host', () => {
    const ex = createExchange({ region: 'global', live: false })
    const url = typeof ex.urls.api === 'string' ? ex.urls.api : Object.values(ex.urls.api)[0]
    expect(url).not.toContain('cdn-ind')
  })

  it('is in sandbox mode unless live is explicitly requested', () => {
    const testnet = createExchange({ region: 'global', live: false })
    const live = createExchange({ region: 'global', live: true })
    const host = (e) => (typeof e.urls.api === 'string' ? e.urls.api : Object.values(e.urls.api)[0])
    expect(host(testnet)).not.toBe(host(live))
  })

  it('always leaves rate limiting on', () => {
    expect(createExchange({}).enableRateLimit).toBe(true)
  })
})

describe('toContracts', () => {
  it('converts underlying quantity using the venue contract size, not a constant', async () => {
    const { venue } = stubVenue()
    // 0.5 ETH at 0.01 ETH per contract = 50 contracts
    const { contracts, contractSize } = await venue.toContracts('ETH', 0.5)
    expect(contractSize).toBe(0.01)
    expect(contracts).toBe(50)
  })

  it('refuses a size below the venue minimum instead of rounding to zero', async () => {
    const { venue } = stubVenue()
    await expect(venue.toContracts('ETH', 0.001)).rejects.toThrow(/below the venue minimum/)
  })

  it('rejects a symbol the venue does not list', async () => {
    const { venue } = stubVenue()
    await expect(venue.toContracts('DOGE', 100)).rejects.toThrow(/not tradable/)
  })
})

describe('submitOrder', () => {
  it('returns the venue order id and status rather than assuming a fill', async () => {
    const { venue } = stubVenue({ createOrder: vi.fn(async () => ({ id: 'abc', status: 'open', filled: 0, remaining: 50 })) })
    const r = await venue.submitOrder({ symbol: 'ETH', side: 'buy', qty: 0.5, price: 1880 })
    expect(r.orderId).toBe('abc')
    expect(r.status).toBe('open')
    expect(r.filled).toBe(0)
  })

  it('refuses to submit while the kill switch is engaged', async () => {
    const { venue } = stubVenue({ opts: { killSwitch: () => true } })
    await expect(venue.submitOrder({ symbol: 'ETH', side: 'buy', qty: 0.5, price: 1880 })).rejects.toThrow(/Kill switch/)
  })

  it('re-checks the notional cap at the boundary, after the engine already did', async () => {
    const { venue } = stubVenue({ opts: { maxOrderNotional: 100 } })
    // 50 contracts x 0.01 x 1880 = 940
    await expect(venue.submitOrder({ symbol: 'ETH', side: 'buy', qty: 0.5, price: 1880 })).rejects.toThrow(/exceeds the server cap/)
  })

  it('passes reduce_only through so a close cannot flip the position', async () => {
    const createOrder = vi.fn(async () => ({ id: '1', status: 'closed', filled: 50, remaining: 0 }))
    const { venue } = stubVenue({ createOrder })
    await venue.submitOrder({ symbol: 'ETH', side: 'sell', qty: 0.5, price: 1880, reduceOnly: true })
    expect(createOrder.mock.calls[0][5]).toMatchObject({ reduce_only: true })
  })

  it('forwards a client order id for idempotency', async () => {
    const createOrder = vi.fn(async () => ({ id: '1', status: 'open', filled: 0, remaining: 50 }))
    const { venue } = stubVenue({ createOrder })
    await venue.submitOrder({ symbol: 'ETH', side: 'buy', qty: 0.5, price: 1880, clientOrderId: 'key-1' })
    expect(createOrder.mock.calls[0][5]).toMatchObject({ client_order_id: 'key-1' })
  })
})

describe('error handling', () => {
  it('never leaks credential-shaped material out of a venue error', async () => {
    const leaky = new Error('auth failed for apiKey=AbCd1234EfGh5678IjKl signature=ZZZZ1111YYYY2222XXXX')
    const { venue } = stubVenue({ fetchBalance: vi.fn(async () => { throw leaky }) })
    await expect(venue.getAccount()).rejects.toThrow(/fetchBalance failed/)
    await venue.getAccount().catch((e) => {
      expect(e.message).not.toContain('AbCd1234EfGh5678IjKl')
      expect(e.message).not.toContain('ZZZZ1111YYYY2222XXXX')
    })
  })

  it('does not mark an auth failure retryable', async () => {
    const { venue } = stubVenue({ fetchBalance: vi.fn(async () => { throw new Error('invalid api key') }) })
    await venue.getAccount().catch((e) => expect(e.retryable).toBe(false))
  })
})

describe('getPositions', () => {
  it('drops flat rows and normalises the shape the engine expects', async () => {
    const { venue } = stubVenue({
      fetchPositions: vi.fn(async () => [
        { symbol: 'ETH/USD:USD', side: 'long', contracts: 10, entryPrice: 1800, markPrice: 1880, unrealizedPnl: 8 },
        { symbol: 'BTC/USD:USD', side: 'long', contracts: 0, entryPrice: 0, markPrice: 0 },
      ]),
    })
    const positions = await venue.getPositions()
    expect(positions).toHaveLength(1)
    expect(positions[0]).toMatchObject({ symbol: 'ETH/USD:USD', side: 'long', qty: 10, entry: 1800 })
  })
})

describe('getAccount', () => {
  it('reports balance and free margin without echoing the raw payload', async () => {
    const { venue } = stubVenue()
    const a = await venue.getAccount()
    expect(a).toMatchObject({ balance: 100, availableMargin: 90, currency: 'USD' })
    expect(a.raw).toBeUndefined()
  })
})

describe('syncClock', () => {
  it('shifts the signing timestamp back by the measured drift', async () => {
    const { venue } = stubVenue()
    const before = venue.exchange.seconds()
    venue.exchange.loadTimeDifference = vi.fn(async () => 20_000) // 20s fast
    await venue.ensureClock()
    expect(venue.exchange.seconds()).toBeLessThanOrEqual(before - 19)
  })

  it('measures only once, however many calls are made', async () => {
    const { venue } = stubVenue()
    venue.exchange.loadTimeDifference = vi.fn(async () => 5_000)
    await venue.ensureClock()
    await venue.ensureClock()
    await venue.ensureClock()
    expect(venue.exchange.loadTimeDifference).toHaveBeenCalledTimes(1)
  })

  it('leaves the clock alone when drift cannot be read, rather than failing', async () => {
    const { venue } = stubVenue()
    venue.exchange.loadTimeDifference = vi.fn(async () => { throw new Error('offline') })
    await expect(venue.ensureClock()).resolves.toBeNull()
    expect(typeof venue.exchange.seconds()).toBe('number')
  })
})

describe('markToMarket', () => {
  const openPos = (over = {}) => ({ symbol: 'ETH/USD:USD', side: 'long', contracts: 50, entryPrice: 1880, markPrice: 1880, ...over })

  it('closes a position whose stop was breached, reduce-only', async () => {
    const createOrder = vi.fn(async () => ({ id: 'x', status: 'closed', filled: 50, remaining: 0, average: 1850 }))
    const { venue } = stubVenue({ createOrder, fetchPositions: vi.fn(async () => [openPos({ markPrice: 1850 })]) })
    venue.intents.set('ETH/USD:USD', { stop: 1860, target: 1920 })
    const closed = await venue.markToMarket()
    expect(closed).toHaveLength(1)
    expect(closed[0].reason).toBe('stop hit')
    expect(createOrder.mock.calls[0][5]).toMatchObject({ reduce_only: true })
  })

  it('closes on the target too', async () => {
    const { venue } = stubVenue({ fetchPositions: vi.fn(async () => [openPos({ markPrice: 1930 })]) })
    venue.intents.set('ETH/USD:USD', { stop: 1860, target: 1920 })
    expect((await venue.markToMarket())[0].reason).toBe('target hit')
  })

  it('leaves a position alone between its stop and target', async () => {
    const createOrder = vi.fn()
    const { venue } = stubVenue({ createOrder, fetchPositions: vi.fn(async () => [openPos()]) })
    venue.intents.set('ETH/USD:USD', { stop: 1860, target: 1920 })
    expect(await venue.markToMarket()).toHaveLength(0)
    expect(createOrder).not.toHaveBeenCalled()
  })

  /* A restart loses the in-memory intents. Guessing a stop for a position we
     have no record of is worse than reporting that it is unmanaged. */
  it('reports an unmanaged position instead of closing or ignoring it', async () => {
    const createOrder = vi.fn()
    const { venue } = stubVenue({ createOrder, fetchPositions: vi.fn(async () => [openPos({ markPrice: 100 })]) })
    expect(await venue.markToMarket()).toHaveLength(0)
    expect(createOrder).not.toHaveBeenCalled()
    expect(venue.lastUnmanaged).toEqual(['ETH/USD:USD'])
  })

  it('records intent on entry but not on a reduce-only exit', async () => {
    const { venue } = stubVenue()
    await venue.submitOrder({ symbol: 'ETH', side: 'buy', qty: 0.5, price: 1880, stop: 1860, target: 1920 })
    expect(venue.intents.get('ETH/USD:USD')).toMatchObject({ stop: 1860, target: 1920 })
    venue.intents.clear()
    await venue.submitOrder({ symbol: 'ETH', side: 'sell', qty: 0.5, price: 1880, stop: 1, target: 2, reduceOnly: true })
    expect(venue.intents.size).toBe(0)
  })
})
