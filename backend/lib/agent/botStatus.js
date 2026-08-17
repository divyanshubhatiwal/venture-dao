/**
 * Where the agent's run state is published so other screens can read it.
 *
 * The Goal Agent page owns this state and always has; the chart needs to
 * display it truthfully rather than guess. A module-level store is enough —
 * it is one value, written by exactly one component, and routing it through
 * React context would mean re-rendering every provider consumer on a change
 * that only a status chip cares about.
 *
 * Nothing here starts, stops, or influences the agent. It only reports.
 */

let state = { mode: 'off', reason: null }
const listeners = new Set()

/** Called by the agent page when its run state changes. */
export function publishBotStatus(next) {
  if (next.mode === state.mode && next.reason === state.reason) return
  state = { ...next }
  listeners.forEach((fn) => fn(state))
}

export function getBotStatus() {
  return state
}

export function subscribeBotStatus(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
