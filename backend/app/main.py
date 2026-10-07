"""
Main FastAPI Application & Real-time WebSocket Server.
Exposes endpoints on ws://127.0.0.1:8765/ws and REST /api/*.
Orchestrates Quotex Adapter -> Candle Builder -> SMC Engine -> Swarm -> Queen -> Paper Trader.
"""
import asyncio
import json
import time
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .market.models import MarketTick, Candle, SMCFeatureVector
from .market.candle_builder import CandleBuilder
from .market.candle_store import CandleStore
from .smc.feature_engine import SMCFeatureEngine
from .swarm.swarm_manager import SwarmManager
from .paper.paper_trader import PaperTradingManager
from .quotex.adapter import QuotexDemoAdapter, QuotexLiveAdapter
from .execution.adapter import ExecutionAdapter
from .database.repository import DatabaseRepository

app = FastAPI(title="OTC Swarm Queen API", version="1.0.0")

# Enable CORS for localhost and Chrome extension.
# allow_origins=["*"] combined with allow_credentials=True is rejected by browsers for
# credentialed requests — list explicit origins and drop credentials instead.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS + ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core singletons
db_repo = DatabaseRepository()
candle_store = CandleStore(max_buffer=1000)
smc_engine = SMCFeatureEngine()
swarm_manager = SwarmManager(population_size=settings.POPULATION_SIZE, mutation_rate=settings.MUTATION_RATE)
paper_trader = PaperTradingManager(expiry_seconds=settings.PAPER_EXPIRY_SECONDS)
execution_adapter = ExecutionAdapter(mode="DISABLED")

demo_adapter = QuotexDemoAdapter(asset=settings.DEFAULT_ASSET)
live_adapter = QuotexLiveAdapter()
active_adapter = demo_adapter
active_adapter.connect()

candle_builder = CandleBuilder(
    asset=settings.DEFAULT_ASSET,
    timeframe=settings.DEFAULT_TIMEFRAME
)

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, event_type: str, payload: Dict[str, Any]):
        if not self.active_connections:
            return
        message = json.dumps({
            "type": event_type,
            "timestamp": int(time.time() * 1000),
            "payload": payload
        })
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception:
                disconnected.append(connection)
        for d in disconnected:
            self.disconnect(d)

manager = ConnectionManager()

# Background generator and engine loop
background_task: Optional[asyncio.Task] = None
is_engine_running = True


async def engine_tick_loop():
    """
    Main real-time tick and candle cycle.
    Aggregates ticks into candles, computes SMC features, passes to 20 workers,
    queries Queen consensus, manages paper trades and broadcasts WebSocket events.
    """
    global is_engine_running
    # Seed candle store with initial historical candles
    base_price = 1.0850
    now_ms = int(time.time() * 1000)
    tf_ms = 60 * 1000
    for i in range(100, 0, -1):
        t = now_ms - (i * tf_ms)
        p = base_price + (math_noise := (i % 7 - 3) * 0.00015)
        c = Candle(
            id=f"{settings.DEFAULT_ASSET}_60_{t}",
            asset=settings.DEFAULT_ASSET,
            timeframe=60,
            timestamp=t,
            open=p,
            high=p + 0.00020,
            low=p - 0.00015,
            close=p + 0.00008,
            volume=100.0,
            closed=True
        )
        candle_store.add_candle(c)

    while True:
        try:
            if not is_engine_running:
                await asyncio.sleep(0.5)
                continue

            # 1. Generate / receive tick from active adapter
            tick = active_adapter.generate_next_tick() if isinstance(active_adapter, QuotexDemoAdapter) else None
            if not tick:
                await asyncio.sleep(0.2)
                continue

            # Broadcast TICK
            await manager.broadcast("TICK", tick.model_dump())

            # 2. Feed tick to Candle Builder
            closed_candle = candle_builder.process_tick(tick)
            current_candle = candle_builder.current_candle

            # Update store with current forming candle
            if current_candle:
                candle_store.add_candle(current_candle)
                await manager.broadcast("CANDLE_UPDATE", current_candle.model_dump())

            # 3. If a candle closed, trigger SMC and Swarm evaluation cycle!
            if closed_candle:
                candle_store.add_candle(closed_candle)
                db_repo.save_candle(closed_candle)
                await manager.broadcast("CANDLE_CLOSED", closed_candle.model_dump())

                # Fetch recent candles for SMC
                history = candle_store.get_candles(settings.DEFAULT_ASSET, 60, limit=120)

                # Process SMC
                fv, raw_smc = smc_engine.process(history, settings.DEFAULT_ASSET, 60)
                await manager.broadcast("SMC_UPDATE", {
                    "featureVector": fv.model_dump(),
                    "raw": raw_smc
                })

                # Evaluate Swarm & Queen
                paper_stats = paper_trader.get_statistics()
                swarm_result = swarm_manager.evaluate_swarm(
                    fv=fv,
                    raw_details=raw_smc,
                    paper_stats=paper_stats,
                    is_data_stale=False
                )

                await manager.broadcast("WORKER_UPDATE", {
                    "workers": swarm_result["workers"],
                    "decisions": swarm_result["decisions"]
                })

                queen_sig = swarm_result["queen"]
                await manager.broadcast("QUEEN_UPDATE", queen_sig)

                # 4. If Queen signals PAPER_SIGNAL or VALIDATED_SIGNAL, open paper trade
                if queen_sig["status"] in ("PAPER_SIGNAL", "VALIDATED_SIGNAL") and queen_sig["direction"] in ("UP", "DOWN"):
                    opened_trade = paper_trader.open_trade(
                        queen_signal=swarm_manager.last_queen_signal,
                        current_price=tick.price,
                        regime=fv.regime.value
                    )
                    if opened_trade:
                        swarm_manager.queen.record_signal_dispatched()
                        db_repo.save_paper_trade(opened_trade.model_dump())
                        await manager.broadcast("PAPER_TRADE_OPEN", opened_trade.model_dump())

            # 5. Check Paper Trade Expiries
            settled_trades = paper_trader.check_expiries(tick.price, tick.timestamp)
            for st in settled_trades:
                db_repo.save_paper_trade(st.model_dump())
                # Settle for workers and evolution
                swarm_manager.settle_trade_outcomes(
                    direction=st.direction,
                    result=st.status,
                    regime=st.regime,
                    asset=st.asset,
                    evidence=st.smcEvidence
                )
                await manager.broadcast("PAPER_TRADE_RESULT", st.model_dump())
                await manager.broadcast("WORKER_UPDATE", {
                    "workers": [w.to_dict() for w in swarm_manager.workers]
                })

            await asyncio.sleep(0.5)  # 2 ticks per second simulation speed

        except asyncio.CancelledError:
            break
        except Exception as e:
            await manager.broadcast("ERROR", {"message": str(e)})
            await asyncio.sleep(1.0)


@app.on_event("startup")
async def startup_event():
    global background_task
    background_task = asyncio.create_task(engine_tick_loop())


@app.on_event("shutdown")
async def shutdown_event():
    global background_task
    if background_task:
        background_task.cancel()


# --- REST API Endpoints ---

@app.get("/api/status")
async def get_status():
    adapter_status = active_adapter.get_connection_status()
    return {
        "app": settings.APP_NAME,
        "env": settings.ENV,
        "dataSource": adapter_status["source"],
        "connection": "CONNECTED" if adapter_status["connected"] else "DISCONNECTED",
        "executionMode": settings.EXECUTION_MODE,
        "liveExecutionDisabled": True,
        "asset": settings.DEFAULT_ASSET,
        "timeframe": settings.DEFAULT_TIMEFRAME,
        "activeWorkers": len(swarm_manager.workers),
        "graveyardRecords": swarm_manager.graveyard.get_total_count(),
        "totalPaperTrades": len(paper_trader.closed_trades)
    }


@app.get("/api/assets")
async def get_assets():
    return {
        "assets": [
            {"id": "EURUSD-OTC", "name": "EUR/USD (OTC)", "payout": 0.85, "active": True},
            {"id": "GBPUSD-OTC", "name": "GBP/USD (OTC)", "payout": 0.84, "active": True},
            {"id": "USDJPY-OTC", "name": "USD/JPY (OTC)", "payout": 0.82, "active": True},
            {"id": "BTCUSD-OTC", "name": "BTC/USD (OTC)", "payout": 0.80, "active": True},
        ]
    }


@app.get("/api/candles")
async def get_candles(asset: str = "EURUSD-OTC", timeframe: int = 60, limit: int = 100):
    candles = candle_store.get_candles(asset, timeframe, limit=limit)
    return {"candles": [c.model_dump() for c in candles]}


@app.get("/api/smc")
async def get_smc():
    candles = candle_store.get_candles(settings.DEFAULT_ASSET, 60, limit=120)
    fv, raw_details = smc_engine.process(candles, settings.DEFAULT_ASSET, 60)
    return {
        "featureVector": fv.model_dump(),
        "raw": raw_details
    }


@app.get("/api/swarm")
async def get_swarm():
    return {
        "populationSize": len(swarm_manager.workers),
        "workers": [w.to_dict() for w in swarm_manager.workers]
    }


@app.get("/api/queen")
async def get_queen():
    return {
        "queenSignal": swarm_manager.last_queen_signal.model_dump() if swarm_manager.last_queen_signal else None,
        "minConsensus": swarm_manager.queen.min_consensus,
        "minConfidence": swarm_manager.queen.min_confidence,
        "minPaperTradesValidation": swarm_manager.queen.min_paper_trades_validation
    }


@app.get("/api/paper-trades")
async def get_paper_trades():
    return {
        "active": [t.model_dump() for t in paper_trader.active_trades],
        "closed": [t.model_dump() for t in paper_trader.closed_trades[-100:]],
        "statistics": paper_trader.get_statistics()
    }


@app.get("/api/graveyard")
async def get_graveyard():
    return {
        "records": swarm_manager.graveyard.get_records(50),
        "totalRecords": swarm_manager.graveyard.get_total_count(),
        "topFailurePatterns": swarm_manager.graveyard.get_top_failure_patterns(6)
    }


@app.get("/api/pattern-memory")
async def get_pattern_memory():
    return {
        "patterns": swarm_manager.pattern_memory.get_patterns(30)
    }


@app.get("/api/performance")
async def get_performance():
    stats = paper_trader.get_statistics()
    worker_healths = [w.health for w in swarm_manager.workers]
    avg_health = sum(worker_healths) / len(worker_healths) if worker_healths else 0.0
    generations = [w.generation for w in swarm_manager.workers]
    max_gen = max(generations) if generations else 1
    return {
        "paperStats": stats,
        "averageWorkerHealth": round(avg_health, 1),
        "maxGeneration": max_gen,
        "graveyardCount": swarm_manager.graveyard.get_total_count(),
        "outOfSample": {
            "validationStatus": "TRAINING" if stats["totalTrades"] < 200 else "EVALUATING",
            "requiredTrades": 200,
            "progressPct": min(100.0, round((stats["totalTrades"] / 200.0) * 100, 1))
        }
    }


@app.post("/api/swarm/reset")
async def reset_swarm():
    swarm_manager.reset_swarm()
    return {"status": "success", "message": "Worker swarm reset to Generation 1 with diverse archetypes"}


@app.post("/api/settings")
async def update_settings(payload: Dict[str, Any]):
    if "consensusThreshold" in payload:
        swarm_manager.queen.min_consensus = float(payload["consensusThreshold"])
    if "minQueenConfidence" in payload:
        swarm_manager.queen.min_confidence = float(payload["minQueenConfidence"])
    if "paperExpirySeconds" in payload:
        paper_trader.expiry_seconds = int(payload["paperExpirySeconds"])
    return {"status": "success", "settings": payload}


# --- WebSocket Endpoint ---

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Send initial snapshot upon connection
        init_payload = {
            "type": "SYSTEM_STATUS",
            "timestamp": int(time.time() * 1000),
            "payload": {
                "dataSource": active_adapter.get_connection_status()["source"],
                "asset": settings.DEFAULT_ASSET,
                "executionMode": "DISABLED",
                "liveExecutionDisabled": True,
                "message": "Connected to OTC Swarm Queen core WebSocket"
            }
        }
        await websocket.send_text(json.dumps(init_payload))

        while True:
            data = await websocket.receive_text()
            # Handle inbound commands e.g. ping/heartbeat or asset subscription
            try:
                msg = json.loads(data)
                mtype = msg.get("type")
                if mtype == "PING":
                    await websocket.send_text(json.dumps({"type": "PONG", "timestamp": int(time.time()*1000)}))
                elif mtype == "SUBSCRIBE_ASSET":
                    target_asset = msg.get("asset", "EURUSD-OTC")
                    candle_builder.asset = target_asset
                    active_adapter.subscribe_asset(target_asset)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
