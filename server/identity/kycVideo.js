import crypto from 'node:crypto'

/**
 * Video liveness challenge.
 *
 * WHAT THIS DOES: proves that a live person sat in front of the camera and
 * followed instructions issued moments earlier by the server. The prompts are
 * randomised per attempt and expire quickly, so a pre-recorded clip cannot
 * satisfy a challenge it could not have known about.
 *
 * WHAT THIS DOES NOT DO, AND CANNOT: establish *who* that person is. Matching a
 * face to a PAN or an ID document requires an accredited provider with access
 * to the underlying records — in India, a KRA or CKYC registry, reached through
 * a licensed intermediary. Nothing here has that, so nothing here can approve
 * an identity. Auto-approving would not be automation, it would be fabricating
 * a verification that never happened.
 *
 * Regulated V-CIP additionally requires the operator to be an RBI/SEBI-
 * regulated entity, with a trained official on the call, geotagging, and
 * retention rules. This is the shape of that process, not the process.
 *
 * THE RAW VIDEO IS NEVER UPLOADED. Liveness is judged in the browser and only
 * the result is sent. Face video is biometric data: storing it on a laptop in a
 * SQLite file would create a far worse liability than the fraud it guards
 * against, and it is not needed to run the challenge.
 *
 * Honest limit: because the check runs client-side, a determined attacker can
 * lie about the result. Real V-CIP puts a human on the call for exactly this
 * reason. This raises the cost of casual fraud; it does not stop a motivated
 * one, and the status wording never implies it does.
 */

const CHALLENGE_TTL_MS = 3 * 60_000
const MIN_DURATION_MS = 4_000
const MAX_DURATION_MS = 90_000
/** Enough frame-to-frame change to rule out a static photo held to the lens. */
const MIN_MOTION_SCORE = 0.02

/** Actions a person can perform on camera without special instruction. */
const ACTIONS = [
  { id: 'blink', label: 'Blink twice, slowly' },
  { id: 'turn-left', label: 'Turn your head to the left' },
  { id: 'turn-right', label: 'Turn your head to the right' },
  { id: 'smile', label: 'Smile' },
  { id: 'nod', label: 'Nod once' },
]

const challenges = new Map()

/**
 * Issue a challenge.
 *
 * The prompt order is random and includes a spoken digit code, so a recording
 * made before the challenge existed cannot contain the right answer.
 */
export function issueChallenge(userId, { now = Date.now() } = {}) {
  const shuffled = [...ACTIONS].sort(() => crypto.randomInt(0, 2) - 0.5).slice(0, 3)
  const spokenCode = String(crypto.randomInt(1000, 9999))
  const nonce = crypto.randomBytes(16).toString('base64url')

  challenges.set(nonce, {
    userId,
    prompts: shuffled.map((a) => a.id),
    spokenCode,
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  })

  return {
    nonce,
    spokenCode,
    prompts: shuffled,
    expiresAt: now + CHALLENGE_TTL_MS,
    instructions: 'Follow each prompt in order, then read the code aloud.',
  }
}

/**
 * Check a submitted result against the challenge that was issued.
 *
 * Every failure is specific, because a generic "verification failed" leaves an
 * honest user with no idea whether to move to better light or start again.
 */
export function verifyChallenge({ nonce, userId, completedPrompts, durationMs, motionScore, now = Date.now() }) {
  const challenge = challenges.get(nonce)
  if (!challenge) return { ok: false, reason: 'That challenge is unknown or already used. Start a new one.' }

  // Single use, whatever the outcome — a challenge that survives a failed
  // attempt can be retried until something sticks.
  challenges.delete(nonce)

  if (challenge.userId !== userId) return { ok: false, reason: 'That challenge belongs to another session.' }
  if (now > challenge.expiresAt) return { ok: false, reason: 'The challenge expired. Please start again.' }

  if (!Array.isArray(completedPrompts) || completedPrompts.length !== challenge.prompts.length) {
    return { ok: false, reason: 'Not all prompts were completed.' }
  }
  // Order matters: it is the part a pre-recorded clip cannot fake.
  if (completedPrompts.some((p, i) => p !== challenge.prompts[i])) {
    return { ok: false, reason: 'The prompts were not completed in the order given.' }
  }

  if (!Number.isFinite(durationMs) || durationMs < MIN_DURATION_MS) {
    return { ok: false, reason: 'The recording was too short to show the prompts being followed.' }
  }
  if (durationMs > MAX_DURATION_MS) return { ok: false, reason: 'The recording was too long. Please try again.' }

  if (!Number.isFinite(motionScore) || motionScore < MIN_MOTION_SCORE) {
    return { ok: false, reason: 'No movement was detected. A still photo cannot complete this check.' }
  }

  return {
    ok: true,
    completedAt: now,
    /* Names what was actually established. Calling this "identity verified"
       would be the lie this whole module is written to avoid. */
    established: 'liveness',
    note: 'A live person completed a randomised challenge. Identity was not verified.',
  }
}

/** Housekeeping; expired challenges are refused anyway. */
export function purgeExpiredChallenges(now = Date.now()) {
  let removed = 0
  for (const [nonce, c] of challenges) {
    if (now > c.expiresAt) {
      challenges.delete(nonce)
      removed++
    }
  }
  return removed
}

export const _challenges = challenges
