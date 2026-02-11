"""
Base Sync Module - Existing 7 sync methods extracted from sync.py.

Handles: Token, Creator, Wallet, Position, Trade, Model, Prediction, Transfer sync.
"""

import logging
from datetime import datetime
from typing import Dict, Optional

from backend.database import fetch
from backend.modules.graph.neo4j_client import run_write

logger = logging.getLogger(__name__)

BATCH_SIZE = 5000


class BaseSyncModule:
    """Syncs core entities: Tokens, Wallets, Models, Trades, Positions, Predictions, Transfers."""

    def __init__(self):
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
            "tokens_synced": 0,
            "wallets_synced": 0,
            "trades_synced": 0,
        }

    async def sync(self, first_run: bool) -> Dict[str, int]:
        """Run all base sync methods. Returns counts per entity."""
        results: Dict[str, int] = {}

        since_tokens = None if first_run else self.last_sync.get("tokens")
        since_trades = None if first_run else self.last_sync.get("trades")
        since_positions = None if first_run else self.last_sync.get("positions")
        since_predictions = None if first_run else self.last_sync.get("predictions")
        since_transfers = None if first_run else self.last_sync.get("transfers")

        results["tokens"] = await self._sync_tokens(since_tokens)
        results["creators_enriched"] = await self._enrich_creators(since_tokens)
        results["phases"] = await self._sync_phases()
        results["current_phase_links"] = await self._link_current_phase()
        results["launched_with"] = await self._link_launched_with(since_tokens)
        results["wallets"] = await self._sync_wallets()
        results["positions"] = await self._sync_positions(since_positions)
        results["trades"] = await self._sync_trades(since_trades)
        results["models"] = await self._sync_models()
        results["predictions"] = await self._sync_predictions(since_predictions)
        results["transfers"] = await self._sync_transfers(since_transfers)

        return results

    # ------------------------------------------------------------------
    # P0: Tokens + Creators + CREATED
    # ------------------------------------------------------------------
    async def _sync_tokens(self, since: Optional[str] = None) -> int:
        where = ""
        args: list = []
        if since:
            where = "WHERE dc.discovered_at > $1"
            args = [since]

        query = f"""
            SELECT
                dc.token_address, dc.name, dc.symbol, dc.trader_public_key,
                dc.initial_buy_sol, dc.market_cap_sol, dc.discovered_at,
                dc.risk_score, dc.is_graduated, dc.is_active,
                dc.deploy_platform, dc.classification, dc.final_outcome,
                dc.is_mayhem_mode, dc.price_sol, dc.liquidity_sol,
                dc.bonding_curve_key, dc.description,
                cs.ath_price_sol, cs.ath_timestamp, cs.current_phase_id
            FROM discovered_coins dc
            LEFT JOIN coin_streams cs ON dc.token_address = cs.mint
            {where}
            ORDER BY dc.discovered_at ASC
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
                "risk_score": float(row["risk_score"]) if row["risk_score"] is not None else None,
                "is_graduated": bool(row["is_graduated"]) if row["is_graduated"] is not None else None,
                "is_active": bool(row["is_active"]) if row["is_active"] is not None else None,
                "deploy_platform": row["deploy_platform"] or None,
                "classification": row["classification"] or None,
                "final_outcome": row["final_outcome"] or None,
                "is_mayhem_mode": bool(row["is_mayhem_mode"]) if row["is_mayhem_mode"] is not None else None,
                "price_sol": float(row["price_sol"]) if row["price_sol"] is not None else None,
                "liquidity_sol": float(row["liquidity_sol"]) if row["liquidity_sol"] is not None else None,
                "bonding_curve_key": row["bonding_curve_key"] or None,
                "description": row["description"] or None,
                "ath_price_sol": float(row["ath_price_sol"]) if row.get("ath_price_sol") is not None else None,
                "ath_timestamp": row["ath_timestamp"].isoformat() if row.get("ath_timestamp") else None,
                "current_phase_id": int(row["current_phase_id"]) if row.get("current_phase_id") is not None else None,
            }
            cypher = """
                MERGE (t:Token {address: $mint})
                SET t.name = $name, t.symbol = $symbol,
                    t.market_cap_sol = $market_cap_sol, t.discovered_at = $discovered_at,
                    t.risk_score = $risk_score, t.is_graduated = $is_graduated,
                    t.is_active = $is_active, t.deploy_platform = $deploy_platform,
                    t.classification = $classification, t.final_outcome = $final_outcome,
                    t.is_mayhem_mode = $is_mayhem_mode, t.price_sol = $price_sol,
                    t.liquidity_sol = $liquidity_sol, t.bonding_curve_key = $bonding_curve_key,
                    t.description = $description, t.initial_buy_sol = $initial_buy_sol,
                    t.ath_price_sol = $ath_price_sol, t.ath_timestamp = $ath_timestamp,
                    t.current_phase_id = $current_phase_id
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
    # P0b: Creator Enrichment (aggregates)
    # ------------------------------------------------------------------
    async def _enrich_creators(self, since: Optional[str] = None) -> int:
        where = ""
        args: list = []
        if since:
            where = "WHERE discovered_at > $1"
            args = [since]

        query = f"""
            SELECT trader_public_key AS address,
                COUNT(*) AS total_tokens_created,
                MIN(discovered_at) AS first_seen,
                MAX(discovered_at) AS last_seen,
                COUNT(*) FILTER (WHERE risk_score > 5) AS high_risk_count,
                AVG(risk_score) AS avg_risk_score,
                BOOL_OR(is_graduated) AS any_graduated
            FROM discovered_coins
            {where}
            GROUP BY trader_public_key
            ORDER BY total_tokens_created DESC
            LIMIT {BATCH_SIZE}
        """
        rows = await fetch(query, *args)
        if not rows:
            return 0

        count = 0
        for row in rows:
            address = row["address"]
            if not address:
                continue
            total = int(row["total_tokens_created"])
            params = {
                "address": address,
                "total_tokens_created": total,
                "first_seen": row["first_seen"].isoformat() if row["first_seen"] else None,
                "last_seen": row["last_seen"].isoformat() if row["last_seen"] else None,
                "high_risk_count": int(row["high_risk_count"]) if row["high_risk_count"] is not None else 0,
                "avg_risk_score": round(float(row["avg_risk_score"]), 2) if row["avg_risk_score"] is not None else None,
                "any_graduated": bool(row["any_graduated"]) if row["any_graduated"] is not None else False,
                "is_serial_creator": total >= 5,
            }
            cypher = """
                MERGE (c:Creator {address: $address})
                SET c.total_tokens_created = $total_tokens_created,
                    c.first_seen = $first_seen, c.last_seen = $last_seen,
                    c.high_risk_count = $high_risk_count,
                    c.avg_risk_score = $avg_risk_score,
                    c.any_graduated = $any_graduated,
                    c.is_serial_creator = $is_serial_creator
            """
            try:
                await run_write(cypher, params)
                count += 1
            except Exception as e:
                logger.warning("Creator enrichment failed for %s: %s", address[:12], e)

        return count

    # ------------------------------------------------------------------
    # P0c: Phase Reference Nodes
    # ------------------------------------------------------------------
    async def _sync_phases(self) -> int:
        rows = await fetch("""
            SELECT phase_id, interval_seconds, max_age_minutes
            FROM ref_coin_phases
            ORDER BY phase_id
        """)
        if not rows:
            return 0

        count = 0
        for row in rows:
            params = {
                "phase_id": int(row["phase_id"]),
                "interval_seconds": int(row["interval_seconds"]) if row["interval_seconds"] is not None else None,
                "max_age_minutes": int(row["max_age_minutes"]) if row["max_age_minutes"] is not None else None,
            }
            try:
                await run_write("""
                    MERGE (p:Phase {phase_id: $phase_id})
                    SET p.interval_seconds = $interval_seconds,
                        p.max_age_minutes = $max_age_minutes
                """, params)
                count += 1
            except Exception as e:
                logger.warning("Phase sync failed for phase %d: %s", params["phase_id"], e)

        return count

    async def _link_current_phase(self) -> int:
        """Link Token nodes to their current Phase via CURRENT_PHASE relationship."""
        try:
            result = await run_write("""
                MATCH (t:Token) WHERE t.current_phase_id IS NOT NULL
                WITH t
                MATCH (p:Phase {phase_id: t.current_phase_id})
                MERGE (t)-[:CURRENT_PHASE]->(p)
                RETURN count(*) AS linked
            """)
            count = result[0]["linked"] if result else 0
            return count
        except Exception as e:
            logger.warning("CURRENT_PHASE linking failed: %s", e)
            return 0

    # ------------------------------------------------------------------
    # P0d: LAUNCHED_WITH (batch-launch detection)
    # ------------------------------------------------------------------
    async def _link_launched_with(self, since: Optional[str] = None) -> int:
        from backend.config import settings
        window_sec = settings.NEO4J_LAUNCHED_WITH_WINDOW_SEC

        where = ""
        args: list = [window_sec]
        if since:
            where = "AND a.discovered_at > $2"
            args.append(since)

        query = f"""
            SELECT a.token_address AS token_a, b.token_address AS token_b,
                   a.trader_public_key AS creator,
                   ABS(EXTRACT(EPOCH FROM a.discovered_at - b.discovered_at)) AS time_diff_sec
            FROM discovered_coins a
            JOIN discovered_coins b
                ON a.trader_public_key = b.trader_public_key
                AND a.token_address < b.token_address
                AND ABS(EXTRACT(EPOCH FROM a.discovered_at - b.discovered_at)) <= $1
            WHERE a.trader_public_key IS NOT NULL
              {where}
            LIMIT 2000
        """
        rows = await fetch(query, *args)
        if not rows:
            return 0

        count = 0
        for row in rows:
            params = {
                "token_a": row["token_a"],
                "token_b": row["token_b"],
                "creator": row["creator"],
                "time_diff_sec": round(float(row["time_diff_sec"]), 1),
            }
            try:
                await run_write("""
                    MATCH (t1:Token {address: $token_a})
                    MATCH (t2:Token {address: $token_b})
                    MERGE (t1)-[r:LAUNCHED_WITH]->(t2)
                    SET r.creator = $creator, r.time_diff_sec = $time_diff_sec
                """, params)
                count += 1
            except Exception as e:
                logger.warning("LAUNCHED_WITH failed for %s-%s: %s", row["token_a"][:8], row["token_b"][:8], e)

        return count

    # ------------------------------------------------------------------
    # P1: Wallets + HOLDS/BOUGHT/SOLD
    # ------------------------------------------------------------------
    async def _sync_wallets(self) -> int:
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
            await run_write("""
                MATCH (w:Wallet {alias: $alias})
                MERGE (target:Address {address: $to_address})
                MERGE (w)-[r:TRANSFERRED_TO {timestamp: $timestamp}]->(target)
                SET r.amount_sol = $amount_sol
            """, params)

        if rows:
            self.last_sync["transfers"] = rows[-1]["created_at"]
        return len(rows)
