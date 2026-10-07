"""
Paper Trading Engine:
Simulates high-precision OTC binary contracts (e.g. 60-second fixed expiry).
Executes only when Queen emits PAPER_SIGNAL or VALIDATED_SIGNAL.
Settles on closing candle tick price and reports result to SwarmManager.
"""
import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from ..swarm.queen import QueenSignal


class PaperTrade(BaseModel):
    id: str
    asset: str
    direction: str  # "UP" or "DOWN"
    entryPrice: float
    exitPrice: Optional[float] = None
    expirySeconds: int = 60
    timestamp: int  # entry timestamp
    expiryTimestamp: int
    queenConfidence: float
    workerVotes: Dict[str, int]
    smcEvidence: List[str]
    regime: str
    status: str = "OPEN"  # "OPEN", "WIN", "LOSS", "DRAW", "INVALID"
    pnl: float = 0.0  # +85% payout simulation on win, -100% on loss


class PaperTradingManager:
    def __init__(self, expiry_seconds: int = 60, payout_pct: float = 0.85):
        self.expiry_seconds = expiry_seconds
        self.payout_pct = payout_pct
        self.active_trades: List[PaperTrade] = []
        self.closed_trades: List[PaperTrade] = []
        self.is_running: bool = True

    def open_trade(
        self,
        queen_signal: QueenSignal,
        current_price: float,
        regime: str
    ) -> Optional[PaperTrade]:
        if not self.is_running:
            return None

        if queen_signal.direction not in ("UP", "DOWN"):
            return None

        if queen_signal.status not in ("PAPER_SIGNAL", "VALIDATED_SIGNAL"):
            return None

        # One open contract per asset: a persistent directional signal would otherwise
        # stack a new trade on every candle close and skew the win-rate statistics.
        if any(t.asset == queen_signal.asset for t in self.active_trades):
            return None

        now_ms = int(time.time() * 1000)
        trade = PaperTrade(
            id=f"PT_{queen_signal.asset}_{now_ms}",
            asset=queen_signal.asset,
            direction=queen_signal.direction,
            entryPrice=current_price,
            expirySeconds=self.expiry_seconds,
            timestamp=now_ms,
            expiryTimestamp=now_ms + (self.expiry_seconds * 1000),
            queenConfidence=queen_signal.confidence,
            workerVotes={
                "up": queen_signal.upVotes,
                "down": queen_signal.downVotes,
                "hold": queen_signal.holdVotes
            },
            smcEvidence=queen_signal.evidence,
            regime=regime,
            status="OPEN"
        )

        self.active_trades.append(trade)
        return trade

    def check_expiries(
        self,
        current_price: float,
        current_timestamp_ms: Optional[int] = None
    ) -> List[PaperTrade]:
        now_ms = current_timestamp_ms if current_timestamp_ms else int(time.time() * 1000)
        settled: List[PaperTrade] = []
        remaining: List[PaperTrade] = []

        for trade in self.active_trades:
            if now_ms >= trade.expiryTimestamp:
                # Settle trade
                trade.exitPrice = current_price
                if trade.direction == "UP":
                    if trade.exitPrice > trade.entryPrice:
                        trade.status = "WIN"
                        trade.pnl = 100.0 * self.payout_pct
                    elif trade.exitPrice < trade.entryPrice:
                        trade.status = "LOSS"
                        trade.pnl = -100.0
                    else:
                        trade.status = "DRAW"
                        trade.pnl = 0.0
                elif trade.direction == "DOWN":
                    if trade.exitPrice < trade.entryPrice:
                        trade.status = "WIN"
                        trade.pnl = 100.0 * self.payout_pct
                    elif trade.exitPrice > trade.entryPrice:
                        trade.status = "LOSS"
                        trade.pnl = -100.0
                    else:
                        trade.status = "DRAW"
                        trade.pnl = 0.0
                else:
                    trade.status = "INVALID"
                    trade.pnl = 0.0

                self.closed_trades.append(trade)
                settled.append(trade)
            else:
                remaining.append(trade)

        self.active_trades = remaining
        return settled

    def get_statistics(self) -> Dict[str, Any]:
        total = len(self.closed_trades)
        if total == 0:
            return {
                "totalTrades": 0,
                "wins": 0,
                "losses": 0,
                "draws": 0,
                "winRate": 0.0,
                "netPnl": 0.0,
                "rolling50": 0.0,
                "rolling100": 0.0,
                "rolling200": 0.0,
                "longestWinStreak": 0,
                "longestLossStreak": 0,
                "currentStreak": 0
            }

        wins = sum(1 for t in self.closed_trades if t.status == "WIN")
        losses = sum(1 for t in self.closed_trades if t.status == "LOSS")
        draws = sum(1 for t in self.closed_trades if t.status == "DRAW")
        net_pnl = sum(t.pnl for t in self.closed_trades)

        # Rolling win rates
        def calc_rolling_rate(window: int) -> float:
            sub = self.closed_trades[-window:]
            w = sum(1 for t in sub if t.status == "WIN")
            tot = sum(1 for t in sub if t.status in ("WIN", "LOSS"))
            return round(w / tot, 3) if tot > 0 else 0.0

        # Streaks
        longest_win = 0
        longest_loss = 0
        curr_streak = 0
        curr_type = None

        for t in self.closed_trades:
            if t.status == "WIN":
                if curr_type == "WIN":
                    curr_streak += 1
                else:
                    curr_streak = 1
                    curr_type = "WIN"
                longest_win = max(longest_win, curr_streak)
            elif t.status == "LOSS":
                if curr_type == "LOSS":
                    curr_streak += 1
                else:
                    curr_streak = 1
                    curr_type = "LOSS"
                longest_loss = max(longest_loss, curr_streak)
            else:
                curr_streak = 0
                curr_type = None

        win_rate = round(wins / (wins + losses), 3) if (wins + losses) > 0 else 0.0

        return {
            "totalTrades": total,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "winRate": win_rate,
            "netPnl": round(net_pnl, 2),
            "rolling50": calc_rolling_rate(50),
            "rolling100": calc_rolling_rate(100),
            "rolling200": calc_rolling_rate(200),
            "longestWinStreak": longest_win,
            "longestLossStreak": longest_loss,
            "currentStreak": curr_streak if curr_type == "WIN" else -curr_streak
        }
