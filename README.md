# Venture DAO

A trading application in two halves that run as two separate processes:

| | Folder | What it is | Runs on |
|---|---|---|---|
| **Frontend** | [`src/`](src) | React 19 + Vite + Tailwind | `localhost:5173` |
| **Backend** | [`server/`](server) | Express + MongoDB | `localhost:5000` |

They talk over HTTP only. The browser never reaches an exchange or the database
directly — everything goes through the backend, because an API secret in a
browser bundle is a published secret.

---

## Run it

Three terminals, in this order. The backend refuses to start without the
database, so start that first.

```bash
npm install
```

```bash
npm run db        # MongoDB on :27017
```

```bash
npm run server    # backend on :5000
```

```bash
npm run dev       # frontend on :5173
```

Then open <http://localhost:5173>.

`npm run db` runs a real MongoDB against `server/data/mongo`. It is a
development convenience for machines with no MongoDB installed — no
authentication, bound to localhost, and it stops with the terminal. For
anything else, install MongoDB Community Server or point `MONGODB_URI` at
Atlas; the application cannot tell the difference.

Other commands:

```bash
npm test          # 307 tests
npm run build     # production bundle into dist/
npm run db:migrate  # one-off import from the old SQLite file
```

---

## Backend — `server/`

Grouped by what each part is responsible for, so you can find things by asking
"what does this do" rather than by remembering filenames.

```
server/
├── index.js            every HTTP route, and the only entry point
│
├── identity/           who someone is, and their credentials
│   ├── auth.js           passwords (scrypt), sessions, cookies
│   ├── kyc.js            PAN records — no UI reaches these any more
│   ├── kycVideo.js       liveness challenges — no UI reaches these any more
│   └── vault.js          AES-256-GCM encryption for anything at rest
│
├── storage/            the database, and nothing else
│   ├── mongo.js          connection, pooling, indexes
│   └── db.js             every query in the application
│
├── trading/            the bot and the exchanges
│   ├── botEngine.js      the safety gates — decides if a trade may happen
│   ├── botService.js     the run loop, positions, the paper account
│   ├── dailySession.js   market hours and session windows
│   ├── suggestConfig.js  proposes settings from account size
│   ├── delta.js          Delta Exchange client (HMAC-signed)
│   └── venues/           exchange adapters via CCXT
│
├── market/
│   └── news.js           market news, fetched and cached server-side
│
├── scripts/            one-off tools, not part of the running server
├── __tests__/
└── data/               runtime database files — gitignored, never source
```

**Where to start reading:** `index.js` lists every route in one file. From a
route you can follow one hop into whichever folder does the work.

**The most important file** is `trading/botEngine.js`. Its `preflight()`
function holds every rule that can stop a trade — position size, leverage,
drawdown, daily loss, stop-loss presence, whether the trade can even cover its
own costs. It runs last and nothing can overrule it.

---

## Frontend — `src/`

```
src/
├── main.jsx, App.jsx    entry point and routing
├── pages/               one file per screen
├── components/          shared UI
├── context/             app-wide state (auth, market prices, trading)
│
└── lib/                 logic with no UI, grouped the same way as the backend
    ├── format.js          formatting, used everywhere — stays at the top
    ├── api/               clients for our own backend
    ├── market/            live prices, candles, macro, currency conversion
    ├── trading/           indicators, signals, backtests, costs, strategies/
    ├── agent/             the decision pipeline and its reasons
    └── demo/              the guided tour and its dataset
```

Pages are lazy-loaded per route, so opening the dashboard does not download the
trading screen.

`lib/` mirrors the backend's folders on purpose: `trading` on one side matches
`trading` on the other, so a change usually lands in the same-named folder in
both halves.

---

## One deliberate crossover

`server/trading/` imports three modules from `src/lib/`:

```
src/lib/agent/decision.js        how a trade decision is made
src/lib/agent/goalManager.js     goal and risk state
src/lib/trading/marketStress.js  market stress scoring
```

These are shared on purpose — the same decision logic runs in the browser for
the simulator and on the server for the live bot, and duplicating it would let
the two drift apart, which is worse than the crossover. They contain no UI and
no browser APIs.

It is the one place the halves are not cleanly separated, and it is deliberate
rather than accidental.

---

## Configuration

Copy `.env.example` to `.env` and fill it in. `.env` is gitignored and must
never be committed.

Nothing holding a secret may be prefixed `VITE_` — that prefix compiles a value
into the browser bundle, which for a database URI or an API secret means
publishing it.

Live trading requires **both** `DELTA_ENV=live` and `DELTA_ALLOW_LIVE=true`.
Either one alone falls back to testnet, so a single typo cannot start moving
real money.

---

## What this is honest about

The strategy does not currently have a demonstrated edge. Measured on this
project's own data:

- 31 winning trades out of 31, and the account still lost 6.16% — fees came to
  four times the gross profit
- 0 of 2,000 simulated runs reached the goal; every one hit the loss limit
- best profit factor found was 0.94, and anything under 1.0 loses money

Those numbers are on the landing page as well as in here. A trading tool that
only shows its good simulations is a sales pitch, not a tool.
