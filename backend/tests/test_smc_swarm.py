"""
Automated unit and integration tests for OTC Swarm Queen core components:
- Candle Builder
- Market Structure
- Liquidity Engine
- Order Block Engine
- Fair Value Gap (FVG)
- Candle Patterns
- Worker Fly DNA & Decisions
- Queen Fly Consensus
- Paper Trader Settlement
"""
import pytest
import time
from backend.app.market.models import MarketTick, Candle, MarketRegimeType
from backend.app.market.candle_builder import CandleBuilder
from backend.app.smc.structure import MarketStructureEngine
from backend.app.smc.liquidity import LiquidityEngine
from backend.app.smc.order_block import OrderBlockEngine
from backend.app.smc.fvg import FVGEngine
from backend.app.smc.candle_patterns import CandlePatternEngine
from backend.app.smc.feature_engine import SMCFeatureEngine
from backend.app.swarm.dna import WorkerDNA
from backend.app.swarm.worker_fly import WorkerFly
from backend.app.swarm.queen import QueenFlyEngine
from backend.app.swarm.swarm_manager import SwarmManager
from backend.app.paper.paper_trader import PaperTradingManager


def generate_test_candles(count: int = 50, start_price: float = 1.0850) -> list[Candle]:
    candles = []
    base_time = 1700000000000
    price = start_price
    for i in range(count):
        t = base_time + (i * 60000)
        c_open = price
        c_high = c_open + 0.00030
        c_low = c_open - 0.00010
        c_close = c_open + 0.00020
        price = c_close
        candles.append(Candle(
            id=f"test_{i}",
            asset="EURUSD-OTC",
            timeframe=60,
            timestamp=t,
            open=round(c_open, 5),
            high=round(c_high, 5),
            low=round(c_low, 5),
            close=round(c_close, 5),
            volume=100.0,
            closed=True
        ))
    return candles


def test_candle_builder():
    builder = CandleBuilder(asset="EURUSD-OTC", timeframe=60)
    # Ticks within same minute: 0s, 10s, 50s.
    # base_t must be aligned to a 60s bucket boundary (1700000000000 % 60000 == 20000,
    # which would push the last ticks into the next candle).
    base_t = 1699999980000
    assert base_t % 60000 == 0
    t1 = MarketTick(asset="EURUSD-OTC", timestamp=base_t + 1000, price=1.0850)
    t2 = MarketTick(asset="EURUSD-OTC", timestamp=base_t + 15000, price=1.0858)
    t3 = MarketTick(asset="EURUSD-OTC", timestamp=base_t + 30000, price=1.0846)
    t4 = MarketTick(asset="EURUSD-OTC", timestamp=base_t + 55000, price=1.0852)

    builder.process_tick(t1)
    builder.process_tick(t2)
    builder.process_tick(t3)
    builder.process_tick(t4)

    assert builder.current_candle is not None
    assert builder.current_candle.open == 1.0850
    assert builder.current_candle.high == 1.0858
    assert builder.current_candle.low == 1.0846
    assert builder.current_candle.close == 1.0852
    assert not builder.current_candle.closed

    # Tick in next minute closes previous
    t_next = MarketTick(asset="EURUSD-OTC", timestamp=base_t + 61000, price=1.0855)
    closed = builder.process_tick(t_next)
    assert closed is not None
    assert closed.closed is True
    assert closed.close == 1.0852


def test_fvg_engine():
    fvg_engine = FVGEngine(min_gap_pct=0.00010)
    # Construct 3 candles where c3.low > c1.high (Bullish FVG)
    c1 = Candle(id="1", asset="EURUSD-OTC", timeframe=60, timestamp=1000, open=1.0800, high=1.0810, low=1.0795, close=1.0805, closed=True)
    c2 = Candle(id="2", asset="EURUSD-OTC", timeframe=60, timestamp=2000, open=1.0806, high=1.0840, low=1.0805, close=1.0838, closed=True)
    c3 = Candle(id="3", asset="EURUSD-OTC", timeframe=60, timestamp=3000, open=1.0839, high=1.0855, low=1.0825, close=1.0850, closed=True)

    result = fvg_engine.analyze([c1, c2, c3])
    assert result["activeBullish"] is not None
    assert result["activeBullish"]["upper"] == 1.0825
    assert result["activeBullish"]["lower"] == 1.0810
    assert result["activeBullish"]["fresh"] is True


def test_order_block_engine():
    ob_engine = OrderBlockEngine(min_displacement_ratio=1.5)
    candles = generate_test_candles(30)
    # Insert a strong bearish displacement candle after a small bullish candle.
    # Timestamps must continue the generated timeline (the generated candles use
    # base_time=1700000000000 + i*60000) and a trailing candle must follow, because
    # the engine never scans the final candle as a displacement candle.
    last = candles[-1]
    end_price = last.close  # ~1.0908 after 30 uptrending candles
    t_prev = last.timestamp + 60000
    t_disp = t_prev + 60000
    t_confirm = t_disp + 60000
    prev_c = Candle(id="ob_prev", asset="EURUSD-OTC", timeframe=60, timestamp=t_prev,
                    open=end_price, high=end_price + 0.00010, low=end_price - 0.00005,
                    close=end_price + 0.00005, closed=True)
    disp_c = Candle(id="ob_disp", asset="EURUSD-OTC", timeframe=60, timestamp=t_disp,
                    open=prev_c.close, high=prev_c.close + 0.00005,
                    low=prev_c.close - 0.00030, close=prev_c.close - 0.00030, closed=True)
    confirm_c = Candle(id="ob_confirm", asset="EURUSD-OTC", timeframe=60, timestamp=t_confirm,
                       open=disp_c.close, high=disp_c.close + 0.00005,
                       low=disp_c.close - 0.00010, close=disp_c.close - 0.00005, closed=True)
    candles.extend([prev_c, disp_c, confirm_c])

    res = ob_engine.analyze(candles)
    assert res["activeBearishOB"] is not None
    assert res["activeBearishOB"]["type"] == "BEARISH"


def test_worker_fly_decisions_and_queen():
    candles = generate_test_candles(60)
    smc = SMCFeatureEngine()
    fv, raw_details = smc.process(candles, "EURUSD-OTC", 60)

    swarm = SwarmManager(population_size=20)
    assert len(swarm.workers) == 20

    # Ensure worker archetypes are diverse
    weights = [w.dna.liquidityWeight for w in swarm.workers]
    assert len(set(weights)) > 3, "Workers must have diverse DNA weights"

    result = swarm.evaluate_swarm(fv, raw_details)
    assert "queen" in result
    assert "workers" in result
    assert len(result["decisions"]) == 20
    assert result["queen"]["direction"] in ("UP", "DOWN", "HOLD")


def test_paper_trading_settlement():
    paper = PaperTradingManager(expiry_seconds=60)
    queen_sig = type("MockQueen", (), {
        "asset": "EURUSD-OTC",
        "direction": "UP",
        "confidence": 0.82,
        "status": "PAPER_SIGNAL",
        "upVotes": 16,
        "downVotes": 2,
        "holdVotes": 2,
        "evidence": ["SELL_SIDE_LIQUIDITY_SWEEP", "BULLISH_ORDER_BLOCK"]
    })()

    # Open trade at 1.08500
    trade = paper.open_trade(queen_sig, current_price=1.08500, regime="TREND_UP")
    assert trade is not None
    assert trade.status == "OPEN"
    assert len(paper.active_trades) == 1

    # Before expiry, should not settle
    settled = paper.check_expiries(current_price=1.08550, current_timestamp_ms=trade.timestamp + 30000)
    assert len(settled) == 0

    # At expiry, price is higher (1.08540) -> WIN
    settled = paper.check_expiries(current_price=1.08540, current_timestamp_ms=trade.expiryTimestamp + 100)
    assert len(settled) == 1
    assert settled[0].status == "WIN"
    assert settled[0].pnl > 0
    stats = paper.get_statistics()
    assert stats["wins"] == 1
    assert stats["winRate"] == 1.0
