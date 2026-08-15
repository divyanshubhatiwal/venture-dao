import { describe, expect, it } from 'vitest'
import { REASONS, summariseBlockers } from '../botReasons'

describe('summariseBlockers', () => {
  it('returns nothing when the bot has not declined anything', () => {
    expect(summariseBlockers([])).toBeNull()
    expect(summariseBlockers([{ kind: 'order', symbol: 'ETH' }])).toBeNull()
  })

  /* The newest entry can be an outlier; the dominant one is what is actually
     holding the bot back, and that is what the operator needs to see. */
  it('picks the most frequent reason, not the most recent', () => {
    const journal = [
      { kind: 'blocked', code: 'STALE_DATA' },
      { kind: 'blocked', code: 'MAX_POSITION' },
      { kind: 'blocked', code: 'MAX_POSITION' },
      { kind: 'blocked', code: 'MAX_POSITION' },
    ]
    const s = summariseBlockers(journal)
    expect(s.code).toBe('MAX_POSITION')
    expect(s.count).toBe(3)
  })

  it('always offers a lever for a reason the operator can act on', () => {
    const s = summariseBlockers([{ kind: 'blocked', code: 'MAX_POSITION' }])
    expect(s.fix).toMatch(/Risk \/ trade|Max position/)
    expect(s.healthy).toBeUndefined()
  })

  it('marks correct refusals as healthy rather than as faults', () => {
    for (const code of ['EDGE_BELOW_COST', 'SYMBOL_EXPOSURE', 'TARGET_REACHED', 'NO_STOP']) {
      expect(summariseBlockers([{ kind: 'blocked', code }]).healthy).toBe(true)
    }
  })

  it('treats a plain no-trade cycle as healthy waiting', () => {
    const s = summariseBlockers([{ kind: 'no-trade', symbol: 'ETH' }])
    expect(s.healthy).toBe(true)
    expect(s.title).toMatch(/No valid setup/)
  })

  it('degrades gracefully on a code it has never seen', () => {
    const s = summariseBlockers([{ kind: 'blocked', code: 'SOMETHING_NEW' }])
    expect(s.title).toBe('SOMETHING_NEW')
    expect(s.tone).toBe('slate')
  })

  it('never tells the user to raise the daily loss limit to keep trading', () => {
    expect(REASONS.DAILY_LOSS.fix).toMatch(/Do not raise/)
  })

  it('gives every reason a title, a why and a tone', () => {
    for (const [code, r] of Object.entries(REASONS)) {
      expect(r.title, code).toBeTruthy()
      expect(r.why, code).toBeTruthy()
      expect(['slate', 'amber', 'rose', 'emerald'], code).toContain(r.tone)
    }
  })
})
