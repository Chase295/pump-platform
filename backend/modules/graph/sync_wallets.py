"""
Wallet Intelligence Sync Module (Phase 3)

Syncs market traders, their trades, creator links, funding relationships,
and timing-based wallet clusters from PostgreSQL into Neo4j.

Graph nodes:
  - MarketTrader  (address, volume stats, whale flag)
  - WalletCluster (cluster_id, risk_score, detection_method)

Graph relationships:
  - MARKET_BOUGHT / MARKET_SOLD  (MarketTrader -> Token)
  - IS_CREATOR                   (MarketTrader -> Token)
  - BELONGS_TO                   (MarketTrader -> WalletCluster)
  - TRADES_WITH                  (MarketTrader -> MarketTrader)
  - FUNDED_BY                    (Wallet -> Wallet)
"""

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, Optional

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write, run_query

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


def _to_float(val) -> float:
    """Convert Decimal / int / None to float."""
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


def _to_iso(val) -> str:
    """Convert datetime to ISO string, or empty string if None."""
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


class WalletSyncModule:
    """Phase 3 - Wallet intelligence: traders, clusters, funding links."""

    def __init__(self):
        self.last_sync_traders: Optional[datetime] = None
        self.last_cluster_sync: Optional[datetime] = None

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------

    async def sync(self) -> Dict[str, int]:
        """Main sync: traders, trades, creator links, funding.

        Called on the normal sync interval (e.g. every 5 min).
        """
        results: Dict[str, int] = {}

        since = self.last_sync_traders

        results["market_traders"] = await self._sync_market_traders(since)
        results["market_trades"] = await self._sync_market_trades(since)
        results["creator_links"] = await self._link_creators()
        results["funded_by"] = await self._derive_funded_by()

        self.last_sync_traders = datetime.now(timezone.utc)

        total = sum(results.values())
        if total > 0:
            logger.info("WalletSync completed: %s (total: %d)", results, total)
        else:
            logger.debug("WalletSync: no new data")

        return results

    async def sync_clusters(self) -> Dict[str, int]:
        """Cluster detection sync - runs on a longer interval (30 min)."""
        results: Dict[str, int] = {}

        since = self.last_cluster_sync
        results["clusters"] = await self._detect_clusters(since)

        self.last_cluster_sync = datetime.now(timezone.utc)

        total = sum(results.values())
        if total > 0:
            logger.info("ClusterSync completed: %s (total: %d)", results, total)
        else:
            logger.debug("ClusterSync: no new data")

        return results

    # ------------------------------------------------------------------
    # 1. Market Traders
    # ------------------------------------------------------------------

    async def _sync_market_traders(self, since: Optional[datetime] = None) -> int:
        """Aggregate significant traders from coin_transactions into MarketTrader nodes."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch(
            """
            SELECT
                trader_public_key AS address,
                COUNT(*) FILTER (WHERE tx_type = 'buy') AS total_buys,
                COUNT(*) FILTER (WHERE tx_type = 'sell') AS total_sells,
                SUM(sol_amount) AS total_volume_sol,
                COUNT(DISTINCT mint) AS unique_tokens,
                MIN(timestamp) AS first_seen,
                MAX(timestamp) AS last_seen,
                BOOL_OR(is_whale) AS is_whale,
                AVG(sol_amount) AS avg_trade_size_sol
            FROM coin_transactions
            WHERE timestamp > $1
            GROUP BY trader_public_key
            HAVING COUNT(*) >= 5 OR SUM(sol_amount) >= 1.0
            ORDER BY total_volume_sol DESC
            LIMIT 5000
            """,
            since,
        )
        if not rows:
            return 0

        count = 0
        for row in rows:
            params = {
                "address": row["address"],
                "total_buys": int(row["total_buys"] or 0),
                "total_sells": int(row["total_sells"] or 0),
                "total_volume_sol": _to_float(row["total_volume_sol"]),
                "unique_tokens": int(row["unique_tokens"] or 0),
                "first_seen": _to_iso(row["first_seen"]),
                "last_seen": _to_iso(row["last_seen"]),
                "is_whale": bool(row["is_whale"]) if row["is_whale"] is not None else False,
                "avg_trade_size_sol": _to_float(row["avg_trade_size_sol"]),
            }
            cypher = """
                MERGE (mt:MarketTrader {address: $address})
                SET mt.total_buys = $total_buys, mt.total_sells = $total_sells,
                    mt.total_volume_sol = $total_volume_sol, mt.unique_tokens = $unique_tokens,
                    mt.first_seen = $first_seen, mt.last_seen = $last_seen,
                    mt.is_whale = $is_whale, mt.avg_trade_size_sol = $avg_trade_size_sol
            """
            try:
                await run_write(cypher, params)
                count += 1
            except Exception as e:
                logger.warning("MarketTrader sync failed for %s: %s", row["address"][:12], e)

        logger.debug("Synced %d market traders", count)
        return count

    # ------------------------------------------------------------------
    # 2. Market Trades (MARKET_BOUGHT / MARKET_SOLD)
    # ------------------------------------------------------------------

    async def _sync_market_trades(self, since: Optional[datetime] = None) -> int:
        """Sync which tokens each trader bought/sold as relationships."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch(
            """
            SELECT
                trader_public_key, mint, tx_type,
                COUNT(*) AS trade_count,
                SUM(sol_amount) AS total_sol,
                MIN(timestamp) AS first_trade,
                MAX(timestamp) AS last_trade
            FROM coin_transactions
            WHERE timestamp > $1
            GROUP BY trader_public_key, mint, tx_type
            HAVING COUNT(*) >= 1
            LIMIT 5000
            """,
            since,
        )
        if not rows:
            return 0

        count = 0
        for row in rows:
            tx_type = row["tx_type"]
            rel_type = "MARKET_BOUGHT" if tx_type == "buy" else "MARKET_SOLD"

            params = {
                "trader_address": row["trader_public_key"],
                "mint": row["mint"],
                "trade_count": int(row["trade_count"] or 0),
                "total_sol": _to_float(row["total_sol"]),
                "first_trade": _to_iso(row["first_trade"]),
                "last_trade": _to_iso(row["last_trade"]),
            }

            cypher = f"""
                MERGE (mt:MarketTrader {{address: $trader_address}})
                WITH mt
                MATCH (t:Token {{address: $mint}})
                MERGE (mt)-[r:{rel_type} {{mint: $mint}}]->(t)
                SET r.trade_count = $trade_count, r.total_sol = $total_sol,
                    r.first_trade = $first_trade, r.last_trade = $last_trade
            """
            try:
                await run_write(cypher, params)
                count += 1
            except Exception as e:
                logger.warning(
                    "MarketTrade sync failed for %s -> %s: %s",
                    row["trader_public_key"][:12],
                    row["mint"][:12],
                    e,
                )

        logger.debug("Synced %d market trade relationships", count)
        return count

    # ------------------------------------------------------------------
    # 3. Link Creators (MarketTrader -> IS_CREATOR -> Token)
    # ------------------------------------------------------------------

    async def _link_creators(self) -> int:
        """Link MarketTrader nodes that are also Creators to their tokens."""
        try:
            await run_write("""
                MATCH (c:Creator)
                WITH c
                MATCH (mt:MarketTrader {address: c.address})
                WITH mt, c
                MATCH (c)-[:CREATED]->(t:Token)
                MERGE (mt)-[:IS_CREATOR]->(t)
            """)
            # Count the links we just created
            records = await run_query("""
                MATCH (mt:MarketTrader)-[:IS_CREATOR]->(t:Token)
                RETURN count(*) AS linked
            """)
            linked = records[0]["linked"] if records else 0
            if linked > 0:
                logger.debug("Linked %d creator-trader relationships", linked)
            return linked
        except Exception as e:
            logger.warning("Link creators failed: %s", e)
            return 0

    # ------------------------------------------------------------------
    # 4. Detect Clusters (timing-based)
    # ------------------------------------------------------------------

    async def _detect_clusters(self, since: Optional[datetime] = None) -> int:
        """Detect wallet clusters based on synchronized buy timing."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch(
            """
            WITH buy_pairs AS (
                SELECT
                    a.trader_public_key AS wallet_a,
                    b.trader_public_key AS wallet_b,
                    a.mint,
                    ABS(EXTRACT(EPOCH FROM a.timestamp - b.timestamp)) AS time_diff_sec
                FROM coin_transactions a
                JOIN coin_transactions b
                    ON a.mint = b.mint
                    AND a.trader_public_key < b.trader_public_key
                    AND a.tx_type = 'buy' AND b.tx_type = 'buy'
                    AND ABS(EXTRACT(EPOCH FROM a.timestamp - b.timestamp)) <= 60
                WHERE a.timestamp > $1
            )
            SELECT
                wallet_a, wallet_b,
                COUNT(DISTINCT mint) AS shared_tokens,
                AVG(time_diff_sec) AS avg_time_diff
            FROM buy_pairs
            GROUP BY wallet_a, wallet_b
            HAVING COUNT(DISTINCT mint) >= 3
            ORDER BY shared_tokens DESC
            LIMIT 500
            """,
            since,
        )
        if not rows:
            return 0

        count = 0
        for row in rows:
            wallet_a = row["wallet_a"]
            wallet_b = row["wallet_b"]
            shared_tokens = int(row["shared_tokens"] or 0)
            avg_time_diff = _to_float(row["avg_time_diff"])

            # Deterministic cluster ID from sorted pair
            sorted_a = min(wallet_a, wallet_b)
            sorted_b = max(wallet_a, wallet_b)
            cluster_id = f"timing_{sorted_a[:8]}_{sorted_b[:8]}"

            # Simple risk heuristic: more shared tokens = higher risk
            risk_score = min(1.0, shared_tokens / 10.0)

            # Create cluster + BELONGS_TO
            cluster_params = {
                "cluster_id": cluster_id,
                "risk_score": risk_score,
                "shared_tokens": shared_tokens,
                "avg_time_diff": avg_time_diff,
                "wallet_a": wallet_a,
                "wallet_b": wallet_b,
            }
            cluster_cypher = """
                MERGE (wc:WalletCluster {cluster_id: $cluster_id})
                SET wc.size = 2, wc.detection_method = 'timing',
                    wc.risk_score = $risk_score, wc.detected_at = datetime(),
                    wc.shared_tokens = $shared_tokens, wc.avg_time_diff_sec = $avg_time_diff
                WITH wc
                MERGE (a:MarketTrader {address: $wallet_a})
                MERGE (b:MarketTrader {address: $wallet_b})
                MERGE (a)-[:BELONGS_TO]->(wc)
                MERGE (b)-[:BELONGS_TO]->(wc)
            """
            try:
                await run_write(cluster_cypher, cluster_params)
            except Exception as e:
                logger.warning(
                    "Cluster creation failed for %s: %s", cluster_id, e
                )
                continue

            # TRADES_WITH between the pair
            trades_with_params = {
                "wallet_a": wallet_a,
                "wallet_b": wallet_b,
                "shared_tokens": shared_tokens,
                "avg_time_diff": avg_time_diff,
            }
            trades_with_cypher = """
                MERGE (a:MarketTrader {address: $wallet_a})
                MERGE (b:MarketTrader {address: $wallet_b})
                MERGE (a)-[r:TRADES_WITH]->(b)
                SET r.shared_tokens = $shared_tokens, r.avg_time_diff_sec = $avg_time_diff,
                    r.detection_method = 'timing', r.detected_at = datetime()
            """
            try:
                await run_write(trades_with_cypher, trades_with_params)
                count += 1
            except Exception as e:
                logger.warning(
                    "TRADES_WITH creation failed for %s <-> %s: %s",
                    wallet_a[:12],
                    wallet_b[:12],
                    e,
                )

        logger.debug("Detected %d wallet clusters", count)
        return count

    # ------------------------------------------------------------------
    # 5. Derive FUNDED_BY (Wallet -> Wallet via transfers)
    # ------------------------------------------------------------------

    async def _derive_funded_by(self) -> int:
        """Link wallets that funded each other via TRANSFERRED_TO relationships."""
        try:
            await run_write("""
                MATCH (w:Wallet)-[t:TRANSFERRED_TO]->(a:Address)
                WITH a.address AS target_address, w, t
                MATCH (w2:Wallet {address: target_address})
                MERGE (w2)-[f:FUNDED_BY]->(w)
                SET f.amount_sol = t.amount_sol, f.timestamp = t.timestamp
            """)
            records = await run_query("""
                MATCH ()-[f:FUNDED_BY]->()
                RETURN count(f) AS linked
            """)
            linked = records[0]["linked"] if records else 0
            if linked > 0:
                logger.debug("Derived %d FUNDED_BY relationships", linked)
            return linked
        except Exception as e:
            logger.warning("Derive funded_by failed: %s", e)
            return 0
