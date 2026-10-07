"""
Market Regime Engine: Classifies current market condition into:
TREND_UP, TREND_DOWN, RANGE, HIGH_VOLATILITY, LOW_VOLATILITY, UNCERTAIN.
Avoids look-ahead bias and requires sufficient sample size.
"""
from typing import List
from .models import Candle, MarketRegimeType


class MarketRegimeEngine:
    @staticmethod
    def classify(candles: List[Candle], period: int = 20) -> MarketRegimeType:
        if len(candles) < period:
            return MarketRegimeType.UNCERTAIN

        recent = candles[-period:]
        closes = [c.close for c in recent]
        highs = [c.high for c in recent]
        lows = [c.low for c in recent]

        # Calculate Simple Moving Averages
        sma_fast = sum(closes[-10:]) / 10.0
        sma_slow = sum(closes) / float(period)

        # Average True Range for volatility
        trs = []
        for i in range(1, len(recent)):
            tr = max(
                recent[i].high - recent[i].low,
                abs(recent[i].high - recent[i-1].close),
                abs(recent[i].low - recent[i-1].close)
            )
            trs.append(tr)
        atr = sum(trs) / len(trs) if trs else 0.0001
        avg_price = sum(closes) / len(closes)
        atr_pct = (atr / avg_price) * 100.0

        # Linear regression slope of closes
        n = len(closes)
        x_mean = (n - 1) / 2.0
        y_mean = sum(closes) / n
        numerator = sum((i - x_mean) * (closes[i] - y_mean) for i in range(n))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        slope = (numerator / denominator) if denominator != 0 else 0.0
        slope_pct = (slope * n / avg_price) * 100.0

        # Consecutive higher highs / lower lows
        hh_count = sum(1 for i in range(1, len(recent)) if recent[i].high > recent[i-1].high)
        ll_count = sum(1 for i in range(1, len(recent)) if recent[i].low < recent[i-1].low)

        # Check for High / Low Volatility outliers
        if atr_pct > 0.35:
            return MarketRegimeType.HIGH_VOLATILITY
        elif atr_pct < 0.03:
            return MarketRegimeType.LOW_VOLATILITY

        # Trend checks
        if slope_pct > 0.08 and sma_fast > sma_slow and hh_count > ll_count + 3:
            return MarketRegimeType.TREND_UP
        elif slope_pct < -0.08 and sma_fast < sma_slow and ll_count > hh_count + 3:
            return MarketRegimeType.TREND_DOWN
        elif abs(slope_pct) <= 0.05:
            return MarketRegimeType.RANGE

        return MarketRegimeType.UNCERTAIN
