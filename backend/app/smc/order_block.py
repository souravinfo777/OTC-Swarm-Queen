"""
Order Block Engine:
Identifies high-probability Institutional Order Blocks.
Requirements:
1. Significant impulse displacement candle that breaks local structure or previous candle extreme.
2. The preceding opposing candle before the strong displacement is the valid Order Block.
3. Mitigation tracking: if future price enters or pierces through the OB, mark mitigated.
4. Never marks generic opposite candles as OBs without displacement.
"""
from typing import List, Dict, Optional
from ..market.models import Candle, OrderBlock


class OrderBlockEngine:
    def __init__(self, min_displacement_ratio: float = 1.6):
        # min_displacement_ratio: candle body must be at least 1.6x the average body of prior 10 candles
        self.min_displacement_ratio = min_displacement_ratio

    def analyze(self, candles: List[Candle]) -> Dict:
        if len(candles) < 20:
            return {
                "bullishOBs": [],
                "bearishOBs": [],
                "activeBullishOB": None,
                "activeBearishOB": None
            }

        order_blocks: List[OrderBlock] = []
        n = len(candles)
        
        # Scan recent window for displacement candles
        scan_start = max(10, n - 45)
        for i in range(scan_start, n - 1):
            # Calculate prior 10 candles avg body
            prior_bodies = [abs(c.close - c.open) for c in candles[i-10:i]]
            avg_body = sum(prior_bodies) / len(prior_bodies) if prior_bodies else 0.0001
            
            curr_c = candles[i]
            prev_c = candles[i - 1]
            curr_body = abs(curr_c.close - curr_c.open)
            displacement_ratio = curr_body / avg_body if avg_body > 0 else 1.0

            if displacement_ratio >= self.min_displacement_ratio:
                # 1. Bullish Displacement: strong green candle breaking prior high
                if curr_c.close > curr_c.open and curr_c.close > prev_c.high:
                    # Preceding candle was bearish (or indecisive low)
                    if prev_c.close <= prev_c.open or (prev_c.low < curr_c.low):
                        ob = OrderBlock(
                            id=f"BULL_OB_{prev_c.timestamp}",
                            type="BULLISH",
                            high=max(prev_c.open, prev_c.high),
                            low=prev_c.low,
                            timestamp=prev_c.timestamp,
                            strength=min(1.0, 0.6 + (displacement_ratio * 0.1)),
                            fresh=True,
                            mitigated=False,
                            displacementScore=round(displacement_ratio, 2)
                        )
                        order_blocks.append(ob)

                # 2. Bearish Displacement: strong red candle breaking prior low
                elif curr_c.close < curr_c.open and curr_c.close < prev_c.low:
                    # Preceding candle was bullish (or indecisive high)
                    if prev_c.close >= prev_c.open or (prev_c.high > curr_c.high):
                        ob = OrderBlock(
                            id=f"BEAR_OB_{prev_c.timestamp}",
                            type="BEARISH",
                            high=prev_c.high,
                            low=min(prev_c.open, prev_c.low),
                            timestamp=prev_c.timestamp,
                            strength=min(1.0, 0.6 + (displacement_ratio * 0.1)),
                            fresh=True,
                            mitigated=False,
                            displacementScore=round(displacement_ratio, 2)
                        )
                        order_blocks.append(ob)

        # Track mitigation with subsequent candles
        latest_c = candles[-1]
        active_bullish: Optional[OrderBlock] = None
        active_bearish: Optional[OrderBlock] = None

        for ob in order_blocks:
            # Check candles that formed AFTER the order block, but skip the displacement
            # candle itself — its range almost always overlaps the preceding OB candle,
            # which marked every OB as non-fresh the moment it was created.
            displacement_ts = None
            for c in candles:
                if c.timestamp > ob.timestamp:
                    displacement_ts = c.timestamp
                    break
            for c in candles:
                if displacement_ts is not None and c.timestamp <= displacement_ts:
                    continue
                if ob.type == "BULLISH":
                    # If price touches the OB zone, it's tested
                    if c.low <= ob.high:
                        ob.fresh = False
                    # If price closes below OB low, it's invalidated/fully mitigated
                    if c.close < ob.low:
                        ob.mitigated = True
                elif ob.type == "BEARISH":
                    if c.high >= ob.low:
                        ob.fresh = False
                    if c.close > ob.high:
                        ob.mitigated = True
                if ob.mitigated:
                    break

            # Determine if currently active near price
            if not ob.mitigated:
                if ob.type == "BULLISH":
                    if active_bullish is None or ob.timestamp > active_bullish.timestamp:
                        active_bullish = ob
                else:
                    if active_bearish is None or ob.timestamp > active_bearish.timestamp:
                        active_bearish = ob

        return {
            "allOBs": [o.model_dump() for o in order_blocks[-20:]],
            "activeBullishOB": active_bullish.model_dump() if active_bullish else None,
            "activeBearishOB": active_bearish.model_dump() if active_bearish else None,
            "hasFreshBullishOB": (active_bullish is not None and active_bullish.fresh),
            "hasFreshBearishOB": (active_bearish is not None and active_bearish.fresh)
        }
