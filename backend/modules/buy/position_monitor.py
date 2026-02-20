"""
SellPositionMonitor - Background service that polls open positions
and executes automated sells when workflow rules trigger.

Polls every N seconds (default 15), checks all open positions belonging
to wallets with active SELL workflows, and evaluates sell rules (OR-logic):
  - stop_loss: price dropped X% from entry
  - trailing_stop: price dropped X% from peak
  - take_profit: price rose X% from entry
  - timeout: position open longer than X minutes

First matching rule triggers a sell via TradingService.execute_sell().
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database import fetch, execute
from backend.modules.buy.trading import TradingService
from backend.modules.buy.jupiter_client import init_jupiter_client

logger = logging.getLogger(__name__)


class SellPositionMonitor:
    """Polls open positions and sells when workflow rules trigger."""

    def __init__(self, interval_seconds: int = 15):
        self._interval = interval_seconds
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._jupiter = init_jupiter_client()
        self._stats = {
            "polls": 0,
            "positions_checked": 0,
            "sells_triggered": 0,
            "errors": 0,
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def start(self):
        """Start the monitor background loop."""
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(
            "SellPositionMonitor started (interval=%ds)", self._interval
        )

    async def stop(self):
        """Stop the monitor gracefully."""
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        await self._jupiter.close()
        logger.info("SellPositionMonitor stopped")

    def get_stats(self) -> Dict[str, Any]:
        return {**self._stats, "running": self._running}

    # ------------------------------------------------------------------
    # Internal: main loop
    # ------------------------------------------------------------------

    async def _run_loop(self):
        """Main polling loop."""
        while self._running:
            try:
                await self._check_positions()
                self._stats["polls"] += 1
            except Exception as e:
                logger.error("SellPositionMonitor poll error: %s", e, exc_info=True)
                self._stats["errors"] += 1

            await asyncio.sleep(self._interval)

    # ------------------------------------------------------------------
    # Internal: check all positions
    # ------------------------------------------------------------------

    async def _check_positions(self):
        """Query open positions with active SELL workflows and evaluate rules."""
        rows = await fetch(
            """
            SELECT
                tw.id        AS workflow_id,
                tw.name      AS workflow_name,
                tw.chain,
                tw.sell_amount_pct,
                tw.wallet_id,
                p.id          AS position_id,
                p.mint,
                p.tokens_held,
                p.entry_price,
                p.initial_sol_spent,
                p.peak_price_sol,
                p.created_at  AS position_created_at,
                w.alias       AS wallet_alias
            FROM trading_workflows tw
            JOIN wallets w ON tw.wallet_id = w.id
            JOIN positions p ON p.wallet_id = tw.wallet_id AND p.status = 'OPEN'
            WHERE tw.type = 'SELL'
              AND tw.is_active = TRUE
              AND w.trading_enabled = TRUE
            """
        )

        if not rows:
            logger.debug("SellPositionMonitor: no open positions with active SELL workflows")
            return

        logger.info("SellPositionMonitor: checking %d position-workflow pair(s)", len(rows))

        for row in rows:
            try:
                await self._evaluate_position(row)
                self._stats["positions_checked"] += 1
            except Exception as e:
                logger.error(
                    "SellPositionMonitor: error evaluating position %s (mint=%s): %s",
                    row["position_id"],
                    row["mint"],
                    e,
                    exc_info=True,
                )
                self._stats["errors"] += 1

    # ------------------------------------------------------------------
    # Internal: evaluate a single position against its workflow rules
    # ------------------------------------------------------------------

    async def _evaluate_position(self, row: dict):
        """Evaluate sell rules for one position-workflow pair."""
        mint: str = row["mint"]
        tokens_held = float(row["tokens_held"])
        entry_price = float(row["entry_price"])
        peak_price = float(row["peak_price_sol"]) if row["peak_price_sol"] is not None else entry_price
        position_created_at: datetime = row["position_created_at"]
        wallet_alias: str = row["wallet_alias"]
        sell_amount_pct = float(row["sell_amount_pct"]) if row["sell_amount_pct"] is not None else 100.0

        # Parse chain (handles both dict and string)
        chain = row["chain"]
        if isinstance(chain, str):
            chain = json.loads(chain)

        # Accept both "rules" (current frontend) and "steps" (legacy) keys
        rules: List[dict] = chain.get("rules") or chain.get("steps") or []
        if not rules:
            logger.warning(
                "SellPositionMonitor: workflow '%s' has empty rules for position %s (mint=%s) "
                "- chain keys: %s. Position will never be sold!",
                row["workflow_name"], row["position_id"], mint[:12], list(chain.keys()),
            )
            return

        # ----- Get current price via Jupiter -----
        # token_amount_raw: assume 6 decimals for SPL tokens
        token_amount_raw = int(tokens_held * 1e6)
        if token_amount_raw <= 0:
            logger.warning(
                "SellPositionMonitor: position %s (mint=%s) has zero tokens_held=%.6f - skipping",
                row["position_id"], mint[:12], tokens_held,
            )
            return

        try:
            quote = await self._jupiter.get_sell_quote(mint, token_amount_raw)
        except Exception as e:
            logger.warning(
                "SellPositionMonitor: Jupiter quote failed for %s (position=%s, wallet=%s): %s "
                "- sell rules cannot be evaluated this cycle!",
                mint[:12], row["position_id"], wallet_alias, e,
            )
            return

        # quote.out_amount is in lamports -> divide by 1e9 for SOL
        current_value_sol = quote.out_amount / 1e9
        if tokens_held <= 0:
            return

        current_price = current_value_sol / tokens_held

        # ----- Update peak_price_sol if new high -----
        if current_price > peak_price:
            await execute(
                "UPDATE positions SET peak_price_sol = $1 WHERE id = $2",
                current_price,
                row["position_id"],
            )
            peak_price = current_price

        # ----- Calculate metrics -----
        change_from_entry_pct = ((current_price - entry_price) / entry_price) * 100 if entry_price > 0 else 0.0

        change_from_peak_pct = ((current_price - peak_price) / peak_price) * 100 if peak_price > 0 else 0.0

        now = datetime.now(timezone.utc)
        # Ensure position_created_at is timezone-aware
        if position_created_at.tzinfo is None:
            position_created_at = position_created_at.replace(tzinfo=timezone.utc)
        minutes_since_open = (now - position_created_at).total_seconds() / 60.0

        metrics = {
            "current_price": current_price,
            "current_value_sol": current_value_sol,
            "entry_price": entry_price,
            "peak_price": peak_price,
            "change_from_entry_pct": round(change_from_entry_pct, 4),
            "change_from_peak_pct": round(change_from_peak_pct, 4),
            "minutes_since_open": round(minutes_since_open, 2),
            "tokens_held": tokens_held,
        }

        # ----- Evaluate rules (OR-logic, first match triggers) -----
        triggered_rule = None

        for rule in rules:
            rule_type = rule.get("type")
            # Accept both "percent" (current frontend) and "target_pct" (legacy)
            rule_pct = rule.get("percent") if rule.get("percent") is not None else rule.get("target_pct")

            if rule_type == "stop_loss":
                # Triggers when price drops below threshold from entry
                # rule_pct is negative (e.g. -5.0)
                threshold = rule_pct if rule_pct is not None else -999
                if change_from_entry_pct <= threshold:
                    triggered_rule = rule
                    break

            elif rule_type == "trailing_stop":
                # Triggers when price drops below threshold from peak
                # rule_pct is negative (e.g. -3.0)
                threshold = rule_pct if rule_pct is not None else -999
                if change_from_peak_pct <= threshold:
                    triggered_rule = rule
                    break

            elif rule_type == "take_profit":
                # Triggers when price rises above threshold from entry
                # rule_pct is positive (e.g. 20.0)
                threshold = rule_pct if rule_pct is not None else 999
                if change_from_entry_pct >= threshold:
                    triggered_rule = rule
                    break

            elif rule_type == "timeout":
                # Triggers when position has been open longer than X minutes
                if minutes_since_open >= rule.get("minutes", 999999):
                    triggered_rule = rule
                    break

        if triggered_rule is None:
            logger.debug(
                "SellPositionMonitor: no rule triggered for mint=%s wallet=%s "
                "(entry=%.6f, current=%.6f, change=%.2f%%, peak_change=%.2f%%, min_open=%.1f)",
                mint[:12], wallet_alias, entry_price, current_price,
                change_from_entry_pct, change_from_peak_pct, minutes_since_open,
            )
            return

        # ----- Execute sell -----
        logger.info(
            "SellPositionMonitor: rule '%s' triggered for mint=%s wallet=%s "
            "(entry=%.6f, current=%.6f, peak=%.6f, change_entry=%.2f%%, change_peak=%.2f%%, min_open=%.1f)",
            triggered_rule["type"],
            mint[:12],
            wallet_alias,
            entry_price,
            current_price,
            peak_price,
            change_from_entry_pct,
            change_from_peak_pct,
            minutes_since_open,
        )

        sell_result = await TradingService.execute_sell(
            wallet_alias=wallet_alias,
            mint=mint,
            amount_pct=sell_amount_pct,
        )

        # ----- Log to workflow_executions -----
        trigger_data = {
            "rule": triggered_rule,
            "metrics": metrics,
        }

        steps_log = [
            {
                "step": "evaluate_rules",
                "triggered_rule": triggered_rule["type"],
                "sell_amount_pct": sell_amount_pct,
            },
            {
                "step": "execute_sell",
                "result": sell_result.get("status"),
                "data": sell_result.get("data"),
            },
        ]

        # Determine execution result
        if sell_result.get("status") == "success":
            exec_result = "EXECUTED"
            error_message = None
            self._stats["sells_triggered"] += 1
        else:
            exec_result = "ERROR"
            error_message = sell_result.get("message") or sell_result.get("code")

        # Get trade_log_id if sell succeeded (look up by signature)
        trade_log_id = None
        if sell_result.get("status") == "success" and sell_result.get("signature"):
            from backend.database import fetchval
            trade_log_id = await fetchval(
                "SELECT id FROM trade_logs WHERE tx_signature = $1",
                sell_result["signature"],
            )

        await execute(
            """
            INSERT INTO workflow_executions
                (workflow_id, mint, trigger_data, steps_log, result, trade_log_id, error_message)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
            """,
            row["workflow_id"],
            mint,
            json.dumps(trigger_data),
            json.dumps(steps_log, default=str),
            exec_result,
            trade_log_id,
            error_message,
        )

        logger.info(
            "SellPositionMonitor: execution logged for workflow '%s' -> %s",
            row["workflow_name"],
            exec_result,
        )


# ============================================================
# Module-level singleton
# ============================================================

_monitor: Optional[SellPositionMonitor] = None


async def start_position_monitor(interval_seconds: int = 15):
    """Start the sell position monitor as a background task."""
    global _monitor
    if _monitor is None:
        _monitor = SellPositionMonitor(interval_seconds=interval_seconds)
        await _monitor.start()
        logger.info("SellPositionMonitor started (interval=%ds)", interval_seconds)
    return _monitor


async def stop_position_monitor():
    """Stop the sell position monitor."""
    global _monitor
    if _monitor is not None:
        await _monitor.stop()
        _monitor = None


def get_position_monitor() -> Optional[SellPositionMonitor]:
    """Get the current monitor instance."""
    return _monitor
