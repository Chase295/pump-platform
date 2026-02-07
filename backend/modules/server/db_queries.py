"""
Database operations for the Server module (Predictions).

Migrated from pump-server/backend/app/database/models.py and alert_models.py.
Uses the shared database pool from backend.database.

All functions use fetch / fetchrow / fetchval / execute helpers
from backend.database instead of acquiring pool connections directly.
"""

import json
import logging
import os
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta, timezone

from backend.database import get_pool, fetch, fetchrow, fetchval, execute

logger = logging.getLogger(__name__)


# ============================================================
# Helpers
# ============================================================

def _parse_send_mode(value: Any) -> List[str]:
    """Convert n8n_send_mode from JSONB Array or String to Python List."""
    if value is None:
        return ['all']

    if isinstance(value, list):
        return value

    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
            return [value]
        except (json.JSONDecodeError, TypeError):
            return [value]

    if isinstance(value, dict):
        if 'value' in value:
            return value['value'] if isinstance(value['value'], list) else [value['value']]
        return list(value.values()) if value else ['all']

    return ['all']


# ============================================================
# prediction_active_models - CRUD operations
# ============================================================

async def get_available_models_for_import() -> List[Dict[str, Any]]:
    """
    Get all available models from training module (for import).

    Filter:
    - status = 'READY' AND is_deleted = false
    - NOT already in prediction_active_models

    Returns:
        List of models with metadata
    """
    # Direct import from training module instead of HTTP call
    from backend.modules.training.db_queries import list_models as get_training_models

    try:
        # Get READY models from training module
        training_models = await get_training_models(status='READY', limit=1000)

        # Filter out already imported models
        imported_model_ids = await fetch("""
            SELECT DISTINCT model_id
            FROM prediction_active_models
        """)
        imported_ids = {row['model_id'] for row in imported_model_ids}

        available_models = []
        for model in training_models:
            if model['id'] not in imported_ids:
                params = model.get('params', {})
                time_based = params.get('_time_based', {}) if isinstance(params, dict) else {}

                available_models.append({
                    'id': model['id'],
                    'name': model['name'],
                    'model_type': model['model_type'],
                    'model_file_path': model.get('model_file_path'),
                    'target_variable': model.get('target_variable'),
                    'target_operator': model.get('target_operator'),
                    'target_value': float(model['target_value']) if model.get('target_value') else None,
                    'future_minutes': time_based.get('future_minutes') if time_based else model.get('future_minutes'),
                    'price_change_percent': time_based.get('min_percent_change') if time_based else model.get('price_change_percent'),
                    'target_direction': time_based.get('direction') if time_based else model.get('target_direction'),
                    'features': model.get('features', []),
                    'phases': model.get('phases'),
                    'params': params,
                    'training_accuracy': float(model['training_accuracy']) if model.get('training_accuracy') else None,
                    'training_f1': float(model['training_f1']) if model.get('training_f1') else None,
                    'training_precision': float(model['training_precision']) if model.get('training_precision') else None,
                    'training_recall': float(model['training_recall']) if model.get('training_recall') else None,
                    'created_at': model.get('created_at')
                })

        logger.info(f"Found {len(available_models)} available models (after filtering)")
        return available_models

    except Exception as e:
        logger.error(f"Error getting available models: {e}", exc_info=True)
        return []


async def get_model_from_training_module(model_id: int) -> Optional[Dict[str, Any]]:
    """
    Get model metadata directly from training module.

    Args:
        model_id: ID of the model in ml_models

    Returns:
        Model dict or None if not found
    """
    from backend.modules.training.db_queries import get_model

    try:
        model = await get_model(model_id)
        if not model:
            return None

        params = model.get('params', {})
        time_based = params.get('_time_based', {}) if isinstance(params, dict) else {}

        return {
            'id': model['id'],
            'name': model['name'],
            'model_type': model['model_type'],
            'model_file_path': model.get('model_file_path'),
            'target_variable': model.get('target_variable'),
            'target_operator': model.get('target_operator'),
            'target_value': float(model['target_value']) if model.get('target_value') else None,
            'future_minutes': time_based.get('future_minutes') if time_based else model.get('future_minutes'),
            'price_change_percent': time_based.get('min_percent_change') if time_based else model.get('price_change_percent'),
            'target_direction': time_based.get('direction') if time_based else model.get('target_direction'),
            'features': model.get('features', []),
            'phases': model.get('phases'),
            'params': params,
            'training_accuracy': float(model['training_accuracy']) if model.get('training_accuracy') else None,
            'training_f1': float(model['training_f1']) if model.get('training_f1') else None,
            'training_precision': float(model['training_precision']) if model.get('training_precision') else None,
            'training_recall': float(model['training_recall']) if model.get('training_recall') else None,
            'roc_auc': float(model['roc_auc']) if model.get('roc_auc') else None,
            'mcc': float(model['mcc']) if model.get('mcc') else None,
            'confusion_matrix': model.get('confusion_matrix'),
            'simulated_profit_pct': float(model['simulated_profit_pct']) if model.get('simulated_profit_pct') else None,
            'created_at': model.get('created_at')
        }
    except Exception as e:
        logger.error(f"Error getting model {model_id} from training module: {e}", exc_info=True)
        return None


async def get_active_models(include_inactive: bool = False) -> List[Dict[str, Any]]:
    """
    Get all active models from prediction_active_models.

    Args:
        include_inactive: If True, also return inactive models

    Returns:
        List of model configurations with statistics
    """
    pool = get_pool()

    where_clause = "WHERE is_active = true" if not include_inactive else ""

    rows = await pool.fetch(f"""
        SELECT
            id, model_id, model_name, model_type,
            target_variable, target_operator, target_value,
            future_minutes, price_change_percent, target_direction,
            features, phases, params,
            local_model_path, model_file_url,
            is_active, last_prediction_at, total_predictions,
            downloaded_at, activated_at, created_at, updated_at,
            custom_name, alert_threshold,
            n8n_webhook_url, n8n_send_mode, n8n_enabled,
            ignore_bad_seconds, ignore_positive_seconds, ignore_alert_seconds,
            coin_filter_mode, coin_whitelist,
            min_scan_interval_seconds,
            max_log_entries_per_coin_negative, max_log_entries_per_coin_positive, max_log_entries_per_coin_alert,
            send_ignored_to_n8n,
            training_accuracy, training_f1, training_precision, training_recall,
            roc_auc, mcc, confusion_matrix, simulated_profit_pct
        FROM prediction_active_models
        {where_clause}
        ORDER BY is_active DESC, created_at DESC
    """)

    # Get statistics for all models in one query (more efficient)
    if rows:
        active_model_ids = [row['id'] for row in rows]
        stats_rows = await pool.fetch("""
            SELECT
                active_model_id,
                COUNT(*) as total_predictions,
                COUNT(*) FILTER (WHERE tag = 'alert') as positive_predictions,
                COUNT(*) FILTER (WHERE tag != 'alert') as negative_predictions,
                AVG(probability) as avg_probability
            FROM model_predictions
            WHERE active_model_id = ANY($1::bigint[])
            GROUP BY active_model_id
        """, active_model_ids)

        stats_dict = {
            row['active_model_id']: {
                'total': row['total_predictions'],
                'positive': row['positive_predictions'],
                'negative': row['negative_predictions'],
                'avg_probability': float(row['avg_probability']) if row['avg_probability'] else None
            }
            for row in stats_rows
        }

        alert_stats_rows = await pool.fetch("""
            SELECT
                active_model_id,
                COUNT(*) FILTER (WHERE tag = 'alert') as alerts_count
            FROM model_predictions
            WHERE active_model_id = ANY($1::bigint[])
            GROUP BY active_model_id
        """, active_model_ids)

        alerts_dict = {
            row['active_model_id']: row['alerts_count']
            for row in alert_stats_rows
        }
    else:
        stats_dict = {}
        alerts_dict = {}

    models = []
    for row in rows:
        # Convert JSONB fields
        features = row['features']
        if isinstance(features, str):
            features = json.loads(features)

        phases = row['phases']
        if phases is not None:
            if isinstance(phases, str):
                try:
                    parsed = json.loads(phases)
                    if isinstance(parsed, str):
                        parsed = json.loads(parsed)
                    phases = parsed
                except (json.JSONDecodeError, TypeError):
                    phases = None
            elif not isinstance(phases, list):
                phases = None

        params = row['params']
        if params is not None and isinstance(params, str):
            params = json.loads(params)

        model_stats = stats_dict.get(row['id'], {})
        model_alerts = alerts_dict.get(row['id'], 0)

        models.append({
            'id': row['id'],
            'model_id': row['model_id'],
            'name': row['model_name'],
            'custom_name': row['custom_name'],
            'model_type': row['model_type'],
            'target_variable': row['target_variable'],
            'target_operator': row['target_operator'],
            'target_value': float(row['target_value']) if row['target_value'] else None,
            'future_minutes': row['future_minutes'],
            'price_change_percent': float(row['price_change_percent']) if row['price_change_percent'] else None,
            'target_direction': row['target_direction'],
            'features': features,
            'phases': phases,
            'params': params,
            'local_model_path': row['local_model_path'],
            'model_file_url': row['model_file_url'],
            'is_active': row['is_active'],
            'last_prediction_at': row['last_prediction_at'],
            'total_predictions': model_stats.get('total', 0),
            'positive_predictions': model_stats.get('positive', 0),
            'average_probability': model_stats.get('avg_probability'),
            'downloaded_at': row['downloaded_at'],
            'activated_at': row['activated_at'],
            'created_at': row['created_at'],
            'updated_at': row['updated_at'],
            'alert_threshold': float(row['alert_threshold']) if row.get('alert_threshold') is not None else 0.7,
            'n8n_webhook_url': row.get('n8n_webhook_url'),
            'n8n_send_mode': _parse_send_mode(row.get('n8n_send_mode', 'all')),
            'n8n_enabled': row['n8n_enabled'] if row['n8n_enabled'] is not None else True,
            'ignore_bad_seconds': row['ignore_bad_seconds'] if row['ignore_bad_seconds'] is not None else 0,
            'ignore_positive_seconds': row['ignore_positive_seconds'] if row['ignore_positive_seconds'] is not None else 0,
            'ignore_alert_seconds': row['ignore_alert_seconds'] if row['ignore_alert_seconds'] is not None else 0,
            'coin_filter_mode': row.get('coin_filter_mode') or 'all',
            'coin_whitelist': json.loads(row['coin_whitelist']) if row.get('coin_whitelist') else None,
            'min_scan_interval_seconds': row['min_scan_interval_seconds'] if row.get('min_scan_interval_seconds') is not None else 20,
            'max_log_entries_per_coin_negative': row['max_log_entries_per_coin_negative'] if row.get('max_log_entries_per_coin_negative') is not None else 0,
            'max_log_entries_per_coin_positive': row['max_log_entries_per_coin_positive'] if row.get('max_log_entries_per_coin_positive') is not None else 0,
            'max_log_entries_per_coin_alert': row['max_log_entries_per_coin_alert'] if row.get('max_log_entries_per_coin_alert') is not None else 0,
            'send_ignored_to_n8n': row.get('send_ignored_to_n8n', False),
            'accuracy': float(row['training_accuracy']) if row.get('training_accuracy') else None,
            'f1_score': float(row['training_f1']) if row.get('training_f1') else None,
            'precision': float(row['training_precision']) if row.get('training_precision') else None,
            'recall': float(row['training_recall']) if row.get('training_recall') else None,
            'training_accuracy': float(row['training_accuracy']) if row.get('training_accuracy') else None,
            'training_f1': float(row['training_f1']) if row.get('training_f1') else None,
            'training_precision': float(row['training_precision']) if row.get('training_precision') else None,
            'training_recall': float(row['training_recall']) if row.get('training_recall') else None,
            'roc_auc': float(row['roc_auc']) if row.get('roc_auc') else None,
            'mcc': float(row['mcc']) if row.get('mcc') else None,
            'confusion_matrix': row['confusion_matrix'],
            'simulated_profit_pct': float(row['simulated_profit_pct']) if row.get('simulated_profit_pct') else None,
            'stats': {
                'total_predictions': model_stats.get('total', 0),
                'positive_predictions': model_stats.get('positive', 0),
                'negative_predictions': model_stats.get('negative', 0),
                'alerts_count': model_alerts
            },
            'model_file_exists': bool(row['local_model_path'] and os.path.exists(row['local_model_path']))
        })

    return models


async def import_model(
    model_id: int,
    model_obj: Any
) -> int:
    """
    Import model into prediction_active_models.

    IMPORTANT: Uses direct Python import from training module, NOT HTTP download.

    Args:
        model_id: ID of the model in ml_models
        model_obj: Loaded model object from training module

    Returns:
        ID of new entry in prediction_active_models

    Raises:
        ValueError: If model not found or already imported
    """
    pool = get_pool()

    # Use transaction with lock to prevent race conditions
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Check if model already imported
            existing = await conn.fetchrow("""
                SELECT id, is_active FROM prediction_active_models
                WHERE model_id = $1
                FOR UPDATE
            """, model_id)

            if existing:
                existing_id = existing['id']
                is_active = existing.get('is_active', False)
                status = "active" if is_active else "paused"
                raise ValueError(f"Model {model_id} is already imported (active_model_id: {existing_id}, status: {status})")

            # Get metadata from training module
            model_data = await get_model_from_training_module(model_id)
            if not model_data:
                raise ValueError(f"Model {model_id} not found or not READY in training module")

            # Validate feature count against actual model
            actual_features = getattr(model_obj, 'n_features_in_', None)
            api_features = len(model_data.get('features', []))
            if actual_features and actual_features != api_features:
                logger.warning(
                    f"FEATURE-MISMATCH when importing model {model_id}: "
                    f"Model expects {actual_features} features, "
                    f"training module provides {api_features} features. "
                    f"Prediction will still be attempted (feature augmentation active)."
                )

            # Convert JSONB fields to JSON strings
            features_data = model_data['features']
            features_json = json.dumps(features_data) if isinstance(features_data, list) else features_data

            phases_data = model_data['phases']
            phases_json = None if phases_data is None else (json.dumps(phases_data) if isinstance(phases_data, list) else phases_data)

            params_data = model_data['params']
            params_json = None if params_data is None else (json.dumps(params_data) if isinstance(params_data, dict) else params_data)

            # Performance metrics from model_data
            training_accuracy = model_data.get('training_accuracy')
            training_f1 = model_data.get('training_f1')
            training_precision = model_data.get('training_precision')
            training_recall = model_data.get('training_recall')
            roc_auc = model_data.get('roc_auc')
            mcc = model_data.get('mcc')
            confusion_matrix = model_data.get('confusion_matrix')
            simulated_profit_pct = model_data.get('simulated_profit_pct')

            confusion_matrix_json = json.dumps(confusion_matrix) if confusion_matrix else None

            # Create entry in prediction_active_models
            new_id = await conn.fetchval("""
                INSERT INTO prediction_active_models (
                    model_id, model_name, model_type,
                    target_variable, target_operator, target_value,
                    future_minutes, price_change_percent, target_direction,
                    features, phases, params,
                    local_model_path, model_file_url,
                    is_active, downloaded_at, activated_at,
                    training_accuracy, training_f1, training_precision, training_recall,
                    roc_auc, mcc, confusion_matrix, simulated_profit_pct,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3,
                    $4, $5, $6,
                    $7, $8, $9,
                    $10::jsonb, $11::jsonb, $12::jsonb,
                    $13, $14,
                    true, NOW(), NOW(),
                    $15, $16, $17, $18,
                    $19, $20, $21::jsonb, $22,
                    NOW(), NOW()
                )
                RETURNING id
            """,
                model_id, model_data['name'], model_data['model_type'],
                model_data['target_variable'], model_data.get('target_operator'), model_data.get('target_value'),
                model_data.get('future_minutes'), model_data.get('price_change_percent'), model_data.get('target_direction'),
                features_json, phases_json, params_json,
                None,  # local_model_path (not used with direct import)
                None,  # model_file_url (not used with direct import)
                training_accuracy, training_f1, training_precision, training_recall,
                roc_auc, mcc, confusion_matrix_json, simulated_profit_pct
            )

            logger.info(f"Model {model_id} imported successfully (active_model_id: {new_id})")
            return new_id


async def activate_model(active_model_id: int) -> bool:
    """Activate model (set is_active = true)"""
    result = await execute("""
        UPDATE prediction_active_models
        SET is_active = true, activated_at = NOW(), updated_at = NOW()
        WHERE id = $1
    """, active_model_id)
    return result != "UPDATE 0"


async def deactivate_model(active_model_id: int) -> bool:
    """Deactivate model (set is_active = false)"""
    result = await execute("""
        UPDATE prediction_active_models
        SET is_active = false, updated_at = NOW()
        WHERE id = $1
    """, active_model_id)
    return result != "UPDATE 0"


async def delete_active_model(active_model_id: int) -> bool:
    """Delete model and all associated predictions"""
    # Delete predictions first (cascade)
    await execute("""
        DELETE FROM model_predictions WHERE active_model_id = $1
    """, active_model_id)

    # Delete model
    result = await execute("""
        DELETE FROM prediction_active_models WHERE id = $1
    """, active_model_id)
    return result != "DELETE 0"


async def rename_active_model(active_model_id: int, new_name: str) -> bool:
    """Rename model (set custom_name)"""
    result = await execute("""
        UPDATE prediction_active_models
        SET custom_name = $1, updated_at = NOW()
        WHERE id = $2
    """, new_name, active_model_id)
    return result != "UPDATE 0"


async def update_alert_config(
    active_model_id: int,
    n8n_webhook_url: Optional[str] = None,
    n8n_enabled: Optional[bool] = None,
    n8n_send_mode: Optional[List[str]] = None,
    alert_threshold: Optional[float] = None,
    coin_filter_mode: Optional[str] = None,
    coin_whitelist: Optional[List[str]] = None,
    min_scan_interval_seconds: Optional[int] = None,
    send_ignored_to_n8n: Optional[bool] = None
) -> bool:
    """Update complete alert configuration for a model"""
    updates = []
    params = []
    param_idx = 1

    if n8n_webhook_url is not None:
        updates.append(f"n8n_webhook_url = ${param_idx}")
        params.append(n8n_webhook_url)
        param_idx += 1

    if n8n_enabled is not None:
        updates.append(f"n8n_enabled = ${param_idx}")
        params.append(n8n_enabled)
        param_idx += 1

    if n8n_send_mode is not None:
        updates.append(f"n8n_send_mode = ${param_idx}::jsonb")
        params.append(json.dumps(n8n_send_mode))
        param_idx += 1

    if alert_threshold is not None:
        updates.append(f"alert_threshold = ${param_idx}")
        params.append(alert_threshold)
        param_idx += 1

    if coin_filter_mode is not None:
        updates.append(f"coin_filter_mode = ${param_idx}")
        params.append(coin_filter_mode)
        param_idx += 1

    if coin_whitelist is not None:
        updates.append(f"coin_whitelist = ${param_idx}::jsonb")
        params.append(json.dumps(coin_whitelist))
        param_idx += 1

    if min_scan_interval_seconds is not None:
        updates.append(f"min_scan_interval_seconds = ${param_idx}")
        params.append(min_scan_interval_seconds)
        param_idx += 1

    if send_ignored_to_n8n is not None:
        updates.append(f"send_ignored_to_n8n = ${param_idx}")
        params.append(send_ignored_to_n8n)
        param_idx += 1

    if not updates:
        return False

    updates.append("updated_at = NOW()")
    params.append(active_model_id)

    query = f"""
        UPDATE prediction_active_models
        SET {', '.join(updates)}
        WHERE id = ${param_idx}
    """

    result = await execute(query, *params)
    return result != "UPDATE 0"


async def update_ignore_settings(
    active_model_id: int,
    ignore_bad_seconds: int,
    ignore_positive_seconds: int,
    ignore_alert_seconds: int
) -> bool:
    """Update coin-ignore settings for a model"""
    result = await execute("""
        UPDATE prediction_active_models
        SET ignore_bad_seconds = $1,
            ignore_positive_seconds = $2,
            ignore_alert_seconds = $3,
            updated_at = NOW()
        WHERE id = $4
    """, ignore_bad_seconds, ignore_positive_seconds, ignore_alert_seconds, active_model_id)
    return result != "UPDATE 0"


async def get_ignore_settings(active_model_id: int) -> Optional[Dict[str, int]]:
    """Get coin-ignore settings for a model"""
    row = await fetchrow("""
        SELECT ignore_bad_seconds, ignore_positive_seconds, ignore_alert_seconds
        FROM prediction_active_models
        WHERE id = $1
    """, active_model_id)

    if not row:
        return None

    return {
        'ignore_bad_seconds': row['ignore_bad_seconds'] if row['ignore_bad_seconds'] is not None else 0,
        'ignore_positive_seconds': row['ignore_positive_seconds'] if row['ignore_positive_seconds'] is not None else 0,
        'ignore_alert_seconds': row['ignore_alert_seconds'] if row['ignore_alert_seconds'] is not None else 0
    }


async def update_max_log_entries_settings(
    active_model_id: int,
    max_log_entries_per_coin_negative: int,
    max_log_entries_per_coin_positive: int,
    max_log_entries_per_coin_alert: int
) -> bool:
    """Update max-log-entries settings for a model"""
    result = await execute("""
        UPDATE prediction_active_models
        SET max_log_entries_per_coin_negative = $1,
            max_log_entries_per_coin_positive = $2,
            max_log_entries_per_coin_alert = $3,
            updated_at = NOW()
        WHERE id = $4
    """, max_log_entries_per_coin_negative, max_log_entries_per_coin_positive, max_log_entries_per_coin_alert, active_model_id)
    return result != "UPDATE 0"


async def get_max_log_entries_settings(active_model_id: int) -> Optional[Dict[str, int]]:
    """Get max-log-entries settings for a model"""
    row = await fetchrow("""
        SELECT max_log_entries_per_coin_negative, max_log_entries_per_coin_positive, max_log_entries_per_coin_alert
        FROM prediction_active_models
        WHERE id = $1
    """, active_model_id)

    if not row:
        return None

    return {
        'max_log_entries_per_coin_negative': row['max_log_entries_per_coin_negative'] if row['max_log_entries_per_coin_negative'] is not None else 0,
        'max_log_entries_per_coin_positive': row['max_log_entries_per_coin_positive'] if row['max_log_entries_per_coin_positive'] is not None else 0,
        'max_log_entries_per_coin_alert': row['max_log_entries_per_coin_alert'] if row['max_log_entries_per_coin_alert'] is not None else 0
    }


# ============================================================
# Predictions & Model Predictions
# ============================================================

async def save_prediction(
    coin_id: str,
    active_model_id: int,
    prediction: int,
    probability: float,
    tag: str,
    timestamp: datetime
) -> int:
    """Save prediction to model_predictions table"""
    new_id = await fetchval("""
        INSERT INTO model_predictions (
            coin_id, active_model_id, prediction, probability, tag,
            prediction_timestamp, evaluation_timestamp, status,
            created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, 'aktiv',
            NOW(), NOW()
        )
        RETURNING id
    """, coin_id, active_model_id, prediction, probability, tag,
        timestamp, timestamp + timedelta(minutes=10), # evaluation_timestamp = prediction_timestamp + 10 minutes by default
    )
    return new_id


async def get_predictions(
    active_model_id: Optional[int] = None,
    coin_id: Optional[str] = None,
    prediction: Optional[int] = None,
    min_probability: Optional[float] = None,
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """Get predictions with filters"""
    conditions = []
    params = []
    param_idx = 1

    if active_model_id is not None:
        conditions.append(f"active_model_id = ${param_idx}")
        params.append(active_model_id)
        param_idx += 1

    if coin_id is not None:
        conditions.append(f"coin_id = ${param_idx}")
        params.append(coin_id)
        param_idx += 1

    if prediction is not None:
        conditions.append(f"prediction = ${param_idx}")
        params.append(prediction)
        param_idx += 1

    if min_probability is not None:
        conditions.append(f"probability >= ${param_idx}")
        params.append(min_probability)
        param_idx += 1

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.extend([limit, offset])

    rows = await fetch(f"""
        SELECT * FROM model_predictions
        {where_clause}
        ORDER BY created_at DESC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """, *params)

    return [dict(row) for row in rows]


async def get_latest_prediction(coin_id: str, active_model_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Get latest prediction for a coin"""
    if active_model_id is not None:
        row = await fetchrow("""
            SELECT * FROM model_predictions
            WHERE coin_id = $1 AND active_model_id = $2
            ORDER BY created_at DESC
            LIMIT 1
        """, coin_id, active_model_id)
    else:
        row = await fetchrow("""
            SELECT * FROM model_predictions
            WHERE coin_id = $1
            ORDER BY created_at DESC
            LIMIT 1
        """, coin_id)

    return dict(row) if row else None


async def get_coin_metrics_at_timestamp(
    coin_id: str,
    timestamp: datetime,
    tolerance_seconds: int = 60
) -> Optional[Dict[str, Any]]:
    """
    Get coin metrics at or near a specific timestamp.

    Args:
        coin_id: Coin mint address
        timestamp: Target timestamp
        tolerance_seconds: Search window in seconds (default: 60)

    Returns:
        Dict with coin metrics or None if not found
    """
    row = await fetchrow("""
        SELECT *
        FROM coin_metrics
        WHERE mint = $1
          AND timestamp BETWEEN $2 - INTERVAL '1 second' * $3 AND $2 + INTERVAL '1 second' * $3
        ORDER BY ABS(EXTRACT(EPOCH FROM (timestamp - $2)))
        LIMIT 1
    """, coin_id, timestamp, tolerance_seconds)

    return dict(row) if row else None
