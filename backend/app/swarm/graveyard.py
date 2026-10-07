"""
Graveyard Memory:
Stores records of deceased workers with complete post-mortem diagnostics:
DNA, generation, fitness, win rate, failure patterns, death timestamp.
Provides learning memory so newly mutated generations avoid proven catastrophic gene traits.
"""
import time
from typing import List, Dict, Any, Optional
from collections import deque
from pydantic import BaseModel


class GraveyardRecord(BaseModel):
    recordId: str
    workerId: int
    generation: int
    fitness: float
    winRate: float
    totalTrades: int
    deathTimestamp: int
    dna: Dict[str, Any]
    failurePatterns: List[str]
    notes: Optional[str] = None


class GraveyardManager:
    def __init__(self, max_records: int = 500):
        self.max_records = max_records
        self.records: deque[GraveyardRecord] = deque(maxlen=max_records)
        self.failure_frequency: Dict[str, int] = {}

    def bury_worker(self, worker_dict: Dict[str, Any], notes: Optional[str] = None) -> GraveyardRecord:
        total_trades = worker_dict["wins"] + worker_dict["losses"]
        win_rate = worker_dict.get("winRate", 0.0)
        
        record = GraveyardRecord(
            recordId=f"GRAVE_{worker_dict['id']}_{worker_dict['generation']}_{int(time.time()*1000)}",
            workerId=worker_dict["id"],
            generation=worker_dict["generation"],
            fitness=worker_dict["fitness"],
            winRate=win_rate,
            totalTrades=total_trades,
            deathTimestamp=int(time.time() * 1000),
            dna=worker_dict["dna"],
            failurePatterns=worker_dict.get("failurePatterns", []),
            notes=notes or f"Deceased in Gen {worker_dict['generation']} with consecutive losses"
        )
        
        # Track aggregated failure frequency
        for pattern in record.failurePatterns:
            self.failure_frequency[pattern] = self.failure_frequency.get(pattern, 0) + 1

        self.records.append(record)
        return record

    def get_records(self, limit: int = 50) -> List[Dict[str, Any]]:
        return [r.model_dump() for r in list(self.records)[-limit:]]

    def get_total_count(self) -> int:
        return len(self.records)

    def get_top_failure_patterns(self, top_n: int = 5) -> List[Dict[str, Any]]:
        sorted_patterns = sorted(self.failure_frequency.items(), key=lambda x: x[1], reverse=True)
        return [{"pattern": p, "count": c} for p, c in sorted_patterns[:top_n]]
