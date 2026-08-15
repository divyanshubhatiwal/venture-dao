# VentureDAO — Frontend

AI-powered decentralised investment intelligence. The AI reads a project, scores it, and opens an
on-chain proposal; token holders vote; the contract executes; outcomes feed back into the model.

This repo is the **frontend only** — React 18 + Vite + Tailwind + Recharts + ethers.js, matching the
stack in the hackathon blueprint. It ships with a complete demo dataset so every screen is clickable
before the backend or the smart contract exist.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

```bash
npm run build     # production bundle in dist/
npm run preview   # serve the production build on :4173
```

## The five modules

| Route | Module | What it does |
|---|---|---|
| `/` | Dashboard | KPI row, treasury performance, live proposals, activity feed, pipeline explainer |
| `/analyzer` | **M1** AI Project Analyzer | Project name or whitepaper PDF → staged analysis → scorecard → one-click proposal |
| `/voting` | **M2** DAO Voting | Proposal cards, live countdowns, token-weighted YES/NO/ABSTAIN, quorum enforcement, tx receipts |
| `/portfolio` | **M3** Portfolio & Treasury | Treasury chart, monthly P&L, sector and risk donuts, sortable holdings table, CSV export |
| `/learning` | **M4** AI Learning Engine | Accuracy trend vs random baseline, per-sector accuracy, learned weights and risk multipliers, JSON report export |
| `/chat` | **M5** Research Chatbot | Grounded Q&A with source attribution, markdown answers, exportable research notes |
| `/markets` | **Live Markets** | Real candlestick + volume charts for crypto, stocks and nine world indices, from 1-minute to weekly; SMA overlays, sparkline watchlists, treasury valued at the live ETH price |
| `/macro` | **Macro & Flow** | Real VIX, dollar, rates, gold, crude, global breadth, crypto aggregates and perp positioning, combined into an inspectable risk-on/risk-off regime read |
| `/trading` | **Signals & Trading** | Technical signal engine with every check exposed, episodes, order ticket, automation agent, positions and P&L — executing into a **paper account** |
| `/agent` | **Goal Agent** | Goal-based autonomous agent: capital protection first, dynamic risk engine, profit lock, account state machine, AI critic, kill switch |

The modules share state through `src/context/DaoContext.jsx`, so an analysis in M1 becomes a proposal
in M2 and the vote you cast shows up on the dashboard.

## Three things that are not in a normal hackathon build

**Evidence-grounded scores.** Every dimension score expands to show the passage the model actually
read, with source and page number, colour-coded as supporting or concerning. A score you can check
against its source is a different product from a score you have to trust. The backend returns these in
`teamStrength.evidence[]`, `technology.evidence[]`, and so on.

**An adversarial second pass.** Analyst models agree with whatever the whitepaper claims. So a bear
agent re-reads the same evidence looking for reasons to pass, and a reconciliation step decides how
much of that case survives — moving *confidence*, never the score, so the number stays auditable
against its citations. `POST /api/analyze/debate`, rendered by `src/components/DebatePanel.jsx`.

**Judge mode.** A hands-free three-minute walkthrough — press the button in the top bar. It drives the
real UI through the full pipeline (analyse → cite → stress-test → propose → vote → portfolio → learning
→ chat), spotlighting each element and narrating the pitch. Space pauses, arrows step, Esc exits.
The script lives in `src/lib/demoScript.js`; pages register the actions it calls via
`useDemo().registerAction`. Nothing about it is faked — it clicks the same code paths you would.

## Real market data

`/markets` is not demo data. Three asset classes, real prices, **no API key**:

| Tab | Provider | Endpoints |
|---|---|---|
| **Crypto** | Binance (candles), CoinGecko (quotes) | `/api/v3/klines`, `/coins/markets` |
| **Stocks** | Yahoo Finance | `/v8/finance/chart`, `/v8/finance/spark` |
| **World indices** | Yahoo Finance | S&P 500, Nasdaq, Dow, FTSE 100, DAX, Nikkei 225, Hang Seng, Sensex, Nifty 50 |

Each provider falls back to the next, and finally to a **snapshot of real prices captured 2026-08-12**
(`src/lib/marketSnapshot.js`, `src/lib/stockSnapshot.js`) so the demo survives a dead venue
connection. The UI **always shows which source produced the numbers on screen** — a green
`Live · Yahoo Finance` chip, or an amber `Snapshot` chip plus a banner. A snapshot is never presented
as live.

Index prices are formatted in their own currency (₹ for the Sensex, ¥ for the Nikkei, £ for the FTSE),
taken from the provider's own metadata rather than assumed.

### The CORS bridge

Binance and CoinGecko send CORS headers, so the browser calls them directly. **Yahoo does not**, so
equity requests go to a same-origin `/yf/*` path that is proxied server-side:

- **Development** — the Vite dev server proxies it (`vite.config.js`)
- **Production on Vercel** — `vercel.json` rewrites `/yf/:path*` to Yahoo, so the deployed app works
  with no backend at all (that file also adds the SPA fallback for deep links like `/markets`)
- **Any other host** — point `VITE_STOCK_PROXY` at your own route, or add this to the Express backend:

  ```js
  app.get('/yf/*', async (req, res) => {
    const url = `https://query1.finance.yahoo.com${req.originalUrl.replace(/^\/yf/, '')}`
    const upstream = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })
    res.status(upstream.status).json(await upstream.json())
  })
  ```

Note: Yahoo's `/v7/finance/quote` now requires an authenticated crumb, which is why quotes come from
the `/v8/finance/spark` endpoint instead.

### Intervals

Both sides support true intraday granularity: **1m, 5m, 15m, 1H, 4H, 1D** for crypto (Binance) and
**1m, 5m, 15m, 1H, 1D, 1W** for equities (Yahoo). Yahoo caps intraday history by interval — 1-minute
data only goes back about 7 days — so each interval is paired with the longest range it supports.

## Signals and paper trading

`/trading` has three parts.

**The signal engine** (`src/lib/indicators.js`, `src/lib/signals.js`) computes RSI-14 with Wilder's
smoothing, MACD 12/26/9, EMA-20, SMA-50, Bollinger 20/2, ATR-14, and swing-pivot support/resistance
from real candles. Each check votes with an explicit weight, and the UI shows every one of them with
the number it fired on — so the call can be argued with rather than obeyed. Entry, stop and target are
volatility-scaled from ATR and confirmed against real swing levels at a 2:1 reward-to-risk.
"Confidence" is agreement between the checks, **not** probability of being right.

**The execution engine** (`src/context/TradingContext.jsx`) fills orders against live prices through a
venue adapter, charging 0.10% fee and 0.05% slippage per side, enforces buying power, and checks stops
and targets on every price tick. Market and limit orders, longs and shorts, and the account persists in
localStorage.

**The agent** rescans every two minutes and opens positions that clear a configurable agreement
threshold. Size comes from a risk budget (default 1% of equity ÷ distance to stop), capped at 20% of
equity per position, with a maximum number of concurrent positions and a daily loss limit that halts
it for the day.

## The goal-based agent

`/agent` — you give it starting capital, a target, a maximum drawdown and a risk budget. It works
toward the target **only while capital protection allows**, and does nothing at all when it doesn't.

```
Priority 1  Protect capital
Priority 2  Avoid large drawdowns
Priority 3  Protect existing profits
Priority 4  Positive expected value
Priority 5  Reach the target
```

**The target never forces a trade.** Missing a trade is cheaper than taking a bad one.

### Pipeline

```
market data → signal → critic → RISK ENGINE → goal manager → paper execution → episode
```

The risk engine runs **last** and has the final word. Neither model confidence nor critic approval can
produce a trade it blocks — that ordering is what makes the safety rules unbypassable rather than
advisory. Verified live: a signal the critic approved at 85% agreement was rejected outright the moment
the kill switch engaged.

### Modules (`src/lib/agent/`)

| File | Role |
|---|---|
| `goalManager.js` | Progress, peak, drawdown, streaks, and the **profit-lock floor** that ratchets up and never falls |
| `riskEngine.js` | Hard gates (boolean vetoes) + soft sizing (multipliers that can only reduce), EV and win-probability estimation |
| `stateMachine.js` | NORMAL → PROFITING → PROFIT_PROTECTION → TARGET_NEAR → TARGET_REACHED, and DRAWDOWN → RISK_REDUCTION → COOLDOWN, plus SAFE_MODE |
| `critic.js` | Adversarial second pass: stop vs ATR, contradicting evidence, volatility, macro conflict, crowding, prior failures on the same setup |
| `decision.js` | Orchestrator and the fixed-width decision record |

### The no-martingale invariant

Every sizing multiplier is `≤ 1`, so **the maximum possible position is the configured base risk**.
Losses shrink size; winning streaks change nothing; approaching the target *reduces* risk rather than
chasing. This is structural, not a rule the model is asked to follow — and it is unit-tested across
six account states.

### Expected value

Win probability comes from the actual trade record, shrunk toward a deliberately pessimistic 45% prior
(weight 20), so three lucky trades cannot manufacture an edge. EV is charged for costs on both sides —
which is what rejects the "take +0.1% and never lose" idea automatically: at 95% win probability and
0.1 reward-to-risk, EV is still negative.

### Tests

```bash
npm test
```

**40 tests, all passing.** They exist because safety rules that aren't tested are just comments:
profit-lock ratcheting, every hard gate (drawdown, daily loss, losing streak, no stop, poor R:R,
negative EV, critic veto, kill switch), the no-martingale invariant across six states, state-machine
transitions, and the guarantee that halting states never permit trading.

### Delta Exchange integration

There is now a backend (`server/`), and it exists for one reason: Delta authenticates with an HMAC
signature over your **API secret**. A secret in a browser bundle is a published secret — anyone with
devtools can read it and drain the account. So the key lives in the Node process and the browser talks
only to our own routes.

```bash
cp .env.example .env      # add DELTA_API_KEY / DELTA_API_SECRET
npm run server            # backend on :5000
npm run dev               # frontend on :5173
```

Connection state shows on `/agent`: environment, endpoint, whether credentials loaded (masked to the
last 4), product count and the order cap.

**Testnet is the default**, and getting to live takes two deliberate switches:

```bash
DELTA_ENV=live
DELTA_ALLOW_LIVE=true     # without this, DELTA_ENV=live falls back to testnet
```

One typo should not be able to start moving real money. Verified: setting `DELTA_ENV=live` alone logs a
warning and stays on testnet.

Guards enforced **server-side**, where the browser cannot reach them — all verified against the live
testnet API:

| Guard | Result |
|---|---|
| `DELTA_MAX_ORDER_NOTIONAL` | 500 contracts → `400 NOTIONAL_CAP` — "notional 9401.62 exceeds cap of 100" |
| Side validation | `moon` → `400 Invalid side` |
| Integer contract size | `0.5` → `400 Size must be a positive integer` |
| Symbol validation | `NOTREAL` → `400 Unknown Delta symbol` |
| Missing credentials | → `503 NO_CREDENTIALS` |
| `DELTA_KILL_SWITCH=true` | → `423` on every order route |

Testnet funds come free from a faucet at testnet.delta.exchange and are worthless play tokens. That is
what makes it the right place to find out whether a strategy works.

### What is deliberately not built

Live-by-default execution. Delta is wired, but it points at testnet unless you set both switches
yourself. Binance and equity brokers remain unwired in `venues.js`.

The agent should earn the right to trade real money by proving itself on testnet first — which is what
this repo's own development order says, and what the backtest evidence currently argues against.

`scalpTest.js` measures any strategy honestly. Run the "+0.1%, never take a loss" idea through it: on
real ETH hourly data it wins **31 of 31 trades and still loses 6.16%**, because fees on 62 legs come to
4× the gross profit. Same strategy with fees zeroed returns +2.85%. That gap is the whole lesson.

### Episodes — the decision cycle

An episode (`src/lib/episodes.js`) is one complete cycle: **decide → execute → outcome → review →
feed back**. When a reasoned order is placed, the episode captures *why* at that moment — every
indicator check with its weight, the levels, the macro regime, and a written thesis. It closes when
the engine books the round trip, and is graded a few minutes later, once there is forward price action
to judge against.

The grading separates **being right** from **being right for the right reason**:

| Grade | Meaning |
|---|---|
| Right, thesis held | Reached the target the reasoning argued for |
| Right, thesis incomplete | Profitable, but the move never got there |
| **Right for the wrong reason** | Profitable, yet price reversed after the exit — luck, not skill |
| Wrong exit, right idea | Stopped out, then price went where the thesis said — stop too tight |
| Wrong, thesis broke | Price went against the reasoning and kept going |

That third row is the point. A winning trade taken for a reason that never materialised is how a
strategy quietly decays while looking healthy.

Each review also attributes the result to the **individual checks** — a check is vindicated when its
verdict matched what price actually did. Rolled up, that gives a per-indicator accuracy record, which
feeds back: checks with at least 5 reviewed episodes nudge the confidence on new signals, capped at
±15 points. A short record should influence a decision, not dictate it.

### Macro & Flow — the context layer

Price is not the only input. `/macro` pulls real, free data — VIX, dollar index, 10-year yield, gold
and crude (Yahoo); total crypto cap and BTC dominance (CoinGecko); ETH perp funding rate and open
interest (Binance futures); and breadth across the nine world indices — and combines them into a
risk-on/risk-off regime read where **every factor is shown with the number it fired on and its
weight**, so the conclusion can be disagreed with.

It is context, not prediction: a risk-off reading does not mean price falls, it means the conditions
that often accompany drawdowns are present. The regime at the time of a decision is stored on the
episode, so hit rate can be broken down by the conditions each trade was taken into.

### The backtest, and what it found

`src/lib/backtest.js` replays the strategy bar by bar with **no look-ahead** (the signal at bar *i* is
computed from bars 0…*i*, entered at the open of bar *i+1*), **pessimistic intrabar fills** (if a bar
touches both stop and target, the stop is assumed first), and **costs on both sides**.

Run over 6 symbols on hourly candles, the result was unambiguous: **the strategy loses money.** Profit
factors ranged 0.03–0.84 on the symbols with enough trades to judge, against a break-even of 1.0.
Trailing stops were the single biggest improvement — profit factor across the pool went from 0.56 to
0.94 — but still short of profitable. Higher confidence thresholds and longer holds both made it worse.

That finding is wired into the product rather than hidden. The agent has an **evidence gate**, on by
default: it refuses to trade any symbol whose backtest fails — negative expectancy, fewer than 10
trades, or beaten by buy and hold. With the current data that is every symbol, so **the agent sits out
and opens nothing**. That is the correct behaviour, not a bug.

The verdict logic is deliberately strict about small samples: one symbol showed a profit factor of 8.14
and is still rejected, because 4 trades cannot distinguish skill from luck.

**No trading system can guarantee profit.** What a system can control is the downside — position
sizing, stops, a daily loss limit, and refusing to trade a strategy with no demonstrated edge. That is
what is implemented here.

### Why there is no live exchange connection

The venue layer (`src/lib/venues.js`) is built as an adapter interface with Binance, Delta and equity
brokers described but **not implemented**. Two independent reasons:

1. **An exchange API key with trade permission cannot live in a React bundle.** Anything the browser
   can read, so can anyone with devtools or a malicious extension. Real order placement has to run
   server-side, with the key in the backend environment and IP-allowlisted at the exchange.
2. **Automated execution with real funds needs an explicit, reviewed decision by the account owner** —
   and in most jurisdictions, attention to whether automated advice and execution is a regulated
   activity. Note also that Yahoo is a *data* source; equities cannot be executed anywhere without a
   licensed broker API (Zerodha Kite, Upstox, Alpaca).

If you build the live path: put it behind `/api/venues/:venue/order` in the Express backend, develop
against the exchange testnets first (`testnet.binance.vision`, Delta's testnet), and keep a hard kill
switch plus per-order and per-day notional caps on the server.

**The signals are not investment advice.** They read price history and nothing else — no earnings, no
news, no filings, no macro. The page says so on every load.

### Everything else

Crypto prices are polled once a minute for the whole app by `src/context/MarketContext.jsx` (one
request, not one per component; it also catches up when a backgrounded tab returns). The treasury
value on the dashboard, portfolio and markets page is `412.68 ETH × the live rate` — the holdings are
demo figures, the price they are valued at is real.

The candlestick chart is hand-built: Recharts has no candle primitive, so `src/components/CandleChart.jsx`
renders each candle as a `Bar` spanning `[low, high]` with a custom shape that draws the wick and an
open/close body, plus SMA-7 / SMA-25 overlays and a linked volume histogram. It measures its own
container before mounting, because `ResponsiveContainer` never recovers from a first render at zero
width (a hidden tab or backgrounded window would otherwise leave the chart permanently blank).

## Demo data vs live backend

Every network call goes through `src/lib/api.js`, which tries the real endpoint and falls back to the
bundled dataset in `src/lib/mockData.js` when it is missing or erroring. That fallback is deliberate —
a demo never dies on stage because of hotel wifi. Each response reports whether it came from `live` or
`mock`, and the sidebar shows which mode is active.

To switch to the real backend:

1. `cp .env.example .env.local`
2. Set `VITE_API_URL=https://your-backend.onrender.com` and `VITE_USE_MOCKS=false`
3. Implement these endpoints:

| Method | Endpoint | Body | Returns |
|---|---|---|---|
| POST | `/api/analyze` | `{ projectName }` or multipart `whitepaper` | The analysis JSON schema below |
| POST | `/api/analyze/debate` | `{ analysis }` | `{ bull, bear, reconciliation }` |
| GET | `/api/proposals` | — | Array of proposals |
| POST | `/api/proposals` | Analysis object | `{ id, txHash }` |
| POST | `/api/proposals/:id/vote` | `{ support, weight }` | `{ txHash, blockNumber }` |
| GET | `/api/portfolio` | — | `{ stats, investments, performance, monthlyPnl, sectors, risk }` |
| GET | `/api/overview` | — | `{ stats, activity, performance, accuracy }` |
| GET | `/api/learning` | — | `{ trend, sectors, weights, multipliers, resolved, accuracy }` |
| POST | `/api/chat` | `{ message, history }` | `{ text, sources }` |

In development, `/api` is proxied to `http://localhost:5000` (override with `VITE_PROXY_TARGET`), so
relative paths work in both dev and production.

### Analysis JSON contract

The Gemini prompt must return exactly this shape — the scorecard renders it directly:

```json
{
  "projectName": "string",
  "sector": "string",
  "fundamentalScore": 0,
  "riskLevel": "Low|Medium|High",
  "recommendation": "Invest|Avoid|Watch",
  "confidence": 0,
  "teamStrength": {
    "score": 0,
    "analysis": "string",
    "evidence": [
      { "quote": "the passage the model read", "source": "Whitepaper §2.1", "page": 7, "kind": "support|concern" }
    ]
  },
  "technology": { "score": 0, "analysis": "string", "evidence": [] },
  "tokenomics": { "score": 0, "analysis": "string", "evidence": [] },
  "community": { "score": 0, "analysis": "string", "evidence": [] },
  "keyRisks": ["string"],
  "keyStrengths": ["string"],
  "summary": "string",
  "sources": ["string"],
  "elapsedSeconds": 0
}
```

## Wallet

`src/context/WalletContext.jsx` connects MetaMask through ethers v6, tracks account and chain changes,
and offers a one-click switch to Sepolia. **Without MetaMask installed it falls back to a clearly
labelled demo identity** and simulates vote receipts, so the governance flow still demos end to end.
Wire real contract calls in `src/lib/api.js` (`castVote`, `createProposal`) once `VentureDAO.sol` is
deployed and `VITE_CONTRACT_ADDRESS` is set.

## Project layout

```
src/
  components/   Layout (sidebar, topbar, wallet), KpiCard, shared UI, ErrorBoundary
  context/      Wallet, Toast, Dao (shared proposal + analysis state)
  lib/          api.js (live-or-mock), mockData.js (demo dataset), format.js
  pages/        Dashboard, Analyzer, Voting, Portfolio, Learning, Chat
```

## Notes

- All demo project names, scores and figures are fictional.
- Responsive from 360px up; the sidebar collapses to a drawer below `lg`.
- An `ErrorBoundary` wraps the app so one bad chart cannot blank the demo.
- Vendor chunks are split (react / charts / web3) to keep first paint light.
