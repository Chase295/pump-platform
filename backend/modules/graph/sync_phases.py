"""
Phase Sync Module - Phase 2 of Neo4j Graph Extension.

Creates PhaseSnapshot and PriceCheckpoint nodes from aggregated coin_metrics data.

PhaseSnapshot: Aggregated metrics per token per phase (price, volume, trades, whales).
PriceCheckpoint: Token price/volume snapshots at fixed time intervals (1, 5, 10, 30, 60, 360, 1440 min).

Relationships:
  Token -[:PHASE_SUMMARY]-> PhaseSnapshot
  PhaseSnapshot -[:NEXT_PHASE]-> PhaseSnapshot
  Token -[:PRICE_AT]-> PriceCheckpoint
  PriceCheckpoint -[:NEXT_CHECKPOINT]-> PriceCheckpoint
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Dict

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


class PhaseSyncModule:
    """Syncs PhaseSnapshot and PriceCheckpoint nodes from aggregated coin_metrics."""

    def __init__(self):
        pass

    async def sync(self) -> Dict[str, int]:
        """Run phase snapshot and price checkpoint sync.

        Returns:
            Dict with 'phase_snapshots' and 'price_checkpoints' counts.
        """
        results: Dict[str, int] = {}
        results["phase_snapshots"] = await self._sync_phase_snapshots()
        results["price_checkpoints"] = await self._sync_price_checkpoints()
        return results

    # ------------------------------------------------------------------
    # PhaseSnapshot: Aggregated metrics per token per phase
    # ------------------------------------------------------------------
    async def _sync_phase_snapshots(self) -> int:
        """Aggregate coin_metrics per token per phase -> PhaseSnapshot nodes."""
        rows = await fetch("""
            SELECT
                cm.mint,
                cm.phase_id_at_time AS phase_id,
                rcp.name AS phase_name,
                (array_agg(cm.price_open ORDER BY cm.timestamp ASC))[1] AS price_open,
                (array_agg(cm.price_close ORDER BY cm.timestamp DESC))[1] AS price_close,
                MAX(cm.price_high) AS price_high,
                MIN(cm.price_low) AS price_low,
                SUM(cm.volume_sol) AS volume_total_sol,
                SUM(cm.buy_volume_sol) AS buy_volume_sol,
                SUM(cm.sell_volume_sol) AS sell_volume_sol,
                SUM(cm.num_buys) AS num_buys,
                SUM(cm.num_sells) AS num_sells,
                SUM(cm.num_buys + cm.num_sells) AS num_trades_total,
                MAX(cm.unique_wallets) AS unique_wallets_peak,
                SUM(cm.num_whale_buys) AS whale_buy_count,
                SUM(cm.num_whale_sells) AS whale_sell_count,
                SUM(COALESCE(cm.whale_buy_volume_sol, 0)) + SUM(COALESCE(cm.whale_sell_volume_sol, 0)) AS whale_volume_sol,
                MAX(COALESCE(cm.dev_sold_amount, 0)) AS dev_sold_amount,
                BOOL_OR(COALESCE(cm.dev_sold_amount, 0) > 0) AS dev_sold,
                MIN(cm.timestamp) AS started_at,
                MAX(cm.timestamp) AS ended_at,
                EXTRACT(EPOCH FROM MAX(cm.timestamp) - MIN(cm.timestamp)) AS duration_seconds,
                COUNT(*) AS num_snapshots
            FROM coin_metrics cm
            JOIN ref_coin_phases rcp ON rcp.id = cm.phase_id_at_time
            WHERE cm.phase_id_at_time IS NOT NULL
            GROUP BY cm.mint, cm.phase_id_at_time, rcp.name
            HAVING COUNT(*) >= 3
            ORDER BY cm.mint, cm.phase_id_at_time
        """)
        if not rows:
            return 0

        # Track unique mints for NEXT_PHASE chaining
        unique_mints = set()

        for row in rows:
            mint = row["mint"]
            phase_id = row["phase_id"]
            snapshot_id = f"{mint}_{phase_id}"
            unique_mints.add(mint)

            params = {
                "mint": mint,
                "snapshot_id": snapshot_id,
                "phase_id": phase_id,
                "phase_name": row["phase_name"] or "",
                "price_open": _to_float(row["price_open"]),
                "price_close": _to_float(row["price_close"]),
                "price_high": _to_float(row["price_high"]),
                "price_low": _to_float(row["price_low"]),
                "volume_total_sol": _to_float(row["volume_total_sol"]),
                "buy_volume_sol": _to_float(row["buy_volume_sol"]),
                "sell_volume_sol": _to_float(row["sell_volume_sol"]),
                "num_buys": int(row["num_buys"]) if row["num_buys"] else 0,
                "num_sells": int(row["num_sells"]) if row["num_sells"] else 0,
                "num_trades_total": int(row["num_trades_total"]) if row["num_trades_total"] else 0,
                "unique_wallets_peak": int(row["unique_wallets_peak"]) if row["unique_wallets_peak"] else 0,
                "whale_buy_count": int(row["whale_buy_count"]) if row["whale_buy_count"] else 0,
                "whale_sell_count": int(row["whale_sell_count"]) if row["whale_sell_count"] else 0,
                "whale_volume_sol": _to_float(row["whale_volume_sol"]),
                "dev_sold": bool(row["dev_sold"]) if row["dev_sold"] is not None else False,
                "dev_sold_amount": _to_float(row["dev_sold_amount"]),
                "started_at": _to_isoformat(row["started_at"]),
                "ended_at": _to_isoformat(row["ended_at"]),
                "duration_seconds": _to_float(row["duration_seconds"]),
                "num_snapshots": int(row["num_snapshots"]) if row["num_snapshots"] else 0,
            }

            cypher = """
                MATCH (t:Token {address: $mint})
                MERGE (ps:PhaseSnapshot {id: $snapshot_id})
                SET ps.mint = $mint,
                    ps.phase_id = $phase_id,
                    ps.phase_name = $phase_name,
                    ps.price_open = $price_open,
                    ps.price_close = $price_close,
                    ps.price_high = $price_high,
                    ps.price_low = $price_low,
                    ps.price_change_pct = CASE WHEN $price_open > 0 THEN (($price_close - $price_open) / $price_open) * 100 ELSE 0 END,
                    ps.volume_total_sol = $volume_total_sol,
                    ps.buy_volume_sol = $buy_volume_sol,
                    ps.sell_volume_sol = $sell_volume_sol,
                    ps.num_buys = $num_buys,
                    ps.num_sells = $num_sells,
                    ps.num_trades_total = $num_trades_total,
                    ps.unique_wallets = $unique_wallets_peak,
                    ps.whale_buy_count = $whale_buy_count,
                    ps.whale_sell_count = $whale_sell_count,
                    ps.whale_volume_sol = $whale_volume_sol,
                    ps.dev_sold = $dev_sold,
                    ps.dev_sold_amount = $dev_sold_amount,
                    ps.started_at = $started_at,
                    ps.ended_at = $ended_at,
                    ps.duration_seconds = $duration_seconds,
                    ps.num_snapshots = $num_snapshots
                MERGE (t)-[:PHASE_SUMMARY]->(ps)
            """
            try:
                await run_write(cypher, params)
            except Exception as e:
                logger.warning("PhaseSnapshot sync failed for %s phase %s: %s", mint[:12], phase_id, e)

        # Chain phases per token using NEXT_PHASE
        for mint in unique_mints:
            try:
                await run_write("""
                    MATCH (t:Token {address: $mint})-[:PHASE_SUMMARY]->(ps:PhaseSnapshot)
                    WITH ps ORDER BY ps.phase_id
                    WITH collect(ps) AS phases
                    UNWIND range(0, size(phases)-2) AS i
                    WITH phases[i] AS current, phases[i+1] AS next
                    MERGE (current)-[:NEXT_PHASE]->(next)
                """, {"mint": mint})
            except Exception as e:
                logger.warning("NEXT_PHASE chaining failed for %s: %s", mint[:12], e)

        count = len(rows)
        logger.info("PhaseSnapshot sync: %d snapshots for %d tokens", count, len(unique_mints))
        return count

    # ------------------------------------------------------------------
    # PriceCheckpoint: Price/volume at fixed time intervals
    # ------------------------------------------------------------------
    async def _sync_price_checkpoints(self) -> int:
        """Create PriceCheckpoint nodes at fixed time intervals after token discovery."""
        rows = await fetch("""
            WITH checkpoint_times AS (
                SELECT unnest(ARRAY[1, 5, 10, 30, 60, 360, 1440]) AS minutes_after
            ),
            token_start AS (
                SELECT token_address AS mint, discovered_at
                FROM discovered_coins
                WHERE discovered_at IS NOT NULL
            )
            SELECT
                ts.mint,
                ct.minutes_after,
                cm.price_close AS price_sol,
                cm.market_cap_close AS market_cap_sol,
                cm.phase_id_at_time AS phase_id,
                cm.timestamp AS recorded_at,
                agg.volume_since_start_sol,
                agg.num_buys_total,
                agg.num_sells_total
            FROM token_start ts
            CROSS JOIN checkpoint_times ct
            JOIN LATERAL (
                SELECT * FROM coin_metrics
                WHERE mint = ts.mint
                  AND timestamp >= ts.discovered_at + (ct.minutes_after || ' minutes')::interval
                ORDER BY timestamp ASC LIMIT 1
            ) cm ON true
            JOIN LATERAL (
                SELECT
                    COALESCE(SUM(volume_sol), 0) AS volume_since_start_sol,
                    COALESCE(SUM(num_buys), 0) AS num_buys_total,
                    COALESCE(SUM(num_sells), 0) AS num_sells_total
                FROM coin_metrics
                WHERE mint = ts.mint AND timestamp <= cm.timestamp
            ) agg ON true
            LIMIT 5000
        """)
        if not rows:
            return 0

        # Track unique mints for NEXT_CHECKPOINT chaining
        unique_mints = set()

        for row in rows:
            mint = row["mint"]
            minutes = int(row["minutes_after"])
            checkpoint_id = f"{mint}_{minutes}"
            unique_mints.add(mint)

            params = {
                "mint": mint,
                "checkpoint_id": checkpoint_id,
                "minutes": minutes,
                "price_sol": _to_float(row["price_sol"]),
                "market_cap_sol": _to_float(row["market_cap_sol"]),
                "volume_since_start_sol": _to_float(row["volume_since_start_sol"]),
                "num_buys_total": int(row["num_buys_total"]) if row["num_buys_total"] else 0,
                "num_sells_total": int(row["num_sells_total"]) if row["num_sells_total"] else 0,
                "phase_id": row["phase_id"],
                "recorded_at": _to_isoformat(row["recorded_at"]),
            }

            cypher = """
                MATCH (t:Token {address: $mint})
                MERGE (pc:PriceCheckpoint {id: $checkpoint_id})
                SET pc.mint = $mint,
                    pc.minutes = $minutes,
                    pc.price_sol = $price_sol,
                    pc.market_cap_sol = $market_cap_sol,
                    pc.volume_since_start_sol = $volume_since_start_sol,
                    pc.num_buys_total = $num_buys_total,
                    pc.num_sells_total = $num_sells_total,
                    pc.phase_id = $phase_id,
                    pc.recorded_at = $recorded_at
                MERGE (t)-[:PRICE_AT]->(pc)
            """
            try:
                await run_write(cypher, params)
            except Exception as e:
                logger.warning("PriceCheckpoint sync failed for %s at %d min: %s", mint[:12], minutes, e)

        # Chain checkpoints per token using NEXT_CHECKPOINT
        for mint in unique_mints:
            try:
                await run_write("""
                    MATCH (t:Token {address: $mint})-[:PRICE_AT]->(pc:PriceCheckpoint)
                    WITH pc ORDER BY pc.minutes
                    WITH collect(pc) AS checkpoints
                    UNWIND range(0, size(checkpoints)-2) AS i
                    WITH checkpoints[i] AS current, checkpoints[i+1] AS next
                    MERGE (current)-[:NEXT_CHECKPOINT]->(next)
                """, {"mint": mint})
            except Exception as e:
                logger.warning("NEXT_CHECKPOINT chaining failed for %s: %s", mint[:12], e)

        count = len(rows)
        logger.info("PriceCheckpoint sync: %d checkpoints for %d tokens", count, len(unique_mints))
        return count
