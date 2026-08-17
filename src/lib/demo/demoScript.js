/**
 * The hands-free walkthrough, following a pitch structure:
 * hook → problem → demo → evidence → ask.
 *
 * Each step can move the router, fire an action a page has registered with the
 * demo director, and spotlight an element by its `data-demo` attribute. The
 * whole flow runs without touching the keyboard, so a dead wifi connection or
 * a shaky hand cannot cost the demo.
 */
export const DEMO_STEPS = [
  {
    id: 'hook',
    route: '/dashboard',
    target: '[data-demo="kpis"]',
    chapter: 'The hook',
    narration:
      'Most trading bots follow an indicator and hope. This one reads the market context, argues against its own idea, and refuses to trade when the evidence is thin.',
    duration: 11000,
  },
  {
    id: 'problem',
    route: '/trading',
    target: '[data-demo="signals"]',
    chapter: 'How it decides',
    narration:
      'Four steps: read the market background, score the setup with checks you can see, let a second pass argue against it, then learn from what actually happened. The safety limits run last and have the final say.',
    duration: 12000,
  },
  {
    id: 'markets',
    route: '/markets',
    target: '[data-demo="candles"]',
    chapter: 'Real market data',
    narration:
      'None of the market data is invented. Live candles, volume and moving averages for crypto, listed equities and nine world indices — from the S&P and Nasdaq to the Sensex and the Nikkei, streaming as they print.',
    duration: 14000,
  },
  {
    id: 'macro',
    route: '/macro',
    target: '[data-demo="regime"]',
    chapter: 'The context layer',
    narration:
      'Price alone is not context. Volatility, the dollar, rates, global breadth and where leverage is positioned combine into a regime read — with every factor shown and weighted, so you can disagree with the conclusion.',
    duration: 14000,
  },
  {
    id: 'signals',
    route: '/trading',
    action: { name: 'trading:scan' },
    target: '[data-demo="signals"]',
    chapter: 'Signals that show their working',
    narration:
      'Every call exposes the checks behind it — RSI, MACD, trend, Bollinger, volume — each with the number it fired on and the weight it carries. Confidence here means agreement between checks, not probability of being right.',
    duration: 15000,
  },
  {
    id: 'backtest',
    route: '/trading',
    target: '[data-demo="backtest"]',
    chapter: 'The honest part',
    narration:
      'And we backtested it. Walk-forward, no look-ahead, costs charged both sides. The strategy loses money — so the agent has an evidence gate that refuses to trade any symbol without a demonstrated edge. Right now that means it sits out.',
    duration: 16000,
  },
  {
    id: 'agent',
    route: '/agent',
    action: { name: 'agent:cycle' },
    target: '[data-demo="goal"]',
    chapter: 'The goal agent',
    narration:
      'Give it starting capital, a target and a maximum drawdown. It works toward the goal only while capital protection allows. Position size can only ever shrink from base — no martingale, no doubling after losses, and risk falls as the target gets closer.',
    duration: 16000,
  },
  {
    id: 'decision',
    route: '/agent',
    target: '[data-demo="decision"]',
    chapter: 'Every decision is auditable',
    narration:
      'Entry, stop, target, reward-to-risk, expected value, the critic verdict, and every size reduction applied with its reason. When a trade is rejected, it says exactly which gate stopped it.',
    duration: 15000,
  },
  {
    id: 'ask',
    route: '/dashboard',
    target: '[data-demo="kpis"]',
    chapter: 'The close',
    narration:
      'Real data, real order routing to Delta, a risk engine that cannot be argued with, and a system honest enough to tell you when its own strategy does not work. Thank you.',
    duration: 12000,
  },
]

export const DEMO_TOTAL_MS = DEMO_STEPS.reduce((sum, s) => sum + s.duration, 0)
