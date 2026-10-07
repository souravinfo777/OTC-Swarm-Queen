"""
SMC Confluence & Feature Engine:
Generates the unified SMC feature vector from Market Structure, Liquidity,
Order Blocks, FVGs, Candle Patterns, and Market Regime.
Calculates an evidence-based Confluence Score (0-100).
"""
from typing import List, Dict, Tuple
from ..market.models import Candle, SMCFeatureVector, MarketRegimeType
from .structure import MarketStructureEngine
from .liquidity import LiquidityEngine
from .order_block import OrderBlockEngine
from .fvg import FVGEngine
from .candle_patterns import CandlePatternEngine
from .trend import TrendEngine
from ..market.market_regime import MarketRegimeEngine


class SMCFeatureEngine:
    def __init__(self):
        self.structure_engine = MarketStructureEngine(swing_window=3)
        self.liquidity_engine = LiquidityEngine(tolerance_pct=0.0003)
        self.ob_engine = OrderBlockEngine(min_displacement_ratio=1.5)
        self.fvg_engine = FVGEngine(min_gap_pct=0.00012)
        self.candle_pattern_engine = CandlePatternEngine()
        self.regime_engine = MarketRegimeEngine()

    def process(self, candles: List[Candle], asset: str, timeframe: int = 60) -> Tuple[SMCFeatureVector, Dict]:
        """
        Processes candle series and returns unified SMCFeatureVector and full raw component results.
        """
        if not candles:
            empty_fv = SMCFeatureVector(
                asset=asset,
                timestamp=0,
                timeframe=timeframe,
                trend="UNCERTAIN",
                bos=False,
                choch=False,
                liquiditySweep=False,
                liquidityType=None,
                bullishOB=False,
                bearishOB=False,
                bullishFVG=False,
                bearishFVG=False,
                fvgFresh=False,
                obFresh=False,
                candlePattern="NONE",
                displacement=0.0,
                wickRatio=0.0,
                volatility=0.0,
                regime=MarketRegimeType.UNCERTAIN,
                confluenceScore=0.0,
                evidence=[]
            )
            return empty_fv, {}

        curr = candles[-1]
        struct_res = self.structure_engine.analyze(candles)
        liq_res = self.liquidity_engine.analyze(candles)
        ob_res = self.ob_engine.analyze(candles)
        fvg_res = self.fvg_engine.analyze(candles)
        pattern_res = self.candle_pattern_engine.analyze(candles)
        regime = self.regime_engine.classify(candles)
        trend = TrendEngine.evaluate(candles, struct_res)

        # Raw components
        bos = struct_res.get("bos", False)
        choch = struct_res.get("choch", False)
        liq_sweep = liq_res.get("sweep", False)
        liq_type = liq_res.get("sweepType")
        rejection_after_sweep = liq_res.get("rejectionAfterSweep", False)

        has_bull_ob = ob_res.get("activeBullishOB") is not None
        has_bear_ob = ob_res.get("activeBearishOB") is not None
        ob_fresh = ob_res.get("hasFreshBullishOB", False) or ob_res.get("hasFreshBearishOB", False)

        has_bull_fvg = fvg_res.get("activeBullish") is not None
        has_bear_fvg = fvg_res.get("activeBearish") is not None
        fvg_fresh = (
            (fvg_res.get("activeBullish") and fvg_res["activeBullish"].get("fresh")) or
            (fvg_res.get("activeBearish") and fvg_res["activeBearish"].get("fresh"))
        )

        pattern = pattern_res.get("pattern", "NONE")
        pattern_dir = pattern_res.get("direction", "NEUTRAL")
        wick_ratio = max(pattern_res.get("upperWickRatio", 0.0), pattern_res.get("lowerWickRatio", 0.0))

        # Displacement score
        displacement = 1.0
        if ob_res.get("activeBullishOB"):
            displacement = max(displacement, ob_res["activeBullishOB"].get("displacementScore", 1.0))
        if ob_res.get("activeBearishOB"):
            displacement = max(displacement, ob_res["activeBearishOB"].get("displacementScore", 1.0))

        # Volatility estimation (High-Low of current candle / Close)
        volatility = round((curr.high - curr.low) / curr.close * 100.0, 4) if curr.close > 0 else 0.0

        # Calculate Confluence Score and Evidence list
        # Evidence points:
        # Liquidity Sweep = 20
        # Order Block = 20
        # FVG = 15
        # BOS / CHoCH = 15
        # Candle Confirmation = 10
        # Trend Alignment = 10
        # Fresh Retest = 10
        score = 0.0
        evidence: List[str] = []

        if liq_sweep:
            score += 20.0
            evidence.append(f"LIQUIDITY_SWEEP ({liq_type})")
            if rejection_after_sweep:
                evidence.append("REJECTION_AFTER_SWEEP")

        if (has_bull_ob or has_bear_ob):
            score += 20.0
            if has_bull_ob:
                evidence.append("BULLISH_ORDER_BLOCK")
            if has_bear_ob:
                evidence.append("BEARISH_ORDER_BLOCK")

        if (has_bull_fvg or has_bear_fvg):
            score += 15.0
            if has_bull_fvg:
                evidence.append("BULLISH_FVG")
            if has_bear_fvg:
                evidence.append("BEARISH_FVG")

        if bos:
            score += 15.0
            evidence.append("BREAK_OF_STRUCTURE (BOS)")
        elif choch:
            score += 15.0
            evidence.append("CHANGE_OF_CHARACTER (CHoCH)")

        if pattern != "NONE" and pattern != "DOJI":
            score += 10.0
            evidence.append(f"CANDLE_PATTERN ({pattern})")

        if trend in ("BULLISH", "BEARISH"):
            score += 10.0
            evidence.append(f"TREND_ALIGNMENT ({trend})")

        if fvg_fresh or ob_fresh:
            score += 10.0
            evidence.append("FRESH_RETEST_ZONE")

        confluence_score = min(100.0, score)

        fv = SMCFeatureVector(
            asset=asset,
            timestamp=curr.timestamp,
            timeframe=timeframe,
            trend=trend,
            bos=bos,
            choch=choch,
            liquiditySweep=liq_sweep,
            liquidityType=liq_type,
            bullishOB=has_bull_ob,
            bearishOB=has_bear_ob,
            bullishFVG=has_bull_fvg,
            bearishFVG=has_bear_fvg,
            fvgFresh=bool(fvg_fresh),
            obFresh=bool(ob_fresh),
            candlePattern=pattern,
            displacement=round(displacement, 2),
            wickRatio=round(wick_ratio, 3),
            volatility=volatility,
            regime=regime,
            confluenceScore=round(confluence_score, 1),
            evidence=evidence
        )

        raw_details = {
            "structure": struct_res,
            "liquidity": liq_res,
            "orderBlocks": ob_res,
            "fvg": fvg_res,
            "pattern": pattern_res,
            "regime": regime.value,
            "trend": trend,
            "confluenceScore": confluence_score,
            "evidence": evidence
        }

        return fv, raw_details
