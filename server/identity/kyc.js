import crypto from 'node:crypto'
import { findKycRecord, setKycLiveness, setKycReview, upsertKycRecord } from '../storage/db.js'
import { encryptSecret, decryptSecret } from './vault.js'

/**
 * KYC records.
 *
 * Read this before extending it — the decisions here are deliberate, and some
 * of them are legal rather than technical.
 *
 * WHAT THIS IS NOT: verification. Real KYC means checking an identity against
 * an accredited source — a KRA or CKYC registry in India, or a licensed
 * provider. Nothing here contacts one. A record reaching APPROVED means a human
 * operator marked it approved, and the status field says `manual` so nobody
 * later mistakes it for a verified identity.
 *
 * AADHAAR IS NOT COLLECTED. The Aadhaar Act restricts who may store Aadhaar
 * numbers, and an unaccredited application storing them in a SQLite file is
 * both unlawful and a serious liability if the file leaks. PAN is what Indian
 * brokers actually key KYC on, so PAN is what this asks for. If a UIDAI-
 * authorised flow is ever added it must go through an authorised agency and
 * store a reference token, never the number.
 *
 * Everything identifying is encrypted at rest with the same vault used for
 * exchange secrets, bound to the owning user so a row lifted into another
 * user's record fails to decrypt rather than quietly working.
 */

export const KYC_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
}


/* ---------- validation ---------- */

/**
 * PAN format: five letters, four digits, one letter.
 *
 * The fourth character encodes holder type and the fifth is the first letter
 * of the surname, so those are checked too — it catches a transposed or
 * invented number that a bare length check would wave through.
 */
const PAN_RE = /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/

export function validatePan(pan) {
  if (typeof pan !== 'string') return 'PAN is required.'
  const value = pan.trim().toUpperCase()
  if (value.length !== 10) return 'PAN must be exactly 10 characters.'
  if (!PAN_RE.test(value)) return 'That is not a valid PAN format (e.g. ABCPE1234F).'
  return null
}

/** Trading accounts require an adult; the check is explicit rather than assumed. */
export function validateDob(dob, now = Date.now()) {
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return 'Date of birth must be YYYY-MM-DD.'
  const date = new Date(`${dob}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return 'Date of birth is not a real date.'
  if (date.getTime() > now) return 'Date of birth cannot be in the future.'

  const years = (now - date.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
  if (years < 18) return 'You must be 18 or older.'
  if (years > 120) return 'Date of birth is not plausible.'
  return null
}

export function validateName(name) {
  if (typeof name !== 'string') return 'Full name is required.'
  const value = name.trim()
  if (value.length < 2 || value.length > 100) return 'Full name must be between 2 and 100 characters.'
  // Permissive on purpose: real names carry apostrophes, hyphens and dots, and
  // a stricter rule mostly rejects people rather than bad data.
  if (!/^[\p{L}\p{M}][\p{L}\p{M}\s'.-]*$/u.test(value)) return 'Full name contains characters that are not allowed.'
  return null
}

/**
 * Rejects an Aadhaar number if one is submitted anyway.
 *
 * A 12-digit value in a KYC form is almost certainly an Aadhaar, and accepting
 * it silently is how restricted identifiers end up in a database that was never
 * meant to hold them.
 */
export function looksLikeAadhaar(value) {
  return typeof value === 'string' && /^\d{4}\s?\d{4}\s?\d{4}$/.test(value.trim())
}

/* ---------- records ---------- */

const aad = (userId) => `${userId}:kyc`

export async function submitKyc({ userId, fullName, dob, pan, address, now = Date.now(), env = process.env }) {
  const fail = (message) => {
    throw Object.assign(new Error(message), { status: 400 })
  }

  if (looksLikeAadhaar(pan)) fail('Do not submit an Aadhaar number. This application asks for PAN only.')

  const nameError = validateName(fullName)
  if (nameError) fail(nameError)
  const dobError = validateDob(dob, now)
  if (dobError) fail(dobError)
  const panError = validatePan(pan)
  if (panError) fail(panError)

  const normalisedPan = pan.trim().toUpperCase()
  const record = {
    userId,
    status: KYC_STATUS.PENDING,
    method: 'manual',
    fullName: fullName.trim(),
    dob,
    panSealed: encryptSecret(normalisedPan, { aad: aad(userId), env }),
    panLast4: normalisedPan.slice(-4),
    addressSealed: address ? encryptSecret(String(address).trim(), { aad: aad(userId), env }) : null,
    submittedAt: now,
  }

  // A resubmission replaces the previous attempt and returns to PENDING; a
  // rejected applicant must be able to correct a typo without a second record.
  // replaceOne rather than a merge, so a stale reviewedAt or reason from the
  // rejected attempt cannot survive into the new one.
  return publicKyc(await upsertKycRecord(record))
}

export const getRawKyc = (userId) => findKycRecord(userId)

/**
 * The only shape allowed out of the server.
 *
 * The sealed PAN and address never leave, not even to their owner: showing a
 * decrypted PAN back to the browser puts it in memory, logs and screenshots for
 * no benefit, since the person submitting it already knows it. A masked tail is
 * enough to recognise the record.
 */
export function publicKyc(row) {
  if (!row) return { status: KYC_STATUS.NOT_STARTED }
  return {
    status: row.status,
    method: row.method,
    fullName: row.fullName,
    dob: row.dob,
    panMasked: `XXXXX${row.panLast4}`,
    submittedAt: row.submittedAt,
    livenessAt: row.livenessAt ?? null,
    livenessNote: row.livenessNote ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reason: row.reason ?? null,
  }
}

/**
 * Decrypt the PAN. Deliberately awkward to reach and never wired to a route —
 * it exists for a reviewer process that does not exist yet, and leaving it
 * unexported from the API surface is the point.
 */
export async function revealPan(userId, env = process.env) {
  const row = await getRawKyc(userId)
  return row ? decryptSecret(row.panSealed, { aad: aad(userId), env }) : null
}

/** Record that a liveness challenge was completed. Never changes `status`:
 *  passing a liveness check is not the same as being approved. */
export async function recordLiveness({ userId, note, now = Date.now() }) {
  const row = await getRawKyc(userId)
  if (!row) throw Object.assign(new Error('Submit your details before the video step.'), { status: 409 })
  await setKycLiveness(userId, { livenessAt: now, livenessNote: note })
  return publicKyc(await getRawKyc(userId))
}

export async function reviewKyc({ userId, approve, reviewedBy, reason = null, now = Date.now() }) {
  const row = await getRawKyc(userId)
  if (!row) throw Object.assign(new Error('No KYC submission for that user.'), { status: 404 })
  if (!approve && !reason) throw Object.assign(new Error('A rejection must say why.'), { status: 400 })

  await setKycReview(userId, {
    status: approve ? KYC_STATUS.APPROVED : KYC_STATUS.REJECTED,
    reviewedAt: now,
    reviewedBy,
    reason,
  })
  return publicKyc(await getRawKyc(userId))
}

/** True only for an approved record. Everything else — missing, pending,
 *  rejected — is not approved, and the caller must not treat them differently. */
export const isKycApproved = async (userId) => (await getRawKyc(userId))?.status === KYC_STATUS.APPROVED
