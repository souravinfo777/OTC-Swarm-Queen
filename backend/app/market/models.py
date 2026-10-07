"""
Standard normalized market data models.
The rest of the application depends only on these structures.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class MarketTick(BaseModel):
    asset: str
    timestamp: int  # milliseconds epoch
    price: float
    volume: Optional[float] = 1.0


class Candle(BaseModel):
    id: str
    asset: str
    timeframe: int  # seconds (e.g. 60, 300, 900)
    timestamp: int  # open timestamp in milliseconds
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    closed: bool = False


class MarketRegimeType(str, Enum):
    TREND_UP = "TREND_UP"
    TREND_DOWN = "TREND_DOWN"
    RANGE = "RANGE"
    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    LOW_VOLATILITY = "LOW_VOLATILITY"
    UNCERTAIN = "UNCERTAIN"


class SwingPoint(BaseModel):
    index: int
    timestamp: int
    price: float
    type: str  # "HIGH" or "LOW"
    classification: Optional[str] = None  # "HH", "HL", "LH", "LL"


class LiquidityZone(BaseModel):
    id: str
    type: str  # "EQUAL_HIGH", "EQUAL_LOW", "SWING_HIGH", "SWING_LOW", "BUY_SIDE", "SELL_SIDE"
    price: float
    timestamp: int
    strength: float
    swept: bool = False
    sweepDirection: Optional[str] = None  # "BULLISH_SWEEP" or "BEARISH_SWEEP"
    sweepTimestamp: Optional[int] = None


class OrderBlock(BaseModel):
    id: str
    type: str  # "BULLISH" or "BEARISH"
    high: float
    low: float
    timestamp: int
    strength: float
    fresh: bool = True
    mitigated: bool = False
    displacementScore: float = 0.0


class FairValueGap(BaseModel):
    id: str
    type: str  # "BULLISH" or "BEARISH"
    upper: float
    lower: float
    size: float
    timestamp: int
    fresh: bool = True
    touched: bool = False
    mitigated: bool = False


class SMCFeatureVector(BaseModel):
    asset: str
    timestamp: int
    timeframe: int
    trend: str  # "BULLISH", "BEARISH", "RANGE", "UNCERTAIN"
    bos: bool
    choch: bool
    liquiditySweep: bool
    liquidityType: Optional[str] = None
    bullishOB: bool
    bearishOB: bool
    bullishFVG: bool
    bearishFVG: bool
    fvgFresh: bool
    obFresh: bool
    candlePattern: str
    displacement: float
    wickRatio: float
    volatility: float
    regime: MarketRegimeType
    confluenceScore: float  # 0 to 100
    evidence: List[str] = []
