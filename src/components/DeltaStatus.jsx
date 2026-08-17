import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, OctagonX, RefreshCw, ServerCog, ShieldCheck, XCircle } from 'lucide-react'
import { Card, Chip, SectionTitle } from './ui'
import { deltaVenue } from '../lib/trading/venues'

const tone = {
  emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  rose: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  slate: 'border-white/15 bg-white/5 text-slate-400',
}

/**
 * Connection panel for the Delta venue. Deliberately loud about which
 * environment is active — the difference between testnet and live is the
 * difference between play tokens and real money, and it should never be
 * something you have to guess at.
 */
export default function DeltaStatus() {
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setStatus(await deltaVenue.status())
    } catch (err) {
      setError(err.message)
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30_000)
    return () => clearInterval(timer)
  }, [load])

  const live = status?.live

  return (
    <Card className="p-5">
      <SectionTitle
        icon={ServerCog}
        title="Delta Exchange"
        hint="Orders signed by the backend"
        action={
          <button onClick={load} className="btn-ghost btn-sm">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        }
      />

      {loading && !status && !error && (
        <p className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Loader2 size={13} className="animate-spin" /> contacting backend…
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <XCircle size={13} className="text-slate-500" />
            Backend not reachable
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
            Start it with <code className="rounded bg-black/40 px-1 font-mono">npm run server</code>. Until then the agent keeps
            using the practice account.
          </p>
        </div>
      )}

      {status && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={live ? tone.rose : tone.emerald}>{live ? 'LIVE — REAL FUNDS' : 'TESTNET'}</Chip>
            <Chip tone={status.reachable ? tone.emerald : tone.amber}>{status.reachable ? 'reachable' : 'unreachable'}</Chip>
            {status.killSwitch && <Chip tone={tone.rose}>kill switch on</Chip>}
          </div>

          {live && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.08] p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-400" />
              <p className="text-[11px] leading-relaxed text-rose-100/90">
                Live mode is active. Orders placed from here move real money on your Delta account.
              </p>
            </div>
          )}

          {status.downgraded && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.08] p-3">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <p className="text-[11px] leading-relaxed text-amber-100/90">
                <code className="font-mono">DELTA_ENV=live</code> was requested but <code className="font-mono">DELTA_ALLOW_LIVE</code>{' '}
                is not <code className="font-mono">true</code>, so the backend stayed on testnet.
              </p>
            </div>
          )}

          <dl className="mt-4 space-y-2.5 text-[11px]">
            {[
              ['Endpoint', status.baseUrl.replace('https://', '')],
              ['Credentials', status.hasCredentials ? `loaded ${status.apiKeyTail}` : 'not set — public data only'],
              ['Products', status.productCount ?? '—'],
              ['Max order notional', `$${status.maxOrderNotional}`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="truncate font-mono text-slate-300">{String(v)}</dd>
              </div>
            ))}
          </dl>

          {!status.hasCredentials && (
            <p className="mt-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-500">
              Add <code className="font-mono text-slate-400">DELTA_API_KEY</code> and{' '}
              <code className="font-mono text-slate-400">DELTA_API_SECRET</code> to <code className="font-mono">.env</code> and
              restart the backend. Get testnet keys free at testnet.delta.exchange — those funds are play tokens.
            </p>
          )}

          {status.hasCredentials && !live && (
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-emerald-300/80">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
              Ready to place real orders against Delta's testnet with virtual funds.
            </p>
          )}
        </>
      )}

      <p className="mt-4 flex items-start gap-2 border-t border-white/[0.06] pt-3 text-[10px] leading-relaxed text-slate-600">
        <OctagonX size={12} className="mt-0.5 shrink-0" />
        Keys live only in the backend process. The order-size cap and kill switch are enforced server-side, where the browser
        cannot reach them.
      </p>
    </Card>
  )
}
