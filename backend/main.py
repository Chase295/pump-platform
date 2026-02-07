"""
Pump Platform - Unified FastAPI Application

Consolidates pump-find, pump-training, pump-server, and pump-buy
into a single monolithic service with modular routers.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from backend.config import settings
from backend.database import init_pool, close_pool, check_health

# Import module routers
from backend.modules.find.router import router as find_router
from backend.modules.training.router import router as training_router
from backend.modules.server.router import router as server_router
from backend.modules.buy.router import router as buy_router

# Import module lifecycle components
from backend.modules.find.streamer import CoinStreamer
from backend.modules.training.jobs import JobManager
from backend.modules.server.alerts import start_alert_evaluator, stop_alert_evaluator
from backend.modules.server.predictor import preload_all_models

# Import Prometheus metrics
from backend.shared.prometheus import get_metrics, platform_uptime_seconds

logger = logging.getLogger(__name__)

# Module-level references for lifecycle management
_streamer: CoinStreamer | None = None
_job_manager: JobManager | None = None

START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown."""
    global _streamer, _job_manager

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
        format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    )
    logger.info("Pump Platform starting...")

    # 1. Initialize database pool
    await init_pool(settings.DATABASE_URL)
    logger.info("Database pool initialized")

    # 2. Start Find module streamer
    _streamer = CoinStreamer()
    # Register streamer with find module if it has a setter
    try:
        from backend.modules.find.router import set_streamer
        set_streamer(_streamer)
    except ImportError:
        pass
    asyncio.create_task(_streamer.start())
    logger.info("Find streamer started")

    # 3. Start Training module job manager
    _job_manager = JobManager()
    await _job_manager.start()
    logger.info("Training job manager started")

    # 4. Start Server module alert evaluator
    await start_alert_evaluator(interval_seconds=settings.POLLING_INTERVAL_SECONDS)
    logger.info("Alert evaluator started")

    # 5. Preload ML models
    try:
        result = await preload_all_models()
        logger.info("Models preloaded: %s loaded, %s failed", result.get("loaded", 0), result.get("failed", 0))
    except Exception as e:
        logger.warning("Model preload failed (non-fatal): %s", e)

    logger.info("Pump Platform ready on port %d", settings.API_PORT)

    # Start uptime tracking task
    async def update_uptime():
        while True:
            platform_uptime_seconds.set(time.time() - START_TIME)
            await asyncio.sleep(10)

    uptime_task = asyncio.create_task(update_uptime())

    yield  # Application runs

    # Shutdown
    logger.info("Pump Platform shutting down...")

    uptime_task.cancel()
    if _streamer:
        await _streamer.stop()
    if _job_manager:
        await _job_manager.stop()
    await stop_alert_evaluator()
    await close_pool()

    logger.info("Pump Platform stopped")


# Create FastAPI app
app = FastAPI(
    title="Pump Platform",
    description="Unified crypto token discovery, ML training, predictions, and trading platform",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount module routers
app.include_router(find_router)      # /api/find/...
app.include_router(training_router)  # /api/training/...
app.include_router(server_router)    # /api/server/...
app.include_router(buy_router)       # /api/buy/...


# Global endpoints
@app.get("/")
async def root():
    """Root endpoint showing platform info."""
    return {
        "service": "pump-platform",
        "version": "1.0.0",
        "modules": ["find", "training", "server", "buy"],
        "uptime": round(time.time() - START_TIME, 1),
    }


@app.get("/health")
async def global_health():
    """Global health check across all modules."""
    db_ok = await check_health()

    # Check module health
    find_ok = _streamer is not None and _streamer.get_status().get("ws_connected", False)
    training_ok = _job_manager is not None

    return {
        "status": "healthy" if db_ok else "degraded",
        "db_connected": db_ok,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "modules": {
            "find": find_ok,
            "training": training_ok,
            "server": True,
            "buy": True,
        },
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics_endpoint():
    """Prometheus metrics endpoint."""
    return get_metrics()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=settings.API_PORT,
        reload=False,
        log_level=settings.LOG_LEVEL.lower(),
    )
