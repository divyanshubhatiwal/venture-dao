import { describe, expect, it, vi } from 'vitest'
import { botStatus, getBot } from '../trading/botService'
import { createCcxtVenue } from '../trading/venues/ccxtVenue'

describe('botStatus regression tests', () => {
  it('returns valid status object in paper mode', () => {
    const status = botStatus('default')
    expect(status).toBeDefined()
    expect(status.mode).toBe('paper')
    expect(status.account).toBeDefined()
    expect(typeof status.account.balance).toBe('number')
    expect(Array.isArray(status.positions)).toBe(true)
    expect(Array.isArray(status.trades)).toBe(true)
    expect(status.progress).toBeDefined()
    expect(status.report).toBeDefined()
  })

  it('returns valid status object with fallback when venue is switched to CCXT', async () => {
    const bot = getBot('test-ccxt-bot', null, 'paper')
    const ccxtVenue = createCcxtVenue({ region: 'india', apiKey: 'k', secret: 's' })
    ccxtVenue.exchange.loadMarkets = vi.fn(async () => ({}))
    ccxtVenue.exchange.fetchBalance = vi.fn(async () => ({ USD: { total: 5000, free: 4500 } }))
    ccxtVenue.exchange.fetchPositions = vi.fn(async () => [])
    ccxtVenue.exchange.loadTimeDifference = vi.fn(async () => 0)

    // Assign ccxt venue
    bot.mode = 'ccxt'
    bot.adapter = ccxtVenue

    const status = botStatus('test-ccxt-bot')
    expect(status).toBeDefined()
    expect(status.mode).toBe('ccxt')
    expect(status.account).toBeDefined()
    expect(typeof status.account.balance).toBe('number')
    expect(Array.isArray(status.positions)).toBe(true)
    expect(Array.isArray(status.trades)).toBe(true)

    // Call getAccount on CCXT adapter and verify ledger synchronization
    await ccxtVenue.getAccount()
    expect(ccxtVenue.ledger.balance).toBe(5000)

    const updatedStatus = botStatus('test-ccxt-bot')
    expect(updatedStatus.account.balance).toBe(5000)
  })
})
