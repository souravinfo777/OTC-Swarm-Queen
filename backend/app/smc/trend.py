"""
Trend Engine:
Synthesizes market structure, swing sequences, displacement direction,
and recent momentum into a clear regime trend:
BULLISH, BEARISH, RANGE, or UNCERTAIN.
"""
from typing import List, Dict
from ..market.models import Candle


class TrendEngine:
    @staticmethod
    def evaluate(candles: List[Candle], structure_res: Dict) -> str:
        if len(candles) < 15:
            return "UNCERTAIN"

        struct_trend = structure_res.get("trend", "UNCERTAIN")
        recent = candles[-15:]
        closes = [c.close for c in recent]

        # Calculate momentum: EMA-9 vs EMA-21
        def calc_ema(values: List[float], period: int) -> float:
            k = 2.0 / (period + 1.0)
            ema = values[0]
            for val in values[1:]:
                ema = (val * k) + (ema * (1.0 - k))
            return ema

        ema9 = calc_ema(closes, 9)
        ema21 = calc_ema(closes, 21)

        # Count bullish vs bearish candles in recent 10
        recent10 = candles[-10:]
        bull_count = sum(1 for c in recent10 if c.close > c.open)
        bear_count = sum(1 for c in recent10 if c.close < c.open)

        # Align structure with momentum
        if struct_trend == "BULLISH" and ema9 > ema21 and bull_count >= 5:
            return "BULLISH"
        elif struct_trend == "BEARISH" and ema9 < ema21 and bear_count >= 5:
            return "BEARISH"
        elif struct_trend == "RANGE" or abs(bull_count - bear_count) <= 1:
            return "RANGE"
        elif struct_trend in ("BULLISH", "BEARISH"):
            # Moderate alignment
            return struct_trend
        
        return "UNCERTAIN"
