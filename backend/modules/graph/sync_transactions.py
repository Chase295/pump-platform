"""
Transaction Sync Module - Phase 6 (Market Trades) of Neo4j Graph Extension.

Syncs significant individual coin_transactions to Neo4j as MarketTrader nodes
with MARKET_BOUGHT/MARKET_SOLD edges including individual trade timestamps.

Only significant trades are synced: whale trades or trades >= 0.5 SOL.

Relationships:
  MarketTrader -[:MARKET_BOUGHT]-> Token
  MarketTrader -[:MARKET_SOLD]-> Token
"""

import logging
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, Optional

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


def _to_float(val) -> float:
    """Convert Decimal/int/None to float safely."""
    if val is None:
        return 0.0
    if isinstance(val, Decimal):
        return float(val)
    return float(val)


def _to_isoformat(val) -> str:
    """Convert datetime to ISO format string safely."""
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.isoformat()
    return str(val)


class TransactionSyncModule:
    """Syncs significant coin_transactions as MarketTrader + MARKET_BOUGHT/MARKET_SOLD edges."""

    def __init__(self):
        self.last_sync: Optional[datetime] = None

    async def sync(self) -> Dict[str, int]:
        """Run transaction sync.

        Returns:
            Dict with 'transactions' count.
        """
        results: Dict[str, int] = {}
        results["transactions"] = await self._sync_significant_trades(self.last_sync)
        return results

    # ------------------------------------------------------------------
    # Market Trades: Whale trades + trades >= 0.5 SOL
    # ------------------------------------------------------------------
    async def _sync_significant_trades(self, since: Optional[datetime] = None) -> int:
        """Sync significant coin_transactions -> MarketTrader + MARKET_BOUGHT/MARKET_SOLD edges."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        rows = await fetch("""
            SELECT
                ct.mint,
                ct.timestamp,
                ct.trader_public_key,
                ct.sol_amount,
                ct.tx_type,
                ct.price_sol,
                ct.is_whale,
                ct.phase_id_at_time,
                (ct.trader_public_key = dc.trader_public_key) AS is_creator_trade
            FROM coin_transactions ct
            JOIN discovered_coins dc ON dc.token_address = ct.mint
            WHERE ct.timestamp > $1
              AND (ct.is_whale = true OR ct.sol_amount >= 0.5)
            ORDER BY ct.timestamp ASC
            LIMIT 5000
        """, since)

        if not rows:
            return 0

        for row in rows:
            mint = row["mint"]
            trader = row["trader_public_key"]
            timestamp = _to_isoformat(row["timestamp"])

            params = {
                "trader_public_key": trader,
                "timestamp": timestamp,
                "is_whale": bool(row["is_whale"]) if row["is_whale"] is not None else False,
                "mint": mint,
                "tx_type": row["tx_type"] or "",
                "sol_amount": _to_float(row["sol_amount"]),
                "price_sol": _to_float(row["price_sol"]),
                "phase_id": row["phase_id_at_time"],
                "is_creator_trade": bool(row["is_creator_trade"]) if row["is_creator_trade"] is not None else False,
            }

            cypher = """
                MERGE (mt:MarketTrader {address: $trader_public_key})
                SET mt.last_seen = $timestamp,
                    mt.is_whale = CASE WHEN $is_whale THEN true ELSE mt.is_whale END
                WITH mt
                MATCH (t:Token {address: $mint})
                FOREACH (_ IN CASE WHEN $tx_type = 'buy' THEN [1] ELSE [] END |
                    MERGE (mt)-[r:MARKET_BOUGHT {timestamp: $timestamp}]->(t)
                    SET r.sol_amount = $sol_amount, r.price_sol = $price_sol,
                        r.is_whale = $is_whale, r.phase_id = $phase_id,
                        r.is_creator_trade = $is_creator_trade
                )
                FOREACH (_ IN CASE WHEN $tx_type = 'sell' THEN [1] ELSE [] END |
                    MERGE (mt)-[r:MARKET_SOLD {timestamp: $timestamp}]->(t)
                    SET r.sol_amount = $sol_amount, r.price_sol = $price_sol,
                        r.is_whale = $is_whale, r.phase_id = $phase_id,
                        r.is_creator_trade = $is_creator_trade
                )
            """
            try:
                await run_write(cypher, params)
            except Exception as e:
                logger.warning("MarketTrade sync failed for %s trader %s: %s", mint[:12], trader[:12], e)

        # Update last_sync from the last row's timestamp
        if rows:
            self.last_sync = rows[-1]["timestamp"]

        count = len(rows)
        logger.info("MarketTrade sync: %d significant trades synced", count)
        return count
