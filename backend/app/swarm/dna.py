"""
Worker DNA model and initialization/mutation utilities.
Provides diverse initial genomes across the 20-worker population.
"""
import random
from pydantic import BaseModel, Field
from typing import Optional


class WorkerDNA(BaseModel):
    version: int = 1
    liquidityWeight: float = Field(ge=0.0, le=1.0)
    orderBlockWeight: float = Field(ge=0.0, le=1.0)
    fvgWeight: float = Field(ge=0.0, le=1.0)
    structureWeight: float = Field(ge=0.0, le=1.0)
    candleWeight: float = Field(ge=0.0, le=1.0)
    trendWeight: float = Field(ge=0.0, le=1.0)
    displacementWeight: float = Field(ge=0.0, le=1.0)
    minConfluence: float = Field(ge=0.30, le=0.90)  # normalized 0.3 to 0.9 (30 to 90 score)
    preferredRegime: str = "ALL"  # "ALL", "TREND", "RANGE", "VOLATILITY"
    maxRiskScore: float = 0.85
    confirmationRequired: bool = True

    @classmethod
    def create_diverse_archetype(cls, index: int) -> "WorkerDNA":
        """
        Creates diverse DNA based on archetypes so the 20 workers don't start identically.
        Archetypes:
        - Liquidity Sweep Specialist
        - Order Block Trend Follower
        - FVG / Imbalance Scalper
        - Market Structure / BOS Breakout
        - Confluence Conservative
        - Range Reversal Specialist
        - Momentum / Displacement Hunter
        """
        regimes = ["ALL", "TREND", "RANGE", "VOLATILITY"]
        archetype = index % 7

        if archetype == 0:  # Liquidity Hunter
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.85, 0.98), 2),
                orderBlockWeight=round(random.uniform(0.60, 0.75), 2),
                fvgWeight=round(random.uniform(0.40, 0.60), 2),
                structureWeight=round(random.uniform(0.65, 0.80), 2),
                candleWeight=round(random.uniform(0.70, 0.85), 2),
                trendWeight=round(random.uniform(0.40, 0.60), 2),
                displacementWeight=round(random.uniform(0.50, 0.70), 2),
                minConfluence=round(random.uniform(0.55, 0.70), 2),
                preferredRegime="RANGE" if index % 2 == 0 else "ALL",
                confirmationRequired=True
            )
        elif archetype == 1:  # Order Block Purest
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.50, 0.65), 2),
                orderBlockWeight=round(random.uniform(0.85, 0.98), 2),
                fvgWeight=round(random.uniform(0.60, 0.75), 2),
                structureWeight=round(random.uniform(0.70, 0.85), 2),
                candleWeight=round(random.uniform(0.55, 0.70), 2),
                trendWeight=round(random.uniform(0.70, 0.90), 2),
                displacementWeight=round(random.uniform(0.80, 0.95), 2),
                minConfluence=round(random.uniform(0.60, 0.75), 2),
                preferredRegime="TREND",
                confirmationRequired=True
            )
        elif archetype == 2:  # FVG Imbalance Hunter
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.55, 0.70), 2),
                orderBlockWeight=round(random.uniform(0.60, 0.75), 2),
                fvgWeight=round(random.uniform(0.88, 0.98), 2),
                structureWeight=round(random.uniform(0.60, 0.75), 2),
                candleWeight=round(random.uniform(0.60, 0.75), 2),
                trendWeight=round(random.uniform(0.65, 0.80), 2),
                displacementWeight=round(random.uniform(0.70, 0.85), 2),
                minConfluence=round(random.uniform(0.55, 0.70), 2),
                preferredRegime="TREND",
                confirmationRequired=False
            )
        elif archetype == 3:  # Structure / BOS Breakout
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.60, 0.75), 2),
                orderBlockWeight=round(random.uniform(0.65, 0.80), 2),
                fvgWeight=round(random.uniform(0.50, 0.65), 2),
                structureWeight=round(random.uniform(0.90, 0.99), 2),
                candleWeight=round(random.uniform(0.65, 0.80), 2),
                trendWeight=round(random.uniform(0.85, 0.98), 2),
                displacementWeight=round(random.uniform(0.75, 0.90), 2),
                minConfluence=round(random.uniform(0.65, 0.78), 2),
                preferredRegime="TREND",
                confirmationRequired=True
            )
        elif archetype == 4:  # Conservative Confluence Queen Guard
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.75, 0.88), 2),
                orderBlockWeight=round(random.uniform(0.80, 0.92), 2),
                fvgWeight=round(random.uniform(0.75, 0.88), 2),
                structureWeight=round(random.uniform(0.80, 0.92), 2),
                candleWeight=round(random.uniform(0.75, 0.88), 2),
                trendWeight=round(random.uniform(0.80, 0.92), 2),
                displacementWeight=round(random.uniform(0.75, 0.88), 2),
                minConfluence=round(random.uniform(0.72, 0.85), 2),
                preferredRegime="ALL",
                confirmationRequired=True
            )
        elif archetype == 5:  # Reversal & Pin Bar Specialist
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.85, 0.95), 2),
                orderBlockWeight=round(random.uniform(0.55, 0.70), 2),
                fvgWeight=round(random.uniform(0.45, 0.60), 2),
                structureWeight=round(random.uniform(0.55, 0.70), 2),
                candleWeight=round(random.uniform(0.90, 0.99), 2),
                trendWeight=round(random.uniform(0.35, 0.55), 2),
                displacementWeight=round(random.uniform(0.50, 0.65), 2),
                minConfluence=round(random.uniform(0.55, 0.68), 2),
                preferredRegime="RANGE",
                confirmationRequired=True
            )
        else:  # Momentum & Volatility Specialist
            return cls(
                version=1,
                liquidityWeight=round(random.uniform(0.60, 0.75), 2),
                orderBlockWeight=round(random.uniform(0.70, 0.85), 2),
                fvgWeight=round(random.uniform(0.70, 0.85), 2),
                structureWeight=round(random.uniform(0.70, 0.85), 2),
                candleWeight=round(random.uniform(0.70, 0.85), 2),
                trendWeight=round(random.uniform(0.75, 0.90), 2),
                displacementWeight=round(random.uniform(0.88, 0.98), 2),
                minConfluence=round(random.uniform(0.60, 0.72), 2),
                preferredRegime="VOLATILITY",
                confirmationRequired=False
            )

    def mutate(self, mutation_rate: float = 0.08) -> "WorkerDNA":
        def perturb(val: float, low: float = 0.1, high: float = 1.0) -> float:
            delta = random.gauss(0, mutation_rate)
            return round(max(low, min(high, val + delta)), 2)

        regimes = ["ALL", "TREND", "RANGE", "VOLATILITY"]
        new_regime = self.preferredRegime
        if random.random() < 0.15:
            new_regime = random.choice(regimes)

        new_conf = self.confirmationRequired
        if random.random() < 0.10:
            new_conf = not self.confirmationRequired

        return WorkerDNA(
            version=self.version + 1,
            liquidityWeight=perturb(self.liquidityWeight),
            orderBlockWeight=perturb(self.orderBlockWeight),
            fvgWeight=perturb(self.fvgWeight),
            structureWeight=perturb(self.structureWeight),
            candleWeight=perturb(self.candleWeight),
            trendWeight=perturb(self.trendWeight),
            displacementWeight=perturb(self.displacementWeight),
            minConfluence=perturb(self.minConfluence, low=0.40, high=0.85),
            preferredRegime=new_regime,
            maxRiskScore=perturb(self.maxRiskScore, low=0.50, high=0.95),
            confirmationRequired=new_conf
        )
