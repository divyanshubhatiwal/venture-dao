import { describe, expect, it } from 'vitest'
import { issueChallenge, purgeExpiredChallenges, verifyChallenge, _challenges } from '../identity/kycVideo.js'

const USER = 'user-1'
const good = (c, over = {}) => ({
  nonce: c.nonce,
  userId: USER,
  completedPrompts: c.prompts.map((p) => p.id),
  durationMs: 9000,
  motionScore: 0.35,
  ...over,
})

describe('issueChallenge', () => {
  it('issues prompts and a spoken code the client could not have known', () => {
    const c = issueChallenge(USER)
    expect(c.prompts).toHaveLength(3)
    expect(c.spokenCode).toMatch(/^\d{4}$/)
    expect(c.nonce).toBeTruthy()
  })

  /* Randomised per attempt: a clip recorded before the challenge existed
     cannot contain the right answers in the right order. */
  it('varies between attempts', () => {
    const codes = new Set(Array.from({ length: 12 }, () => issueChallenge(USER).spokenCode))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('verifyChallenge', () => {
  it('accepts a genuine completion', () => {
    const c = issueChallenge(USER)
    const r = verifyChallenge(good(c))
    expect(r.ok).toBe(true)
    // Names exactly what was established, and no more.
    expect(r.established).toBe('liveness')
    expect(r.note).toMatch(/Identity was not verified/)
  })

  it('rejects a still photo', () => {
    const c = issueChallenge(USER)
    expect(verifyChallenge(good(c, { motionScore: 0 })).reason).toMatch(/still photo/)
  })

  it('rejects prompts done in the wrong order', () => {
    const c = issueChallenge(USER)
    const reversed = c.prompts.map((p) => p.id).reverse()
    expect(verifyChallenge(good(c, { completedPrompts: reversed })).reason).toMatch(/order/)
  })

  it('rejects a clip too short to contain the prompts', () => {
    const c = issueChallenge(USER)
    expect(verifyChallenge(good(c, { durationMs: 500 })).reason).toMatch(/too short/)
  })

  it('rejects a missing prompt', () => {
    const c = issueChallenge(USER)
    expect(verifyChallenge(good(c, { completedPrompts: [c.prompts[0].id] })).reason).toMatch(/Not all prompts/)
  })

  /* One use per challenge, pass or fail — otherwise it can be retried until
     something sticks. */
  it('cannot be replayed', () => {
    const c = issueChallenge(USER)
    expect(verifyChallenge(good(c)).ok).toBe(true)
    expect(verifyChallenge(good(c)).reason).toMatch(/unknown or already used/)
  })

  it('is consumed even by a failed attempt', () => {
    const c = issueChallenge(USER)
    verifyChallenge(good(c, { motionScore: 0 }))
    expect(verifyChallenge(good(c)).reason).toMatch(/unknown or already used/)
  })

  it('refuses a challenge issued to another user', () => {
    const c = issueChallenge(USER)
    expect(verifyChallenge(good(c, { userId: 'someone-else' })).reason).toMatch(/another session/)
  })

  it('refuses an expired challenge', () => {
    const c = issueChallenge(USER, { now: 0 })
    expect(verifyChallenge({ ...good(c), now: 10 * 60_000 }).reason).toMatch(/expired/)
  })

  it('refuses a fabricated nonce', () => {
    expect(verifyChallenge({ nonce: 'made-up', userId: USER, completedPrompts: [], durationMs: 9000, motionScore: 1 }).ok).toBe(false)
  })
})

describe('purgeExpiredChallenges', () => {
  it('clears out challenges nobody completed', () => {
    _challenges.clear()
    issueChallenge(USER, { now: 0 })
    expect(purgeExpiredChallenges(10 * 60_000)).toBe(1)
    expect(_challenges.size).toBe(0)
  })
})
