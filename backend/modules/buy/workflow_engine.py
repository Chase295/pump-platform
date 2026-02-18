"""
BuyWorkflowEngine - Automated buy execution triggered by predictions.

When the PredictionScanner produces a prediction, BuyWorkflowEngine checks all
active BUY workflows.  For each matching workflow it evaluates the trigger
(model + min-probability), cooldown, position limits, and optional on-demand
prediction conditions.  If everything passes it calls TradingService.execute_buy.

Every evaluation is logged to the ``workflow_executions`` table.
"""

import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database import fetch, fetchrow, fetchval, get_pool

logger = logging.getLogger(__name__)


class BuyWorkflowEngine:
    """Evaluate active BUY workflows whenever a new prediction arrives."""

    def __init__(self):
        # cooldown tracking:  workflow_id -> last execution UTC timestamp
        self._last_execution: Dict[str, float] = {}

    # ------------------------------------------------------------------
    # Public entry-point (called from PredictionScanner)
    # ------------------------------------------------------------------

    async def on_prediction(
        self,
        coin_id: str,
        model_id: Optional[int],
        active_model_id: Optional[int],
        probability: float,
        prediction: int,
        tag: str,
        timestamp: datetime,
    ) -> None:
        """
        Called for every new prediction.  Finds matching BUY workflows
        and evaluates / executes them.
        """
        try:
            workflows = await self._get_active_buy_workflows()
            if not workflows:
                return

            for wf in workflows:
                try:
                    await self._evaluate_workflow(
                        wf,
                        coin_id=coin_id,
                        model_id=model_id,
                        active_model_id=active_model_id,
                        probability=probability,
                        prediction=prediction,
                        tag=tag,
                        timestamp=timestamp,
                    )
                except Exception as e:
                    logger.error(
                        "Error evaluating workflow %s for coin %s: %s",
                        wf.get("id"), coin_id[:8], e,
                        exc_info=True,
                    )
        except Exception as e:
            logger.error("BuyWorkflowEngine.on_prediction error: %s", e, exc_info=True)

    # ------------------------------------------------------------------
    # Fetch active BUY workflows (with wallet info)
    # ------------------------------------------------------------------

    async def _get_active_buy_workflows(self) -> List[Dict[str, Any]]:
        rows = await fetch("""
            SELECT
                tw.id,
                tw.wallet_id,
                tw.name,
                tw.type,
                tw.chain,
                tw.buy_amount_mode,
                tw.buy_amount_value,
                tw.cooldown_seconds,
                tw.max_open_positions,
                w.alias        AS wallet_alias,
                w.trading_enabled,
                w.virtual_sol_balance,
                w.real_sol_balance,
                w.type         AS wallet_type
            FROM trading_workflows tw
            JOIN wallets w ON tw.wallet_id = w.id
            WHERE tw.type = 'BUY'
              AND tw.is_active = TRUE
        """)
        return [dict(r) for r in rows]

    # ------------------------------------------------------------------
    # Evaluate a single workflow against the incoming prediction
    # ------------------------------------------------------------------

    async def _evaluate_workflow(
        self,
        wf: Dict[str, Any],
        *,
        coin_id: str,
        model_id: Optional[int],
        active_model_id: Optional[int],
        probability: float,
        prediction: int,
        tag: str,
        timestamp: datetime,
    ) -> None:
        steps_log: List[Dict[str, Any]] = []
        wf_id = str(wf["id"])
        wallet_alias = wf["wallet_alias"]

        # --- Parse chain --------------------------------------------------
        chain = wf["chain"]
        if isinstance(chain, str):
            chain = json.loads(chain)

        trigger = chain.get("trigger", {})
        conditions: List[Dict[str, Any]] = chain.get("conditions", [])

        trigger_data = {
            "coin_id": coin_id,
            "model_id": model_id,
            "active_model_id": active_model_id,
            "probability": probability,
            "prediction": prediction,
            "tag": tag,
            "timestamp": timestamp.isoformat() if timestamp else None,
        }

        # --- 1. Trigger model match --------------------------------------
        trigger_model_id = trigger.get("model_id")
        if trigger_model_id is not None:
            match = (
                trigger_model_id == model_id
                or trigger_model_id == active_model_id
            )
            steps_log.append({
                "step": "trigger_model_match",
                "expected_model_id": trigger_model_id,
                "incoming_model_id": model_id,
                "incoming_active_model_id": active_model_id,
                "pass": match,
            })
            if not match:
                await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
                return

        # --- 2. Min probability -------------------------------------------
        min_prob = trigger.get("min_probability")
        if min_prob is not None:
            passed = probability >= min_prob
            steps_log.append({
                "step": "min_probability",
                "required": min_prob,
                "actual": probability,
                "pass": passed,
            })
            if not passed:
                await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
                return

        # --- 3. Cooldown --------------------------------------------------
        cooldown_secs = wf.get("cooldown_seconds", 0)
        if cooldown_secs and cooldown_secs > 0:
            last_ts = self._last_execution.get(wf_id, 0)
            elapsed = time.time() - last_ts
            passed = elapsed >= cooldown_secs
            steps_log.append({
                "step": "cooldown",
                "cooldown_seconds": cooldown_secs,
                "elapsed_seconds": round(elapsed, 1),
                "pass": passed,
            })
            if not passed:
                await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
                return

        # --- 4. Trading enabled -------------------------------------------
        if not wf.get("trading_enabled", True):
            steps_log.append({"step": "trading_enabled", "pass": False})
            await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
            return

        # --- 5. Max open positions ----------------------------------------
        max_positions = wf.get("max_open_positions", 5)
        open_count = await fetchval(
            """
            SELECT COUNT(*)
            FROM positions
            WHERE wallet_id = $1 AND status = 'OPEN'
            """,
            wf["wallet_id"],
        )
        passed = open_count < max_positions
        steps_log.append({
            "step": "max_open_positions",
            "max": max_positions,
            "current": open_count,
            "pass": passed,
        })
        if not passed:
            await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
            return

        # --- 6. Already holding this coin? --------------------------------
        already_holding = await fetchval(
            """
            SELECT 1
            FROM positions
            WHERE wallet_id = $1 AND mint = $2 AND status = 'OPEN'
            """,
            wf["wallet_id"],
            coin_id,
        )
        passed = already_holding is None
        steps_log.append({
            "step": "not_already_holding",
            "coin_id": coin_id,
            "pass": passed,
        })
        if not passed:
            await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
            return

        # --- 7. On-demand prediction conditions ---------------------------
        for idx, cond in enumerate(conditions):
            cond_type = cond.get("type", "on_demand_prediction")
            if cond_type != "on_demand_prediction":
                steps_log.append({
                    "step": f"condition_{idx}",
                    "type": cond_type,
                    "pass": True,
                    "note": "unknown condition type - skipped",
                })
                continue

            cond_passed = await self._evaluate_on_demand_condition(
                cond, coin_id, timestamp, idx, steps_log,
            )
            if not cond_passed:
                await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
                return

        # --- 8. Calculate amount_sol --------------------------------------
        amount_sol = self._calculate_amount(wf)
        if amount_sol is None or amount_sol <= 0:
            steps_log.append({
                "step": "calculate_amount",
                "buy_amount_mode": wf.get("buy_amount_mode"),
                "buy_amount_value": float(wf["buy_amount_value"]) if wf.get("buy_amount_value") else None,
                "pass": False,
                "note": "could not determine buy amount",
            })
            await self._log_execution(wf_id, coin_id, trigger_data, steps_log, "REJECTED")
            return

        steps_log.append({
            "step": "calculate_amount",
            "amount_sol": amount_sol,
            "pass": True,
        })

        # --- 9. Execute buy -----------------------------------------------
        try:
            from backend.modules.buy.trading import TradingService

            buy_result = await TradingService.execute_buy(
                wallet_alias=wallet_alias,
                mint=coin_id,
                amount_sol=amount_sol,
            )

            if buy_result.get("status") == "success":
                # Record cooldown timestamp
                self._last_execution[wf_id] = time.time()

                steps_log.append({
                    "step": "execute_buy",
                    "pass": True,
                    "signature": buy_result.get("signature"),
                    "data": buy_result.get("data"),
                })

                # Try to get trade_log_id from the signature
                trade_log_id = await self._get_trade_log_id(buy_result.get("signature"))

                await self._log_execution(
                    wf_id, coin_id, trigger_data, steps_log,
                    "EXECUTED", trade_log_id=trade_log_id,
                )
                logger.info(
                    "Workflow '%s' EXECUTED buy for %s (%.4f SOL) - %s",
                    wf.get("name"), coin_id[:8], amount_sol,
                    buy_result.get("signature"),
                )
            else:
                steps_log.append({
                    "step": "execute_buy",
                    "pass": False,
                    "status": buy_result.get("status"),
                    "code": buy_result.get("code"),
                    "message": buy_result.get("message"),
                })
                await self._log_execution(
                    wf_id, coin_id, trigger_data, steps_log,
                    "ERROR", error_message=buy_result.get("message"),
                )
                logger.warning(
                    "Workflow '%s' buy FAILED for %s: %s",
                    wf.get("name"), coin_id[:8], buy_result.get("message"),
                )

        except Exception as e:
            steps_log.append({
                "step": "execute_buy",
                "pass": False,
                "error": str(e),
            })
            await self._log_execution(
                wf_id, coin_id, trigger_data, steps_log,
                "ERROR", error_message=str(e),
            )
            logger.error(
                "Workflow '%s' buy exception for %s: %s",
                wf.get("name"), coin_id[:8], e,
                exc_info=True,
            )

    # ------------------------------------------------------------------
    # On-demand prediction condition
    # ------------------------------------------------------------------

    async def _evaluate_on_demand_condition(
        self,
        cond: Dict[str, Any],
        coin_id: str,
        timestamp: datetime,
        idx: int,
        steps_log: List[Dict[str, Any]],
    ) -> bool:
        """Run an on-demand prediction with a specified model and compare
        the result probability against the condition's threshold."""
        cond_model_id = cond.get("model_id")
        threshold = cond.get("threshold", 0.5)
        operator = cond.get("operator", "gte")

        step_entry: Dict[str, Any] = {
            "step": f"condition_{idx}",
            "type": "on_demand_prediction",
            "model_id": cond_model_id,
            "threshold": threshold,
            "operator": operator,
        }

        if cond_model_id is None:
            step_entry["pass"] = False
            step_entry["note"] = "missing model_id in condition"
            steps_log.append(step_entry)
            return False

        try:
            # Load model config from ml_models via prediction_active_models
            pool = get_pool()
            model_config = await pool.fetchrow("""
                SELECT *
                FROM prediction_active_models
                WHERE model_id = $1 AND is_active = TRUE
                LIMIT 1
            """, cond_model_id)

            if not model_config:
                # Fallback: try to find by active_model_id directly
                model_config = await pool.fetchrow("""
                    SELECT *
                    FROM prediction_active_models
                    WHERE id = $1
                    LIMIT 1
                """, cond_model_id)

            if not model_config:
                step_entry["pass"] = False
                step_entry["note"] = f"model_id {cond_model_id} not found in prediction_active_models"
                steps_log.append(step_entry)
                return False

            model_config_dict = dict(model_config)

            from backend.modules.server.predictor import predict_coin

            result = await predict_coin(
                coin_id=coin_id,
                timestamp=timestamp,
                model_config=model_config_dict,
                pool=pool,
            )

            result_prob = result["probability"]
            step_entry["result_probability"] = result_prob
            step_entry["result_prediction"] = result["prediction"]

            passed = self._compare(result_prob, operator, threshold)
            step_entry["pass"] = passed
            steps_log.append(step_entry)
            return passed

        except Exception as e:
            step_entry["pass"] = False
            step_entry["error"] = str(e)
            steps_log.append(step_entry)
            logger.warning(
                "On-demand prediction condition_%d failed for coin %s: %s",
                idx, coin_id[:8], e,
            )
            return False

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compare(value: float, operator: str, threshold: float) -> bool:
        """Compare value against threshold using the given operator."""
        if operator == "gte":
            return value >= threshold
        elif operator == "gt":
            return value > threshold
        elif operator == "lte":
            return value <= threshold
        elif operator == "lt":
            return value < threshold
        else:
            # Default to gte for unknown operators
            return value >= threshold

    def _calculate_amount(self, wf: Dict[str, Any]) -> Optional[float]:
        """Determine the SOL amount to spend based on workflow config."""
        mode = wf.get("buy_amount_mode", "fixed")
        value = wf.get("buy_amount_value")

        if value is None:
            return None

        value = float(value)

        if mode == "fixed":
            return value
        elif mode == "percent":
            # percent of wallet balance
            wallet_type = wf.get("wallet_type", "TEST")
            if wallet_type == "TEST":
                balance = float(wf.get("virtual_sol_balance") or 0)
            else:
                balance = float(wf.get("real_sol_balance") or 0)

            if balance <= 0:
                return None

            return balance * (value / 100.0)
        else:
            return value  # fallback to treating as fixed

    async def _get_trade_log_id(self, signature: Optional[str]) -> Optional[str]:
        """Look up trade_log_id by tx_signature."""
        if not signature:
            return None
        try:
            row = await fetchrow(
                "SELECT id FROM trade_logs WHERE tx_signature = $1",
                signature,
            )
            return str(row["id"]) if row else None
        except Exception:
            return None

    async def _log_execution(
        self,
        workflow_id: str,
        mint: str,
        trigger_data: Dict[str, Any],
        steps_log: List[Dict[str, Any]],
        result: str,
        error_message: Optional[str] = None,
        trade_log_id: Optional[str] = None,
    ) -> None:
        """Write a row to workflow_executions."""
        try:
            pool = get_pool()
            await pool.execute("""
                INSERT INTO workflow_executions
                    (workflow_id, mint, trigger_data, steps_log, result,
                     error_message, trade_log_id)
                VALUES ($1::uuid, $2, $3::jsonb, $4::jsonb, $5, $6, $7::uuid)
            """,
                workflow_id,
                mint,
                json.dumps(trigger_data, default=str),
                json.dumps(steps_log, default=str),
                result,
                error_message,
                trade_log_id,
            )
        except Exception as e:
            logger.error("Failed to log workflow execution: %s", e)


# ============================================================
# Module-level singleton
# ============================================================

_engine: Optional[BuyWorkflowEngine] = None


async def start_buy_workflow_engine() -> BuyWorkflowEngine:
    """Create and return the singleton BuyWorkflowEngine."""
    global _engine
    if _engine is None:
        _engine = BuyWorkflowEngine()
        logger.info("BuyWorkflowEngine started")
    return _engine


def get_buy_workflow_engine() -> Optional[BuyWorkflowEngine]:
    """Return the current engine instance (or None if not started)."""
    return _engine
