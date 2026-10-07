"""
Evolution Engine:
Handles tournament selection, DNA mutation, and rebirth of deceased workers.
Preserves population diversity to avoid collapse into a single overfitting strategy.
"""
import random
from typing import List, Optional
from .worker_fly import WorkerFly
from .dna import WorkerDNA
from .graveyard import GraveyardManager


class EvolutionEngine:
    def __init__(self, mutation_rate: float = 0.08):
        self.mutation_rate = mutation_rate

    def select_parent(self, active_workers: List[WorkerFly]) -> Optional[WorkerFly]:
        """
        Tournament selection among active, healthy workers (health > 40).
        """
        healthy_candidates = [w for w in active_workers if w.health > 40 and w.status != "DEAD"]
        if not healthy_candidates:
            # Fallback to any non-dead worker
            healthy_candidates = [w for w in active_workers if w.status != "DEAD"]

        if not healthy_candidates:
            return None

        # Sample tournament of 3
        tournament_size = min(3, len(healthy_candidates))
        tournament = random.sample(healthy_candidates, tournament_size)
        # Winner is highest fitness
        return max(tournament, key=lambda w: w.fitness)

    def rebirth_worker(
        self,
        dead_worker: WorkerFly,
        active_workers: List[WorkerFly],
        graveyard: GraveyardManager
    ) -> WorkerFly:
        """
        1. Archive dead worker in Graveyard.
        2. Select fit parent.
        3. Mutate DNA with controlled perturbation.
        4. Rebirth worker into new generation with 100 health.
        """
        # Step 1: Archive to graveyard
        graveyard.bury_worker(dead_worker.to_dict(), notes="Rebirth triggered after health exhaustion")

        # Step 2: Select parent
        parent = self.select_parent(active_workers)
        parent_dna = parent.dna if parent else WorkerDNA.create_diverse_archetype(dead_worker.id)

        # Step 3 & 4: Mutate DNA
        new_dna = parent_dna.mutate(self.mutation_rate)

        # Step 5 & 6: Rebirth
        dead_worker.generation += 1
        dead_worker.dna = new_dna
        dead_worker.health = 100.0
        dead_worker.fitness = 0.50
        dead_worker.totalSignals = 0
        dead_worker.wins = 0
        dead_worker.losses = 0
        dead_worker.holds = 0
        dead_worker.consecutiveLosses = 0
        dead_worker.consecutiveHolds = 0
        dead_worker.status = "ACTIVE"
        dead_worker.recentOutcomes.clear()
        dead_worker.failurePatterns.clear()
        dead_worker.lastDecision = None

        return dead_worker
