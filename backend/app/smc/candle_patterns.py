"""
Candle Pattern Engine:
Detects high-impact price action patterns:
- Bullish / Bearish Engulfing
- Pin Bar (Hammer / Shooting Star)
- Rejection Candle (Long wick against trend)
- Doji (Indecision)
- Inside Bar (Consolidation)
- Breakout Candle
- Displacement Candle
- Long Wick
- Momentum Candle
- Failed Breakout
Calculates metrics: body ratio, upper wick ratio, lower wick ratio, range, close location.
"""
from typing import List, Dict, Optional
from ..market.models import Candle


class CandlePatternEngine:
    @staticmethod
    def analyze(candles: List[Candle]) -> Dict:
        if len(candles) < 3:
            return {
                "pattern": "NONE",
                "direction": "NEUTRAL",
                "bodyRatio": 0.0,
                "upperWickRatio": 0.0,
                "lowerWickRatio": 0.0,
                "range": 0.0,
                "closeLocation": 0.5,
                "confidence": 0.0
            }

        curr = candles[-1]
        prev = candles[-2]
        prev2 = candles[-3]

        total_range = curr.high - curr.low
        if total_range <= 0.000001:
            total_range = 0.000001

        body = abs(curr.close - curr.open)
        upper_wick = curr.high - max(curr.open, curr.close)
        lower_wick = min(curr.open, curr.close) - curr.low

        body_ratio = body / total_range
        upper_wick_ratio = upper_wick / total_range
        lower_wick_ratio = lower_wick / total_range

        # Close location relative to range: 0.0 = low, 1.0 = high
        close_location = (curr.close - curr.low) / total_range

        candle_dir = "BULLISH" if curr.close > curr.open else ("BEARISH" if curr.close < curr.open else "DOJI")

        prev_range = prev.high - prev.low
        if prev_range <= 0:
            prev_range = 0.000001
        prev_body = abs(prev.close - prev.open)

        pattern = "NONE"
        confidence = 0.5

        # 1. Doji
        if body_ratio < 0.10:
            pattern = "DOJI"
            confidence = 0.65

        # 2. Pin Bar / Hammer (Bullish Rejection)
        elif lower_wick_ratio >= 0.60 and body_ratio <= 0.30 and upper_wick_ratio <= 0.20:
            pattern = "PIN_BAR_BULLISH"
            candle_dir = "BULLISH"
            confidence = 0.85

        # 3. Pin Bar / Shooting Star (Bearish Rejection)
        elif upper_wick_ratio >= 0.60 and body_ratio <= 0.30 and lower_wick_ratio <= 0.20:
            pattern = "PIN_BAR_BEARISH"
            candle_dir = "BEARISH"
            confidence = 0.85

        # 4. Bullish Engulfing
        elif curr.close > curr.open and prev.close < prev.open and curr.open <= prev.close and curr.close > prev.open and body > prev_body * 1.1:
            pattern = "BULLISH_ENGULFING"
            candle_dir = "BULLISH"
            confidence = 0.82

        # 5. Bearish Engulfing
        elif curr.close < curr.open and prev.close > prev.open and curr.open >= prev.close and curr.close < prev.open and body > prev_body * 1.1:
            pattern = "BEARISH_ENGULFING"
            candle_dir = "BEARISH"
            confidence = 0.82

        # 6. Inside Bar
        elif curr.high <= prev.high and curr.low >= prev.low:
            pattern = "INSIDE_BAR"
            confidence = 0.60

        # 7. Displacement Candle (strong institutional body with minimal wicks)
        elif body_ratio >= 0.75 and total_range > prev_range * 1.5:
            pattern = f"DISPLACEMENT_{candle_dir}"
            confidence = 0.88

        # 8. Momentum Candle
        elif body_ratio >= 0.65 and (close_location >= 0.85 if candle_dir == "BULLISH" else close_location <= 0.15):
            pattern = f"MOMENTUM_{candle_dir}"
            confidence = 0.78

        # 9. Long Wick Rejection
        elif upper_wick_ratio >= 0.50:
            pattern = "BEARISH_REJECTION_WICK"
            confidence = 0.75
        elif lower_wick_ratio >= 0.50:
            pattern = "BULLISH_REJECTION_WICK"
            confidence = 0.75

        # 10. Failed Breakout (Pierced prev high/low and closed back inside)
        elif curr.high > prev.high and curr.close < prev.high and candle_dir == "BEARISH":
            pattern = "FAILED_BULLISH_BREAKOUT"
            confidence = 0.80
        elif curr.low < prev.low and curr.close > prev.low and candle_dir == "BULLISH":
            pattern = "FAILED_BEARISH_BREAKOUT"
            confidence = 0.80

        return {
            "pattern": pattern,
            "direction": candle_dir,
            "bodyRatio": round(body_ratio, 3),
            "upperWickRatio": round(upper_wick_ratio, 3),
            "lowerWickRatio": round(lower_wick_ratio, 3),
            "range": round(total_range, 6),
            "closeLocation": round(close_location, 3),
            "confidence": round(confidence, 2)
        }
