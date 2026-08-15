import { useState } from 'react'
import { useTrading } from '../context/TradingContext'
import { usd } from '../lib/format'

const TABS = ['Positions', 'Orders', 'Trade History', 'Bot Activity']

const relative = (t) => {
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const Empty = ({ children }) => <p className="px-4 py-6 text-center text-xs text-slate-600">{children}</p>

const Head = ({ cols }) => (
  <thead>
    <tr className="border-b border-white/[0.07] bg-white/[0.02]">
      {cols.map((c, i) => (
        <th key={c} className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${i === 0 ? 'text-left' : 'text-right'}`}>
          {c}
        </th>
      ))}
    </tr>
  </thead>
)

const Pnl = ({ value, pct }) => (
  <span className={`num font-semibold ${value >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
    {value >= 0 ? '+' : ''}
    {usd(value)}
    {pct != null && <span className="ml-1 text-[10px] opacity-70">({pct >= 0 ? '+' : ''}{pct}%)</span>}
  </span>
)

/**
 * Positions, orders, fills and agent log from the existing paper-trading
 * context. Scrolls internally at a fixed height so the chart above it keeps
 * its space no matter how many rows accumulate.
 */
export default function TradingTabs() {
  const { positions, orders, trades, log, closePosition, cancelOrder } = useTrading()
  const [tab, setTab] = useState('Positions')

  const counts = {
    Positions: positions.length,
    Orders: orders.filter((o) => o.status === 'working').length,
    'Trade History': trades.length,
    'Bot Activity': log.length,
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/[0.07] px-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 py-2.5 text-xs font-semibold transition ${
              tab === t ? 'border-b-2 border-brand-400 text-white' : 'border-b-2 border-transparent text-slate-500 hover:text-slate-300'
            }`}
          >
            {t}
            {counts[t] > 0 && <span className="num ml-1.5 rounded bg-white/10 px-1 text-[10px] text-slate-400">{counts[t]}</span>}
          </button>
        ))}
      </div>

      <div className="max-h-[220px] overflow-y-auto">
        {tab === 'Positions' &&
          (positions.length === 0 ? (
            <Empty>No open positions.</Empty>
          ) : (
            <table className="w-full min-w-[560px] text-xs">
              <Head cols={['Symbol', 'Side', 'Qty', 'Entry', 'Mark', 'Unrealised', '']} />
              <tbody className="divide-y divide-white/[0.05]">
                {positions.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 num font-bold text-slate-100">{p.symbol}</td>
                    <td className={`px-3 py-2 text-right font-semibold uppercase ${p.side === 'long' ? 'text-emerald-400' : 'text-rose-400'}`}>{p.side}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{p.qty}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{usd(p.entry)}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{usd(p.mark)}</td>
                    <td className="px-3 py-2 text-right"><Pnl value={p.unrealised} pct={p.unrealisedPct} /></td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => closePosition(p.id)} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300">
                        Close
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'Orders' &&
          (orders.length === 0 ? (
            <Empty>No orders yet.</Empty>
          ) : (
            <table className="w-full min-w-[560px] text-xs">
              <Head cols={['Symbol', 'Side', 'Type', 'Qty', 'Price', 'Status', '']} />
              <tbody className="divide-y divide-white/[0.05]">
                {orders.slice(0, 40).map((o) => (
                  <tr key={o.id} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 num font-bold text-slate-100">{o.symbol}</td>
                    <td className={`px-3 py-2 text-right font-semibold uppercase ${o.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>{o.side}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{o.type}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{o.qty}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{o.fillPrice ? usd(o.fillPrice) : o.limitPrice ? usd(o.limitPrice) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`chip ${o.status === 'filled' ? 'border-emerald-500/25 text-emerald-300' : o.status === 'cancelled' ? 'border-white/10 text-slate-500' : 'border-amber-500/25 text-amber-300'}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {o.status === 'working' && (
                        <button onClick={() => cancelOrder(o.id)} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400 transition hover:text-rose-300">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'Trade History' &&
          (trades.length === 0 ? (
            <Empty>No closed trades yet.</Empty>
          ) : (
            <table className="w-full min-w-[560px] text-xs">
              <Head cols={['Symbol', 'Side', 'Qty', 'Entry', 'Exit', 'P&L', 'Reason']} />
              <tbody className="divide-y divide-white/[0.05]">
                {trades.slice(0, 60).map((t, i) => (
                  <tr key={`${t.id}-${i}`} className="hover:bg-white/[0.03]">
                    <td className="px-3 py-2 num font-bold text-slate-100">{t.symbol}</td>
                    <td className={`px-3 py-2 text-right font-semibold uppercase ${t.side === 'long' ? 'text-emerald-400' : 'text-rose-400'}`}>{t.side}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{t.qty}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{usd(t.entry)}</td>
                    <td className="px-3 py-2 text-right num text-slate-300">{usd(t.exit)}</td>
                    <td className="px-3 py-2 text-right"><Pnl value={t.pnl} pct={t.pnlPct} /></td>
                    <td className="px-3 py-2 text-right text-[10px] text-slate-500">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'Bot Activity' &&
          (log.length === 0 ? (
            <Empty>No activity recorded this session.</Empty>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {log.slice(0, 60).map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span className="chip shrink-0 border-white/10 text-slate-500">{l.kind}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300">{l.text}</span>
                  <span className="shrink-0 text-[10px] text-slate-600">{relative(l.at)}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  )
}
