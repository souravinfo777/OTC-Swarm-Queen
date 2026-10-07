"""
Liquidity Engine:
Detects:
- Equal Highs (EQH) & Equal Lows (EQL)
- Recent Swing High & Low pools (Buy-side / Sell-side liquidity)
- Liquidity sweeps (price wicks beyond liquidity level then closes back inside)
- Rejection after sweep
"""
from typing import List, Dict, Optional
from ..market.models import Candle, LiquidityZone


class LiquidityEngine:
    def __init__(self, tolerance_pct: float = 0.0003):
        # tolerance_pct: 0.03% difference threshold for equal highs/lows
        self.tolerance_pct = tolerance_pct

    def analyze(self, candles: List[Candle]) -> Dict:
        if len(candles) < 15:
            return {
                "activeZones": [],
                "sweep": False,
                "sweepType": None,
                "sweepPrice": None,
                "rejectionAfterSweep": False
            }

        zones: List[LiquidityZone] = []
        recent = candles[-60:]
        n = len(recent)

        # 1. Detect Equal Highs & Equal Lows
        # Clamp the window start: with fewer than ~25 candles, n - 25 would be negative
        # and wrap the scan to the beginning of the buffer instead of "last 25".
        for i in range(max(0, n - 25), n - 2):
            for j in range(i + 2, n - 1):
                # Equal Highs (Buy-side liquidity pool)
                diff_high = abs(recent[i].high - recent[j].high)
                avg_high = (recent[i].high + recent[j].high) / 2.0
                if (diff_high / avg_high) <= self.tolerance_pct:
                    zones.append(LiquidityZone(
                        id=f"EQH_{recent[j].timestamp}",
                        type="EQUAL_HIGH",
                        price=avg_high,
                        timestamp=recent[j].timestamp,
                        strength=0.85,
                        swept=False
                    ))

                # Equal Lows (Sell-side liquidity pool)
                diff_low = abs(recent[i].low - recent[j].low)
                avg_low = (recent[i].low + recent[j].low) / 2.0
                if (diff_low / avg_low) <= self.tolerance_pct:
                    zones.append(LiquidityZone(
                        id=f"EQL_{recent[j].timestamp}",
                        type="EQUAL_LOW",
                        price=avg_low,
                        timestamp=recent[j].timestamp,
                        strength=0.85,
                        swept=False
                    ))

        # 2. Add Recent Significant Highs/Lows as Liquidity Pools
        highest_c = max(recent[:-1], key=lambda c: c.high)
        lowest_c = min(recent[:-1], key=lambda c: c.low)

        zones.append(LiquidityZone(
            id=f"BSL_{highest_c.timestamp}",
            type="BUY_SIDE",
            price=highest_c.high,
            timestamp=highest_c.timestamp,
            strength=0.75,
            swept=False
        ))

        zones.append(LiquidityZone(
            id=f"SSL_{lowest_c.timestamp}",
            type="SELL_SIDE",
            price=lowest_c.low,
            timestamp=lowest_c.timestamp,
            strength=0.75,
            swept=False
        ))

        # 3. Detect Sweeps on Current / Previous Candle
        current = recent[-1]
        previous = recent[-2] if len(recent) >= 2 else current

        sweep_detected = False
        sweep_type = None
        sweep_price = None
        rejection = False

        for zone in zones:
            if zone.type in ("BUY_SIDE", "EQUAL_HIGH"):
                # Bullish liquidity swept if price pierced above the zone high, but closed below it!
                # That triggers a Bearish reversal opportunity (Sell setup)
                if current.high > zone.price and current.close < zone.price:
                    zone.swept = True
                    zone.sweepDirection = "BEARISH_SWEEP"
                    sweep_detected = True
                    sweep_type = "BUY_SIDE_SWEPT"
                    sweep_price = zone.price
                    # Check for rejection wick
                    upper_wick = current.high - max(current.open, current.close)
                    body = abs(current.close - current.open)
                    if upper_wick > body * 1.2:
                        rejection = True

            elif zone.type in ("SELL_SIDE", "EQUAL_LOW"):
                # Sell-side liquidity swept if price pierced below the zone low, but closed above it!
                # That triggers a Bullish reversal opportunity (Buy setup)
                if current.low < zone.price and current.close > zone.price:
                    zone.swept = True
                    zone.sweepDirection = "BULLISH_SWEEP"
                    sweep_detected = True
                    sweep_type = "SELL_SIDE_SWEPT"
                    sweep_price = zone.price
                    # Check for rejection wick
                    lower_wick = min(current.open, current.close) - current.low
                    body = abs(current.close - current.open)
                    if lower_wick > body * 1.2:
                        rejection = True

        return {
            "activeZones": [z.model_dump() for z in zones[-15:]],
            "sweep": sweep_detected,
            "sweepType": sweep_type,
            "sweepPrice": sweep_price,
            "rejectionAfterSweep": rejection
        }
