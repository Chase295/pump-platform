"""
Unified Configuration for Pump Platform

Single pydantic-settings class that holds ALL environment variables used
by the four service modules (find, training, server, buy).

Usage:
    from backend.config import settings

    dsn = settings.DATABASE_URL
    ws  = settings.WS_URI
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central settings loaded from environment variables / .env file."""

    # ------------------------------------------------------------------
    # Database
    # ------------------------------------------------------------------
    DATABASE_URL: str = ""

    # ------------------------------------------------------------------
    # Find module
    # ------------------------------------------------------------------
    WS_URI: str = "wss://pumpportal.fun/api/data"
    WS_RETRY_DELAY: int = 3
    WS_MAX_RETRY_DELAY: int = 60
    WS_PING_INTERVAL: int = 20
    WS_PING_TIMEOUT: int = 5
    WS_CONNECTION_TIMEOUT: int = 30
    COIN_CACHE_SECONDS: int = 360
    COIN_CACHE_MAX_SIZE: int = 5000
    BATCH_SIZE: int = 10
    BATCH_TIMEOUT: int = 30
    BAD_NAMES_PATTERN: str = "test|bot|rug|scam|cant|honey|faucet"
    SPAM_BURST_WINDOW: int = 30
    N8N_FIND_WEBHOOK_URL: str = ""
    N8N_FIND_WEBHOOK_METHOD: str = "POST"
    DB_REFRESH_INTERVAL: int = 10
    SOL_RESERVES_FULL: float = 85.0
    WHALE_THRESHOLD_SOL: float = 1.0
    TRADE_BUFFER_SECONDS: int = 180

    # ------------------------------------------------------------------
    # Training module
    # ------------------------------------------------------------------
    MODEL_STORAGE_PATH: str = "/app/models"
    JOB_POLL_INTERVAL: int = 5
    MAX_CONCURRENT_JOBS: int = 2

    # ------------------------------------------------------------------
    # Server module
    # ------------------------------------------------------------------
    N8N_SERVER_WEBHOOK_URL: str = ""
    POLLING_INTERVAL_SECONDS: int = 30
    EVENT_BATCH_SIZE: int = 50
    EVENT_BATCH_TIMEOUT_SECONDS: int = 5

    # ------------------------------------------------------------------
    # Buy module
    # ------------------------------------------------------------------
    HELIUS_RPC_URL: str = ""
    QUICKNODE_RPC_URL: str = ""
    JITO_BLOCK_ENGINE: str = "amsterdam.mainnet.block-engine.jito.wtf"
    JUPITER_API_KEY: str = ""
    ENCRYPTION_KEY: str = ""
    DEFAULT_SLIPPAGE_BPS: int = 100
    DEFAULT_JITO_TIP_LAMPORTS: int = 50000
    NETWORK_FEE_SOL: float = 0.000005
    SAFETY_BUFFER_SOL: float = 0.001

    # ------------------------------------------------------------------
    # Graph module (Neo4j)
    # ------------------------------------------------------------------
    NEO4J_URI: str = "bolt://neo4j:7687"
    NEO4J_USER: str = ""
    NEO4J_PASSWORD: str = ""
    NEO4J_SYNC_INTERVAL_SECONDS: int = 300
    NEO4J_SYNC_ENABLED: bool = True
    NEO4J_EVENT_VOLUME_SPIKE_MULTIPLIER: float = 5.0
    NEO4J_EVENT_WHALE_THRESHOLD_SOL: float = 1.0
    NEO4J_EVENT_MASS_SELL_THRESHOLD: int = 10
    NEO4J_EVENT_LIQUIDITY_DROP_PCT: float = 50.0
    NEO4J_EVENT_OUTCOME_DELAY_MINUTES: int = 5

    # Phase feature flags
    NEO4J_SYNC_EVENTS_ENABLED: bool = True
    NEO4J_SYNC_PHASES_ENABLED: bool = True
    NEO4J_SYNC_WALLETS_ENABLED: bool = True
    NEO4J_SYNC_MARKET_ENABLED: bool = True
    NEO4J_SYNC_ENRICHMENT_ENABLED: bool = True
    NEO4J_SYNC_TRANSACTIONS_ENABLED: bool = True

    # Cluster detection interval (expensive, runs less frequently)
    NEO4J_SYNC_CLUSTER_INTERVAL_SECONDS: int = 1800

    # LAUNCHED_WITH: max time window (seconds) between tokens from same creator
    NEO4J_LAUNCHED_WITH_WINDOW_SEC: int = 3600

    # ------------------------------------------------------------------
    # Embeddings module
    # ------------------------------------------------------------------
    EMBEDDING_ENABLED: bool = True
    EMBEDDING_INTERVAL_SECONDS: int = 60
    EMBEDDING_WINDOW_SECONDS: int = 300
    EMBEDDING_BATCH_SIZE: int = 500
    EMBEDDING_MIN_SNAPSHOTS: int = 3
    EMBEDDING_STRATEGY: str = "handcrafted_v1"
    EMBEDDING_SIMILARITY_THRESHOLD: float = 0.85
    EMBEDDING_NEO4J_SYNC_ENABLED: bool = True
    EMBEDDING_MAX_RESULTS: int = 50

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------
    AUTH_USER: str = ""
    AUTH_PASSWORD: str = ""

    # OAuth (MCP authentication for Claude.ai)
    OAUTH_CLIENT_ID: str = ""
    OAUTH_CLIENT_SECRET: str = ""
    OAUTH_BASE_URL: str = ""  # e.g. "https://pump-platform.chase295.de"
    OAUTH_ACCESS_TOKEN_EXPIRY: int = 3600      # 1 hour
    OAUTH_REFRESH_TOKEN_EXPIRY: int = 604800   # 7 days
    OAUTH_AUTH_CODE_EXPIRY: int = 300           # 5 minutes

    # ------------------------------------------------------------------
    # General
    # ------------------------------------------------------------------
    LOG_LEVEL: str = "INFO"
    API_PORT: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False


# Module-level singleton so every import gets the same instance.
settings = Settings()
