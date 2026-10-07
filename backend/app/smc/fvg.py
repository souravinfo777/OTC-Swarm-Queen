"""
Fair Value Gap (FVG) Engine:
Uses classic 3-candle imbalance logic:
- Bullish FVG: Candle 1 High < Candle 3 Low (gap between Candle 1 High and Candle 3 Low)
- Bearish FVG: Candle 1 Low > Candle 3 High (gap between Candle 1 Low and Candle 3 High)
Tracks:
- Upper, lower, size, timestamp, fresh, touched, mitigated.
- When price fills or touches the gap, updates touched/mitigated state.
"""
from typing import List, Dict, Optional
from ..market.models import Candle, FairValueGap


class FVGEngine:
    def __init__(self, min_gap_pct: float = 0.00015):
        self.min_gap_pct = min_gap_pct

    def analyze(self, candles: List[Candle]) -> Dict:
        # A 3-candle sequence is the minimum for a valid FVG (c1, c2, c3).
        if len(candles) < 3:
            return {
                "activeFVGs": [],
                "bullishFVGs": [],
                "bearishFVGs": [],
                "activeBullish": None,
                "activeBearish": None
            }

        fvgs: List[FairValueGap] = []
        n = len(candles)

        # Scan for 3-candle sequences [i-2, i-1, i]
        for i in range(2, n):
            c1 = candles[i - 2]
            c2 = candles[i - 1]
            c3 = candles[i]

            # Bullish FVG: c3.low is strictly above c1.high
            if c3.low > c1.high:
                gap_size = c3.low - c1.high
                avg_price = (c3.low + c1.high) / 2.0
                if (gap_size / avg_price) >= self.min_gap_pct:
                    fvg = FairValueGap(
                        id=f"BULL_FVG_{c2.timestamp}",
                        type="BULLISH",
                        upper=c3.low,
                        lower=c1.high,
                        size=gap_size,
                        timestamp=c2.timestamp,
                        fresh=True,
                        touched=False,
                        mitigated=False
                    )
                    fvgs.append(fvg)

            # Bearish FVG: c1.low is strictly above c3.high
            elif c1.low > c3.high:
                gap_size = c1.low - c3.high
                avg_price = (c1.low + c3.high) / 2.0
                if (gap_size / avg_price) >= self.min_gap_pct:
                    fvg = FairValueGap(
                        id=f"BEAR_FVG_{c2.timestamp}",
                        type="BEARISH",
                        upper=c1.low,
                        lower=c3.high,
                        size=gap_size,
                        timestamp=c2.timestamp,
                        fresh=True,
                        touched=False,
                        mitigated=False
                    )
                    fvgs.append(fvg)

        # Update mitigation status from candles strictly AFTER the completing candle
        # (c3). Scanning c3 itself marked every FVG touched at birth, so "fresh" was
        # permanently False and the FRESH_RETEST confluence point could never fire.
        for fvg in fvgs:
            # The FVG completes on the first candle after the middle candle (c3):
            # exclude it and everything before it from the mitigation scan.
            completing_ts = None
            for c in candles:
                if c.timestamp > fvg.timestamp:
                    completing_ts = c.timestamp
                    break
            for c in candles:
                if completing_ts is not None and c.timestamp <= completing_ts:
                    continue
                if fvg.type == "BULLISH":
                    # If price enters the gap
                    if c.low <= fvg.upper:
                        fvg.touched = True
                        fvg.fresh = False
                    # If price closes below lower boundary, it is fully mitigated
                    if c.close <= fvg.lower:
                        fvg.mitigated = True
                elif fvg.type == "BEARISH":
                    # If price enters the gap
                    if c.high >= fvg.lower:
                        fvg.touched = True
                        fvg.fresh = False
                    # If price closes above upper boundary, it is fully mitigated
                    if c.close >= fvg.upper:
                        fvg.mitigated = True

        # Identify latest active fresh or touched FVGs
        active_bullish: Optional[FairValueGap] = None
        active_bearish: Optional[FairValueGap] = None

        for f in fvgs:
            if not f.mitigated:
                if f.type == "BULLISH":
                    if active_bullish is None or f.timestamp > active_bullish.timestamp:
                        active_bullish = f
                else:
                    if active_bearish is None or f.timestamp > active_bearish.timestamp:
                        active_bearish = f

        return {
            "allFVGs": [f.model_dump() for f in fvgs[-25:]],
            "activeBullish": active_bullish.model_dump() if active_bullish else None,
            "activeBearish": active_bearish.model_dump() if active_bearish else None,
            "bullishCount": sum(1 for f in fvgs if f.type == "BULLISH" and not f.mitigated),
            "bearishCount": sum(1 for f in fvgs if f.type == "BEARISH" and not f.mitigated)
        }
