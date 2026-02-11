"""
PostgreSQL -> Neo4j Graph Sync Service (Orchestrator)

Background task that periodically syncs entities from PostgreSQL to Neo4j.
Delegates to specialized sync modules for each phase.

Sync priorities:
  Base: Tokens + Creators + Wallets + Trades + Models + Predictions + Transfers
  Phase 1: Events + Outcomes
  Phase 2: PhaseSnapshots + PriceCheckpoints
  Phase 3: MarketTraders + WalletClusters
  Phase 4: SolPrice + DURING_MARKET
  Phase 5: SocialProfile + ImageHash + Tokenomics
  Phase 6: Significant coin_transactions
"""

import asyncio
import logging
import time
from typing import Dict, Optional, Any

from backend.config import settings
from backend.modules.graph.constraints import ensure_all_constraints
from backend.modules.graph.sync_base import BaseSyncModule
from backend.modules.graph.sync_events import EventSyncModule
from backend.modules.graph.sync_phases import PhaseSyncModule
from backend.modules.graph.sync_wallets import WalletSyncModule
from backend.modules.graph.sync_market import MarketSyncModule
from backend.modules.graph.sync_enrichment import EnrichmentSyncModule
from backend.modules.graph.sync_transactions import TransactionSyncModule

logger = logging.getLogger(__name__)


class GraphSyncService:
    """Background service that syncs PostgreSQL data into Neo4j."""

    def __init__(self, interval_seconds: int = 300):
        self.interval_seconds = interval_seconds
        self.running = False
        self.first_run = True

        # Module instances
        self.base = BaseSyncModule()
        self.events = EventSyncModule()
        self.phases = PhaseSyncModule()
        self.wallets = WalletSyncModule()
        self.market = MarketSyncModule()
        self.enrichment = EnrichmentSyncModule()
        self.transactions = TransactionSyncModule()

        # Cluster detection runs on its own interval
        self._last_cluster_run: float = 0

        # Aggregate stats
        self.stats: Dict[str, int] = {
            "total_syncs": 0,
            "tokens_synced": 0,
            "wallets_synced": 0,
            "trades_synced": 0,
            "events_detected": 0,
            "outcomes_calculated": 0,
            "phase_snapshots_created": 0,
            "price_checkpoints_created": 0,
            "market_traders_synced": 0,
            "wallet_clusters_detected": 0,
        }

    async def run_once(self) -> Dict[str, int]:
        """Execute a single sync round."""
        results: Dict[str, int] = {}
        try:
            if self.first_run:
                await ensure_all_constraints()

            # Base sync (always runs)
            base_results = await self.base.sync(self.first_run)
            results.update(base_results)
            self.stats["tokens_synced"] += base_results.get("tokens", 0)
            self.stats["wallets_synced"] += base_results.get("wallets", 0)
            self.stats["trades_synced"] += base_results.get("trades", 0)

            # Phase 1: Events
            if settings.NEO4J_SYNC_EVENTS_ENABLED:
                try:
                    event_results = await self.events.sync()
                    results.update({f"events_{k}": v for k, v in event_results.items()})
                    self.stats["events_detected"] += event_results.get("events", 0)
                    self.stats["outcomes_calculated"] += event_results.get("outcomes", 0)
                except Exception as e:
                    logger.error("Event sync failed: %s", e, exc_info=True)

            # Phase 2: Phases
            if settings.NEO4J_SYNC_PHASES_ENABLED:
                try:
                    phase_results = await self.phases.sync()
                    results.update(phase_results)
                    self.stats["phase_snapshots_created"] += phase_results.get("phase_snapshots", 0)
                    self.stats["price_checkpoints_created"] += phase_results.get("price_checkpoints", 0)
                except Exception as e:
                    logger.error("Phase sync failed: %s", e, exc_info=True)

            # Phase 3: Wallets (MarketTrader, trades, creators, funded_by)
            if settings.NEO4J_SYNC_WALLETS_ENABLED:
                try:
                    wallet_results = await self.wallets.sync()
                    results.update({f"wallet_{k}": v for k, v in wallet_results.items()})
                    self.stats["market_traders_synced"] += wallet_results.get("market_traders", 0)

                    # Cluster detection on its own interval
                    now = time.monotonic()
                    cluster_interval = settings.NEO4J_SYNC_CLUSTER_INTERVAL_SECONDS
                    if now - self._last_cluster_run >= cluster_interval:
                        cluster_results = await self.wallets.sync_clusters()
                        results.update({f"cluster_{k}": v for k, v in cluster_results.items()})
                        self.stats["wallet_clusters_detected"] += cluster_results.get("clusters", 0)
                        self._last_cluster_run = now
                except Exception as e:
                    logger.error("Wallet sync failed: %s", e, exc_info=True)

            # Phase 4: Market context
            if settings.NEO4J_SYNC_MARKET_ENABLED:
                try:
                    market_results = await self.market.sync()
                    results.update({f"market_{k}": v for k, v in market_results.items()})
                except Exception as e:
                    logger.error("Market sync failed: %s", e, exc_info=True)

            # Phase 5: Enrichment
            if settings.NEO4J_SYNC_ENRICHMENT_ENABLED:
                try:
                    enrichment_results = await self.enrichment.sync()
                    results.update({f"enrichment_{k}": v for k, v in enrichment_results.items()})
                except Exception as e:
                    logger.error("Enrichment sync failed: %s", e, exc_info=True)

            # Phase 6: Transactions (depends on MarketTrader nodes from Phase 3)
            if settings.NEO4J_SYNC_TRANSACTIONS_ENABLED:
                try:
                    tx_results = await self.transactions.sync()
                    results.update(tx_results)
                except Exception as e:
                    logger.error("Transaction sync failed: %s", e, exc_info=True)

            self.first_run = False
            self.stats["total_syncs"] += 1

            total = sum(results.values())
            if total > 0:
                logger.info("Graph sync completed: %s (total: %d entities)", results, total)
            else:
                logger.debug("Graph sync: no new data")

        except Exception as e:
            logger.error("Graph sync error: %s", e, exc_info=True)

        return results

    async def start(self) -> None:
        """Start the sync service as background loop."""
        self.running = True
        logger.info("Graph sync service started (interval: %ds)", self.interval_seconds)

        # Wait for DB + Neo4j to be ready
        await asyncio.sleep(10)

        while self.running:
            try:
                await self.run_once()
            except Exception as e:
                logger.error("Graph sync loop error: %s", e, exc_info=True)
            await asyncio.sleep(self.interval_seconds)

    async def stop(self) -> None:
        """Stop the sync service."""
        self.running = False
        logger.info("Graph sync service stopped")

    def get_status(self) -> Dict[str, Any]:
        """Return current sync status."""
        # Collect last_sync from all modules
        last_sync = dict(self.base.last_sync)
        last_sync["events"] = self.events.last_sync_events
        last_sync["outcomes"] = self.events.last_sync_outcomes
        last_sync["social_profiles"] = self.enrichment.last_sync_social
        last_sync["image_hashes"] = self.enrichment.last_sync_images
        last_sync["tokenomics"] = self.enrichment.last_sync_tokenomics
        last_sync["market_traders"] = self.wallets.last_sync_traders
        last_sync["sol_prices"] = self.market.last_sync_prices
        last_sync["transactions"] = self.transactions.last_sync

        return {
            "running": self.running,
            "first_run_done": not self.first_run,
            "last_sync_timestamps": {
                k: v.isoformat() if v else None
                for k, v in last_sync.items()
            },
            "stats": self.stats,
            "interval_seconds": self.interval_seconds,
            "feature_flags": {
                "events": settings.NEO4J_SYNC_EVENTS_ENABLED,
                "phases": settings.NEO4J_SYNC_PHASES_ENABLED,
                "wallets": settings.NEO4J_SYNC_WALLETS_ENABLED,
                "market": settings.NEO4J_SYNC_MARKET_ENABLED,
                "enrichment": settings.NEO4J_SYNC_ENRICHMENT_ENABLED,
                "transactions": settings.NEO4J_SYNC_TRANSACTIONS_ENABLED,
            },
        }


# Global instance
_sync_service: Optional[GraphSyncService] = None


async def start_graph_sync(interval_seconds: int = 300) -> None:
    """Start the graph sync background task."""
    global _sync_service
    if _sync_service is None:
        _sync_service = GraphSyncService(interval_seconds=interval_seconds)
        asyncio.create_task(_sync_service.start())
        logger.info("Graph sync background task started")
    else:
        logger.warning("Graph sync already running")


async def stop_graph_sync() -> None:
    """Stop the graph sync background task."""
    global _sync_service
    if _sync_service:
        await _sync_service.stop()
        _sync_service = None


def get_graph_sync() -> Optional[GraphSyncService]:
    """Get the current sync service instance."""
    return _sync_service
