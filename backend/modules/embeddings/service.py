"""
Background Embedding Service.

Periodically generates embeddings from coin_metrics + coin_transactions
and stores them in coin_pattern_embeddings.

Pattern follows GraphSyncService in backend/modules/graph/sync.py.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

import numpy as np

from backend.modules.embeddings import db_queries as db
from backend.modules.embeddings.generator import create_generator, BaseGenerator
from backend.modules.embeddings.similarity import compute_similarity_pairs, sync_similarities_to_neo4j
from backend.shared.prometheus import (
    embeddings_generated,
    embeddings_generation_duration,
    embeddings_active_configs,
)

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Background service that generates embeddings from coin data."""

    def __init__(self, interval_seconds: int = 60):
        self.interval_seconds = interval_seconds
        self.running = False
        self.last_run: Optional[datetime] = None
        self.generators: Dict[int, BaseGenerator] = {}
        self.stats = {
            "total_runs": 0,
            "total_embeddings": 0,
            "total_errors": 0,
        }

    async def _load_active_configs(self) -> None:
        """Load all active embedding_configs and create generators."""
        configs = await db.get_active_configs()
        self.generators.clear()
        for cfg in configs:
            try:
                gen = create_generator(cfg["strategy"], cfg)
                self.generators[cfg["id"]] = gen
            except Exception as e:
                logger.warning("Failed to create generator for config %d: %s", cfg["id"], e)
        embeddings_active_configs.set(len(self.generators))
        if self.generators:
            logger.info("Loaded %d active embedding config(s)", len(self.generators))

    async def run_once(self) -> Dict[str, int]:
        """Execute one embedding generation round."""
        import time
        start_time = time.monotonic()
        results = {"processed": 0, "created": 0, "errors": 0}

        # Reload configs periodically
        if not self.generators or self.stats["total_runs"] % 10 == 0:
            await self._load_active_configs()

        if not self.generators:
            return results

        now = datetime.now(timezone.utc)

        for config_id, generator in self.generators.items():
            try:
                config = await db.get_config(config_id)
                if not config or not config["is_active"]:
                    continue

                window_seconds = config["window_seconds"]
                batch_size = 500  # Process up to 500 mints per window

                # Find where we left off
                last_ts = await db.get_latest_window_end(config_id)
                if last_ts is None:
                    # First run: start from 1 hour ago
                    start_from = now - timedelta(hours=1)
                else:
                    start_from = last_ts

                # Generate non-overlapping windows
                current = start_from
                while current + timedelta(seconds=window_seconds) <= now:
                    window_end = current + timedelta(seconds=window_seconds)

                    # Find all active mints in this window
                    mints = await db.get_mints_in_window(current, window_end)
                    if not mints:
                        current = window_end
                        continue

                    # Process in batches
                    for i in range(0, len(mints), batch_size):
                        batch_mints = mints[i:i + batch_size]
                        embeddings = await generator.generate_batch(
                            batch_mints, current, window_end,
                        )

                        if embeddings:
                            # Prepare rows for batch insert
                            rows = []
                            new_ids = []
                            for mint, vector in embeddings.items():
                                vec_str = "[" + ",".join(str(float(v)) for v in vector) + "]"
                                fhash = generator.feature_hash(vector)
                                rows.append((
                                    mint,
                                    current,
                                    window_end,
                                    vec_str,
                                    None,  # phase_id determined later
                                    config["min_snapshots"],
                                    None,  # label (auto-labeling happens separately)
                                    config["strategy"],
                                    config_id,
                                    fhash,
                                ))

                            inserted = await db.insert_embeddings_batch(rows)
                            results["created"] += inserted
                            embeddings_generated.labels(strategy=config["strategy"]).inc(inserted)

                        results["processed"] += len(batch_mints)

                    current = window_end

                # Update config stats
                if results["created"] > 0:
                    await db.update_config_stats(config_id, results["created"])

            except Exception as e:
                logger.error("Error processing config %d: %s", config_id, e, exc_info=True)
                results["errors"] += 1

        # Similarity computation + Neo4j sync
        from backend.config import settings
        if settings.EMBEDDING_NEO4J_SYNC_ENABLED and results["created"] > 0:
            try:
                pairs = await compute_similarity_pairs()
                if pairs > 0:
                    synced = await sync_similarities_to_neo4j()
                    logger.debug("Similarity sync: %d pairs computed, %d synced to Neo4j", pairs, synced)
            except Exception as e:
                logger.warning("Similarity sync failed: %s", e)

        # Track timing
        duration = time.monotonic() - start_time
        embeddings_generation_duration.observe(duration)

        self.stats["total_runs"] += 1
        self.stats["total_embeddings"] += results["created"]
        self.stats["total_errors"] += results["errors"]
        self.last_run = now

        return results

    async def start(self) -> None:
        """Start the background embedding loop."""
        self.running = True
        logger.info("Embedding service starting (interval: %ds)", self.interval_seconds)

        # Wait for database to be ready
        await asyncio.sleep(20)

        while self.running:
            try:
                results = await self.run_once()
                if results["created"] > 0:
                    logger.info(
                        "Embedding run: %d processed, %d created, %d errors",
                        results["processed"], results["created"], results["errors"],
                    )
            except Exception as e:
                logger.error("Embedding service error: %s", e, exc_info=True)
                self.stats["total_errors"] += 1

            await asyncio.sleep(self.interval_seconds)

    async def stop(self) -> None:
        """Stop the background loop."""
        self.running = False
        logger.info("Embedding service stopped")

    def get_status(self) -> dict:
        """Return current service status."""
        return {
            "running": self.running,
            "last_run": self.last_run.isoformat() if self.last_run else None,
            "stats": self.stats,
            "active_configs": len(self.generators),
            "interval_seconds": self.interval_seconds,
        }


# ---------------------------------------------------------------------------
# Global instance management
# ---------------------------------------------------------------------------

_embedding_service: Optional[EmbeddingService] = None
_service_task: Optional[asyncio.Task] = None


async def start_embedding_service(interval_seconds: int = 60) -> None:
    """Start the global embedding service."""
    global _embedding_service, _service_task
    if _embedding_service is not None:
        logger.warning("Embedding service already running")
        return
    _embedding_service = EmbeddingService(interval_seconds=interval_seconds)
    _service_task = asyncio.create_task(_embedding_service.start())
    logger.info("Embedding service task created")


async def stop_embedding_service() -> None:
    """Stop the global embedding service."""
    global _embedding_service, _service_task
    if _embedding_service:
        await _embedding_service.stop()
    if _service_task and not _service_task.done():
        _service_task.cancel()
        try:
            await _service_task
        except asyncio.CancelledError:
            pass
    _embedding_service = None
    _service_task = None


def get_embedding_service() -> Optional[EmbeddingService]:
    """Get the current embedding service instance."""
    return _embedding_service
