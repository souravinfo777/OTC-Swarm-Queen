"""
Candle Store: Maintains historical candle buffer (at least 500 candles per asset/timeframe)
and provides rolling series access for SMC engines.
"""
from typing import Dict, List, Optional
from collections import deque
from .models import Candle


class CandleStore:
    def __init__(self, max_buffer: int = 1000):
        self.max_buffer = max_buffer
        # Key: (asset, timeframe) -> deque of Candle
        self._store: Dict[str, deque[Candle]] = {}

    def _key(self, asset: str, timeframe: int) -> str:
        return f"{asset}:{timeframe}"

    def add_candle(self, candle: Candle):
        key = self._key(candle.asset, candle.timeframe)
        if key not in self._store:
            self._store[key] = deque(maxlen=self.max_buffer)
        
        # If last candle has same timestamp, replace it (e.g. updating in-progress)
        if len(self._store[key]) > 0 and self._store[key][-1].timestamp == candle.timestamp:
            self._store[key][-1] = candle
        else:
            self._store[key].append(candle)

    def get_candles(self, asset: str, timeframe: int, limit: int = 500) -> List[Candle]:
        key = self._key(asset, timeframe)
        if key not in self._store:
            return []
        items = list(self._store[key])
        return items[-limit:]

    def get_latest_candle(self, asset: str, timeframe: int) -> Optional[Candle]:
        key = self._key(asset, timeframe)
        if key not in self._store or len(self._store[key]) == 0:
            return None
        return self._store[key][-1]

    def count(self, asset: str, timeframe: int) -> int:
        key = self._key(asset, timeframe)
        return len(self._store[key]) if key in self._store else 0

    def clear(self, asset: Optional[str] = None, timeframe: Optional[int] = None):
        if asset and timeframe:
            key = self._key(asset, timeframe)
            if key in self._store:
                self._store[key].clear()
        else:
            self._store.clear()
