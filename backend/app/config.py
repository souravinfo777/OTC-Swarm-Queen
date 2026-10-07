"""
Backend configuration and settings.
"""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "OTC Swarm Queen"
    ENV: str = "development"
    DEBUG: bool = True
    
    # Server & WebSocket
    HOST: str = "127.0.0.1"
    PORT: int = 8765
    WS_PATH: str = "/ws"
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "chrome-extension://*",
    ]
    
    # Data & Mode
    DATA_SOURCE: str = "DEMO"  # "DEMO" or "LIVE"
    EXECUTION_MODE: str = "DISABLED"  # "DISABLED", "PAPER", "SIGNAL_ONLY"
    DEFAULT_ASSET: str = "EURUSD-OTC"
    DEFAULT_TIMEFRAME: int = 60  # seconds
    
    # Swarm Parameters
    POPULATION_SIZE: int = 20
    MIN_PAPER_TRADES_VALIDATION: int = 200
    CONSENSUS_THRESHOLD: float = 0.60
    MIN_QUEEN_CONFIDENCE: float = 0.70
    GRAVEYARD_MAX_RECORDS: int = 500
    MUTATION_RATE: float = 0.08
    PAPER_EXPIRY_SECONDS: int = 60
    
    # Database
    DATABASE_URL: str = "sqlite:///./data/swarm_queen.db"
    
    # Gemini AI
    GEMINI_API_KEY: Optional[str] = None
    
    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
