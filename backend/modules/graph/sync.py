"""
PostgreSQL -> Neo4j Graph Sync Service

Background task that periodically syncs entities from PostgreSQL to Neo4j.
Pattern follows AlertEvaluator in backend/modules/server/alerts.py.

Sync priorities:
  P0: Tokens + Creators + CREATED
  P1: Wallets + HOLDS/BOUGHT/SOLD
  P2: Models + PREDICTED (alerts only)
  P3: Transfers + TRANSFERRED_TO
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Optional, Any

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write, run_query

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


class GraphSyncService:
    """Background service that syncs PostgreSQL data into Neo4j."""

    def __init__(self, interval_seconds: int = 300):
        self.interval_seconds = interval_seconds
        self.running = False
        self.first_run = True
        self.last_sync: Dict[str, Optional[datetime]] = {
            "tokens": None,
            "wallets": None,
            "models": None,
            "trades": None,
            "positions": None,
            "predictions": None,
            "transfers": None,
        }
        self.stats: Dict[str, int] = {
            "total_syncs": 0,
            "tokens_synced": 0,
            "wallets_synced": 0,
            "trades_synced": 0,
        }

    async def _ensure_constraints(self) -> None:
        """Create uniqueness constraints on first run."""
        constraints = [
            "CREATE CONSTRAINT token_address IF NOT EXISTS FOR (t:Token) REQUIRE t.address IS UNIQUE",
            "CREATE CONSTRAINT creator_address IF NOT EXISTS FOR (c:Creator) REQUIRE c.address IS UNIQUE",
            "CREATE CONSTRAINT wallet_alias IF NOT EXISTS FOR (w:Wallet) REQUIRE w.alias IS UNIQUE",
            "CREATE CONSTRAINT model_id IF NOT EXISTS FOR (m:Model) REQUIRE m.id IS UNIQUE",
        ]
        for cypher in constraints:
            try:
                await run_write(cypher)
            except Exception as e:
                if "already exists" in str(e).lower() or "equivalent" in str(e).lower():
                    logger.debug("Constraint already exists: %s", e)
                else:
                    logger.warning("Constraint creation failed: %s", e)
        logger.info("Neo4j constraints ensured")

    # ------------------------------------------------------------------
    # P0: Tokens + Creators + CREATED
    # ------------------------------------------------------------------
    async def _sync_tokens(self, since: Optional[str] = None) -> int:
        """Sync discovered_coins -> Token + Creator nodes + CREATED relationship."""
        where = ""
        args: list = []
        if since:
            where = "WHERE discovered_at > $1"
            args = [since]

        query = f"""
            SELECT token_address, name, symbol, trader_public_key,
                   initial_buy_sol, market_cap_sol, discovered_at
            FROM discovered_coins
            {where}
            ORDER BY discovered_at ASC
            LIMIT {BATCH_SIZE}
        """
        rows = await fetch(query, *args)
        if not rows:
            return 0

        for row in rows:
            mint = row["token_address"]
            creator = row["trader_public_key"]
            params = {
                "mint": mint,
                "name": row["name"] or "",
                "symbol": row["symbol"] or "",
                "creator": creator or "",
                "initial_buy_sol": float(row["initial_buy_sol"]) if row["initial_buy_sol"] else 0.0,
                "market_cap_sol": float(row["market_cap_sol"]) if row["market_cap_sol"] else 0.0,
                "discovered_at": row["discovered_at"].isoformat() if row["discovered_at"] else "",
            }
            cypher = """
                MERGE (t:Token {address: $mint})
                SET t.name = $name, t.symbol = $symbol,
                    t.market_cap_sol = $market_cap_sol, t.discovered_at = $discovered_at
                WITH t
                MERGE (c:Creator {address: $creator})
                MERGE (c)-[r:CREATED]->(t)
                SET r.initial_buy_sol = $initial_buy_sol, r.timestamp = $discovered_at
            """
            try:
                await run_write(cypher, params)
            except Exception as e:
                logger.warning("Token sync failed for %s: %s", mint[:12], e)

        if rows:
            self.last_sync["tokens"] = rows[-1]["discovered_at"]

        count = len(rows)
        self.stats["tokens_synced"] += count
        return count

    # ------------------------------------------------------------------
    # P1: Wallets + HOLDS/BOUGHT/SOLD
    # ------------------------------------------------------------------
    async def _sync_wallets(self) -> int:
        """Sync wallets table -> Wallet nodes."""
        rows = await fetch("""
            SELECT alias, address, type, status, virtual_sol_balance, real_sol_balance
            FROM wallets
        """)
        for row in rows:
            params = {
                "alias": row["alias"],
                "address": row["address"],
                "type": row["type"],
                "status": row["status"],
                "virtual_balance": float(row["virtual_sol_balance"]) if row["virtual_sol_balance"] else 0.0,
                "real_balance": float(row["real_sol_balance"]) if row["real_sol_balance"] else 0.0,
            }
            await run_write("""
                MERGE (w:Wallet {alias: $alias})
                SET w.address = $address, w.type = $type, w.status = $status,
                    w.virtual_balance = $virtual_balance, w.real_balance = $real_balance
            """, params)
        self.stats["wallets_synced"] += len(rows)
        return len(rows)

    async def _sync_positions(self, since: Optional[str] = None) -> int:
        """Sync positions -> HOLDS relationships."""
        where = ""
        args: list = []
        if since:
            where = "WHERE p.created_at > $1"
            args = [since]

        rows = await fetch(f"""
            SELECT w.alias, p.mint, p.status, p.tokens_held, p.entry_price, p.initial_sol_spent, p.created_at
            FROM positions p
            JOIN wallets w ON w.id = p.wallet_id
            {where}
            ORDER BY p.created_at ASC
            LIMIT {BATCH_SIZE}
        """, *args)

        for row in rows:
            params = {
                "alias": row["alias"],
                "mint": row["mint"],
                "status": row["status"],
                "tokens_held": float(row["tokens_held"]) if row["tokens_held"] else 0.0,
                "entry_price": float(row["entry_price"]) if row["entry_price"] else 0.0,
                "sol_spent": float(row["initial_sol_spent"]) if row["initial_sol_spent"] else 0.0,
            }
            await run_write("""
                MATCH (w:Wallet {alias: $alias})
                MERGE (t:Token {address: $mint})
                MERGE (w)-[r:HOLDS]->(t)
                SET r.tokens_held = $tokens_held, r.entry_price = $entry_price,
                    r.status = $status, r.sol_spent = $sol_spent
            """, params)

        if rows:
            self.last_sync["positions"] = rows[-1]["created_at"]
        return len(rows)

    async def _sync_trades(self, since: Optional[str] = None) -> int:
        """Sync trade_logs -> BOUGHT/SOLD relationships."""
        where = ""
        args: list = []
        if since:
            where = "WHERE t.created_at > $1"
            args = [since]

        rows = await fetch(f"""
            SELECT w.alias, t.action, t.mint, t.amount_sol, t.amount_tokens, t.created_at
            FROM trade_logs t
            JOIN wallets w ON w.id = t.wallet_id
            {where}
            ORDER BY t.created_at ASC
            LIMIT {BATCH_SIZE}
        """, *args)

        for row in rows:
            action = row["action"]
            rel_type = "BOUGHT" if action == "BUY" else "SOLD"
            params = {
                "alias": row["alias"],
                "mint": row["mint"],
                "amount_sol": float(row["amount_sol"]) if row["amount_sol"] else 0.0,
                "amount_tokens": float(row["amount_tokens"]) if row["amount_tokens"] else 0.0,
                "timestamp": row["created_at"].isoformat() if row["created_at"] else "",
            }
            # Use MERGE with timestamp to avoid duplicates on re-sync
            cypher = f"""
                MATCH (w:Wallet {{alias: $alias}})
                MERGE (t:Token {{address: $mint}})
                MERGE (w)-[r:{rel_type} {{timestamp: $timestamp}}]->(t)
                SET r.amount_sol = $amount_sol, r.amount_tokens = $amount_tokens
            """
            await run_write(cypher, params)

        if rows:
            self.last_sync["trades"] = rows[-1]["created_at"]
        self.stats["trades_synced"] += len(rows)
        return len(rows)

    # ------------------------------------------------------------------
    # P2: Models + PREDICTED (alerts only)
    # ------------------------------------------------------------------
    async def _sync_models(self) -> int:
        """Sync prediction_active_models -> Model nodes."""
        rows = await fetch("""
            SELECT id, custom_name, model_name, model_type, is_active,
                   training_accuracy, training_f1
            FROM prediction_active_models
        """)
        for row in rows:
            params = {
                "id": row["id"],
                "name": row["custom_name"] or row["model_name"] or f"model_{row['id']}",
                "model_type": row["model_type"] or "",
                "status": "active" if row["is_active"] else "paused",
                "accuracy": float(row["training_accuracy"]) if row.get("training_accuracy") else None,
                "f1_score": float(row["training_f1"]) if row.get("training_f1") else None,
            }
            await run_write("""
                MERGE (m:Model {id: $id})
                SET m.name = $name, m.model_type = $model_type, m.status = $status,
                    m.accuracy = $accuracy, m.f1_score = $f1_score
            """, params)
        return len(rows)

    async def _sync_predictions(self, since: Optional[str] = None) -> int:
        """Sync model_predictions (alerts only) -> PREDICTED relationships."""
        where = "WHERE mp.tag = 'alert'"
        args: list = []
        if since:
            where += " AND mp.created_at > $1"
            args = [since]

        rows = await fetch(f"""
            SELECT mp.active_model_id, mp.coin_id, mp.probability, mp.tag, mp.created_at
            FROM model_predictions mp
            {where}
            ORDER BY mp.created_at ASC
            LIMIT {BATCH_SIZE}
        """, *args)

        for row in rows:
            params = {
                "model_id": row["active_model_id"],
                "mint": row["coin_id"],
                "probability": float(row["probability"]) if row["probability"] else 0.0,
                "tag": row["tag"] or "",
                "timestamp": row["created_at"].isoformat() if row["created_at"] else "",
            }
            await run_write("""
                MATCH (m:Model {id: $model_id})
                MERGE (t:Token {address: $mint})
                MERGE (m)-[r:PREDICTED {timestamp: $timestamp}]->(t)
                SET r.probability = $probability, r.tag = $tag
            """, params)

        if rows:
            self.last_sync["predictions"] = rows[-1]["created_at"]
        return len(rows)

    # ------------------------------------------------------------------
    # P3: Transfers + TRANSFERRED_TO
    # ------------------------------------------------------------------
    async def _sync_transfers(self, since: Optional[str] = None) -> int:
        """Sync transfer_logs -> TRANSFERRED_TO relationships."""
        where = ""
        args: list = []
        if since:
            where = "WHERE tl.created_at > $1"
            args = [since]

        rows = await fetch(f"""
            SELECT w.alias, tl.to_address, tl.amount_sol, tl.created_at
            FROM transfer_logs tl
            JOIN wallets w ON w.id = tl.from_wallet_id
            {where}
            ORDER BY tl.created_at ASC
            LIMIT {BATCH_SIZE}
        """, *args)

        for row in rows:
            params = {
                "alias": row["alias"],
                "to_address": row["to_address"],
                "amount_sol": float(row["amount_sol"]) if row["amount_sol"] else 0.0,
                "timestamp": row["created_at"].isoformat() if row["created_at"] else "",
            }
            # Try to match existing Wallet node by address, otherwise create Address node
            await run_write("""
                MATCH (w:Wallet {alias: $alias})
                MERGE (target:Address {address: $to_address})
                MERGE (w)-[r:TRANSFERRED_TO {timestamp: $timestamp}]->(target)
                SET r.amount_sol = $amount_sol
            """, params)

        if rows:
            self.last_sync["transfers"] = rows[-1]["created_at"]
        return len(rows)

    # ------------------------------------------------------------------
    # Main sync loop
    # ------------------------------------------------------------------
    async def run_once(self) -> Dict[str, int]:
        """Execute a single sync round."""
        results: Dict[str, int] = {}
        try:
            if self.first_run:
                await self._ensure_constraints()

            since_tokens = None if self.first_run else self.last_sync.get("tokens")
            since_trades = None if self.first_run else self.last_sync.get("trades")
            since_positions = None if self.first_run else self.last_sync.get("positions")
            since_predictions = None if self.first_run else self.last_sync.get("predictions")
            since_transfers = None if self.first_run else self.last_sync.get("transfers")

            # P0: Tokens + Creators
            results["tokens"] = await self._sync_tokens(since_tokens)

            # P1: Wallets + Positions + Trades
            results["wallets"] = await self._sync_wallets()
            results["positions"] = await self._sync_positions(since_positions)
            results["trades"] = await self._sync_trades(since_trades)

            # P2: Models + Predictions
            results["models"] = await self._sync_models()
            results["predictions"] = await self._sync_predictions(since_predictions)

            # P3: Transfers
            results["transfers"] = await self._sync_transfers(since_transfers)

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
        return {
            "running": self.running,
            "first_run_done": not self.first_run,
            "last_sync_timestamps": {
                k: v.isoformat() if v else None
                for k, v in self.last_sync.items()
            },
            "stats": self.stats,
            "interval_seconds": self.interval_seconds,
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
