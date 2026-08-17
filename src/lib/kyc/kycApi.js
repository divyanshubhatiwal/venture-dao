const API = import.meta.env?.VITE_API_URL || ''

/**
 * KYC client.
 *
 * Every call carries the session cookie; the server takes the owner from that
 * and ignores anything the page might claim about who it is.
 *
 * Note what is absent: there is no "fetch my PAN". The server will not return
 * a decrypted PAN even to the person who submitted it, so there is nothing to
 * call. A masked tail comes back with the status, which is all the UI needs to
 * show that a record exists.
 */
async function call(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}/api/kyc${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))
  if (!json.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status })
  return json.data
}

export const kycApi = {
  status: () => call(''),
  submit: (payload) => call('', { method: 'POST', body: payload }),
  // The prompts and their order come from the server and expire in minutes,
  // which is what a pre-recorded clip cannot satisfy.
  videoChallenge: () => call('/video/challenge', { method: 'POST' }),
  videoComplete: (result) => call('/video/complete', { method: 'POST', body: result }),
}

/* Client-side mirrors of the server's rules. The server is the authority —
   these exist only so the answer arrives without a round trip. */

const PAN_RE = /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/

export const looksLikeAadhaar = (value) => typeof value === 'string' && /^\d{4}\s?\d{4}\s?\d{4}$/.test(value.trim())

export function validatePanClient(pan) {
  const value = String(pan ?? '').trim().toUpperCase()
  if (looksLikeAadhaar(value)) return 'That looks like an Aadhaar number. Enter your PAN instead.'
  if (!value) return 'PAN is required.'
  if (value.length !== 10) return 'PAN is 10 characters, like ABCPE1234F.'
  if (!PAN_RE.test(value)) return 'That is not a valid PAN. Check the 4th and 5th characters.'
  return null
}

export function validateDobClient(dob, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dob ?? ''))) return 'Enter your date of birth.'
  const date = new Date(`${dob}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return 'That is not a real date.'
  if (date.getTime() > now) return 'Date of birth cannot be in the future.'
  const years = (now - date.getTime()) / (365.2425 * 24 * 60 * 60 * 1000)
  if (years < 18) return 'You must be 18 or older to trade.'
  if (years > 120) return 'Please check the year.'
  return null
}

export function validateNameClient(name) {
  const value = String(name ?? '').trim()
  if (value.length < 2) return 'Enter your full name as it appears on your PAN.'
  if (value.length > 100) return 'That name is too long.'
  return null
}
