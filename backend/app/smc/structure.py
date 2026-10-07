"""
Market Structure Engine:
Detects Swing Highs, Swing Lows, Higher Highs (HH), Higher Lows (HL),
Lower Highs (LH), Lower Lows (LL), Break of Structure (BOS), and
Change of Character (CHoCH).
Strictly avoids look-ahead bias by requiring right-side confirmation window.
"""
from typing import List, Dict, Optional, Tuple
from ..market.models import Candle, SwingPoint


class MarketStructureEngine:
    def __init__(self, swing_window: int = 3):
        self.swing_window = swing_window

    def analyze(self, candles: List[Candle]) -> Dict:
        """
        Analyzes candle series up to current candle.
        Returns trend, bos, choch, lastSwingHigh, lastSwingLow, swings list.
        """
        if len(candles) < (self.swing_window * 2 + 3):
            return {
                "trend": "UNCERTAIN",
                "bos": False,
                "choch": False,
                "lastSwingHigh": None,
                "lastSwingLow": None,
                "swings": []
            }

        swings: List[SwingPoint] = []
        n = len(candles)

        # Identify swing highs and swing lows without look-ahead beyond index + swing_window
        # To evaluate candle i, we look at [i - swing_window ... i + swing_window]
        # Notice that for recent candles, we can only confirm up to n - 1 - swing_window
        eval_limit = n - self.swing_window
        for i in range(self.swing_window, eval_limit):
            curr_c = candles[i]
            
            # Check swing high
            is_high = True
            for w in range(1, self.swing_window + 1):
                if candles[i - w].high >= curr_c.high or candles[i + w].high > curr_c.high:
                    is_high = False
                    break
            
            if is_high:
                swings.append(SwingPoint(
                    index=i,
                    timestamp=curr_c.timestamp,
                    price=curr_c.high,
                    type="HIGH"
                ))
                continue

            # Check swing low
            is_low = True
            for w in range(1, self.swing_window + 1):
                if candles[i - w].low <= curr_c.low or candles[i + w].low < curr_c.low:
                    is_low = False
                    break
            
            if is_low:
                swings.append(SwingPoint(
                    index=i,
                    timestamp=curr_c.timestamp,
                    price=curr_c.low,
                    type="LOW"
                ))

        if not swings:
            return {
                "trend": "UNCERTAIN",
                "bos": False,
                "choch": False,
                "lastSwingHigh": None,
                "lastSwingLow": None,
                "swings": []
            }

        # Classify HH, HL, LH, LL
        last_high: Optional[SwingPoint] = None
        last_low: Optional[SwingPoint] = None

        for sp in swings:
            if sp.type == "HIGH":
                if last_high is None:
                    sp.classification = "HIGH"
                elif sp.price > last_high.price:
                    sp.classification = "HH"
                else:
                    sp.classification = "LH"
                last_high = sp
            else:
                if last_low is None:
                    sp.classification = "LOW"
                elif sp.price < last_low.price:
                    sp.classification = "LL"
                else:
                    sp.classification = "HL"
                last_low = sp

        # Detect BOS / CHoCH on current candle
        latest_c = candles[-1]
        bos = False
        choch = False
        prev_trend = "RANGE"

        # Determine prior swing trend
        highs = [s for s in swings if s.type == "HIGH"]
        lows = [s for s in swings if s.type == "LOW"]

        if len(highs) >= 2 and len(lows) >= 2:
            if highs[-1].price > highs[-2].price and lows[-1].price > lows[-2].price:
                prev_trend = "BULLISH"
            elif highs[-1].price < highs[-2].price and lows[-1].price < lows[-2].price:
                prev_trend = "BEARISH"
            else:
                prev_trend = "RANGE"

        current_trend = prev_trend

        # Break of Structure / Change of Character:
        # If in Bullish trend and latest candle closes above last confirmed swing high: BOS (trend continuation)
        # If in Bearish trend and latest candle closes above last confirmed swing high: CHoCH (trend reversal)
        # If in Bearish trend and latest candle closes below last confirmed swing low: BOS (continuation)
        # If in Bullish trend and latest candle closes below last confirmed swing low: CHoCH (reversal)
        if last_high and latest_c.close > last_high.price:
            if prev_trend == "BULLISH":
                bos = True
                current_trend = "BULLISH"
            elif prev_trend == "BEARISH":
                choch = True
                current_trend = "BULLISH"

        if last_low and latest_c.close < last_low.price:
            if prev_trend == "BEARISH":
                bos = True
                current_trend = "BEARISH"
            elif prev_trend == "BULLISH":
                choch = True
                current_trend = "BEARISH"

        return {
            "trend": current_trend,
            "bos": bos,
            "choch": choch,
            "lastSwingHigh": last_high.price if last_high else None,
            "lastSwingLow": last_low.price if last_low else None,
            "swings": [s.model_dump() for s in swings[-10:]]
        }
