import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const tones = {
  success: { icon: CheckCircle2, ring: 'border-emerald-500/30', accent: 'text-emerald-400' },
  error: { icon: XCircle, ring: 'border-rose-500/30', accent: 'text-rose-400' },
  warning: { icon: AlertTriangle, ring: 'border-amber-500/30', accent: 'text-amber-400' },
  info: { icon: Info, ring: 'border-brand-500/30', accent: 'text-brand-300' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    ({ title, description, tone = 'info', duration = 4500 }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t, { id, title, description, tone }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2">
        {toasts.map((t) => {
          const { icon: Icon, ring, accent } = tones[t.tone] ?? tones.info
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex animate-fade-up items-start gap-3 rounded-xl border ${ring} bg-ink-850/95 p-3.5 shadow-xl backdrop-blur`}
            >
              <Icon className={`mt-0.5 h-4.5 w-4.5 shrink-0 ${accent}`} size={18} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">{t.title}</p>
                {t.description && <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-400">{t.description}</p>}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="rounded-md p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}
