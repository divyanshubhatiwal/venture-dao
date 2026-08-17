"""
Donchian breakout with a long-term trend filter — the same hypothesis already
tested in src/lib/strategies/trendFollow.js, reimplemented here so Freqtrade
can check it independently.

The point is not to reuse the JS result but to disagree with it if it is wrong.
That result — out-of-sample profit factor 1.47 across 13 symbols — came from a
backtester written by the same person who wrote the strategy, which is exactly
the situation where a subtle look-ahead bug flatters the numbers and nobody
notices. Freqtrade's engine was written by other people, enforces its own
candle boundaries, and charges its own fees. If the edge is real it should
survive being measured by a stranger.

Parameters are the published Turtle/textbook defaults, fixed before any result
was looked at:

    entry channel   20   breakout lookback
    exit channel    10   trailing exit lookback
    trend filter   200   long-term regime line
    ATR stop       2.0x  volatility stop

Long only. Shorting needs borrow, funding and squeeze assumptions that would
have to be modelled honestly rather than assumed free.

This file is research tooling. It is not imported by the application, and no
code from it is shipped into src/ or server/.
"""

from functools import reduce

import talib.abstract as ta
from pandas import DataFrame

from freqtrade.strategy import IStrategy


class DonchianTrend(IStrategy):
    INTERFACE_VERSION = 3

    timeframe = "1d"
    can_short = False

    # Exits are driven entirely by the channel and the ATR stop below. A flat
    # percentage ROI table would close winners early and quietly convert this
    # from a trend follower — which needs its few large winners — into
    # something else that happens to share its entries.
    minimal_roi = {"0": 100.0}

    # Wide enough never to bind. The real protective stop is the ATR one in
    # custom_stoploss; leaving this at a tight default would silently override
    # the volatility sizing the strategy depends on.
    stoploss = -0.99
    use_custom_stoploss = True

    trailing_stop = False
    process_only_new_candles = True

    startup_candle_count: int = 210  # 200 trend filter + ATR warmup + margin

    order_types = {
        "entry": "market",
        "exit": "market",
        "stoploss": "market",
        "stoploss_on_exchange": False,
    }

    ENTRY_LOOKBACK = 20
    EXIT_LOOKBACK = 10
    TREND_FILTER = 200
    ATR_PERIOD = 14
    ATR_STOP_MULT = 2.0

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # shift(1) throughout: a channel that includes the current candle is
        # compared against itself, so today's high is always "the highest high"
        # and the breakout triggers on every bar. That is the single most
        # common way a breakout backtest invents an edge.
        dataframe["channel_high"] = dataframe["high"].rolling(self.ENTRY_LOOKBACK).max().shift(1)
        dataframe["channel_low"] = dataframe["low"].rolling(self.EXIT_LOOKBACK).min().shift(1)
        dataframe["trend"] = ta.SMA(dataframe, timeperiod=self.TREND_FILTER)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=self.ATR_PERIOD)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        conditions = [
            dataframe["close"] > dataframe["trend"],        # regime is up
            dataframe["close"] > dataframe["channel_high"],  # and it broke out
            dataframe["atr"] > 0,                            # volatility is measurable
            dataframe["volume"] > 0,                         # the candle actually traded
        ]
        dataframe.loc[reduce(lambda a, b: a & b, conditions), "enter_long"] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe.loc[dataframe["close"] < dataframe["channel_low"], "exit_long"] = 1
        return dataframe

    def custom_stoploss(self, pair: str, trade, current_time, current_rate, current_profit, **kwargs) -> float:
        """
        Volatility stop, fixed at entry rather than trailing.

        Deliberately not a trailing stop: trailing changes the risk taken after
        the trade is open, and the whole design here is that the maximum loss is
        decided once, before entry, and never revised upward.
        """
        candle = self.dp.get_analyzed_dataframe(pair, self.timeframe)[0]
        if candle.empty or "atr" not in candle:
            return self.stoploss

        atr = candle["atr"].iat[-1]
        if not atr or atr <= 0 or not trade.open_rate:
            return self.stoploss

        # Returned as a negative ratio from the entry price, per Freqtrade's API.
        distance = (atr * self.ATR_STOP_MULT) / trade.open_rate
        return -min(abs(distance), 0.99)
