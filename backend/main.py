"""
Pump Platform - Unified FastAPI Application

Consolidates pump-find, pump-training, pump-server, and pump-buy
into a single monolithic service with modular routers.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.config import settings
from backend.database import init_pool, close_pool, check_health

# Import module routers
from backend.modules.find.router import router as find_router
from backend.modules.training.router import router as training_router
from backend.modules.server.router import router as server_router
from backend.modules.buy.router import router as buy_router
from backend.modules.graph.router import router as graph_router
from backend.modules.embeddings.router import router as embeddings_router
from backend.modules.auth.router import router as auth_router, _auth_enabled, _generate_token

# Import module lifecycle components
from backend.modules.find.streamer import CoinStreamer
from backend.modules.training.jobs import JobManager
from backend.modules.training.auto_retrain import AutoRetrainManager
from backend.modules.server.alerts import start_alert_evaluator, stop_alert_evaluator
from backend.modules.server.predictor import preload_all_models
from backend.modules.server.scanner import start_prediction_scanner, stop_prediction_scanner

# Import graph module lifecycle
from backend.modules.graph.neo4j_client import (
    init_neo4j, close_neo4j, check_health as neo4j_check_health,
)
from backend.modules.graph.sync import start_graph_sync, stop_graph_sync
from backend.modules.embeddings.service import start_embedding_service, stop_embedding_service

# Import Prometheus metrics
from backend.shared.prometheus import get_metrics, platform_uptime_seconds

logger = logging.getLogger(__name__)

# Paths that never require authentication
_PUBLIC_PATHS = frozenset({"/", "/health", "/metrics", "/api/auth/login", "/api/auth/status"})


class AuthMiddleware(BaseHTTPMiddleware):
    """Reject unauthenticated requests to /api/... when auth is enabled."""

    async def dispatch(self, request: Request, call_next):
        if not _auth_enabled():
            return await call_next(request)

        path = request.url.path

        # Public paths - always allowed
        if path in _PUBLIC_PATHS:
            return await call_next(request)

        # Only protect /api/ routes
        if not path.startswith("/api/"):
            return await call_next(request)

        # Check Bearer token
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid token"})

        token = auth_header.removeprefix("Bearer ").strip()
        if token != _generate_token():
            return JSONResponse(status_code=401, content={"detail": "Invalid token"})

        return await call_next(request)

# Module-level references for lifecycle management
_streamer: CoinStreamer | None = None
_job_manager: JobManager | None = None
_auto_retrain: AutoRetrainManager | None = None

START_TIME = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown."""
    global _streamer, _job_manager, _auto_retrain

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

    # 3b. Start Auto-Retrain manager (background)
    _auto_retrain = AutoRetrainManager()
    await _auto_retrain.start()
    logger.info("Auto-retrain manager started")

    # 4. Start Server module alert evaluator
    await start_alert_evaluator(interval_seconds=settings.POLLING_INTERVAL_SECONDS)
    logger.info("Alert evaluator started")

    # 5. Preload ML models
    try:
        result = await preload_all_models()
        logger.info("Models preloaded: %s loaded, %s failed", result.get("loaded", 0), result.get("failed", 0))
    except Exception as e:
        logger.warning("Model preload failed (non-fatal): %s", e)

    # 5b. Start prediction scanner (polls coin_metrics and runs predictions)
    await start_prediction_scanner()
    logger.info("Prediction scanner started")

    # 6. Initialize Neo4j graph database (background retry - Neo4j may start slower)
    async def _init_neo4j_with_retry(max_retries: int = 12, delay: int = 10):
        for attempt in range(1, max_retries + 1):
            try:
                await init_neo4j(settings.NEO4J_URI, settings.NEO4J_USER, settings.NEO4J_PASSWORD)
                logger.info("Neo4j driver initialized (attempt %d)", attempt)
                if settings.NEO4J_SYNC_ENABLED:
                    await start_graph_sync(interval_seconds=settings.NEO4J_SYNC_INTERVAL_SECONDS)
                    logger.info("Graph sync service started")
                return
            except Exception as e:
                logger.warning("Neo4j init attempt %d/%d failed: %s", attempt, max_retries, e)
                if attempt < max_retries:
                    await asyncio.sleep(delay)
        logger.error("Neo4j init failed after %d attempts - graph module disabled", max_retries)

    asyncio.create_task(_init_neo4j_with_retry())

    # 7. Start Embedding generation service
    if settings.EMBEDDING_ENABLED:
        await start_embedding_service(interval_seconds=settings.EMBEDDING_INTERVAL_SECONDS)
        logger.info("Embedding service started")

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
    if _auto_retrain:
        await _auto_retrain.stop()
    await stop_alert_evaluator()
    await stop_prediction_scanner()
    await stop_embedding_service()
    await stop_graph_sync()
    await close_neo4j()
    await close_pool()

    logger.info("Pump Platform stopped")


# Create FastAPI app
app = FastAPI(
    title="Pump Platform",
    description="Unified crypto token discovery, ML training, predictions, and trading platform",
    version="1.0.0",
    lifespan=lifespan,
)

# Auth middleware (must be added before CORS so it runs after CORS)
app.add_middleware(AuthMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount module routers
app.include_router(auth_router)      # /api/auth/...
app.include_router(find_router)      # /api/find/...
app.include_router(training_router)  # /api/training/...
app.include_router(server_router)    # /api/server/...
app.include_router(buy_router)       # /api/buy/...
app.include_router(graph_router)     # /api/graph/...
app.include_router(embeddings_router) # /api/embeddings/...

# MCP integration - exposes all API endpoints as MCP tools
from fastapi_mcp import FastApiMCP

mcp = FastApiMCP(
    app,
    name="pump-platform",
    description="Unified Crypto Trading Platform - Discovery, Training, Predictions, Trading",
)
mcp.mount()


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

    # Neo4j health (non-blocking, fail-safe)
    try:
        graph_ok = await neo4j_check_health()
    except Exception:
        graph_ok = False

    # Embeddings health (non-blocking)
    from backend.modules.embeddings.service import get_embedding_service
    emb_svc = get_embedding_service()
    embeddings_ok = emb_svc is not None and emb_svc.running

    return {
        "status": "healthy" if db_ok else "degraded",
        "db_connected": db_ok,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "modules": {
            "find": find_ok,
            "training": training_ok,
            "server": True,
            "buy": True,
            "graph": graph_ok,
            "embeddings": embeddings_ok,
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
