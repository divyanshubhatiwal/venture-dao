# Freqtrade research harness

Freqtrade used as a **measurement tool**, not as a trading engine.

The application already has an execution engine, risk gates and a session
manager. What it does not have is a strategy with a demonstrated edge — the
existing signal engine measures a profit factor of **0.94**, and it loses even
with fees set to zero. That is the problem this directory exists to attack.

Nothing here is imported by the app. It never trades and holds no credentials.

## Why a second backtester

`src/lib/strategies/trendFollow.js` already reported an out-of-sample profit
factor of **1.47** for the Donchian trend hypothesis. That number was produced
by a backtester written by the same person who wrote the strategy — which is
precisely the setup where a look-ahead bug flatters the result and nobody
catches it.

Freqtrade's engine was written by other people, enforces its own candle
boundaries and charges its own fees. If the edge is real, it survives being
measured by a stranger. If the two disagree, one of them has a bug worth
finding, and that is a useful outcome too.

## Prerequisites

Docker Desktop. Freqtrade cannot be pip-installed on this machine — TA-Lib
needs MSVC Build Tools, which are not present.

## Commands

Run all of these from `research/freqtrade`.

**1. Download candles** (public data, no key needed)

```bash
docker compose run --rm freqtrade download-data --timeframe 1d --days 1500
```

**2. Backtest, in-sample**

```bash
docker compose run --rm freqtrade backtesting --strategy DonchianTrend --timerange 20200101-20240101
```

**3. Backtest, out-of-sample** — the number that actually counts. Nothing may
be tuned after seeing it.

```bash
docker compose run --rm freqtrade backtesting --strategy DonchianTrend --timerange 20240101-
```

**4. Walk-forward, which is stricter than one split**

```bash
docker compose run --rm freqtrade backtesting --strategy DonchianTrend --timerange 20200101- --timeframe-detail 1h
```

## Reading the result

Look at **profit factor** and **expectancy**, not total profit. Total profit on
a long-only strategy through a bull market mostly measures the bull market.

Compare against buy-and-hold before believing anything: the JS study found this
approach lost to simply holding on 9 of 13 symbols. A strategy that
underperforms doing nothing is not an edge, it is activity.

Then remove the best five trades and look again. The JS result collapsed from
1.47 to 0.96 under that test, which says the edge rests on a handful of
outliers and is far more fragile than the headline suggests.

## On hyperopt

`freqtrade hyperopt` will find parameters that fit the sample. It will always
find some. A hyperopt result is a hypothesis to test on data it has never seen,
never a result in itself — and the more parameters it is allowed to tune, the
more certain it becomes that the answer is overfitted.

If hyperopt is used at all, its output must be tested on a third period that
was held back from both the fitting and the validation.

## Licence

Freqtrade is GPL-3.0. It runs here as a separate container invoked from the
command line, which imposes no licence obligation on the application. What
comes back is numbers and conclusions.

`DonchianTrend.py` is written for Freqtrade's plugin interface and stays in
this directory. Do not copy it, or any Freqtrade code, into `src/` or
`server/` — port the *finding*, implemented independently, not the source.
