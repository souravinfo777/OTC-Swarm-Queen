"""
Database Repository:
Handles SQLite connections, table creation, and atomic persistence.
"""
import json
import os
from typing import List, Optional, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .models import Base, CandleRecord, WorkerRecord, PaperTradeRecord, GraveyardEntity
from ..market.models import Candle


class DatabaseRepository:
    def __init__(self, db_url: str = "sqlite:///./data/swarm_queen.db"):
        # Ensure data directory exists
        os.makedirs("./data", exist_ok=True)
        self.engine = create_engine(db_url, connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def save_candle(self, candle: Candle):
        with self.SessionLocal() as session:
            record = session.query(CandleRecord).filter_by(id=candle.id).first()
            if not record:
                record = CandleRecord(
                    id=candle.id,
                    asset=candle.asset,
                    timeframe=candle.timeframe,
                    timestamp=candle.timestamp,
                    open=candle.open,
                    high=candle.high,
                    low=candle.low,
                    close=candle.close,
                    volume=candle.volume,
                    closed=candle.closed
                )
                session.add(record)
            else:
                record.high = candle.high
                record.low = candle.low
                record.close = candle.close
                record.volume = candle.volume
                record.closed = candle.closed
            session.commit()

    def get_recent_candles(self, asset: str, timeframe: int, limit: int = 500) -> List[Candle]:
        with self.SessionLocal() as session:
            records = session.query(CandleRecord).filter_by(asset=asset, timeframe=timeframe).order_by(CandleRecord.timestamp.desc()).limit(limit).all()
            records.reverse()
            return [
                Candle(
                    id=r.id,
                    asset=r.asset,
                    timeframe=r.timeframe,
                    timestamp=r.timestamp,
                    open=r.open,
                    high=r.high,
                    low=r.low,
                    close=r.close,
                    volume=r.volume or 1.0,
                    closed=r.closed
                )
                for r in records
            ]

    def save_paper_trade(self, trade_dict: Dict[str, Any]):
        with self.SessionLocal() as session:
            record = session.query(PaperTradeRecord).filter_by(id=trade_dict["id"]).first()
            if not record:
                record = PaperTradeRecord(
                    id=trade_dict["id"],
                    asset=trade_dict["asset"],
                    direction=trade_dict["direction"],
                    entry_price=trade_dict["entryPrice"],
                    exit_price=trade_dict.get("exitPrice"),
                    expiry_seconds=trade_dict.get("expirySeconds", 60),
                    timestamp=trade_dict["timestamp"],
                    status=trade_dict["status"],
                    pnl=trade_dict.get("pnl", 0.0),
                    queen_confidence=trade_dict.get("queenConfidence", 0.0),
                    evidence_json=json.dumps(trade_dict.get("smcEvidence", []))
                )
                session.add(record)
            else:
                record.exit_price = trade_dict.get("exitPrice")
                record.status = trade_dict["status"]
                record.pnl = trade_dict.get("pnl", 0.0)
            session.commit()

    def save_graveyard_record(self, record_dict: Dict[str, Any]):
        with self.SessionLocal() as session:
            entity = GraveyardEntity(
                record_id=record_dict["recordId"],
                worker_id=record_dict["workerId"],
                generation=record_dict["generation"],
                fitness=record_dict["fitness"],
                win_rate=record_dict["winRate"],
                death_timestamp=record_dict["deathTimestamp"],
                dna_json=json.dumps(record_dict["dna"]),
                failure_patterns_json=json.dumps(record_dict.get("failurePatterns", []))
            )
            session.add(entity)
            session.commit()
