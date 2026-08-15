export const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n))

export function shortAddress(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function usd(n, opts = {}) {
  const { compact = false, decimals = 0 } = opts
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : decimals,
    minimumFractionDigits: compact ? 0 : decimals,
  }).format(n)
}

export function num(n, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(n)
}

export function pct(n, decimals = 1) {
  return `${n > 0 ? '+' : ''}${n.toFixed(decimals)}%`
}

/** Human countdown from now to an ISO/ms deadline. */
export function timeLeft(deadline) {
  const ms = new Date(deadline).getTime() - Date.now()
  if (ms <= 0) return { ended: true, label: 'Voting closed', ms: 0 }
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`
  return { ended: false, label, ms }
}

export function relativeTime(date) {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.round(hrs / 24)}d ago`
}

/** Tailwind text colour for a 0-100 score. */
export function scoreColor(score) {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 55) return 'text-amber-400'
  return 'text-rose-400'
}

export function scoreHex(score) {
  if (score >= 75) return '#34d399'
  if (score >= 55) return '#fbbf24'
  return '#fb7185'
}

export const riskTone = {
  Low: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  High: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
}

export const recommendationTone = {
  Invest: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Watch: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  Avoid: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
}

export const statusTone = {
  Active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Exited: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
  Failed: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  Passed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  Rejected: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  Live: 'border-brand-500/30 bg-brand-500/10 text-brand-200',
}
