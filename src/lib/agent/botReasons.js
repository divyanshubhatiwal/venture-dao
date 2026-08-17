/**
 * Plain-language explanations for why the bot is not trading.
 *
 * The engine already records exactly why every cycle declined, but it records
 * it as codes in a journal — `MAX_POSITION`, `EDGE_BELOW_COST` — which tells
 * someone who wrote the risk engine what happened and tells nobody else. The
 * commonest question asked of this app has been "why isn't it trading?", and
 * the app has always known the answer.
 *
 * Each entry says three things: what happened, why the bot is designed to do
 * that, and what the operator can actually change. The third part matters most
 * — a reason with no lever attached just reads as a malfunction.
 *
 * `tone` drives colour only. `healthy: true` marks refusals that are the bot
 * working correctly rather than something to fix.
 */

export const REASONS = {
  'no-trade': {
    title: 'No valid setup right now',
    why: 'The signal engine or its critic found nothing worth trading on the scanned markets.',
    fix: 'Nothing to do. Most cycles end here by design — waiting is a position.',
    tone: 'slate',
    healthy: true,
  },
  MAX_POSITION: {
    title: 'Position would be too large',
    why: 'Risk ÷ stop distance asks for a bigger position than your max-position cap allows. A tight stop makes the required size grow, so this fires most often when stops are close.',
    fix: 'Lower Risk / trade %, raise Max position %, or scan a longer timeframe where stops sit further away.',
    tone: 'amber',
  },
  MAX_LEVERAGE: {
    title: 'Position would exceed your leverage limit',
    why: 'The size implied by your risk budget is more than Max leverage × your equity.',
    fix: 'Lower Risk / trade %, or raise Max leverage — knowing that leverage magnifies losses as well as gains.',
    tone: 'amber',
  },
  MAX_NOTIONAL: {
    title: 'Order value above the server cap',
    why: 'DELTA_MAX_ORDER_NOTIONAL limits any single order, and this one was larger.',
    fix: 'Raise the cap in your .env deliberately, or reduce Risk / trade %.',
    tone: 'amber',
  },
  EDGE_BELOW_COST: {
    title: 'The trade could not pay its own fees',
    why: 'The distance to target was worth less than a few times the round-trip cost, so it would need luck on slippage just to break even.',
    fix: 'Nothing to do. This is the check that stops fee-only trades — the kind that win and still lose money.',
    tone: 'slate',
    healthy: true,
  },
  SYMBOL_EXPOSURE: {
    title: 'Already holding that market',
    why: 'The bot will not add to an open position, which would concentrate risk in one symbol.',
    fix: 'Nothing to do. It will look at other markets instead.',
    tone: 'slate',
    healthy: true,
  },
  OPPOSING_EXPOSURE: {
    title: 'That would hedge against your own position',
    why: 'A long and a short on one market pay both spreads to net roughly nothing.',
    fix: 'Nothing to do. The existing position has to close first.',
    tone: 'slate',
    healthy: true,
  },
  MAX_POSITIONS: { title: 'Position limit reached', why: 'Every slot allowed by Max positions is in use.', fix: 'Wait for one to close, or raise Max positions.', tone: 'slate', healthy: true },
  MAX_TRADES: { title: 'Daily trade limit reached', why: 'The bot has taken as many trades today as you allowed.', fix: 'Raise Max trades per day, or wait for tomorrow.', tone: 'slate', healthy: true },
  STALE_DATA: { title: 'Market data is stale', why: 'The latest candles are too old to trade on, usually a dropped connection.', fix: 'Check the backend is online and reaching the data provider.', tone: 'rose' },
  NO_STOP: { title: 'No stop could be placed', why: 'The bot refuses any entry it cannot protect.', fix: 'Nothing to do — an unprotected position is never worth taking.', tone: 'slate', healthy: true },
  INVALID_STOP: { title: 'The stop was on the wrong side of entry', why: 'A long needs its stop below entry, a short above.', fix: 'Nothing to do. The setup was rejected as malformed.', tone: 'slate', healthy: true },
  DAILY_LOSS: { title: 'Daily loss limit reached', why: 'Losses hit the limit you set, so new entries stop for the day.', fix: 'Trading resumes tomorrow. Do not raise the limit to keep trading — that is the behaviour this exists to prevent.', tone: 'rose' },
  TARGET_REACHED: { title: 'Daily target reached', why: 'The bot met your profit objective and stopped, rather than giving it back.', fix: 'Enable "continue after target" if you want it to keep going.', tone: 'emerald', healthy: true },
  SESSION_ENDED: { title: 'Outside trading hours', why: 'The clock is outside your configured session window.', fix: 'Change the session times, or set start and end equal for 24-hour trading.', tone: 'slate', healthy: true },
  NEAR_CLOSE: { title: 'Too close to the session end', why: 'A position opened now would be flattened before it had room to work, paying fees for nothing.', fix: 'Nothing to do, or shorten the entry cutoff.', tone: 'slate', healthy: true },
  KILL_SWITCH: { title: 'Kill switch is on', why: 'DELTA_KILL_SWITCH blocks every order at the server.', fix: 'Set DELTA_KILL_SWITCH=false in .env and restart the backend.', tone: 'rose' },
  EMERGENCY_STOP: { title: 'Emergency stop is latched', why: 'All trading is halted until you clear it explicitly.', fix: 'Press "Clear stop" when you are ready to resume.', tone: 'rose' },
  MIN_MARGIN: { title: 'Not enough free margin', why: 'Available margin is below the floor you configured.', fix: 'Close a position or lower the margin floor.', tone: 'amber' },
  DRAWDOWN: { title: 'Drawdown limit reached', why: 'The account fell far enough from its peak to halt trading.', fix: 'Review what happened before restarting. This limit exists to end a bad run.', tone: 'rose' },
  NOT_APPROVED: { title: 'The pipeline declined', why: 'The critic or risk engine rejected the setup.', fix: 'Nothing to do.', tone: 'slate', healthy: true },
  INVALID_QTY: { title: 'Position size came out as zero', why: 'The risk budget was too small to buy a whole unit.', fix: 'Raise Risk / trade %, or trade a market with a smaller minimum size.', tone: 'amber' },
}

/**
 * The single most useful thing to tell the operator right now.
 *
 * Picks the most frequent recent reason rather than the newest one: the latest
 * entry might be an outlier, where the dominant reason is what is actually
 * holding the bot back.
 */
export function summariseBlockers(journal = []) {
  const relevant = journal.filter((entry) => entry.kind === 'blocked' || entry.kind === 'no-trade')
  if (relevant.length === 0) return null

  const counts = new Map()
  for (const entry of relevant) {
    const code = entry.code ?? entry.kind
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  const [code, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  const reason = REASONS[code]
  if (!reason) return { code, count, title: code, why: 'No explanation recorded for this code.', fix: '', tone: 'slate' }
  return { code, count, total: relevant.length, ...reason }
}
