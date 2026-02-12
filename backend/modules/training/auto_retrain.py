"""
Auto-Retrain & Drift Detection for the Training module.

Provides an ``AutoRetrainManager`` that runs as a background task.
It periodically checks if models need retraining based on:
  - Scheduled intervals (daily, every 2 days, weekly)
  - Drift detection (accuracy dropping below threshold)
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional

from backend.database import get_pool

logger = logging.getLogger(__name__)


async def get_training_setting(key: str, default=None):
    """Get a single training setting value."""
    pool = get_pool()
    try:
        row = await pool.fetchrow(
            "SELECT value FROM training_settings WHERE key = $1", key
        )
        if row:
            import json
            return json.loads(row["value"]) if isinstance(row["value"], str) else row["value"]
        return default
    except Exception:
        return default


async def get_all_training_settings() -> Dict[str, Any]:
    """Get all training settings as a dict."""
    pool = get_pool()
    try:
        rows = await pool.fetch("SELECT key, value FROM training_settings")
        import json
        result = {}
        for row in rows:
            val = row["value"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    pass
            result[row["key"]] = val
        return result
    except Exception as e:
        logger.error("Error loading training settings: %s", e)
        return {}


async def update_training_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    """Update training settings. Returns the updated settings."""
    pool = get_pool()
    import json
    for key, value in updates.items():
        json_value = json.dumps(value)
        await pool.execute(
            """
            INSERT INTO training_settings (key, value, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()
            """,
            key, json_value,
        )
    return await get_all_training_settings()


class AutoRetrainManager:
    """Background task that handles auto-retrain and drift detection.

    Usage::

        manager = AutoRetrainManager()
        await manager.start()
        await manager.stop()
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("AutoRetrainManager started")

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("AutoRetrainManager stopped")

    async def _loop(self):
        # Wait a bit on startup before first check
        await asyncio.sleep(60)

        while self._running:
            try:
                await self._check_drift()
                await self._check_auto_retrain()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("AutoRetrainManager error: %s", e, exc_info=True)

            # Sleep for check interval
            interval_hours = await get_training_setting("drift_check_interval_hours", 6)
            await asyncio.sleep(int(interval_hours) * 3600)

    async def _check_drift(self):
        """Check if any active models have drifted below accuracy threshold."""
        enabled = await get_training_setting("drift_detection_enabled", False)
        if not enabled:
            return

        threshold = await get_training_setting("drift_accuracy_threshold", 0.5)
        logger.info("Drift detection: checking active models (threshold: %.2f)", threshold)

        try:
            pool = get_pool()
            # Get active models from server module
            active_models = await pool.fetch(
                "SELECT id, model_id, custom_name FROM active_models WHERE status = 'active'"
            )

            for am in active_models:
                active_model_id = am["id"]
                # Check recent alert evaluation accuracy
                row = await pool.fetchrow(
                    """
                    SELECT
                        COUNT(*) AS total,
                        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes
                    FROM alert_evaluations
                    WHERE active_model_id = $1
                      AND evaluated_at >= NOW() - INTERVAL '24 hours'
                    """,
                    active_model_id,
                )
                if row and row["total"] and row["total"] > 10:
                    accuracy = row["successes"] / row["total"]
                    if accuracy < threshold:
                        logger.warning(
                            "DRIFT DETECTED: active_model %d accuracy %.2f < threshold %.2f",
                            active_model_id, accuracy, threshold,
                        )
        except Exception as e:
            logger.warning("Drift detection failed: %s", e)

    async def _check_auto_retrain(self):
        """Check if auto-retrain should be triggered."""
        enabled = await get_training_setting("auto_retrain_enabled", False)
        if not enabled:
            return

        base_model_id = await get_training_setting("auto_retrain_base_model_id")
        if not base_model_id:
            return

        schedule = await get_training_setting("auto_retrain_schedule", "daily")
        logger.info("Auto-retrain check: base_model=%s, schedule=%s", base_model_id, schedule)

        try:
            from backend.modules.training.db_queries import get_model, create_job

            model = await get_model(int(base_model_id))
            if not model or model.get("is_deleted"):
                logger.warning("Auto-retrain base model %s not found", base_model_id)
                return

            # Check if we already retrained recently
            pool = get_pool()
            last_retrain = await pool.fetchrow(
                """
                SELECT created_at FROM ml_jobs
                WHERE job_type = 'TRAIN'
                  AND progress_msg LIKE '%auto-retrain%'
                  AND status IN ('COMPLETED', 'RUNNING', 'PENDING')
                ORDER BY created_at DESC LIMIT 1
                """
            )

            if last_retrain:
                hours_since = (datetime.now(timezone.utc) - last_retrain["created_at"]).total_seconds() / 3600
                min_hours = {"daily": 20, "every_2_days": 44, "weekly": 164}.get(schedule, 20)
                if hours_since < min_hours:
                    return

            # Create a new TRAIN job with recent data
            now = datetime.now(timezone.utc)
            params = model.get("params", {}) or {}
            train_duration = (model["train_end"] - model["train_start"]).total_seconds()
            new_end = now
            new_start = now - timedelta(seconds=train_duration)

            job_id = await create_job(
                job_type="TRAIN",
                priority=3,
                train_model_type=model["model_type"],
                train_target_var=model["target_variable"],
                train_operator=model.get("target_operator"),
                train_value=float(model["target_value"]) if model.get("target_value") else None,
                train_start=new_start,
                train_end=new_end,
                train_features=model["features"],
                train_phases=model["phases"],
                train_params=params,
                progress_msg=f"{model['name']}_auto-retrain_{now.strftime('%Y%m%d')}",
            )
            logger.info("Auto-retrain job created: %d (base model: %s)", job_id, base_model_id)

        except Exception as e:
            logger.error("Auto-retrain failed: %s", e, exc_info=True)
