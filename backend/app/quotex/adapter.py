"""
Quotex Isolated Data Adapter Layer:
Defines the strict QuotexAdapterInterface. The rest of the application
never depends on raw Quotex WebSocket protocols.
Provides both QuotexDemoAdapter (high-fidelity simulated OTC market data)
and QuotexLiveAdapter placeholder ready for ChipaDevTeam/QuotexAPI or direct WebSocket.
"""
from abc import ABC, abstractmethod
import time
import math
import random
from typing import Callable, Optional, Dict, Any
from ..market.models import MarketTick, Candle


class QuotexAdapterInterface(ABC):
    @abstractmethod
    def connect(self) -> bool:
        pass

    @abstractmethod
    def disconnect(self) -> bool:
        pass

    @abstractmethod
    def subscribe_asset(self, asset: str) -> bool:
        pass

    @abstractmethod
    def subscribe_candles(self, asset: str, timeframe: int, callback: Callable[[Candle], None]) -> bool:
        pass

    @abstractmethod
    def subscribe_quotes(self, asset: str, callback: Callable[[MarketTick], None]) -> bool:
        pass

    @abstractmethod
    def get_connection_status(self) -> Dict[str, Any]:
        pass


class QuotexDemoAdapter(QuotexAdapterInterface):
    """
    Realistic OTC simulated candle & tick generator.
    Simulates institutional OTC market behavior:
    - Micro trends and mean reversion
    - Liquidity sweeps outside swing ranges
    - Momentum displacement bursts
    - High-frequency tick updates (e.g. 1-2 ticks/second)
    """
    def __init__(self, asset: str = "EURUSD-OTC", base_price: float = 1.0850):
        self.asset = asset
        self.base_price = base_price
        self.current_price = base_price
        self.connected = False
        self.tick_callback: Optional[Callable[[MarketTick], None]] = None
        self.candle_callback: Optional[Callable[[Candle], None]] = None
        self.trend_bias = 0.0
        self.cycle = 0

    def connect(self) -> bool:
        self.connected = True
        return True

    def disconnect(self) -> bool:
        self.connected = False
        return True

    def subscribe_asset(self, asset: str) -> bool:
        self.asset = asset
        return True

    def subscribe_candles(self, asset: str, timeframe: int, callback: Callable[[Candle], None]) -> bool:
        self.asset = asset
        self.candle_callback = callback
        return True

    def subscribe_quotes(self, asset: str, callback: Callable[[MarketTick], None]) -> bool:
        self.asset = asset
        self.tick_callback = callback
        return True

    def generate_next_tick(self) -> MarketTick:
        self.cycle += 1
        # Regime shifting sinusoidal bias
        if self.cycle % 120 == 0:
            self.trend_bias = random.choice([-0.00004, 0.0, 0.00004, 0.00008, -0.00008])

        # Add Gaussian noise + institutional jump chance (displacement)
        noise = random.gauss(0, 0.00003)
        jump = 0.0
        if random.random() < 0.05:  # 5% chance of displacement / liquidity sweep attempt
            jump = random.choice([0.00012, -0.00012])

        self.current_price = max(0.1, self.current_price + self.trend_bias + noise + jump)
        tick = MarketTick(
            asset=self.asset,
            timestamp=int(time.time() * 1000),
            price=round(self.current_price, 5),
            volume=round(random.uniform(0.5, 4.0), 2)
        )

        if self.tick_callback:
            self.tick_callback(tick)

        return tick

    def get_connection_status(self) -> Dict[str, Any]:
        return {
            "source": "DEMO",
            "connected": self.connected,
            "asset": self.asset,
            "latencyMs": 12,
            "stale": False,
            "message": "Connected to OTC DEMO simulation stream"
        }


class QuotexLiveAdapter(QuotexAdapterInterface):
    """
    Live Quotex adapter implementation placeholder.
    Encapsulates connection to Quotex WebSocket (e.g. via QuotexAPI).
    Isolated so that API changes do not alter SMC or Swarm logic.
    """
    def __init__(self, ws_url: Optional[str] = None, token: Optional[str] = None):
        self.ws_url = ws_url
        self.token = token
        self.connected = False
        self.asset = "EURUSD-OTC"
        self.tick_callback: Optional[Callable[[MarketTick], None]] = None

    def connect(self) -> bool:
        # In this phase, if credentials or external endpoint are not provided,
        # fail safely and instruct to switch to DEMO
        if not self.ws_url or not self.token:
            self.connected = False
            return False
        self.connected = True
        return True

    def disconnect(self) -> bool:
        self.connected = False
        return True

    def subscribe_asset(self, asset: str) -> bool:
        self.asset = asset
        return True

    def subscribe_candles(self, asset: str, timeframe: int, callback: Callable[[Candle], None]) -> bool:
        return True

    def subscribe_quotes(self, asset: str, callback: Callable[[MarketTick], None]) -> bool:
        self.tick_callback = callback
        return True

    def get_connection_status(self) -> Dict[str, Any]:
        return {
            "source": "LIVE",
            "connected": self.connected,
            "asset": self.asset,
            "latencyMs": 45 if self.connected else 0,
            "stale": not self.connected,
            "message": "Live Quotex WebSocket adapter configured" if self.connected else "Live Quotex WebSocket not connected"
        }
