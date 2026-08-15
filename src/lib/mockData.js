/**
 * Demo dataset for VentureDAO.
 *
 * Everything here is fictional. It exists so the whole product is clickable
 * before the Node/Gemini backend and the Sepolia contract are wired in — see
 * `src/lib/api.js`, which prefers the real API and falls back to this file.
 */

const daysAgo = (d) => new Date(Date.now() - d * 86400 * 1000).toISOString()

export const DAO_STATS = {
  treasuryEth: 412.68,
  treasuryUsd: 1_486_048,
  tokenHolders: 2841,
  totalVotes: 18_734,
  activeProposals: 3,
  projectsAnalyzed: 147,
  aiAccuracy: 78.4,
  avgAnalysisSeconds: 11.6,
  quorumPct: 20,
  totalSupply: 10_000_000,
}

export const INVESTMENTS = [
  { id: 1, project: 'Verdant DeFi', sector: 'DeFi', entryEth: 40, valueEth: 62.4, roi: 56.0, status: 'Active', date: daysAgo(52), aiScore: 79, aiCall: 'Invest' },
  { id: 2, project: 'Helix Oracle', sector: 'Infrastructure', entryEth: 30, valueEth: 44.1, roi: 47.0, status: 'Active', date: daysAgo(88), aiScore: 82, aiCall: 'Invest' },
  { id: 3, project: 'NexusChain', sector: 'Layer 1', entryEth: 55, valueEth: 71.5, roi: 30.0, status: 'Active', date: daysAgo(120), aiScore: 76, aiCall: 'Invest' },
  { id: 4, project: 'ZeroLag Network', sector: 'Infrastructure', entryEth: 25, valueEth: 38.8, roi: 55.2, status: 'Exited', date: daysAgo(165), aiScore: 81, aiCall: 'Invest' },
  { id: 5, project: 'Meridian Vaults', sector: 'DeFi', entryEth: 20, valueEth: 24.6, roi: 23.0, status: 'Active', date: daysAgo(74), aiScore: 71, aiCall: 'Invest' },
  { id: 6, project: 'PixelForge', sector: 'NFT / Gaming', entryEth: 18, valueEth: 9.2, roi: -48.9, status: 'Failed', date: daysAgo(198), aiScore: 58, aiCall: 'Watch' },
  { id: 7, project: 'Stratos Data', sector: 'AI / Data', entryEth: 32, valueEth: 51.2, roi: 60.0, status: 'Active', date: daysAgo(41), aiScore: 85, aiCall: 'Invest' },
  { id: 8, project: 'Cobalt Swap', sector: 'DeFi', entryEth: 22, valueEth: 17.4, roi: -20.9, status: 'Active', date: daysAgo(29), aiScore: 66, aiCall: 'Watch' },
  { id: 9, project: 'Lumen Identity', sector: 'Identity', entryEth: 15, valueEth: 26.7, roi: 78.0, status: 'Exited', date: daysAgo(210), aiScore: 88, aiCall: 'Invest' },
  { id: 10, project: 'Tessera Realty', sector: 'RWA', entryEth: 28, valueEth: 30.9, roi: 10.4, status: 'Active', date: daysAgo(15), aiScore: 74, aiCall: 'Invest' },
]

export const PERFORMANCE = [
  { month: 'Sep', treasury: 214, benchmark: 214 },
  { month: 'Oct', treasury: 238, benchmark: 221 },
  { month: 'Nov', treasury: 261, benchmark: 209 },
  { month: 'Dec', treasury: 249, benchmark: 231 },
  { month: 'Jan', treasury: 296, benchmark: 244 },
  { month: 'Feb', treasury: 331, benchmark: 252 },
  { month: 'Mar', treasury: 318, benchmark: 240 },
  { month: 'Apr', treasury: 364, benchmark: 258 },
  { month: 'May', treasury: 389, benchmark: 266 },
  { month: 'Jun', treasury: 412, benchmark: 271 },
]

export const MONTHLY_PNL = [
  { month: 'Jan', pnl: 32 },
  { month: 'Feb', pnl: 41 },
  { month: 'Mar', pnl: -14 },
  { month: 'Apr', pnl: 52 },
  { month: 'May', pnl: 27 },
  { month: 'Jun', pnl: 23 },
]

export const SECTOR_ALLOCATION = [
  { name: 'DeFi', value: 34, color: '#6366f1' },
  { name: 'Infrastructure', value: 24, color: '#a855f7' },
  { name: 'AI / Data', value: 16, color: '#22d3ee' },
  { name: 'Layer 1', value: 12, color: '#34d399' },
  { name: 'RWA', value: 8, color: '#fbbf24' },
  { name: 'NFT / Gaming', value: 6, color: '#fb7185' },
]

export const RISK_DISTRIBUTION = [
  { name: 'Low', value: 52, color: '#34d399' },
  { name: 'Medium', value: 33, color: '#fbbf24' },
  { name: 'High', value: 15, color: '#fb7185' },
]

/* ---------- M4: AI learning engine ---------- */

export const ACCURACY_TREND = [
  { month: 'Sep', accuracy: 58, baseline: 50, samples: 9 },
  { month: 'Oct', accuracy: 61, baseline: 50, samples: 14 },
  { month: 'Nov', accuracy: 64, baseline: 50, samples: 18 },
  { month: 'Dec', accuracy: 63, baseline: 50, samples: 21 },
  { month: 'Jan', accuracy: 68, baseline: 50, samples: 26 },
  { month: 'Feb', accuracy: 71, baseline: 50, samples: 30 },
  { month: 'Mar', accuracy: 70, baseline: 50, samples: 33 },
  { month: 'Apr', accuracy: 74, baseline: 50, samples: 38 },
  { month: 'May', accuracy: 77, baseline: 50, samples: 44 },
  { month: 'Jun', accuracy: 78.4, baseline: 50, samples: 51 },
]

export const SECTOR_ACCURACY = [
  { sector: 'DeFi', accuracy: 84, samples: 22 },
  { sector: 'Infrastructure', accuracy: 81, samples: 17 },
  { sector: 'AI / Data', accuracy: 76, samples: 11 },
  { sector: 'Layer 1', accuracy: 73, samples: 9 },
  { sector: 'RWA', accuracy: 66, samples: 6 },
  { sector: 'NFT / Gaming', accuracy: 54, samples: 13 },
]

export const SCORING_WEIGHTS = [
  { param: 'Team strength', initial: 0.25, current: 0.22, note: 'Anonymous teams still shipped — weight trimmed.' },
  { param: 'Technology', initial: 0.25, current: 0.28, note: 'Strongest single predictor of a 12-month survivor.' },
  { param: 'Tokenomics', initial: 0.25, current: 0.31, note: 'Unlock cliffs explained most drawdowns; weight raised.' },
  { param: 'Community', initial: 0.25, current: 0.19, note: 'Social buzz was noisy in NFT / Gaming — weight cut.' },
]

export const RISK_MULTIPLIERS = [
  { sector: 'NFT / Gaming', multiplier: 1.42, reason: 'AI under-called risk on 6 of 13 calls' },
  { sector: 'RWA', multiplier: 1.18, reason: 'Regulatory outcomes hard to predict from whitepapers' },
  { sector: 'DeFi', multiplier: 0.94, reason: 'Audited protocols outperformed model expectation' },
  { sector: 'Infrastructure', multiplier: 0.97, reason: 'Stable outcomes, minor correction' },
]

export const ACTIVITY = [
  { id: 1, type: 'signal', text: 'Signal scan — BTC strong sell at 85% agreement', at: daysAgo(0.02) },
  { id: 2, type: 'risk', text: 'Risk engine blocked NVDA long — reward-to-risk 1.2 below the 1.5 minimum', at: daysAgo(0.03) },
  { id: 3, type: 'trade', text: 'Agent opened ETH long, 0.64% risk, stop 1,872', at: daysAgo(0.09) },
  { id: 4, type: 'learning', text: 'Learning engine raised tokenomics weight 0.28 → 0.31', at: daysAgo(0.5) },
  { id: 5, type: 'trade', text: 'SOL short hit target — episode graded "thesis held"', at: daysAgo(2) },
  { id: 6, type: 'risk', text: 'Critic vetoed AAPL long — stop inside one ATR', at: daysAgo(2.3) },
  { id: 7, type: 'analysis', text: 'Regime shifted to leaning risk-on — VIX 14.6', at: daysAgo(1.9) },
]

/* ---------- M5: research chatbot ---------- */

export const CHAT_SUGGESTIONS = [
  'Why is the agent not trading right now?',
  'Which sector has given us the best returns?',
  'What is the market regime saying?',
  'Has the strategy actually made money?',
]

export function mockChatReply(question) {
  const q = question.toLowerCase()

  if ((q.includes('not trading') || q.includes("isn't trading") || q.includes('no trade')) || (q.includes('agent') && q.includes('why'))) {
    return {
      text: `The **evidence gate** is holding it back, and that is deliberate.\n\nBefore the agent trades a symbol it checks that symbol's backtest. Right now none of the six pass:\n\n- Profit factor ranges **0.03 – 0.84** on the symbols with enough trades to judge, against a break-even of 1.0\n- The two that look profitable have **3 and 4 trades** — too few to separate skill from luck\n\nSo it sits out. An agent that trades because it hasn't hit its target yet is how accounts get emptied.`,
      sources: ['Strategy backtest — 6 symbols, hourly', 'Risk engine — evidence gate'],
    }
  }
  if (q.includes('sector') && (q.includes('best') || q.includes('return') || q.includes('perform'))) {
    return {
      text: `**AI / Data** is the best performing sector at **+60.0%** average ROI, though it is only 16% of the book.\n\nBy weighted contribution:\n- DeFi — 34% of book, +19.4% average\n- Infrastructure — 24% of book, +51.1% average\n- AI / Data — 16% of book, +60.0% average\n- NFT / Gaming — 6% of book, **−48.9%** average\n\nNFT / Gaming is the only sector that has lost money, which is why the learning engine now applies a 1.42× risk multiplier there.`,
      sources: ['Portfolio ledger (10 positions)', 'Learning engine — risk multipliers'],
    }
  }
  if (q.includes('regime') || q.includes('macro') || q.includes('market condition')) {
    return {
      text: `The backdrop reads **leaning risk-on**, driven mainly by calm volatility — VIX around **14.5**.\n\nThe rest is mixed rather than confirming:\n- Global breadth **4 of 9** indices advancing\n- BTC dominance **56.2%**, which is defensive positioning inside crypto\n- Perp funding balanced, and both venues price leverage within 0.1pp of each other\n\nThis is context, not a forecast. Risk-on conditions describe the environment a trade is taken into; they do not say which way the next move goes.`,
      sources: ['Macro & Flow — regime read', 'Yahoo Finance', 'Binance futures', 'Hyperliquid'],
    }
  }
  if (q.includes('made money') || q.includes('profitable') || q.includes('backtest') || q.includes('accuracy') || q.includes('learn')) {
    return {
      text: `Honestly: **no, not yet.**\n\nWalk-forward backtest with no look-ahead and costs on both sides, across six symbols:\n- Baseline config: **−$310** over 28 trades, profit factor **0.56**\n- Best variant (trailing stops): **−$30** over 38 trades, profit factor **0.94** — still under 1.0\n- Raising the confidence threshold made it *worse*, not better\n\nThe model's own recommendation accuracy has improved from 58% to 78.4% against a 50% baseline, but accuracy is not the same as profitability once fees are charged. That gap is why the agent refuses to trade.`,
      sources: ['Strategy backtest', 'Learning engine — accuracy trend'],
    }
  }
  if (q.includes('treasury') || q.includes('balance') || q.includes('position')) {
    return {
      text: `Treasury holds **412.68 ETH**, valued at the live ETH rate rather than a fixed number.\n\n- **285 ETH** deployed across positions, **127.68 ETH** unallocated\n- 10 positions on the book, 7 active, unrealised **+38.2%**\n- Two exits closed at +55.2% and +78.0%\n\nThe paper trading account is separate and starts at $100,000 of virtual money.`,
      sources: ['Portfolio ledger', 'Live ETH price — Binance stream'],
    }
  }
  return {
    text: `I answer from the system's own records — the portfolio ledger, the signal engine, the macro regime, episode history and the backtest results.\n\nTry asking why the agent is not trading, how a sector has performed, what the market regime is saying, or whether the strategy has actually made money. I will cite what the answer came from, including when the answer is unflattering.`,
    sources: ['VentureDAO knowledge base'],
  }
}
