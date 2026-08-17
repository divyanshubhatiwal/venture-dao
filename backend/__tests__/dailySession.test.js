import { describe, expect, it } from 'vitest'
import { dailyProgress, dailyReport, entriesBlocked, inWindow, minutesToClose, STOP_REASON } from '../trading/dailySession.js'

const IST = 'Asia/Kolkata'
/** 2026-08-15T04:30:00Z === 10:00 IST */
const at = (utcIso) => new Date(utcIso).getTime()

describe('inWindow', () => {
  const cfg = { sessionStart: '08:00', sessionEnd: '23:00', timeZone: IST }

  it('is open inside the window', () => {
    expect(inWindow(at('2026-08-15T04:30:00Z'), cfg)).toBe(true) // 10:00 IST
  })

  it('is shut before the start and after the end', () => {
    expect(inWindow(at('2026-08-15T01:00:00Z'), cfg)).toBe(false) // 06:30 IST
    expect(inWindow(at('2026-08-15T18:00:00Z'), cfg)).toBe(false) // 23:30 IST
  })

  it('handles a window that wraps past midnight', () => {
    const overnight = { sessionStart: '22:00', sessionEnd: '04:00', timeZone: IST }
    expect(inWindow(at('2026-08-15T17:00:00Z'), overnight)).toBe(true) // 22:30 IST
    expect(inWindow(at('2026-08-15T21:00:00Z'), overnight)).toBe(true) // 02:30 IST
    expect(inWindow(at('2026-08-15T09:00:00Z'), overnight)).toBe(false) // 14:30 IST
  })

  it('treats an equal start and end as always open', () => {
    expect(inWindow(at('2026-08-15T09:00:00Z'), { sessionStart: '00:00', sessionEnd: '00:00', timeZone: IST })).toBe(true)
  })

  it('respects the configured timezone rather than the host clock', () => {
    const utc = { sessionStart: '08:00', sessionEnd: '23:00', timeZone: 'UTC' }
    // 03:00 UTC is inside the IST window (08:30) but outside the UTC one.
    expect(inWindow(at('2026-08-15T03:00:00Z'), { ...utc, timeZone: IST })).toBe(true)
    expect(inWindow(at('2026-08-15T03:00:00Z'), utc)).toBe(false)
  })
})

describe('minutesToClose', () => {
  it('counts down inside the window and is null outside it', () => {
    const cfg = { sessionStart: '08:00', sessionEnd: '23:00', timeZone: IST }
    expect(minutesToClose(at('2026-08-15T17:00:00Z'), cfg)).toBe(30) // 22:30 IST
    expect(minutesToClose(at('2026-08-15T19:00:00Z'), cfg)).toBeNull()
  })
})

describe('dailyProgress', () => {
  const config = { dailyTargetPercent: 2, dailyLossLimitPercent: 3 }

  it('derives target and loss amounts from equity', () => {
    const p = dailyProgress({ startingEquity: 100_000, config })
    expect(p.targetAmount).toBe(2000)
    expect(p.lossLimitAmount).toBe(3000)
  })

  it('reports the target reached only on realised profit', () => {
    expect(dailyProgress({ startingEquity: 100_000, realisedPnl: 2000, config }).targetReached).toBe(true)
    // Unrealised gains can evaporate, so they must not end the session.
    expect(dailyProgress({ startingEquity: 100_000, unrealisedPnl: 5000, config }).targetReached).toBe(false)
  })

  it('counts unrealised losses toward the loss limit', () => {
    expect(dailyProgress({ startingEquity: 100_000, unrealisedPnl: -3200, config }).lossLimitHit).toBe(true)
  })

  it('tracks the remainder and percentage achieved', () => {
    const p = dailyProgress({ startingEquity: 100_000, realisedPnl: 1250, config })
    expect(p.remainingToTarget).toBe(750)
    expect(Math.round(p.targetAchievedPercent)).toBe(63)
  })
})

describe('entriesBlocked', () => {
  const config = { dailyTargetPercent: 2, dailyLossLimitPercent: 3, sessionStart: '08:00', sessionEnd: '23:00', timeZone: IST }
  const open = at('2026-08-15T04:30:00Z')

  it('allows entries in a normal session', () => {
    expect(entriesBlocked({ at: open, config, progress: dailyProgress({ startingEquity: 100_000, config }) })).toBeNull()
  })

  it('stops entries once the target is reached', () => {
    const progress = dailyProgress({ startingEquity: 100_000, realisedPnl: 2500, config })
    expect(entriesBlocked({ at: open, config, progress })).toBe(STOP_REASON.TARGET_REACHED)
  })

  it('keeps trading past the target when the user opts in', () => {
    const progress = dailyProgress({ startingEquity: 100_000, realisedPnl: 2500, config })
    expect(entriesBlocked({ at: open, config: { ...config, continueAfterTarget: true }, progress })).toBeNull()
  })

  it('the loss limit outranks everything, including a reached target', () => {
    const progress = dailyProgress({ startingEquity: 100_000, realisedPnl: 2500, unrealisedPnl: -6000, config })
    expect(entriesBlocked({ at: open, config, progress })).toBe(STOP_REASON.DAILY_LOSS)
  })

  it('stops entries outside the session window', () => {
    const progress = dailyProgress({ startingEquity: 100_000, config })
    expect(entriesBlocked({ at: at('2026-08-15T20:00:00Z'), config, progress })).toBe(STOP_REASON.SESSION_ENDED)
  })
})

describe('dailyReport', () => {
  const trades = [
    { symbol: 'ETH', pnl: 900, fee: 25 },
    { symbol: 'BTC', pnl: -400, fee: 30 },
    { symbol: 'ETH', pnl: 700, fee: 20 },
  ]

  it('separates gross, fees and net rather than reporting net alone', () => {
    const r = dailyReport({ startingEquity: 100_000, endingEquity: 101_200, trades, config: { dailyTargetPercent: 2 } })
    expect(r.netPnl).toBe(1200)
    expect(r.fees).toBe(75)
    expect(r.grossPnl).toBe(1275)
  })

  it('counts wins, losses and distinct markets', () => {
    const r = dailyReport({ startingEquity: 100_000, endingEquity: 101_200, trades, markets: trades.map((t) => t.symbol) })
    expect(r.trades).toBe(3)
    expect(r.wins).toBe(2)
    expect(r.losses).toBe(1)
    expect(r.markets).toEqual(['ETH', 'BTC'])
  })

  it('reports partial achievement without inflating it to the target', () => {
    const r = dailyReport({ startingEquity: 100_000, endingEquity: 101_420, trades: [], config: { dailyTargetPercent: 2 } })
    expect(r.returnPercent).toBe(1.42)
    expect(r.targetAchievedPercent).toBe(71)
  })

  it('handles a day with no trades', () => {
    const r = dailyReport({ startingEquity: 100_000, endingEquity: 100_000, trades: [] })
    expect(r.trades).toBe(0)
    expect(r.netPnl).toBe(0)
    expect(r.maxDrawdownPercent).toBe(0)
  })
})

describe('near-close entry cutoff', () => {
  const config = {
    dailyTargetPercent: 2,
    dailyLossLimitPercent: 3,
    sessionStart: '08:00',
    sessionEnd: '23:00',
    timeZone: IST,
    entryCutoffMinutes: 20,
  }
  const progress = dailyProgress({ startingEquity: 100_000, config })

  it('bars entries inside the cutoff, since flatten would close them at once', () => {
    // 22:45 IST — 15 minutes to the bell.
    expect(entriesBlocked({ at: at('2026-08-15T17:15:00Z'), config, progress })).toBe(STOP_REASON.NEAR_CLOSE)
  })

  it('allows entries with room left in the session', () => {
    // 20:00 IST — three hours to run.
    expect(entriesBlocked({ at: at('2026-08-15T14:30:00Z'), config, progress })).toBeNull()
  })

  it('is off when no cutoff is configured', () => {
    const { entryCutoffMinutes, ...noCutoff } = config
    expect(entriesBlocked({ at: at('2026-08-15T17:15:00Z'), config: noCutoff, progress })).toBeNull()
  })
})

describe('24-hour session', () => {
  const allDay = { sessionStart: '00:00', sessionEnd: '00:00', timeZone: IST, entryCutoffMinutes: 20, dailyTargetPercent: 2, dailyLossLimitPercent: 3 }
  const progress = dailyProgress({ startingEquity: 100_000, config: allDay })

  it('is open at every hour of the day', () => {
    for (const h of ['00:30', '06:00', '12:00', '18:00', '23:45']) {
      const t = new Date(`2026-08-15T${h}:00+05:30`).getTime()
      expect(inWindow(t, allDay)).toBe(true)
    }
  })

  it('has no countdown to a close', () => {
    expect(minutesToClose(at('2026-08-15T18:20:00Z'), allDay)).toBeNull()
  })

  it('never bars entries for being near a close that does not exist', () => {
    // 23:50 IST would sit inside a 20-minute cutoff on a midnight-ending window.
    expect(entriesBlocked({ at: at('2026-08-15T18:20:00Z'), config: allDay, progress })).toBeNull()
  })

  it('still stops on the target and the loss limit', () => {
    expect(entriesBlocked({ at: at('2026-08-15T18:20:00Z'), config: allDay, progress: dailyProgress({ startingEquity: 100_000, realisedPnl: 2500, config: allDay }) })).toBe(STOP_REASON.TARGET_REACHED)
    expect(entriesBlocked({ at: at('2026-08-15T18:20:00Z'), config: allDay, progress: dailyProgress({ startingEquity: 100_000, unrealisedPnl: -4000, config: allDay }) })).toBe(STOP_REASON.DAILY_LOSS)
  })
})
