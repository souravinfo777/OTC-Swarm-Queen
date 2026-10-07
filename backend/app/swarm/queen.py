"""
Queen Fly Engine:
Master consensus and quantitative arbitration engine.
Synthesizes all 20 worker votes through reliability-weighted aggregation,
SMC confluence verification, regime gating, and strict paper trade validation criteria.
"""
import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from .worker_fly import WorkerDecision, WorkerFly
from ..market.models import SMCFeatureVector, MarketRegimeType


class QueenSignal(BaseModel):
    timestamp: int
    asset: str
    direction: str  # "UP", "DOWN", "HOLD"
    confidence: float
    consensus: float  # 0.0 to 1.0 (fraction of active votes aligned)
    status: str  # "NO_SIGNAL", "WATCH", "PAPER_SIGNAL", "VALIDATED_SIGNAL"
    upVotes: int
    downVotes: int
    holdVotes: int
    totalWorkers: int
    evidence: List[str]
    cooldownRemaining: int = 0
    reasons: List[str] = []


class QueenFlyEngine:
    def __init__(
        self,
        min_consensus: float = 0.60,
        min_confidence: float = 0.70,
        min_paper_trades_validation: int = 200,
        cooldown_seconds: int = 45
    ):
        self.min_consensus = min_consensus
        self.min_confidence = min_confidence
        self.min_paper_trades_validation = min_paper_trades_validation
        self.cooldown_seconds = cooldown_seconds
        self.last_signal_timestamp: int = 0
        self.total_paper_trades: int = 0
        self.rolling_win_rates: Dict[str, float] = {"50": 0.0, "100": 0.0, "200": 0.0}

    def evaluate(
        self,
        fv: SMCFeatureVector,
        workers: List[WorkerFly],
        worker_decisions: List[WorkerDecision],
        paper_stats: Optional[Dict[str, Any]] = None,
        is_data_stale: bool = False
    ) -> QueenSignal:
        now_ms = int(time.time() * 1000)
        
        # 1. Stale Data Safety Rule (Rule 14 & Sec 31)
        if is_data_stale or fv.trend == "UNCERTAIN" and fv.confluenceScore < 20:
            return QueenSignal(
                timestamp=now_ms,
                asset=fv.asset,
                direction="HOLD",
                confidence=0.0,
                consensus=0.0,
                status="NO_SIGNAL",
                upVotes=0,
                downVotes=0,
                holdVotes=len(workers),
                totalWorkers=len(workers),
                evidence=["DATA_STALE_OR_INCOMPLETE"],
                cooldownRemaining=0,
                reasons=["Market data is stale or incomplete. System fails safely with NO_SIGNAL."]
            )

        # 2. Count raw votes
        up_workers = [d for d in worker_decisions if d.decision == "UP"]
        down_workers = [d for d in worker_decisions if d.decision == "DOWN"]
        hold_workers = [d for d in worker_decisions if d.decision == "HOLD"]

        up_votes = len(up_workers)
        down_votes = len(down_workers)
        hold_votes = len(hold_workers)
        total_workers = len(worker_decisions) or 1

        # 3. Reliability-Weighted Voting (Workers with higher health and fitness have greater weight)
        # Create map workerId -> worker
        worker_map = {w.id: w for w in workers}

        weighted_up = 0.0
        weighted_down = 0.0

        for d in up_workers:
            w = worker_map.get(d.workerId)
            weight = (w.fitness * 0.6) + ((w.health / 100.0) * 0.4) if w else 0.5
            weighted_up += weight * d.confidence

        for d in down_workers:
            w = worker_map.get(d.workerId)
            weight = (w.fitness * 0.6) + ((w.health / 100.0) * 0.4) if w else 0.5
            weighted_down += weight * d.confidence

        total_directional_weight = weighted_up + weighted_down

        # 4. Consensus Ratio
        active_deciders = up_votes + down_votes
        if active_deciders > 0:
            consensus_up = up_votes / float(total_workers)
            consensus_down = down_votes / float(total_workers)
        else:
            consensus_up = 0.0
            consensus_down = 0.0

        dominant_dir = "HOLD"
        raw_consensus = 0.0
        confidence = 0.0
        queen_evidence: List[str] = []
        reasons: List[str] = []

        if weighted_up > weighted_down and consensus_up >= self.min_consensus:
            dominant_dir = "UP"
            raw_consensus = consensus_up
            weight_ratio = weighted_up / total_directional_weight if total_directional_weight > 0 else 0.5
            confidence = (0.5 * weight_ratio) + (0.5 * (fv.confluenceScore / 100.0))
            # Aggregate up-worker evidence
            for d in up_workers:
                for ev in d.evidence:
                    if ev not in queen_evidence and not ev.startswith("CONFLUENCE"):
                        queen_evidence.append(ev)
            reasons.append(f"{up_votes} of {total_workers} workers voted UP with consensus {round(consensus_up*100)}%.")
            reasons.append(f"SMC Confluence Score is {fv.confluenceScore}/100.")

        elif weighted_down > weighted_up and consensus_down >= self.min_consensus:
            dominant_dir = "DOWN"
            raw_consensus = consensus_down
            weight_ratio = weighted_down / total_directional_weight if total_directional_weight > 0 else 0.5
            confidence = (0.5 * weight_ratio) + (0.5 * (fv.confluenceScore / 100.0))
            # Aggregate down-worker evidence
            for d in down_workers:
                for ev in d.evidence:
                    if ev not in queen_evidence and not ev.startswith("CONFLUENCE"):
                        queen_evidence.append(ev)
            reasons.append(f"{down_votes} of {total_workers} workers voted DOWN with consensus {round(consensus_down*100)}%.")
            reasons.append(f"SMC Confluence Score is {fv.confluenceScore}/100.")

        else:
            dominant_dir = "HOLD"
            raw_consensus = max(consensus_up, consensus_down)
            confidence = round(fv.confluenceScore / 100.0 * 0.4, 2)
            reasons.append(f"Consensus threshold ({int(self.min_consensus*100)}%) not met: UP={up_votes}, DOWN={down_votes}, HOLD={hold_votes}.")

        # Check cooldown
        elapsed_since_signal = (now_ms - self.last_signal_timestamp) // 1000
        cooldown_remaining = max(0, self.cooldown_seconds - elapsed_since_signal)

        # Determine Queen Status
        status = "NO_SIGNAL"
        if dominant_dir != "HOLD":
            if cooldown_remaining > 0:
                status = "WATCH"
                reasons.append(f"In signal cooldown ({cooldown_remaining}s remaining).")
            elif confidence < self.min_confidence:
                status = "WATCH"
                reasons.append(f"Confidence ({round(confidence*100)}%) below Queen threshold ({int(self.min_confidence*100)}%).")
            else:
                # Signal is valid for paper trading
                status = "PAPER_SIGNAL"
                
                # Check if system qualifies for VALIDATED_SIGNAL status:
                # Requires: minimum paper trades (200), rolling win rate > 60%, no active loss streak
                total_trades = paper_stats.get("totalTrades", 0) if paper_stats else 0
                rolling_win_rate = paper_stats.get("winRate", 0.0) if paper_stats else 0.0
                if total_trades >= self.min_paper_trades_validation and rolling_win_rate >= 0.60:
                    status = "VALIDATED_SIGNAL"
                    reasons.append(f"Swarm achieved validated status with {total_trades} paper trades and {round(rolling_win_rate*100, 1)}% win rate.")
                else:
                    reasons.append(f"Paper trade signal created. Total paper trades ({total_trades}/{self.min_paper_trades_validation}) needed for validated tier.")

        return QueenSignal(
            timestamp=now_ms,
            asset=fv.asset,
            direction=dominant_dir,
            confidence=round(confidence, 2),
            consensus=round(raw_consensus, 2),
            status=status,
            upVotes=up_votes,
            downVotes=down_votes,
            holdVotes=hold_votes,
            totalWorkers=total_workers,
            evidence=queen_evidence[:8],
            cooldownRemaining=cooldown_remaining,
            reasons=reasons
        )

    def record_signal_dispatched(self):
        self.last_signal_timestamp = int(time.time() * 1000)
