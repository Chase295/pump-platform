"""
Prediction Defaults – key-value settings applied to newly imported models.

Follows the same pattern as training/auto_retrain.py (get/update helpers
backed by a key-value table with JSONB values).
"""

import json
import logging
from typing import Dict, Any

from backend.database import get_pool

logger = logging.getLogger(__name__)

# Schema defaults – used when a key is missing from the DB table.
PREDICTION_DEFAULTS_SCHEMA: Dict[str, Any] = {
    "alert_threshold": 0.7,
    "n8n_enabled": True,
    "n8n_webhook_url": "",
    "n8n_send_mode": ["all"],
    "ignore_bad_seconds": 0,
    "ignore_positive_seconds": 0,
    "ignore_alert_seconds": 0,
    "max_log_entries_per_coin_negative": 0,
    "max_log_entries_per_coin_positive": 0,
    "max_log_entries_per_coin_alert": 0,
    "send_ignored_to_n8n": False,
}


async def get_all_prediction_defaults() -> Dict[str, Any]:
    """Return all prediction defaults, filling missing keys from the schema."""
    pool = get_pool()
    try:
        rows = await pool.fetch("SELECT key, value FROM prediction_defaults")
        result: Dict[str, Any] = {}
        for row in rows:
            val = row["value"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    pass
            result[row["key"]] = val

        # Fill any missing keys from schema
        for key, default in PREDICTION_DEFAULTS_SCHEMA.items():
            if key not in result:
                result[key] = default

        return result
    except Exception as e:
        logger.error("Error loading prediction defaults: %s", e)
        return dict(PREDICTION_DEFAULTS_SCHEMA)


async def update_prediction_defaults(updates: Dict[str, Any]) -> Dict[str, Any]:
    """UPSERT prediction defaults. Returns the full updated dict."""
    pool = get_pool()
    for key, value in updates.items():
        if key not in PREDICTION_DEFAULTS_SCHEMA:
            continue
        json_value = value if isinstance(value, str) else json.dumps(value)
        await pool.execute(
            """
            INSERT INTO prediction_defaults (key, value, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()
            """,
            key, json_value,
        )
    return await get_all_prediction_defaults()
