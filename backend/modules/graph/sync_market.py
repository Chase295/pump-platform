"""
Market Context Sync Module - Phase 4 (Marktkontext)

Creates SolPrice nodes from exchange_rates and links Token nodes
to their market context via DURING_MARKET relationships.

Graph schema:
  (:SolPrice {timestamp, usd, source})
  (:Token)-[:DURING_MARKET]->(:SolPrice)
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Optional

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write, run_query

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


class MarketSyncModule:
    """Syncs SOL price data and links tokens to their market context."""

    def __init__(self):
        self.last_sync_prices: Optional[datetime] = None

    async def sync(self) -> Dict[str, int]:
        """Run all market sync methods. Returns counts per entity."""
        results: Dict[str, int] = {}

        results["sol_prices"] = await self._sync_sol_prices(self.last_sync_prices)
        results["market_links"] = await self._link_tokens_to_market()

        return results

    # ------------------------------------------------------------------
    # SolPrice nodes from exchange_rates
    # ------------------------------------------------------------------
    async def _sync_sol_prices(self, since: Optional[datetime] = None) -> int:
        """Sync hourly average SOL prices from exchange_rates -> SolPrice nodes."""
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(days=7)

        rows = await fetch("""
            SELECT
                date_trunc('hour', created_at) AS hour_timestamp,
                AVG(sol_price_usd) AS usd,
                source
            FROM exchange_rates
            WHERE created_at > $1
            GROUP BY date_trunc('hour', created_at), source
            ORDER BY hour_timestamp ASC
        """, since)

        if not rows:
            return 0

        for row in rows:
            hour_ts = row["hour_timestamp"]
            params = {
                "hour_timestamp": hour_ts.isoformat() if hour_ts else "",
                "usd": float(row["usd"]) if row["usd"] else 0.0,
                "source": row["source"] or "",
            }
            cypher = """
                MERGE (sp:SolPrice {timestamp: $hour_timestamp})
                SET sp.usd = $usd, sp.source = $source
            """
            try:
                await run_write(cypher, params)
            except Exception as e:
                logger.warning("SolPrice sync failed for %s: %s", params["hour_timestamp"], e)

        if rows:
            last_row = rows[-1]
            if last_row["hour_timestamp"]:
                self.last_sync_prices = last_row["hour_timestamp"]

        count = len(rows)
        logger.debug("Synced %d SolPrice nodes", count)
        return count

    # ------------------------------------------------------------------
    # DURING_MARKET: Token -> SolPrice (hour of discovery)
    # ------------------------------------------------------------------
    async def _link_tokens_to_market(self) -> int:
        """Link Token nodes to the SolPrice node for the hour they were discovered."""
        try:
            await run_write("""
                MATCH (t:Token)
                WHERE t.discovered_at IS NOT NULL AND NOT (t)-[:DURING_MARKET]->(:SolPrice)
                WITH t LIMIT 5000
                WITH t, datetime(t.discovered_at) AS disc_time
                WITH t, datetime({year: disc_time.year, month: disc_time.month, day: disc_time.day, hour: disc_time.hour}) AS hour_rounded
                MATCH (sp:SolPrice)
                WHERE datetime(sp.timestamp) = hour_rounded
                MERGE (t)-[:DURING_MARKET]->(sp)
            """)
            records = await run_query("""
                MATCH ()-[r:DURING_MARKET]->()
                RETURN count(r) AS linked
            """)
            linked = records[0]["linked"] if records else 0
            if linked > 0:
                logger.debug("Linked %d tokens to market context", linked)
            return linked
        except Exception as e:
            logger.warning("Token-to-market linking failed: %s", e)
            return 0
