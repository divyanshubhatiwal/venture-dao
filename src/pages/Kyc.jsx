import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, BadgeCheck, Clock, FileText, Info, Loader2, Lock, ShieldAlert, XCircle } from 'lucide-react'
import { Card, PageHeader, Skeleton } from '../components/ui'
import { kycApi, looksLikeAadhaar, validateDobClient, validateNameClient, validatePanClient } from '../lib/kyc/kycApi'
import VideoLiveness from '../components/VideoLiveness'

/**
 * Identity verification.
 *
 * Two things this screen is careful about, both of them honesty rather than
 * decoration:
 *
 * It never claims to have verified anyone. Nothing in this application talks to
 * a KRA, a CKYC registry or a licensed provider, so "approved" means a human
 * looked at a form. Saying "Verified" with a tick would be the single most
 * misleading thing this page could do.
 *
 * It refuses Aadhaar rather than accepting it quietly. The field is PAN, the
 * help text says so, and a 12-digit entry is rejected before it can be sent —
 * because the surest way to end up storing restricted identifiers is to leave
 * a box someone can type one into.
 */

const STATUS = {
  NOT_STARTED: {
    label: 'Not started',
    icon: FileText,
    tone: 'border-white/10 bg-white/[0.03] text-slate-300',
    blurb: 'Submit your details to open a verification record.',
  },
  PENDING: {
    label: 'Awaiting review',
    icon: Clock,
    tone: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-200',
    blurb: 'Your details are stored encrypted and are waiting on a manual review.',
  },
  APPROVED: {
    label: 'Approved',
    icon: BadgeCheck,
    tone: 'border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200',
    blurb: 'An operator marked this record approved. This is not an accredited identity check.',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    tone: 'border-rose-500/25 bg-rose-500/[0.07] text-rose-200',
    blurb: 'Correct the details below and submit again.',
  },
}

const Field = ({ id, label, hint, error, children }) => (
  <div>
    <label htmlFor={id} className="label mb-1.5 block">
      {label}
    </label>
    {children}
    {error ? (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-300">
        <AlertCircle size={13} />
        {error}
      </p>
    ) : (
      hint && <p className="mt-1.5 text-[11px] text-slate-600">{hint}</p>
    )}
  </div>
)

export default function Kyc() {
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState(null)
  const [errors, setErrors] = useState({})

  const [fullName, setFullName] = useState('')
  const [dob, setDob] = useState('')
  const [pan, setPan] = useState('')
  const [address, setAddress] = useState('')

  const load = useCallback(() => {
    kycApi
      .status()
      .then(setRecord)
      .catch(() => setRecord(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const validate = () => {
    const next = {
      fullName: validateNameClient(fullName),
      dob: validateDobClient(dob),
      pan: validatePanClient(pan),
    }
    Object.keys(next).forEach((k) => next[k] == null && delete next[k])
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError(null)
    if (!validate()) return

    setSaving(true)
    try {
      setRecord(await kycApi.submit({ fullName, dob, pan: pan.trim().toUpperCase(), address }))
      // Cleared on success so a PAN does not sit in component state, and in
      // React DevTools, for the rest of the session.
      setPan('')
      setAddress('')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const status = STATUS[record?.status ?? 'NOT_STARTED']
  const StatusIcon = status.icon
  const canSubmit = !record || record.status === 'NOT_STARTED' || record.status === 'REJECTED'

  return (
    <div className="animate-fade-up">
      <PageHeader
        eyebrow="Account"
        title="Verify your identity"
        subtitle="Indian trading accounts need a PAN. Your details are locked before they are saved, and never sent back to your browser."
      />

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="p-5">
            <div className={`flex items-start gap-3 rounded-xl border p-3.5 ${status.tone}`}>
              <StatusIcon size={17} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{status.label}</p>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{status.blurb}</p>
                {record?.reason && <p className="mt-1.5 text-xs opacity-90">Reason given: {record.reason}</p>}
              </div>
            </div>

            {record && record.status !== 'NOT_STARTED' && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.06] pt-4 sm:grid-cols-3">
                {[
                  ['Name on record', record.fullName],
                  ['Date of birth', record.dob],
                  ['PAN', record.panMasked],
                  ['Submitted', new Date(record.submittedAt).toLocaleDateString()],
                  ['Method', record.method === 'manual' ? 'Manual review' : record.method],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] uppercase tracking-wide text-slate-600">{k}</dt>
                    <dd className="mt-0.5 text-xs text-slate-200">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Only offered once there are details to attach it to — a liveness
                check with no record behind it verifies nothing. */}
            {record && record.status !== 'NOT_STARTED' && !record.livenessAt && (
              <div className="mt-5 border-t border-white/[0.06] pt-5">
                <VideoLiveness onPassed={setRecord} />
              </div>
            )}

            {record?.livenessAt && (
              <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
                <BadgeCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" />
                <div>
                  <p className="text-xs font-semibold text-emerald-200">
                    Liveness passed · {new Date(record.livenessAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{record.livenessNote}</p>
                </div>
              </div>
            )}

            {canSubmit ? (
              <form onSubmit={handleSubmit} noValidate className="mt-5 space-y-4 border-t border-white/[0.06] pt-5">
                {formError && (
                  <p className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.08] p-3 text-xs text-rose-200">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    {formError}
                  </p>
                )}

                <Field id="fullName" label="Full name" hint="Exactly as printed on your PAN card." error={errors.fullName}>
                  <input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    placeholder="Divyanshu Bhatiwal"
                    className={`input ${errors.fullName ? 'border-rose-500/50' : ''}`}
                  />
                </Field>

                <Field id="dob" label="Date of birth" hint="You must be 18 or older to hold a trading account." error={errors.dob}>
                  <input
                    id="dob"
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    className={`input ${errors.dob ? 'border-rose-500/50' : ''}`}
                  />
                </Field>

                <Field
                  id="pan"
                  label="PAN"
                  hint="Ten characters, like ABCPE1234F. Do not enter an Aadhaar number."
                  error={errors.pan}
                >
                  <input
                    id="pan"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    maxLength={10}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ABCPE1234F"
                    className={`input num tracking-[0.15em] ${errors.pan ? 'border-rose-500/50' : ''}`}
                  />
                </Field>

                {/* Caught as it is typed, not on submit: the point is that the
                    number never leaves the machine, so saying so early matters. */}
                {looksLikeAadhaar(pan) && (
                  <p className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-3 text-xs text-amber-200">
                    <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                    That looks like an Aadhaar number. This application does not collect Aadhaar and will not store it — please
                    enter your PAN.
                  </p>
                )}

                <Field id="address" label="Address (optional)" hint="Encrypted alongside your PAN.">
                  <textarea
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={2}
                    placeholder="City, State"
                    className="input resize-none"
                  />
                </Field>

                <button type="submit" disabled={saving} className="btn-primary w-full py-2.5">
                  {saving && <Loader2 size={15} className="animate-spin" />}
                  {record?.status === 'REJECTED' ? 'Resubmit for review' : 'Submit for verification'}
                </button>
              </form>
            ) : (
              <p className="mt-5 border-t border-white/[0.06] pt-5 text-xs text-slate-500">
                Your submission is locked while it is under review. If something is wrong, contact the operator to have it
                rejected so you can resubmit.
              </p>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Lock size={14} className="text-emerald-300" />
                <p className="label">How this is stored</p>
              </div>
              <ul className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-slate-400">
                <li>Your PAN and address are encrypted with AES-256-GCM before they touch the database.</li>
                <li>The encryption is bound to your account, so a record copied into another user’s row cannot be read.</li>
                <li>Only the last four characters of your PAN are kept in the clear, so a record can be identified without decrypting it.</li>
                <li>The server never sends a decrypted PAN back to the browser — not even to you.</li>
              </ul>
            </Card>

            {/* The honest caveat, given its own space rather than buried in a footer. */}
            <Card className="border-amber-500/20 p-4">
              <div className="flex items-center gap-2">
                <Info size={14} className="text-amber-300" />
                <p className="label text-amber-200/90">What this is not</p>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                This is a record, not a verification. Nothing here checks your identity against a KRA, CKYC registry or
                licensed provider — “approved” means a person reviewed the form. It does not make this a regulated broker,
                and it is not sufficient for real-money trading anywhere.
              </p>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
