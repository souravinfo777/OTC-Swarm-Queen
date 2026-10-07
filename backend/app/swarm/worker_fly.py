"""
Worker Fly:
An individual quantitative decision agent in the 20-fly swarm.
Evaluates the unified SMC feature vector through its individualized DNA parameters.
Maintains health, performance metrics, and strategy history.
"""
from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field
from .dna import WorkerDNA
from ..market.models import SMCFeatureVector, MarketRegimeType


class WorkerDecision(BaseModel):
    workerId: int
    decision: str  # "UP", "DOWN", "HOLD"
    confidence: float
    evidence: List[str]
    dnaVersion: int
    reason: str


class WorkerFly:
    def __init__(self, worker_id: int, dna: Optional[WorkerDNA] = None, generation: int = 1):
        self.id = worker_id
        self.generation = generation
        self.health = 100.0
        self.fitness = 0.50
        self.totalSignals = 0
        self.wins = 0
        self.losses = 0
        self.holds = 0
        self.consecutiveLosses = 0
        self.consecutiveHolds = 0
        self.status = "ACTIVE"  # "ACTIVE", "WEAK", "DEAD", "REBIRTH_PENDING"
        self.dna = dna if dna is not None else WorkerDNA.create_diverse_archetype(worker_id)
        self.recentOutcomes: List[str] = []  # last 20 outcomes "WIN", "LOSS", "DRAW"
        self.lastDecision: Optional[WorkerDecision] = None
        self.failurePatterns: List[str] = []

    def evaluate(self, fv: SMCFeatureVector, raw_details: Dict[str, Any]) -> WorkerDecision:
        """
        Deterministic decision based on worker's DNA weights and the SMC feature vector.
        Every evaluation — including early-return HOLD paths — updates lastDecision, so
        trade settlement and fitness never credit a stale vote from a previous candle.
        """
        decision = self._evaluate(fv, raw_details)
        self.lastDecision = decision
        return decision

    def _evaluate(self, fv: SMCFeatureVector, raw_details: Dict[str, Any]) -> WorkerDecision:
        if self.health <= 0 or self.status == "DEAD":
            self.status = "DEAD"
            return WorkerDecision(
                workerId=self.id,
                decision="HOLD",
                confidence=0.0,
                evidence=["WORKER_DEAD"],
                dnaVersion=self.dna.version,
                reason="Worker is deceased awaiting rebirth."
            )

        # 1. Regime compatibility check
        if self.dna.preferredRegime != "ALL":
            if self.dna.preferredRegime == "TREND" and fv.regime.value not in ("TREND_UP", "TREND_DOWN"):
                self.holds += 1
                self.consecutiveHolds += 1
                return WorkerDecision(
                    workerId=self.id,
                    decision="HOLD",
                    confidence=0.35,
                    evidence=["REGIME_MISMATCH_NON_TREND"],
                    dnaVersion=self.dna.version,
                    reason=f"Regime {fv.regime.value} does not match worker preferred TREND regime."
                )
            elif self.dna.preferredRegime == "RANGE" and fv.regime.value != "RANGE":
                self.holds += 1
                self.consecutiveHolds += 1
                return WorkerDecision(
                    workerId=self.id,
                    decision="HOLD",
                    confidence=0.35,
                    evidence=["REGIME_MISMATCH_NON_RANGE"],
                    dnaVersion=self.dna.version,
                    reason=f"Regime {fv.regime.value} does not match worker preferred RANGE regime."
                )
            elif self.dna.preferredRegime == "VOLATILITY" and fv.regime.value != "HIGH_VOLATILITY":
                self.holds += 1
                self.consecutiveHolds += 1
                return WorkerDecision(
                    workerId=self.id,
                    decision="HOLD",
                    confidence=0.35,
                    evidence=["REGIME_MISMATCH_NON_VOLATILITY"],
                    dnaVersion=self.dna.version,
                    reason=f"Regime {fv.regime.value} does not match worker preferred HIGH_VOLATILITY regime."
                )

        # 2. Minimum Confluence Filter
        norm_confluence = fv.confluenceScore / 100.0
        if norm_confluence < self.dna.minConfluence:
            self.holds += 1
            self.consecutiveHolds += 1
            return WorkerDecision(
                workerId=self.id,
                decision="HOLD",
                confidence=round(norm_confluence, 2),
                evidence=[f"CONFLUENCE_BELOW_MIN_{int(self.dna.minConfluence * 100)}"],
                dnaVersion=self.dna.version,
                reason=f"Confluence {fv.confluenceScore} is below worker threshold of {int(self.dna.minConfluence * 100)}."
            )

        # 3. Calculate directional evidence scores (Bullish vs Bearish)
        bull_score = 0.0
        bear_score = 0.0
        bull_evidence: List[str] = []
        bear_evidence: List[str] = []

        # Liquidity Sweep
        if fv.liquiditySweep:
            if fv.liquidityType == "SELL_SIDE_SWEPT":
                # Sell-side swept -> Bullish reversal
                weight = self.dna.liquidityWeight * 25.0
                bull_score += weight
                bull_evidence.append("SELL_SIDE_LIQUIDITY_SWEEP")
            elif fv.liquidityType == "BUY_SIDE_SWEPT":
                # Buy-side swept -> Bearish reversal
                weight = self.dna.liquidityWeight * 25.0
                bear_score += weight
                bear_evidence.append("BUY_SIDE_LIQUIDITY_SWEEP")

        # Order Blocks
        if fv.bullishOB:
            weight = self.dna.orderBlockWeight * 25.0 * (1.2 if fv.obFresh else 0.8)
            bull_score += weight
            bull_evidence.append("BULLISH_ORDER_BLOCK" + ("_FRESH" if fv.obFresh else ""))
        if fv.bearishOB:
            weight = self.dna.orderBlockWeight * 25.0 * (1.2 if fv.obFresh else 0.8)
            bear_score += weight
            bear_evidence.append("BEARISH_ORDER_BLOCK" + ("_FRESH" if fv.obFresh else ""))

        # Fair Value Gaps
        if fv.bullishFVG:
            weight = self.dna.fvgWeight * 20.0 * (1.2 if fv.fvgFresh else 0.8)
            bull_score += weight
            bull_evidence.append("BULLISH_FVG" + ("_FRESH" if fv.fvgFresh else ""))
        if fv.bearishFVG:
            weight = self.dna.fvgWeight * 20.0 * (1.2 if fv.fvgFresh else 0.8)
            bear_score += weight
            bear_evidence.append("BEARISH_FVG" + ("_FRESH" if fv.fvgFresh else ""))

        # Market Structure (BOS / CHoCH)
        if fv.trend == "BULLISH":
            weight = self.dna.trendWeight * 15.0
            bull_score += weight
            bull_evidence.append("BULLISH_TREND")
            if fv.bos:
                bull_score += self.dna.structureWeight * 15.0
                bull_evidence.append("BULLISH_BOS")
        elif fv.trend == "BEARISH":
            weight = self.dna.trendWeight * 15.0
            bear_score += weight
            bear_evidence.append("BEARISH_TREND")
            if fv.bos:
                bear_score += self.dna.structureWeight * 15.0
                bear_evidence.append("BEARISH_BOS")

        if fv.choch:
            weight = self.dna.structureWeight * 12.0
            if "BULLISH" in fv.evidence:
                bull_score += weight
                bull_evidence.append("BULLISH_CHOCH")
            else:
                bear_score += weight
                bear_evidence.append("BEARISH_CHOCH")

        # Candle Confirmation
        if "BULLISH" in fv.candlePattern:
            weight = self.dna.candleWeight * 15.0
            bull_score += weight
            bull_evidence.append(f"CANDLE_{fv.candlePattern}")
        elif "BEARISH" in fv.candlePattern:
            weight = self.dna.candleWeight * 15.0
            bear_score += weight
            bear_evidence.append(f"CANDLE_{fv.candlePattern}")

        # Displacement
        if fv.displacement > 1.8:
            weight = self.dna.displacementWeight * 10.0
            if bull_score > bear_score:
                bull_score += weight
                bull_evidence.append("STRONG_DISPLACEMENT")
            elif bear_score > bull_score:
                bear_score += weight
                bear_evidence.append("STRONG_DISPLACEMENT")

        # Confirmation required check
        if self.dna.confirmationRequired and ("CANDLE" not in "".join(bull_evidence + bear_evidence) and not fv.liquiditySweep):
            self.holds += 1
            self.consecutiveHolds += 1
            return WorkerDecision(
                workerId=self.id,
                decision="HOLD",
                confidence=0.45,
                evidence=["AWAITING_CANDLE_CONFIRMATION"],
                dnaVersion=self.dna.version,
                reason="Worker requires candle or sweep confirmation before entering."
            )

        # Final decision comparison
        score_diff = abs(bull_score - bear_score)
        threshold = 30.0 * self.dna.minConfluence

        if bull_score > bear_score and score_diff >= threshold:
            confidence = min(0.95, round(0.55 + (bull_score / 160.0), 2))
            self.totalSignals += 1
            self.consecutiveHolds = 0
            decision = WorkerDecision(
                workerId=self.id,
                decision="UP",
                confidence=confidence,
                evidence=bull_evidence,
                dnaVersion=self.dna.version,
                reason=f"Bullish evidence ({round(bull_score, 1)}) significantly outweighed bearish ({round(bear_score, 1)})."
            )
        elif bear_score > bull_score and score_diff >= threshold:
            confidence = min(0.95, round(0.55 + (bear_score / 160.0), 2))
            self.totalSignals += 1
            self.consecutiveHolds = 0
            decision = WorkerDecision(
                workerId=self.id,
                decision="DOWN",
                confidence=confidence,
                evidence=bear_evidence,
                dnaVersion=self.dna.version,
                reason=f"Bearish evidence ({round(bear_score, 1)}) significantly outweighed bullish ({round(bull_score, 1)})."
            )
        else:
            self.holds += 1
            self.consecutiveHolds += 1
            decision = WorkerDecision(
                workerId=self.id,
                decision="HOLD",
                confidence=0.40,
                evidence=["INDECISIVE_SMC_TALLY"],
                dnaVersion=self.dna.version,
                reason=f"Bull ({round(bull_score, 1)}) and Bear ({round(bear_score, 1)}) scores did not reach decision threshold."
            )

        return decision

    def settle_trade(self, outcome: str, market_regime: str, evidence: List[str]):
        """
        Settles paper trade outcome:
        - Health changes: positive reward on WIN, negative on LOSS.
        - Controlled inactivity penalty if hold on clear setup.
        - Updates fitness, consecutive losses, and status.
        """
        if self.status == "DEAD":
            return

        self.recentOutcomes.append(outcome)
        if len(self.recentOutcomes) > 20:
            self.recentOutcomes.pop(0)

        if outcome == "WIN":
            self.wins += 1
            self.consecutiveLosses = 0
            # Health reward (capped at 100)
            self.health = min(100.0, self.health + 8.0)
        elif outcome == "LOSS":
            self.losses += 1
            self.consecutiveLosses += 1
            # Progressive loss penalty: repeated losses hurt more
            loss_penalty = 12.0 + (self.consecutiveLosses * 3.0)
            self.health = max(0.0, self.health - loss_penalty)
            # Track failure context
            self.failurePatterns.append(f"{market_regime}_{'-'.join(evidence[:2])}")
            if len(self.failurePatterns) > 10:
                self.failurePatterns.pop(0)
        elif outcome == "HOLD":
            # Check inactivity penalty: ONLY if worker ignored setup repeatedly (consecutiveHolds > 15)
            if self.consecutiveHolds > 15 and self.totalSignals > 5:
                self.health = max(0.0, self.health - 1.5)

        # Update status based on health
        if self.health <= 0:
            self.status = "DEAD"
        elif self.health < 35.0:
            self.status = "WEAK"
        else:
            self.status = "ACTIVE"

    def to_dict(self) -> Dict[str, Any]:
        total_trades = self.wins + self.losses
        win_rate = round(self.wins / total_trades, 3) if total_trades > 0 else 0.0
        return {
            "id": self.id,
            "generation": self.generation,
            "health": round(self.health, 1),
            "fitness": round(self.fitness, 3),
            "status": self.status,
            "totalSignals": self.totalSignals,
            "wins": self.wins,
            "losses": self.losses,
            "holds": self.holds,
            "consecutiveLosses": self.consecutiveLosses,
            "consecutiveHolds": self.consecutiveHolds,
            "winRate": win_rate,
            "dna": self.dna.model_dump(),
            "lastDecision": self.lastDecision.model_dump() if self.lastDecision else None,
            "recentOutcomes": self.recentOutcomes[-10:],
            "failurePatterns": self.failurePatterns
        }
