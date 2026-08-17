import { scoreHex } from '../lib/format'

export function Card({ as: Tag = 'div', className = '', hover = false, children, ...rest }) {
  return (
    <Tag className={`card ${hover ? 'card-hover' : ''} ${className}`} {...rest}>
      {children}
    </Tag>
  )
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="mb-6 border-b border-white/[0.07] pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && <p className="label mb-2">{eyebrow}</p>}
          <h1 className="text-[26px] font-semibold tracking-tight text-white">{title}</h1>
          {subtitle && <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function SectionTitle({ icon: Icon, title, hint, action }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {Icon && <Icon size={15} className="shrink-0 text-brand-300" />}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-slate-100">{title}</h2>
          {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Chip({ tone = 'border-white/15 bg-white/5 text-slate-300', children, className = '' }) {
  return <span className={`chip ${tone} ${className}`}>{children}</span>
}

export function ProgressBar({ value, max = 100, className = '', barClass = 'bg-brand-500', label }) {
  const pctValue = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-slate-400">
          <span>{label}</span>
          <span className="font-mono text-slate-300">{pctValue.toFixed(0)}%</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${barClass}`}
          style={{ width: `${pctValue}%` }}
        />
      </div>
    </div>
  )
}

/** Circular 0-100 score gauge; colour tracks the score band. */
export function ScoreRing({ score = 0, size = 132, stroke = 10, label = 'AI Score' }) {
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - score / 100)
  const color = scoreHex(score)

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="stroke-white/[0.08]" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          stroke={color}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-mono text-3xl font-bold leading-none" style={{ color }}>
          {score}
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-500">{label}</div>
      </div>
    </div>
  )
}

export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`skeleton ${className}`} />
}

export function StatSkeleton() {
  return (
    <Card className="p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </Card>
  )
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-500">
          <Icon size={22} />
        </span>
      )}
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Shared dark tooltip for every Recharts surface. */
export function ChartTooltip({ active, payload, label, formatter, suffix = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-ink-850/95 px-3 py-2 shadow-xl backdrop-blur">
      {label != null && <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.dataKey ?? entry.name} className="flex items-center gap-2 text-xs text-slate-200">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color ?? entry.payload?.color }} />
          <span className="text-slate-400">{entry.name}</span>
          <span className="ml-auto font-mono font-semibold text-slate-100">
            {formatter ? formatter(entry.value) : entry.value}
            {suffix}
          </span>
        </p>
      ))}
    </div>
  )
}

/** Glassmorphic accessible Modal */
export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div
        className={`relative z-10 w-full ${maxWidth} transform overflow-hidden rounded-2xl border border-white/15 bg-ink-900/95 p-6 shadow-2xl backdrop-blur-xl transition-all animate-fade-up`}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

/** Glowing status badge */
export function StatusBadge({ status = 'online', text, ping }) {
  const isOnline = status === 'online'
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md transition ${
        isOnline
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      }`}
    >
      <span className="relative flex h-2 w-2">
        {isOnline && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      </span>
      <span>{text || (isOnline ? 'Live API' : 'Connecting')}</span>
      {ping && <span className="font-mono text-[10px] text-slate-400">{ping}ms</span>}
    </div>
  )
}
