"""
Fitness Engine:
Calculates a balanced, Bayesian-adjusted fitness score:
- Incorporates Laplace smoothing / prior expectation to avoid low-sample dominance
- Weighting: Sample size penalty, rolling recent win rate, loss streak penalty, health state
"""
from typing import List


class FitnessEngine:
    @staticmethod
    def calculate_fitness(
        wins: int,
        losses: int,
        recent_outcomes: List[str],
        consecutive_losses: int,
        health: float
    ) -> float:
        total = wins + losses
        if total == 0:
            return 0.50  # Neutral baseline

        # 1. Bayesian smoothed win rate (prior = 50% on 10 pseudo-trades)
        # Prevents a 2-0 worker from dominating over a 65-35 worker
        prior_trades = 10
        prior_wins = 5
        smoothed_win_rate = (wins + prior_wins) / float(total + prior_trades)

        # 2. Recent form (last 10 outcomes)
        if recent_outcomes:
            recent_wins = sum(1 for o in recent_outcomes if o == "WIN")
            recent_losses = sum(1 for o in recent_outcomes if o == "LOSS")
            recent_total = recent_wins + recent_losses
            recent_rate = (recent_wins / recent_total) if recent_total > 0 else 0.50
        else:
            recent_rate = 0.50

        # 3. Loss streak penalty
        streak_penalty = min(0.25, consecutive_losses * 0.05)

        # 4. Health factor (0.0 to 1.0)
        health_factor = health / 100.0

        # Weighted combination:
        # 45% Smoothed Win Rate
        # 25% Recent Form
        # 20% Health Factor
        # - Streak Penalty
        fitness = (0.45 * smoothed_win_rate) + (0.25 * recent_rate) + (0.20 * health_factor) - streak_penalty
        return round(max(0.05, min(0.99, fitness)), 4)
