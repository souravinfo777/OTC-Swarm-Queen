"""
Swarm Manager:
Orchestrates the 20-worker population, Queen consensus arbitration,
fitness updates, death and rebirth evolution, and pattern memory.
"""
from typing import List, Dict, Any, Optional
from .worker_fly import WorkerFly, WorkerDecision
from .queen import QueenFlyEngine, QueenSignal
from .graveyard import GraveyardManager
from .evolution import EvolutionEngine
from .fitness import FitnessEngine
from ..market.models import SMCFeatureVector, Candle


class PatternMemoryStore:
    def __init__(self):
        # Key: signature e.g. "SELL_SWEEP+BULL_OB+BULL_FVG+BOS" -> stats
        self.signatures: Dict[str, Dict[str, Any]] = {}

    def get_signature_key(self, fv: SMCFeatureVector) -> str:
        parts = []
        if fv.liquiditySweep:
            parts.append(fv.liquidityType or "LIQ_SWEEP")
        if fv.bullishOB:
            parts.append("BULL_OB")
        elif fv.bearishOB:
            parts.append("BEAR_OB")
        if fv.bullishFVG:
            parts.append("BULL_FVG")
        elif fv.bearishFVG:
            parts.append("BEAR_FVG")
        if fv.bos:
            parts.append("BOS")
        elif fv.choch:
            parts.append("CHOCH")
        if "ENGULFING" in fv.candlePattern:
            parts.append("ENGULF")
        elif "PIN_BAR" in fv.candlePattern:
            parts.append("PIN_BAR")
        return "+".join(parts) if parts else "UNSTRUCTURED"

    def record_outcome(self, signature: str, outcome: str, regime: str, asset: str):
        if signature not in self.signatures:
            self.signatures[signature] = {
                "signature": signature,
                "occurrences": 0,
                "wins": 0,
                "losses": 0,
                "draws": 0,
                "winRate": 0.0,
                "preferredRegime": regime,
                "asset": asset
            }
        
        stat = self.signatures[signature]
        stat["occurrences"] += 1
        if outcome == "WIN":
            stat["wins"] += 1
        elif outcome == "LOSS":
            stat["losses"] += 1
        else:
            stat["draws"] += 1

        total = stat["wins"] + stat["losses"]
        stat["winRate"] = round(stat["wins"] / total, 3) if total > 0 else 0.0

    def get_patterns(self, limit: int = 50) -> List[Dict[str, Any]]:
        return sorted(self.signatures.values(), key=lambda x: x["occurrences"], reverse=True)[:limit]


class SwarmManager:
    def __init__(self, population_size: int = 20, mutation_rate: float = 0.08):
        self.population_size = population_size
        self.workers: List[WorkerFly] = [
            WorkerFly(worker_id=i + 1, generation=1) for i in range(population_size)
        ]
        self.queen = QueenFlyEngine()
        self.graveyard = GraveyardManager(max_records=500)
        self.evolution = EvolutionEngine(mutation_rate=mutation_rate)
        self.pattern_memory = PatternMemoryStore()
        self.last_queen_signal: Optional[QueenSignal] = None
        self.last_feature_vector: Optional[SMCFeatureVector] = None

    def evaluate_swarm(
        self,
        fv: SMCFeatureVector,
        raw_details: Dict[str, Any],
        paper_stats: Optional[Dict[str, Any]] = None,
        is_data_stale: bool = False
    ) -> Dict[str, Any]:
        self.last_feature_vector = fv
        
        # 1. Collect decisions from all 20 workers
        decisions: List[WorkerDecision] = []
        for worker in self.workers:
            d = worker.evaluate(fv, raw_details)
            decisions.append(d)

        # 2. Queen arbitrates
        queen_signal = self.queen.evaluate(
            fv=fv,
            workers=self.workers,
            worker_decisions=decisions,
            paper_stats=paper_stats,
            is_data_stale=is_data_stale
        )
        self.last_queen_signal = queen_signal

        return {
            "queen": queen_signal.model_dump(),
            "workers": [w.to_dict() for w in self.workers],
            "decisions": [d.model_dump() for d in decisions],
            "featureVector": fv.model_dump()
        }

    def settle_trade_outcomes(
        self,
        direction: str,
        result: str,  # "WIN", "LOSS", "DRAW"
        regime: str,
        asset: str,
        evidence: List[str]
    ):
        """
        Settles trade for all workers who participated or held,
        updates health, recalculates fitness, checks for deaths and rebirths.
        """
        # Record into pattern memory
        if self.last_feature_vector:
            sig = self.pattern_memory.get_signature_key(self.last_feature_vector)
            self.pattern_memory.record_outcome(sig, result, regime, asset)

        dead_workers_to_rebirth: List[WorkerFly] = []

        for worker in self.workers:
            if worker.status == "DEAD":
                continue

            last_d = worker.lastDecision
            if last_d:
                if last_d.decision == direction:
                    # Worker agreed with the trade direction
                    worker_outcome = result
                elif last_d.decision == "HOLD":
                    worker_outcome = "HOLD"
                else:
                    # Worker took the opposite trade
                    worker_outcome = "LOSS" if result == "WIN" else "WIN"
            else:
                worker_outcome = "HOLD"

            worker.settle_trade(worker_outcome, regime, evidence)
            
            # Recalculate fitness
            worker.fitness = FitnessEngine.calculate_fitness(
                wins=worker.wins,
                losses=worker.losses,
                recent_outcomes=worker.recentOutcomes,
                consecutive_losses=worker.consecutiveLosses,
                health=worker.health
            )

            if worker.status == "DEAD":
                dead_workers_to_rebirth.append(worker)

        # Handle Rebirths
        for dead_w in dead_workers_to_rebirth:
            self.evolution.rebirth_worker(
                dead_worker=dead_w,
                active_workers=self.workers,
                graveyard=self.graveyard
            )

    def reset_swarm(self):
        self.workers = [WorkerFly(worker_id=i + 1, generation=1) for i in range(self.population_size)]
        self.last_queen_signal = None
