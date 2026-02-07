"""
Alert Evaluation System for Server module.

Migrated from pump-server/backend/app/database/alert_models.py,
evaluation_job.py, and alert_evaluator.py.

Handles alert evaluation, ATH tracking, and n8n webhook notifications.
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, Any

import aiohttp

from backend.config import settings
from backend.database import get_pool, fetch, fetchrow, fetchval, execute
from backend.modules.server.db_queries import get_coin_metrics_at_timestamp

logger = logging.getLogger(__name__)


# ============================================================
# Alert Evaluation
# ============================================================

async def evaluate_pending_predictions(batch_size: int = 100) -> Dict[str, int]:
    """
    Evaluate all 'aktiv' entries in model_predictions.

    Evaluates ALL pending predictions regardless of model status.
    Even predictions from deleted or deactivated models are evaluated.
    If model configuration is missing, evaluation_result='not_applicable' is set.

    Args:
        batch_size: Maximum number of entries to process

    Returns:
        Dict with statistics (evaluated, success, failed, not_applicable)
    """
    pool = get_pool()

    # Get ALL pending predictions (regardless of model status)
    rows = await pool.fetch("""
        SELECT
            mp.*,
            pam.future_minutes,
            pam.price_change_percent,
            pam.target_direction,
            cm_eval.price_open as eval_price_open,
            cm_eval.price_high as eval_price_high,
            cm_eval.price_low as eval_price_low,
            cm_eval.price_close as eval_price_close,
            cm_eval.market_cap_close as eval_market_cap_close,
            cm_eval.volume_sol as eval_volume_sol,
            cm_eval.phase_id_at_time as eval_phase_id
        FROM model_predictions mp
        LEFT JOIN prediction_active_models pam ON pam.id = mp.active_model_id
        LEFT JOIN LATERAL (
            SELECT *
            FROM coin_metrics
            WHERE mint = mp.coin_id
              AND timestamp <= mp.evaluation_timestamp
            ORDER BY timestamp DESC
            LIMIT 1
        ) cm_eval ON true
        WHERE mp.status = 'aktiv'
          AND mp.evaluation_timestamp <= NOW()
        ORDER BY mp.evaluation_timestamp ASC
        LIMIT $1
    """, batch_size * 10)

    if not rows:
        logger.debug("No pending evaluations")
        return {'evaluated': 0, 'success': 0, 'failed': 0, 'not_applicable': 0, 'errors': 0}

    logger.debug(f"{len(rows)} pending evaluations found")

    stats = {
        'evaluated': 0,
        'success': 0,
        'failed': 0,
        'not_applicable': 0,
        'errors': 0
    }

    # OPTIMIZATION: Collect all updates and execute in batches (much faster)
    updates_to_execute = []

    for row in rows:
        try:
            prediction_id = row['id']
            coin_id = row['coin_id']
            tag = row['tag']
            prediction = row['prediction']
            evaluation_timestamp = row['evaluation_timestamp']

            # Metrics are already in the JOIN (much faster)
            if row.get('eval_price_close') is not None:
                current_metrics = {
                    'price_open': float(row['eval_price_open']) if row['eval_price_open'] else None,
                    'price_high': float(row['eval_price_high']) if row['eval_price_high'] else None,
                    'price_low': float(row['eval_price_low']) if row['eval_price_low'] else None,
                    'price_close': float(row['eval_price_close']) if row['eval_price_close'] else None,
                    'market_cap_close': float(row['eval_market_cap_close']) if row['eval_market_cap_close'] else None,
                    'volume_sol': float(row['eval_volume_sol']) if row['eval_volume_sol'] else None,
                    'phase_id': int(row['eval_phase_id']) if row['eval_phase_id'] else None
                }
            else:
                current_metrics = None

            if not current_metrics:
                logger.warning(f"No metrics found for coin {coin_id[:12]}... at timestamp {evaluation_timestamp} (Prediction ID: {prediction_id})")
                updates_to_execute.append((
                    'inaktiv',
                    'not_applicable',
                    None,  # actual_change_pct
                    'No metrics at evaluation_timestamp found',
                    None, None, None, None, None, None, None,
                    None, None,  # ATH
                    prediction_id
                ))
                stats['not_applicable'] += 1
                stats['evaluated'] += 1
                continue

            # Calculate actual price change
            from decimal import Decimal

            price_close_at_evaluation_to_save = row.get('eval_price_close')
            if price_close_at_evaluation_to_save is not None:
                if isinstance(price_close_at_evaluation_to_save, Decimal):
                    price_close_at_evaluation_to_save = float(price_close_at_evaluation_to_save)
                else:
                    price_close_at_evaluation_to_save = float(price_close_at_evaluation_to_save)

            price_close_at_start_raw = row['price_close_at_prediction']

            if price_close_at_start_raw is not None:
                if isinstance(price_close_at_start_raw, Decimal):
                    price_close_at_start = float(price_close_at_start_raw)
                else:
                    price_close_at_start = float(price_close_at_start_raw)
            else:
                price_close_at_start = None

            if price_close_at_start and price_close_at_evaluation_to_save:
                # Actual percentage gain/loss
                actual_change_pct = ((price_close_at_evaluation_to_save - price_close_at_start) / price_close_at_start) * 100
                logger.debug(f"{prediction_id}: actual_change_pct={actual_change_pct:.2f}% (absolute gain: {price_close_at_start:.2e} → {price_close_at_evaluation_to_save:.2e})")
            else:
                actual_change_pct = None
                logger.debug(f"No price data for Prediction {prediction_id}: start={price_close_at_start}, evaluation={price_close_at_evaluation_to_save}")

            # Determine evaluation_result
            evaluation_result = 'not_applicable'
            evaluation_note = None

            # Get model configuration for evaluation
            target_change = float(row.get('price_change_percent')) if row.get('price_change_percent') else None
            target_direction = row.get('target_direction') or 'up'
            future_minutes = row.get('future_minutes') or 10

            if actual_change_pct is None:
                evaluation_result = 'not_applicable'
                evaluation_note = 'Price data not available'
            elif target_change is None:
                # No target defined - cannot be evaluated
                evaluation_result = 'not_applicable'
                if row.get('future_minutes') is None:
                    evaluation_note = 'Model deleted or deactivated - no configuration available'
                else:
                    evaluation_note = 'No target (price_change_percent) defined'
            else:
                # Evaluation based on prediction and actual change
                if prediction == 1:
                    # Positive prediction: Expected price increase
                    if target_direction == 'up':
                        if actual_change_pct >= target_change:
                            evaluation_result = 'success'
                            evaluation_note = f'Price rose by {actual_change_pct:.2f}% (Target: {target_change}%)'
                        else:
                            evaluation_result = 'failed'
                            evaluation_note = f'Price only rose by {actual_change_pct:.2f}% (Target: {target_change}%)'
                    else:  # down
                        if actual_change_pct <= -target_change:
                            evaluation_result = 'success'
                            evaluation_note = f'Price fell by {abs(actual_change_pct):.2f}% (Target: {target_change}%)'
                        else:
                            evaluation_result = 'failed'
                            evaluation_note = f'Price only fell by {abs(actual_change_pct):.2f}% (Target: {target_change}%)'
                else:
                    # Negative prediction (prediction=0): Expected NO price increase
                    if target_direction == 'up':
                        if actual_change_pct < target_change:
                            evaluation_result = 'success'
                            evaluation_note = f'Price only rose by {actual_change_pct:.2f}% (Target was ≥{target_change}% - correct negative)'
                        else:
                            evaluation_result = 'failed'
                            evaluation_note = f'Price rose by {actual_change_pct:.2f}% (Target was ≥{target_change}% - false negative)'
                    else:  # down
                        if actual_change_pct > -target_change:
                            evaluation_result = 'success'
                            evaluation_note = f'Price only fell by {abs(actual_change_pct):.2f}% (Target was ≤-{target_change}% - correct negative)'
                        else:
                            evaluation_result = 'failed'
                            evaluation_note = f'Price fell by {abs(actual_change_pct):.2f}% (Target was ≤-{target_change}% - false negative)'

            # Final ATH check
            final_ath_highest = row.get('ath_highest_pct')
            final_ath_lowest = row.get('ath_lowest_pct')

            if actual_change_pct is not None:
                if actual_change_pct > 0:
                    if final_ath_highest is None or actual_change_pct > float(final_ath_highest):
                        final_ath_highest = actual_change_pct
                if actual_change_pct < 0:
                    if final_ath_lowest is None or actual_change_pct < float(final_ath_lowest):
                        final_ath_lowest = actual_change_pct

            if price_close_at_evaluation_to_save is None:
                logger.warning(f"Prediction {prediction_id}: price_close_at_evaluation_to_save is None! Using price_close_at_start as fallback.")
                price_close_at_evaluation_to_save = price_close_at_start

            updates_to_execute.append((
                'inaktiv',
                evaluation_result,
                actual_change_pct,
                evaluation_note,
                price_close_at_evaluation_to_save,
                current_metrics.get('price_open') if current_metrics else None,
                current_metrics.get('price_high') if current_metrics else None,
                current_metrics.get('price_low') if current_metrics else None,
                current_metrics.get('market_cap_close') if current_metrics else None,
                current_metrics.get('volume_sol') if current_metrics else None,
                current_metrics.get('phase_id') if current_metrics else None,
                final_ath_highest,
                final_ath_lowest,
                prediction_id
            ))

            stats['evaluated'] += 1
            if evaluation_result == 'success':
                stats['success'] += 1
            elif evaluation_result == 'failed':
                stats['failed'] += 1
            else:
                stats['not_applicable'] += 1

            logger.debug(f"Prediction {prediction_id} evaluated: {evaluation_result} ({evaluation_note})")

        except Exception as e:
            logger.error(f"Error evaluating Prediction {row.get('id')}: {e}", exc_info=True)
            stats['errors'] += 1

    # OPTIMIZATION: Execute all UPDATEs in batches (much faster)
    if updates_to_execute:
        batch_size_inner = 50
        total_batches = (len(updates_to_execute) + batch_size_inner - 1) // batch_size_inner

        for batch_idx in range(total_batches):
            batch = updates_to_execute[batch_idx * batch_size_inner:(batch_idx + 1) * batch_size_inner]

            tasks = []
            for update_data in batch:
                tasks.append(pool.execute("""
                    UPDATE model_predictions
                    SET status = $1,
                        evaluated_at = NOW(),
                        evaluation_result = $2,
                        actual_price_change_pct = $3,
                        evaluation_note = $4,
                        price_close_at_evaluation = $5,
                        price_open_at_evaluation = $6,
                        price_high_at_evaluation = $7,
                        price_low_at_evaluation = $8,
                        market_cap_at_evaluation = $9,
                        volume_at_evaluation = $10,
                        phase_id_at_evaluation = $11,
                        ath_highest_pct = $12,
                        ath_lowest_pct = $13,
                        updated_at = NOW()
                    WHERE id = $14
                """, *update_data))

            await asyncio.gather(*tasks, return_exceptions=True)

        logger.debug(f"{len(updates_to_execute)} updates executed in {total_batches} batches")

    return stats


# ============================================================
# n8n Webhook Notifications
# ============================================================

async def send_n8n_webhook(
    webhook_url: str,
    payload: Dict[str, Any],
    timeout: int = 10
) -> bool:
    """
    Send webhook notification to n8n.

    Args:
        webhook_url: n8n webhook URL
        payload: Data to send
        timeout: Request timeout in seconds

    Returns:
        True if successful, False otherwise
    """
    if not webhook_url:
        return False

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.post(webhook_url, json=payload) as response:
                if response.status == 200:
                    logger.debug(f"n8n webhook sent successfully: {webhook_url}")
                    return True
                else:
                    error_text = await response.text()
                    logger.warning(f"n8n webhook failed ({response.status}): {error_text}")
                    return False
    except aiohttp.ClientError as e:
        logger.warning(f"n8n webhook network error: {e}")
        return False
    except Exception as e:
        logger.error(f"n8n webhook error: {e}", exc_info=True)
        return False


async def check_n8n_status(webhook_url: str) -> str:
    """
    Check n8n webhook status.

    Args:
        webhook_url: n8n webhook URL

    Returns:
        Status string: 'ok', 'error', 'no_url'
    """
    if not webhook_url:
        return 'no_url'

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5)) as session:
            async with session.get(webhook_url) as response:
                if response.status < 500:
                    return 'ok'
                else:
                    return 'error'
    except Exception:
        return 'error'


# ============================================================
# Alert Evaluator Background Service
# ============================================================

class AlertEvaluator:
    """Background service for alert evaluation"""

    def __init__(self, interval_seconds: int = 30):
        """
        Args:
            interval_seconds: Interval between evaluation runs (default: 30 seconds)
        """
        self.interval_seconds = interval_seconds
        self.running = False
        self.last_run: Optional[datetime] = None
        self.stats: Dict[str, int] = {'total_evaluated': 0, 'total_success': 0, 'total_failed': 0}

    async def run_once(self) -> Dict[str, int]:
        """Execute a single evaluation round"""
        try:
            logger.debug("Starting alert evaluation...")

            # Final evaluation: Only for alerts whose evaluation_timestamp has been reached
            stats = await evaluate_pending_predictions(batch_size=100)

            # Update overall statistics
            self.stats['total_evaluated'] += stats.get('evaluated', 0)
            self.stats['total_success'] += stats.get('success', 0)
            self.stats['total_failed'] += stats.get('failed', 0)

            if stats.get('evaluated', 0) > 0:
                logger.info(
                    f"Alert evaluation completed: "
                    f"{stats.get('evaluated', 0)} evaluated "
                    f"({stats.get('success', 0)} successful, "
                    f"{stats.get('failed', 0)} failed)"
                )

            self.last_run = datetime.now(timezone.utc)
            return stats

        except Exception as e:
            logger.error(f"Error in alert evaluation: {e}", exc_info=True)
            return {'evaluated': 0, 'success': 0, 'failed': 0}

    async def start(self):
        """Start the alert evaluator as background service"""
        self.running = True
        logger.info(f"Alert evaluator started (interval: {self.interval_seconds}s)")

        # Wait briefly so DB connection is ready
        await asyncio.sleep(5)

        while self.running:
            try:
                await self.run_once()
            except Exception as e:
                logger.error(f"Error in alert evaluator loop: {e}", exc_info=True)

            # Wait for next interval
            await asyncio.sleep(self.interval_seconds)

    async def stop(self):
        """Stop the alert evaluator"""
        self.running = False
        logger.info("Alert evaluator stopped")

    def get_stats(self) -> Dict[str, Any]:
        """Get current statistics"""
        return {
            **self.stats,
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'interval_seconds': self.interval_seconds,
            'running': self.running
        }


# Global instance
_alert_evaluator: Optional[AlertEvaluator] = None


async def start_alert_evaluator(interval_seconds: int = 30):
    """Start the alert evaluator as background task"""
    global _alert_evaluator

    if _alert_evaluator is None:
        _alert_evaluator = AlertEvaluator(interval_seconds=interval_seconds)
        asyncio.create_task(_alert_evaluator.start())
        logger.info("Alert evaluator background task started")
    else:
        logger.warning("Alert evaluator already running")


async def stop_alert_evaluator():
    """Stop the alert evaluator"""
    global _alert_evaluator

    if _alert_evaluator:
        await _alert_evaluator.stop()
        _alert_evaluator = None
        logger.info("Alert evaluator stopped")


def get_alert_evaluator() -> Optional[AlertEvaluator]:
    """Get the current alert evaluator instance"""
    return _alert_evaluator
