"""
SQLite Database models for OTC Swarm Queen persistence.
Persists candles, workers, DNA, generations, health, paper trades, graveyard, and settings.
"""
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text, BigInteger
from sqlalchemy.orm import declarative_base, sessionmaker

Base = declarative_base()


class CandleRecord(Base):
    __tablename__ = "candles"
    id = Column(String(64), primary_key=True)
    asset = Column(String(32), index=True)
    timeframe = Column(Integer, index=True)
    timestamp = Column(BigInteger, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Float)
    closed = Column(Boolean, default=True)


class WorkerRecord(Base):
    __tablename__ = "workers"
    id = Column(Integer, primary_key=True)
    generation = Column(Integer, default=1)
    health = Column(Float, default=100.0)
    fitness = Column(Float, default=0.50)
    status = Column(String(32), default="ACTIVE")
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    holds = Column(Integer, default=0)
    dna_json = Column(Text)


class PaperTradeRecord(Base):
    __tablename__ = "paper_trades"
    id = Column(String(64), primary_key=True)
    asset = Column(String(32), index=True)
    direction = Column(String(8))
    entry_price = Column(Float)
    exit_price = Column(Float, nullable=True)
    expiry_seconds = Column(Integer, default=60)
    timestamp = Column(BigInteger, index=True)
    status = Column(String(16))  # "OPEN", "WIN", "LOSS", "DRAW"
    pnl = Column(Float, default=0.0)
    queen_confidence = Column(Float)
    evidence_json = Column(Text)


class GraveyardEntity(Base):
    __tablename__ = "graveyard"
    record_id = Column(String(64), primary_key=True)
    worker_id = Column(Integer)
    generation = Column(Integer)
    fitness = Column(Float)
    win_rate = Column(Float)
    death_timestamp = Column(BigInteger)
    dna_json = Column(Text)
    failure_patterns_json = Column(Text)
