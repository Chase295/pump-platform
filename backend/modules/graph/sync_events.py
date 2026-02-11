"""
Event Detection & Sync Module - Phase 1 of Neo4j Graph Extension

Detects significant events from PostgreSQL data (coin_metrics, coin_transactions)
and syncs them to Neo4j as Event nodes with HAD_EVENT relationships to Tokens.

Event types:
  - volume_spike: Volume exceeds rolling average by configurable multiplier
  - whale_entry: Large buy by a whale wallet
  - dev_sold: Creator wallet sold their own token
  - price_ath: New all-time high price
  - mass_sell: Abnormally high sell count vs buy count
  - liquidity_drop: Sudden drop in virtual SOL reserves

After detection, events are chained (FOLLOWED_BY) per token and outcomes
(RESULTED_IN -> Outcome) are calculated after a configurable delay.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Set

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write, run_query
from backend.config import settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


def _classify_outcome(price_change_pct: float, max_gain_pct: float, max_loss_pct: float) -> str:
    """Classify a price outcome into a human-readable category."""
    if max_gain_pct > 50:
        return "pump"
    if max_loss_pct < -80:
        return "rug"
    if max_loss_pct < -50:
        return "dump"
    if abs(price_change_pct) < 10:
        return "sideways"
    if price_change_pct < -30:
        return "slow_bleed"
    return "mixed"


class EventSyncModule:
    """Detects significant events from PostgreSQL and syncs them to Neo4j."""

    def __init__(self):
        self.last_sync_events: Optional[datetime] = None
        self.last_sync_outcomes: Optional[datetime] = None

    async def sync(self) -> Dict[str, int]:
        """Run full event sync cycle: detect, chain, evaluate outcomes.

        Returns:
            Dict with counts per event type plus chained/outcomes counts.
        """
        results: Dict[str, int] = {}

        # Detect events from PostgreSQL and write to Neo4j
        event_counts, affected_mints = await self._detect_events()
        results.update(event_counts)

        # Chain events per token (FOLLOWED_BY relationships)
        results["chained"] = await self._chain_events(affected_mints)

        # Calculate outcomes for events old enough
        results["outcomes"] = await self._calculate_outcomes()

        total = sum(results.values())
        if total > 0:
            logger.info("Event sync completed: %s (total: %d)", results, total)
        else:
            logger.debug("Event sync: no new events")

        return results

    # ------------------------------------------------------------------
    # Event detection orchestrator
    # ------------------------------------------------------------------

    async def _detect_events(self) -> tuple[Dict[str, int], Set[str]]:
        """Run all event detectors. Returns (counts_dict, affected_mints_set)."""
        since = self.last_sync_events
        if since is None:
            since = datetime.now(timezone.utc) - timedelta(hours=24)

        counts: Dict[str, int] = {}
        all_mints: Set[str] = set()
        latest_ts: Optional[datetime] = None

        detectors = [
            ("volume_spike", self._detect_volume_spikes),
            ("whale_entry", self._detect_whale_entries),
            ("dev_sold", self._detect_dev_sold),
            ("price_ath", self._detect_price_ath),
            ("mass_sell", self._detect_mass_sell),
            ("liquidity_drop", self._detect_liquidity_drop),
        ]

        for name, detector in detectors:
            try:
                count, mints, last_ts = await detector(since)
                counts[name] = count
                all_mints.update(mints)
                if last_ts is not None:
                    if latest_ts is None or last_ts > latest_ts:
                        latest_ts = last_ts
            except Exception as e:
                logger.error("Event detector %s failed: %s", name, e, exc_info=True)
                counts[name] = 0

        if latest_ts is not None:
            self.last_sync_events = latest_ts

        return counts, all_mints

    # ------------------------------------------------------------------
    # Individual event detectors
    # ------------------------------------------------------------------

    async def _detect_volume_spikes(self, since: datetime) -> tuple[int, Set[str], Optional[datetime]]:
        """Detect volume spikes where current volume exceeds rolling average."""
        multiplier = getattr(settings, "NEO4J_EVENT_VOLUME_SPIKE_MULTIPLIER", 5.0)

        rows = await fetch("""
            SELECT
                cm.mint, cm.timestamp, cm.volume_sol AS current_volume,
                AVG(prev.volume_sol) AS avg_volume,
                cm.volume_sol / NULLIF(AVG(prev.volume_sol), 0) AS multiplier,
                cm.price_close, cm.phase_id_at_time
            FROM coin_metrics cm
            JOIN LATERAL (
                SELECT volume_sol FROM coin_metrics prev
                WHERE prev.mint = cm.mint AND prev.timestamp < cm.timestamp
                ORDER BY prev.timestamp DESC LIMIT 5
            ) prev ON true
            WHERE cm.timestamp > $1
            GROUP BY cm.mint, cm.timestamp, cm.volume_sol, cm.price_close, cm.phase_id_at_time
            HAVING cm.volume_sol > AVG(prev.volume_sol) * $2
            ORDER BY cm.timestamp ASC LIMIT 1000
        """, since, multiplier)

        mints: Set[str] = set()
        last_ts: Optional[datetime] = None
        count = 0

        for row in rows:
            mint = row["mint"]
            ts = row["timestamp"]
            actual_multiplier = float(row["multiplier"]) if row["multiplier"] else 0.0

            if actual_multiplier > 20:
                severity = "critical"
            elif actual_multiplier > 10:
                severity = "high"
            elif actual_multiplier > 5:
                severity = "medium"
            else:
                severity = "low"

            event_id = f"{mint}_volume_spike_{ts.isoformat()}"
            params = {
                "event_id": event_id,
                "type": "volume_spike",
                "severity": severity,
                "mint": mint,
                "timestamp": ts.isoformat(),
                "value": float(row["current_volume"]) if row["current_volume"] else 0.0,
                "threshold": float(row["avg_volume"]) * multiplier if row["avg_volume"] else 0.0,
                "multiplier": actual_multiplier,
                "phase_id": row["phase_id_at_time"],
                "price_at_event": float(row["price_close"]) if row["price_close"] else 0.0,
                "avg_volume": float(row["avg_volume"]) if row["avg_volume"] else 0.0,
            }

            try:
                await run_write("""
                    MERGE (e:Event {id: $event_id})
                    SET e.type = $type, e.severity = $severity, e.mint = $mint,
                        e.timestamp = $timestamp, e.value = $value, e.threshold = $threshold,
                        e.multiplier = $multiplier, e.phase_id = $phase_id, e.price_at_event = $price_at_event,
                        e.avg_volume = $avg_volume
                    WITH e
                    MATCH (t:Token {address: $mint})
                    MERGE (t)-[:HAD_EVENT]->(e)
                """, params)
                mints.add(mint)
                count += 1
                last_ts = ts
            except Exception as e:
                logger.warning("Failed to write volume_spike event for %s: %s", mint[:12], e)

        return count, mints, last_ts

    async def _detect_whale_entries(self, since: datetime) -> tuple[int, Set[str], Optional[datetime]]:
        """Detect large whale buy transactions."""
        rows = await fetch("""
            SELECT mint, timestamp, trader_public_key, sol_amount, price_sol, phase_id_at_time
            FROM coin_transactions
            WHERE is_whale = true AND tx_type = 'buy' AND timestamp > $1
            ORDER BY timestamp ASC LIMIT 1000
        """, since)

        mints: Set[str] = set()
        last_ts: Optional[datetime] = None
        count = 0

        for row in rows:
            mint = row["mint"]
            ts = row["timestamp"]
            sol_amount = float(row["sol_amount"]) if row["sol_amount"] else 0.0

            if sol_amount > 10:
                severity = "critical"
            elif sol_amount > 5:
                severity = "high"
            elif sol_amount > 2:
                severity = "medium"
            else:
                severity = "low"

            event_id = f"{mint}_whale_entry_{ts.isoformat()}"
            params = {
                "event_id": event_id,
                "type": "whale_entry",
                "severity": severity,
                "mint": mint,
                "timestamp": ts.isoformat(),
                "value": sol_amount,
                "threshold": getattr(settings, "NEO4J_EVENT_WHALE_THRESHOLD_SOL", 1.0),
                "multiplier": 0.0,
                "phase_id": row["phase_id_at_time"],
                "price_at_event": float(row["price_sol"]) if row["price_sol"] else 0.0,
                "trader": row["trader_public_key"] or "",
            }

            try:
                await run_write("""
                    MERGE (e:Event {id: $event_id})
                    SET e.type = $type, e.severity = $severity, e.mint = $mint,
                        e.timestamp = $timestamp, e.value = $value, e.threshold = $threshold,
                        e.multiplier = $multiplier, e.phase_id = $phase_id, e.price_at_event = $price_at_event,
                        e.trader = $trader
                    WITH e
                    MATCH (t:Token {address: $mint})
                    MERGE (t)-[:HAD_EVENT]->(e)
                """, params)
                mints.add(mint)
                count += 1
                last_ts = ts
            except Exception as e:
                logger.warning("Failed to write whale_entry event for %s: %s", mint[:12], e)

        return count, mints, last_ts

    async def _detect_dev_sold(self, since: datetime) -> tuple[int, Set[str], Optional[datetime]]:
        """Detect when a token creator sells their own token."""
        rows = await fetch("""
            SELECT ct.mint, ct.timestamp, ct.trader_public_key, ct.sol_amount, ct.price_sol, ct.phase_id_at_time
            FROM coin_transactions ct
            JOIN discovered_coins dc ON dc.token_address = ct.mint
            WHERE ct.trader_public_key = dc.trader_public_key AND ct.tx_type = 'sell' AND ct.timestamp > $1
            ORDER BY ct.timestamp ASC LIMIT 1000
        """, since)

        mints: Set[str] = set()
        last_ts: Optional[datetime] = None
        count = 0

        for row in rows:
            mint = row["mint"]
            ts = row["timestamp"]
            sol_amount = float(row["sol_amount"]) if row["sol_amount"] else 0.0

            event_id = f"{mint}_dev_sold_{ts.isoformat()}"
            params = {
                "event_id": event_id,
                "type": "dev_sold",
                "severity": "critical",
                "mint": mint,
                "timestamp": ts.isoformat(),
                "value": sol_amount,
                "threshold": 0.0,
                "multiplier": 0.0,
                "phase_id": row["phase_id_at_time"],
                "price_at_event": float(row["price_sol"]) if row["price_sol"] else 0.0,
                "trader": row["trader_public_key"] or "",
            }

            try:
                await run_write("""
                    MERGE (e:Event {id: $event_id})
                    SET e.type = $type, e.severity = $severity, e.mint = $mint,
                        e.timestamp = $timestamp, e.value = $value, e.threshold = $threshold,
                        e.multiplier = $multiplier, e.phase_id = $phase_id, e.price_at_event = $price_at_event,
                        e.trader = $trader
                    WITH e
                    MATCH (t:Token {address: $mint})
                    MERGE (t)-[:HAD_EVENT]->(e)
                """, params)
                mints.add(mint)
                count += 1
                last_ts = ts
            except Exception as e:
                logger.warning("Failed to write dev_sold event for %s: %s", mint[:12], e)

        return count, mints, last_ts

    async def _detect_price_ath(self, since: datetime) -> tuple[int, Set[str], Optional[datetime]]:
        """Detect new all-time high prices."""
        rows = await fetch("""
            SELECT cm.mint, cm.timestamp, cm.price_close AS new_ath, cs.ath_price_sol AS previous_ath, cm.phase_id_at_time
            FROM coin_metrics cm
            JOIN coin_streams cs ON cs.token_address = cm.mint
            WHERE cm.price_close > cs.ath_price_sol AND cm.timestamp > $1
            ORDER BY cm.timestamp ASC LIMIT 1000
        """, since)

        mints: Set[str] = set()
        last_ts: Optional[datetime] = None
        count = 0

        for row in rows:
            mint = row["mint"]
            ts = row["timestamp"]
            new_ath = float(row["new_ath"]) if row["new_ath"] else 0.0
            previous_ath = float(row["previous_ath"]) if row["previous_ath"] else 0.0
            ath_multiplier = new_ath / previous_ath if previous_ath > 0 else 0.0

            event_id = f"{mint}_price_ath_{ts.isoformat()}"
            params = {
                "event_id": event_id,
                "type": "price_ath",
                "severity": "medium",
                "mint": mint,
                "timestamp": ts.isoformat(),
                "value": new_ath,
                "threshold": previous_ath,
                "multiplier": ath_multiplier,
                "phase_id": row["phase_id_at_time"],
                "price_at_event": new_ath,
            }

            try:
                await run_write("""
                    MERGE (e:Event {id: $event_id})
                    SET e.type = $type, e.severity = $severity, e.mint = $mint,
                        e.timestamp = $timestamp, e.value = $value, e.threshold = $threshold,
                        e.multiplier = $multiplier, e.phase_id = $phase_id, e.price_at_event = $price_at_event
                    WITH e
                    MATCH (t:Token {address: $mint})
                    MERGE (t)-[:HAD_EVENT]->(e)
                """, params)
                mints.add(mint)
                count += 1
                last_ts = ts
            except Exception as e:
                logger.warning("Failed to write price_ath event for %s: %s", mint[:12], e)

        return count, mints, last_ts

    async def _detect_mass_sell(self, since: datetime) -> tuple[int, Set[str], Optional[datetime]]:
        """Detect periods with abnormally high sell count relative to buys."""
        threshold = getattr(settings, "NEO4J_EVENT_MASS_SELL_THRESHOLD", 10)

        rows = await fetch("""
            SELECT mint, timestamp, num_sells, num_buys, sell_volume_sol, buy_volume_sol, price_close, phase_id_at_time
            FROM coin_metrics
            WHERE num_sells > $2 AND num_sells > num_buys * 3 AND timestamp > $1
            ORDER BY timestamp ASC LIMIT 1000
        """, since, threshold)

        mints: Set[str] = set()
        last_ts: Optional[datetime] = None
        count = 0

        for row in rows:
            mint = row["mint"]
            ts = row["timestamp"]
            num_sells = int(row["num_sells"]) if row["num_sells"] else 0

            if num_sells > 50:
                severity = "critical"
            elif num_sells > 30:
                severity = "high"
            elif num_sells > 10:
                severity = "medium"
            else:
                severity = "low"

            event_id = f"{mint}_mass_sell_{ts.isoformat()}"
            params = {
                "event_id": event_id,
                "type": "mass_sell",
                "severity": severity,
                "mint": mint,
                "timestamp": ts.isoformat(),
                "value": float(row["sell_volume_sol"]) if row["sell_volume_sol"] else 0.0,
                "threshold": float(threshold),
                "multiplier": 0.0,
                "phase_id": row["phase_id_at_time"],
                "price_at_event": float(row["price_close"]) if row["price_close"] else 0.0,
                "num_sells": num_sells,
                "num_buys": int(row["num_buys"]) if row["num_buys"] else 0,
            }

            try:
                await run_write("""
                    MERGE (e:Event {id: $event_id})
                    SET e.type = $type, e.severity = $severity, e.mint = $mint,
                        e.timestamp = $timestamp, e.value = $value, e.threshold = $threshold,
                        e.multiplier = $multiplier, e.phase_id = $phase_id, e.price_at_event = $price_at_event,
                        e.num_sells = $num_sells, e.num_buys = $num_buys
                    WITH e
                    MATCH (t:Token {address: $mint})
                    MERGE (t)-[:HAD_EVENT]->(e)
                """, params)
                mints.add(mint)
                count += 1
                last_ts = ts
            except Exception as e:
                logger.warning("Failed to write mass_sell event for %s: %s", mint[:12], e)

        return count, mints, last_ts

    async def _detect_liquidity_drop(self, since: datetime) -> tuple[int, Set[str], Optional[datetime]]:
        """Detect sudden drops in virtual SOL reserves."""
        drop_pct = getattr(settings, "NEO4J_EVENT_LIQUIDITY_DROP_PCT", 50.0)

        rows = await fetch("""
            SELECT cm.mint, cm.timestamp, cm.virtual_sol_reserves AS current_liquidity,
                prev.virtual_sol_reserves AS prev_liquidity,
                (cm.virtual_sol_reserves / NULLIF(prev.virtual_sol_reserves, 0)) AS ratio,
                cm.price_close, cm.phase_id_at_time
            FROM coin_metrics cm
            JOIN LATERAL (
                SELECT virtual_sol_reserves FROM coin_metrics prev
                WHERE prev.mint = cm.mint AND prev.timestamp < cm.timestamp
                ORDER BY prev.timestamp DESC LIMIT 1
            ) prev ON true
            WHERE cm.virtual_sol_reserves < prev.virtual_sol_reserves * (1.0 - $2 / 100.0)
              AND prev.virtual_sol_reserves > 0 AND cm.timestamp > $1
            ORDER BY cm.timestamp ASC LIMIT 1000
        """, since, drop_pct)

        mints: Set[str] = set()
        last_ts: Optional[datetime] = None
        count = 0

        for row in rows:
            mint = row["mint"]
            ts = row["timestamp"]
            current_liq = float(row["current_liquidity"]) if row["current_liquidity"] else 0.0
            prev_liq = float(row["prev_liquidity"]) if row["prev_liquidity"] else 0.0
            ratio = float(row["ratio"]) if row["ratio"] else 0.0
            drop_actual_pct = (1.0 - ratio) * 100.0 if ratio else 0.0

            if drop_actual_pct > 90:
                severity = "critical"
            elif drop_actual_pct > 70:
                severity = "high"
            elif drop_actual_pct > 50:
                severity = "medium"
            else:
                severity = "low"

            event_id = f"{mint}_liquidity_drop_{ts.isoformat()}"
            params = {
                "event_id": event_id,
                "type": "liquidity_drop",
                "severity": severity,
                "mint": mint,
                "timestamp": ts.isoformat(),
                "value": current_liq,
                "threshold": prev_liq * (1.0 - drop_pct / 100.0),
                "multiplier": ratio,
                "phase_id": row["phase_id_at_time"],
                "price_at_event": float(row["price_close"]) if row["price_close"] else 0.0,
            }

            try:
                await run_write("""
                    MERGE (e:Event {id: $event_id})
                    SET e.type = $type, e.severity = $severity, e.mint = $mint,
                        e.timestamp = $timestamp, e.value = $value, e.threshold = $threshold,
                        e.multiplier = $multiplier, e.phase_id = $phase_id, e.price_at_event = $price_at_event
                    WITH e
                    MATCH (t:Token {address: $mint})
                    MERGE (t)-[:HAD_EVENT]->(e)
                """, params)
                mints.add(mint)
                count += 1
                last_ts = ts
            except Exception as e:
                logger.warning("Failed to write liquidity_drop event for %s: %s", mint[:12], e)

        return count, mints, last_ts

    # ------------------------------------------------------------------
    # Event chaining (FOLLOWED_BY relationships)
    # ------------------------------------------------------------------

    async def _chain_events(self, mints: Set[str]) -> int:
        """Create FOLLOWED_BY relationships between events for each token.

        Orders events by timestamp and connects consecutive events.
        Returns total number of FOLLOWED_BY relationships created/updated.
        """
        if not mints:
            return 0

        chained = 0
        for mint in mints:
            try:
                await run_write("""
                    MATCH (t:Token {address: $mint})-[:HAD_EVENT]->(e:Event)
                    WITH e ORDER BY e.timestamp
                    WITH collect(e) AS events
                    UNWIND range(0, size(events)-2) AS i
                    WITH events[i] AS prev, events[i+1] AS next
                    MERGE (prev)-[r:FOLLOWED_BY]->(next)
                    SET r.gap_seconds = duration.between(datetime(prev.timestamp), datetime(next.timestamp)).seconds
                """, {"mint": mint})
                chained += 1
            except Exception as e:
                logger.warning("Event chaining failed for %s: %s", mint[:12], e)

        return chained

    # ------------------------------------------------------------------
    # Outcome calculation
    # ------------------------------------------------------------------

    async def _calculate_outcomes(self) -> int:
        """Calculate price outcomes for events that are old enough.

        Queries Neo4j for events without an Outcome node, then looks up
        price data from PostgreSQL to compute price changes.
        Returns number of outcomes created.
        """
        delay_minutes = getattr(settings, "NEO4J_EVENT_OUTCOME_DELAY_MINUTES", 5)

        # Find events without outcomes that are old enough
        events = await run_query("""
            MATCH (e:Event)
            WHERE NOT (e)-[:RESULTED_IN]->(:Outcome)
              AND datetime(e.timestamp) < datetime() - duration({minutes: $delay_minutes})
            RETURN e.id AS event_id, e.mint AS mint, e.timestamp AS timestamp, e.price_at_event AS price_at_event
            LIMIT 500
        """, {"delay_minutes": delay_minutes})

        if not events:
            return 0

        outcomes_created = 0

        for event in events:
            event_id = event["event_id"]
            mint = event["mint"]
            event_ts_raw = event["timestamp"]
            event_price = event["price_at_event"]

            if not event_price or event_price <= 0:
                continue

            # Parse event timestamp from Neo4j (string) to datetime for asyncpg
            try:
                if isinstance(event_ts_raw, str):
                    event_ts = datetime.fromisoformat(event_ts_raw.replace("Z", "+00:00"))
                elif isinstance(event_ts_raw, datetime):
                    event_ts = event_ts_raw
                else:
                    logger.warning("Unexpected timestamp type for event %s: %s", event_id[:30], type(event_ts_raw))
                    continue
            except (ValueError, TypeError) as e:
                logger.warning("Cannot parse timestamp for event %s: %s", event_id[:30], e)
                continue

            try:
                # Fetch price data after the event
                price_rows = await fetch("""
                    SELECT price_close, price_high, price_low
                    FROM coin_metrics
                    WHERE mint = $1 AND timestamp >= $2 AND timestamp <= $2 + INTERVAL '5 minutes'
                    ORDER BY timestamp ASC
                """, mint, event_ts)

                if not price_rows:
                    continue

                last_price = float(price_rows[-1]["price_close"]) if price_rows[-1]["price_close"] else 0.0
                max_price = max(float(r["price_high"]) for r in price_rows if r["price_high"])
                min_price = min(float(r["price_low"]) for r in price_rows if r["price_low"])

                price_change_pct = ((last_price - event_price) / event_price) * 100
                max_gain_pct = ((max_price - event_price) / event_price) * 100
                max_loss_pct = ((min_price - event_price) / event_price) * 100

                outcome_type = _classify_outcome(price_change_pct, max_gain_pct, max_loss_pct)

                # Calculate total volume in the outcome window
                volume_rows = await fetch("""
                    SELECT COALESCE(SUM(volume_sol), 0) AS total_volume
                    FROM coin_metrics
                    WHERE mint = $1 AND timestamp >= $2 AND timestamp <= $2 + INTERVAL '5 minutes'
                """, mint, event_ts)
                volume_after = float(volume_rows[0]["total_volume"]) if volume_rows else 0.0

                duration_seconds = delay_minutes * 60
                evaluated_at = datetime.now(timezone.utc).isoformat()

                await run_write("""
                    MATCH (e:Event {id: $event_id})
                    MERGE (o:Outcome {event_id: $event_id})
                    SET o.type = $outcome_type, o.price_change_pct = $price_change_pct,
                        o.duration_seconds = $duration_seconds, o.max_gain_pct = $max_gain_pct,
                        o.max_loss_pct = $max_loss_pct, o.volume_after_sol = $volume_after_sol,
                        o.evaluated_at = $evaluated_at
                    MERGE (e)-[:RESULTED_IN]->(o)
                """, {
                    "event_id": event_id,
                    "outcome_type": outcome_type,
                    "price_change_pct": price_change_pct,
                    "duration_seconds": duration_seconds,
                    "max_gain_pct": max_gain_pct,
                    "max_loss_pct": max_loss_pct,
                    "volume_after_sol": volume_after,
                    "evaluated_at": evaluated_at,
                })
                outcomes_created += 1

            except Exception as e:
                logger.warning("Outcome calculation failed for event %s: %s", event_id[:30], e)

        self.last_sync_outcomes = datetime.now(timezone.utc)
        return outcomes_created
