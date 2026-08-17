import { useEffect, useState } from 'react'
import { Activity, Ban, CircleDot, Pause, Radio } from 'lucide-react'
import { deltaVenue } from '../lib/trading/venues'
import { subscribeBotStatus } from '../lib/api/botApi'

const BOT_CHIP = {
  running: { label: 'BOT RUNNING', tone: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300', icon: Activity },
  paused: { label: 'BOT PAUSED', tone: 'border-amber-500/30 bg-amber-500/10 text-amber-300', icon: Pause },
  off: { label: 'BOT OFF', tone: 'border-white/10 bg-white/[0.04] text-slate-500', icon: CircleDot },
}

/**
 * Derive the chip from what the server reports about the loop that actually
 * trades. This previously read a value published by the Goal Agent page, so
 * the bar could read BOT OFF while the server-side bot was mid-cycle — two
 * different "bots" on one screen, disagreeing. There is one bot, it lives on
 * the server, so ask it.
 */
function modeFrom(status) {
  if (!status) return 'off'
  if (status.emergencyStop || status.killSwitch) return 'paused'
  return status.running ? 'running' : 'off'
}

/**
 * Execution context, stated plainly: which venue would receive an order, and
 * whether the agent is running.
 *
 * Every chip is driven by something the app actually reports — the venue from
 * the backend's own status endpoint, the bot from the agent page. If the
 * backend cannot be reached the routing chips are omitted rather than
 * defaulted, because guessing "testnet" for something that might be live is
 * the one mistake this bar exists to prevent.
 */
export default function TradingStatusBar({ streaming, source }) {
  const [delta, setDelta] = useState(null)
  const [bot, setBot] = useState(null)

  useEffect(() => subscribeBotStatus((next, err) => setBot(err ? null : next)), [])

  useEffect(() => {
    let alive = true
    const pull = () =>
      deltaVenue
        .status()
        .then((s) => alive && setDelta(s))
        .catch(() => alive && setDelta(null))
    pull()
    const t = setInterval(pull, 30_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const botChip = BOT_CHIP[modeFrom(bot)]
  const BotIcon = botChip.icon

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip border-brand-500/30 bg-brand-500/10 text-brand-200">PAPER</span>

      {delta && (
        <span
          className={`chip ${delta.live ? 'border-rose-500/40 bg-rose-500/15 text-rose-300' : 'border-sky-500/30 bg-sky-500/10 text-sky-300'}`}
          title={delta.baseUrl}
        >
          {delta.live ? 'DELTA LIVE' : 'DELTA TESTNET'}
        </span>
      )}

      {delta?.killSwitch && (
        <span className="chip border-rose-500/40 bg-rose-500/15 text-rose-300">
          <Ban size={11} />
          KILL SWITCH
        </span>
      )}

      <span className={`chip ${botChip.tone}`} title={bot?.state ? `${bot.state} · ${bot.mode}` : undefined}>
        <BotIcon size={11} />
        {botChip.label}
      </span>

      <span className={`chip ${streaming ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
        {streaming ? <span className="live-dot" /> : <Radio size={11} />}
        {streaming ? 'LIVE' : source ?? 'POLLING'}
      </span>
    </div>
  )
}
