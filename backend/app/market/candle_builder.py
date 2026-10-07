"""
Candle Builder: Assembles MarketTick streams into normalized Candles (1m, 5m, 15m).
Follows tick aggregation rules:
OPEN = first tick
HIGH = maximum tick
LOW = minimum tick
CLOSE = final tick
Never marks a candle closed until its timeframe is actually complete.
"""
from typing import Dict, Optional, Callable, List
from .models import MarketTick, Candle


class CandleBuilder:
    def __init__(self, asset: str, timeframe: int = 60, on_candle_closed: Optional[Callable[[Candle], None]] = None):
        self.asset = asset
        self.timeframe = timeframe  # in seconds
        self.tf_millis = timeframe * 1000
        self.current_candle: Optional[Candle] = None
        self.on_candle_closed = on_candle_closed

    def _get_candle_period_start(self, timestamp: int) -> int:
        return (timestamp // self.tf_millis) * self.tf_millis

    def process_tick(self, tick: MarketTick) -> Optional[Candle]:
        """
        Process a single market tick. Returns the closed candle if this tick closes one,
        otherwise updates current candle and returns None.
        """
        period_start = self._get_candle_period_start(tick.timestamp)
        closed_candle: Optional[Candle] = None

        if self.current_candle is None:
            # First tick creates current candle
            self.current_candle = Candle(
                id=f"{self.asset}_{self.timeframe}_{period_start}",
                asset=self.asset,
                timeframe=self.timeframe,
                timestamp=period_start,
                open=tick.price,
                high=tick.price,
                low=tick.price,
                close=tick.price,
                volume=tick.volume or 1.0,
                closed=False
            )
            return None

        # Check if period rolled over
        if period_start > self.current_candle.timestamp:
            # Mark previous as closed
            self.current_candle.closed = True
            closed_candle = self.current_candle
            if self.on_candle_closed:
                self.on_candle_closed(closed_candle)

            # Start new candle
            self.current_candle = Candle(
                id=f"{self.asset}_{self.timeframe}_{period_start}",
                asset=self.asset,
                timeframe=self.timeframe,
                timestamp=period_start,
                open=tick.price,
                high=tick.price,
                low=tick.price,
                close=tick.price,
                volume=tick.volume or 1.0,
                closed=False
            )
            return closed_candle
        else:
            # Update existing candle
            self.current_candle.high = max(self.current_candle.high, tick.price)
            self.current_candle.low = min(self.current_candle.low, tick.price)
            self.current_candle.close = tick.price
            self.current_candle.volume += (tick.volume or 1.0)
            return None

    def force_close_current(self) -> Optional[Candle]:
        if self.current_candle and not self.current_candle.closed:
            self.current_candle.closed = True
            closed = self.current_candle
            if self.on_candle_closed:
                self.on_candle_closed(closed)
            return closed
        return None
