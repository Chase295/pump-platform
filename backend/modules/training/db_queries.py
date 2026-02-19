"""
Database CRUD operations for the Training module.

Migrated from pump-training/backend/app/database/models.py.
Uses the shared database pool from backend.database.

All functions use ``fetch / fetchrow / fetchval / execute`` helpers
from ``backend.database`` instead of acquiring pool connections directly.
"""

import json
import logging
import time
from typing import Optional, List, Dict, Any
from datetime import datetime

from backend.database import get_pool, fetch, fetchrow, fetchval, execute

logger = logging.getLogger(__name__)


# ============================================================
# JSONB helpers (inlined from database/utils.py)
# ============================================================

def to_jsonb(value) -> Optional[str]:
    """Convert Python object to JSON string for PostgreSQL JSONB."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return json.dumps(value)
    except (TypeError, ValueError) as e:
        logger.warning("Could not convert value to JSONB: %s", e)
        return None


def from_jsonb(value):
    """Convert JSONB string to Python object."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            try:
                import ast
                return ast.literal_eval(value)
            except (ValueError, SyntaxError):
                logger.warning("Could not parse JSONB string: %s...", value[:100])
                return None
    return None


def convert_jsonb_fields(data: dict, fields: list, direction: str = "from") -> dict:
    """Convert multiple JSONB fields in a dictionary."""
    result = data.copy()
    for field in fields:
        if field in result and result[field] is not None:
            if direction == "from":
                result[field] = from_jsonb(result[field])
            elif direction == "to":
                result[field] = to_jsonb(result[field])
    return result


# ============================================================
# ml_models - CRUD
# ============================================================

async def ensure_unique_model_name(name: str) -> str:
    """Ensure the model name is unique; append a suffix if needed."""
    existing = await fetchval(
        "SELECT id FROM ml_models WHERE name = $1 AND is_deleted = FALSE",
        name,
    )
    if existing is None:
        return name

    timestamp = int(time.time() * 1000)
    counter = 1
    while True:
        new_name = f"{name}_{timestamp}_{counter}"
        existing = await fetchval(
            "SELECT id FROM ml_models WHERE name = $1 AND is_deleted = FALSE",
            new_name,
        )
        if existing is None:
            logger.warning("Model name '%s' exists -- using '%s'", name, new_name)
            return new_name
        counter += 1
        if counter > 1000:
            new_name = f"{name}_{timestamp}"
            return new_name


async def create_model(
    name: str,
    model_type: str,
    target_variable: str,
    train_start: datetime,
    train_end: datetime,
    features: List[str],
    target_operator: Optional[str] = None,
    target_value: Optional[float] = None,
    phases: Optional[List[int]] = None,
    params: Optional[Dict[str, Any]] = None,
    training_accuracy: Optional[float] = None,
    training_f1: Optional[float] = None,
    training_precision: Optional[float] = None,
    training_recall: Optional[float] = None,
    feature_importance: Optional[Dict[str, float]] = None,
    model_file_path: Optional[str] = None,
    description: Optional[str] = None,
    status: str = "TRAINING",
    cv_scores: Optional[Dict[str, Any]] = None,
    cv_overfitting_gap: Optional[float] = None,
    roc_auc: Optional[float] = None,
    mcc: Optional[float] = None,
    fpr: Optional[float] = None,
    fnr: Optional[float] = None,
    confusion_matrix: Optional[Dict[str, int]] = None,
    simulated_profit_pct: Optional[float] = None,
    future_minutes: Optional[int] = None,
    price_change_percent: Optional[float] = None,
    target_direction: Optional[str] = None,
    use_flag_features: Optional[bool] = None,
    model_binary: Optional[bytes] = None,
    best_iteration: Optional[int] = None,
    best_score: Optional[float] = None,
    low_importance_features: Optional[List[str]] = None,
    shap_values: Optional[Dict[str, Any]] = None,
    early_stopping_rounds: Optional[int] = None,
    threshold_sweep: Optional[List[Dict[str, Any]]] = None,
) -> int:
    """Insert a new model into ml_models. Returns the new model id."""
    pool = get_pool()

    original_name = name
    name = await ensure_unique_model_name(name)

    if params is not None and isinstance(params, str):
        params = from_jsonb(params) or {}

    if use_flag_features is None:
        use_flag_features = params.get('use_flag_features', True) if params else True
    if params is None:
        params = {}
    params['use_flag_features'] = use_flag_features

    features_jsonb = to_jsonb(features)
    phases_jsonb = to_jsonb(phases)
    params_jsonb = to_jsonb(params)
    fi_jsonb = to_jsonb(feature_importance)
    cv_jsonb = to_jsonb(cv_scores)
    cm_jsonb = to_jsonb(confusion_matrix)
    low_imp_jsonb = to_jsonb(low_importance_features)
    shap_jsonb = to_jsonb(shap_values)
    sweep_jsonb = to_jsonb(threshold_sweep)

    max_retries = 2
    retry_count = 0

    while retry_count < max_retries:
        try:
            model_id = await pool.fetchval(
                """
                INSERT INTO ml_models (
                    name, model_type, status,
                    target_variable, target_operator, target_value,
                    train_start, train_end,
                    features, phases, params,
                    training_accuracy, training_f1, training_precision, training_recall,
                    feature_importance, model_file_path, description,
                    cv_scores, cv_overfitting_gap,
                    roc_auc, mcc, fpr, fnr, confusion_matrix, simulated_profit_pct,
                    future_minutes, price_change_percent, target_direction,
                    use_flag_features, model_binary,
                    best_iteration, best_score, low_importance_features,
                    shap_values, early_stopping_rounds,
                    threshold_sweep
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8,
                    $9::jsonb, $10::jsonb, $11::jsonb,
                    $12, $13, $14, $15, $16::jsonb, $17, $18,
                    $19::jsonb, $20,
                    $21, $22, $23, $24, $25::jsonb, $26,
                    $27, $28, $29,
                    $30, $31::bytea,
                    $32, $33, $34::jsonb,
                    $35::jsonb, $36,
                    $37::jsonb
                ) RETURNING id
                """,
                name, model_type, status,
                target_variable, target_operator, target_value,
                train_start, train_end,
                features_jsonb, phases_jsonb, params_jsonb,
                training_accuracy, training_f1, training_precision, training_recall,
                fi_jsonb, model_file_path, description,
                cv_jsonb, cv_overfitting_gap,
                roc_auc, mcc, fpr, fnr, cm_jsonb, simulated_profit_pct,
                future_minutes, price_change_percent, target_direction,
                use_flag_features, model_binary,
                best_iteration, best_score, low_imp_jsonb,
                shap_jsonb, early_stopping_rounds,
                sweep_jsonb,
            )
            logger.info("Model created: %s (ID: %d)", name, model_id)
            return model_id
        except Exception as e:
            error_str = str(e).lower()
            if 'duplicate key' in error_str and 'ml_models_name_key' in error_str:
                retry_count += 1
                if retry_count < max_retries:
                    name = await ensure_unique_model_name(original_name)
                    continue
                raise
            # Fallback for older schema without new metric columns
            if any(col in error_str for col in [
                'cv_scores', 'cv_overfitting_gap', 'roc_auc', 'mcc',
                'fpr', 'fnr', 'confusion_matrix', 'simulated_profit_pct',
            ]):
                logger.warning("New metric columns not found -- using fallback insert")
                model_id = await pool.fetchval(
                    """
                    INSERT INTO ml_models (
                        name, model_type, status,
                        target_variable, target_operator, target_value,
                        train_start, train_end,
                        features, phases, params,
                        training_accuracy, training_f1, training_precision, training_recall,
                        feature_importance, model_file_path, description,
                        future_minutes, price_change_percent, target_direction
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8,
                        $9::jsonb, $10::jsonb, $11::jsonb,
                        $12, $13, $14, $15, $16::jsonb, $17, $18,
                        $19, $20, $21
                    ) RETURNING id
                    """,
                    name, model_type, status,
                    target_variable, target_operator, target_value,
                    train_start, train_end,
                    features_jsonb, phases_jsonb, params_jsonb,
                    training_accuracy, training_f1, training_precision, training_recall,
                    fi_jsonb, model_file_path, description,
                    future_minutes, price_change_percent, target_direction,
                )
                logger.info("Model created (fallback): %s (ID: %d)", name, model_id)
                return model_id
            raise

    raise RuntimeError(f"Could not create model after {max_retries} retries")


async def get_model(model_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a model by id."""
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM ml_models WHERE id = $1", model_id)
    if not row:
        return None
    d = dict(row)
    jsonb_fields = [
        'features', 'phases', 'params', 'feature_importance',
        'cv_scores', 'confusion_matrix',
        'low_importance_features', 'shap_values',
        'threshold_sweep',
    ]
    return convert_jsonb_fields(d, jsonb_fields, direction="from")


async def update_model(
    model_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    **kwargs,
) -> bool:
    """Update model name/description."""
    pool = get_pool()
    updates = []
    values: list = []
    pn = 1
    if name is not None:
        updates.append(f"name = ${pn}")
        values.append(name)
        pn += 1
    if description is not None:
        updates.append(f"description = ${pn}")
        values.append(description)
        pn += 1
    if not updates:
        return False
    updates.append("updated_at = NOW()")
    values.append(model_id)
    query = f"UPDATE ml_models SET {', '.join(updates)} WHERE id = ${pn}"
    await pool.execute(query, *values)
    return True


async def list_models(
    status: Optional[str] = None,
    is_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List models with optional filters."""
    pool = get_pool()
    conditions = ["is_deleted = $1"]
    params: list = [is_deleted]
    pn = 2
    if status:
        conditions.append(f"status = ${pn}")
        params.append(status)
        pn += 1
    where = " AND ".join(conditions)
    params.extend([limit, offset])
    rows = await pool.fetch(
        f"SELECT * FROM ml_models WHERE {where} ORDER BY created_at DESC LIMIT ${pn} OFFSET ${pn + 1}",
        *params,
    )
    result = []
    jsonb_fields = ['features', 'phases', 'params', 'feature_importance', 'cv_scores', 'confusion_matrix', 'low_importance_features', 'shap_values', 'threshold_sweep']
    for row in rows:
        d = dict(row)
        d.pop('model_binary', None)
        d = convert_jsonb_fields(d, jsonb_fields, direction="from")
        result.append(d)
    return result


async def delete_model(model_id: int) -> bool:
    """Soft-delete a model and clear from cache."""
    await execute(
        "UPDATE ml_models SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1",
        model_id,
    )
    from backend.modules.training.trainer import ModelCache
    ModelCache.remove(model_id)
    return True


# ============================================================
# ml_test_results - CRUD
# ============================================================

async def get_or_create_test_result(
    model_id: int,
    test_start: datetime,
    test_end: datetime,
    accuracy: Optional[float] = None,
    f1_score: Optional[float] = None,
    precision_score: Optional[float] = None,
    recall: Optional[float] = None,
    roc_auc: Optional[float] = None,
    mcc: Optional[float] = None,
    fpr: Optional[float] = None,
    fnr: Optional[float] = None,
    simulated_profit_pct: Optional[float] = None,
    confusion_matrix: Optional[Dict[str, int]] = None,
    tp: Optional[int] = None,
    tn: Optional[int] = None,
    fp: Optional[int] = None,
    fn: Optional[int] = None,
    num_samples: Optional[int] = None,
    num_positive: Optional[int] = None,
    num_negative: Optional[int] = None,
    has_overlap: bool = False,
    overlap_note: Optional[str] = None,
    feature_importance: Optional[Dict[str, float]] = None,
    train_accuracy: Optional[float] = None,
    train_f1: Optional[float] = None,
    train_precision: Optional[float] = None,
    train_recall: Optional[float] = None,
    accuracy_degradation: Optional[float] = None,
    f1_degradation: Optional[float] = None,
    is_overfitted: Optional[bool] = None,
    test_duration_days: Optional[float] = None,
    threshold_sweep: Optional[List[Dict[str, Any]]] = None,
    proba_stats: Optional[Dict[str, Any]] = None,
    feature_diagnostics: Optional[Dict[str, Any]] = None,
) -> int:
    """Create a test result or return existing id for same model/period."""
    pool = get_pool()

    existing = await pool.fetchrow(
        "SELECT id FROM ml_test_results WHERE model_id = $1 AND test_start = $2 AND test_end = $3 LIMIT 1",
        model_id, test_start, test_end,
    )
    if existing:
        return existing['id']

    cm_jsonb = to_jsonb(confusion_matrix)
    fi_jsonb = to_jsonb(feature_importance)
    sweep_jsonb = to_jsonb(threshold_sweep)
    proba_jsonb = to_jsonb(proba_stats)
    diag_jsonb = to_jsonb(feature_diagnostics)

    test_id = await pool.fetchval(
        """
        INSERT INTO ml_test_results (
            model_id, test_start, test_end,
            accuracy, f1_score, precision_score, recall, roc_auc,
            mcc, fpr, fnr, simulated_profit_pct, confusion_matrix,
            tp, tn, fp, fn,
            num_samples, num_positive, num_negative,
            has_overlap, overlap_note, feature_importance,
            train_accuracy, train_f1, train_precision, train_recall,
            accuracy_degradation, f1_degradation, is_overfitted,
            test_duration_days, threshold_sweep,
            proba_stats, feature_diagnostics
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13::jsonb,
            $14, $15, $16, $17,
            $18, $19, $20,
            $21, $22, $23::jsonb,
            $24, $25, $26, $27,
            $28, $29, $30, $31, $32::jsonb,
            $33::jsonb, $34::jsonb
        ) RETURNING id
        """,
        model_id, test_start, test_end,
        accuracy, f1_score, precision_score, recall, roc_auc,
        mcc, fpr, fnr, simulated_profit_pct, cm_jsonb,
        tp, tn, fp, fn,
        num_samples, num_positive, num_negative,
        has_overlap, overlap_note, fi_jsonb,
        train_accuracy, train_f1, train_precision, train_recall,
        accuracy_degradation, f1_degradation, is_overfitted,
        test_duration_days, sweep_jsonb,
        proba_jsonb, diag_jsonb,
    )
    logger.info("Test result created: ID %d for model %d", test_id, model_id)
    return test_id


# Alias
create_test_result = get_or_create_test_result


async def get_test_result(test_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single test result."""
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM ml_test_results WHERE id = $1", test_id)
    if not row:
        return None
    d = dict(row)
    return convert_jsonb_fields(d, ['feature_importance', 'confusion_matrix', 'threshold_sweep', 'proba_stats', 'feature_diagnostics'], direction="from")


async def get_test_results(model_id: int) -> List[Dict[str, Any]]:
    """Fetch all test results for a model."""
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT * FROM ml_test_results WHERE model_id = $1 ORDER BY created_at DESC",
        model_id,
    )
    result = []
    for row in rows:
        d = dict(row)
        d = convert_jsonb_fields(d, ['feature_importance', 'confusion_matrix', 'threshold_sweep', 'proba_stats', 'feature_diagnostics'], direction="from")
        result.append(d)
    return result


async def list_all_test_results(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """List all test results."""
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT * FROM ml_test_results ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        limit, offset,
    )
    result = []
    for row in rows:
        d = dict(row)
        d = convert_jsonb_fields(d, ['feature_importance', 'confusion_matrix', 'threshold_sweep', 'proba_stats', 'feature_diagnostics'], direction="from")
        result.append(d)
    return result


async def delete_test_result(test_id: int) -> bool:
    """Delete a test result."""
    deleted = await execute("DELETE FROM ml_test_results WHERE id = $1", test_id)
    return deleted == "DELETE 1"


# ============================================================
# ml_comparisons - CRUD
# ============================================================

async def create_comparison_v2(
    model_ids: List[int],
    test_result_ids: List[int],
    results: List[Dict[str, Any]],
    test_start: datetime,
    test_end: datetime,
    num_samples: Optional[int] = None,
    winner_id: Optional[int] = None,
    winner_reason: Optional[str] = None,
) -> int:
    """Create a model comparison (v2 format, up to 4 models)."""
    pool = get_pool()

    model_a = model_ids[0] if len(model_ids) >= 1 else None
    model_b = model_ids[1] if len(model_ids) >= 2 else None

    comparison_id = await pool.fetchval(
        """
        INSERT INTO ml_comparisons (
            model_a_id, model_b_id, test_start, test_end,
            model_ids, test_result_ids, results,
            num_samples, winner_id, winner_reason
        ) VALUES (
            $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10
        ) RETURNING id
        """,
        model_a, model_b, test_start, test_end,
        to_jsonb(model_ids), to_jsonb(test_result_ids), to_jsonb(results),
        num_samples, winner_id, winner_reason,
    )
    logger.info("Comparison v2 created: ID %d (%d models)", comparison_id, len(model_ids))
    return comparison_id


async def get_comparison(comparison_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a comparison."""
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM ml_comparisons WHERE id = $1", comparison_id)
    if not row:
        return None
    d = dict(row)
    jsonb_fields = ['a_confusion_matrix', 'b_confusion_matrix', 'model_ids', 'test_result_ids', 'results']
    return convert_jsonb_fields(d, jsonb_fields, direction="from")


async def list_comparisons(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """List all comparisons."""
    pool = get_pool()
    rows = await pool.fetch(
        "SELECT * FROM ml_comparisons ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        limit, offset,
    )
    result = []
    jsonb_fields = ['a_confusion_matrix', 'b_confusion_matrix', 'model_ids', 'test_result_ids', 'results']
    for row in rows:
        d = dict(row)
        d = convert_jsonb_fields(d, jsonb_fields, direction="from")
        result.append(d)
    return result


async def delete_comparison(comparison_id: int) -> bool:
    """Delete a comparison."""
    deleted = await execute("DELETE FROM ml_comparisons WHERE id = $1", comparison_id)
    return deleted == "DELETE 1"


# ============================================================
# ml_jobs - CRUD
# ============================================================

async def create_job(
    job_type: str,
    priority: int = 5,
    train_model_type: Optional[str] = None,
    train_target_var: Optional[str] = None,
    train_operator: Optional[str] = None,
    train_value: Optional[float] = None,
    train_start: Optional[datetime] = None,
    train_end: Optional[datetime] = None,
    train_features: Optional[List[str]] = None,
    train_phases: Optional[List[int]] = None,
    train_params: Optional[Dict[str, Any]] = None,
    test_model_id: Optional[int] = None,
    test_start: Optional[datetime] = None,
    test_end: Optional[datetime] = None,
    compare_model_a_id: Optional[int] = None,
    compare_model_b_id: Optional[int] = None,
    compare_model_ids: Optional[List[int]] = None,
    compare_start: Optional[datetime] = None,
    compare_end: Optional[datetime] = None,
    progress_msg: Optional[str] = None,
    train_future_minutes: Optional[int] = None,
    train_price_change_percent: Optional[float] = None,
    train_target_direction: Optional[str] = None,
    use_flag_features: Optional[bool] = None,
) -> int:
    """Create a new job (TRAIN, TEST, or COMPARE)."""
    pool = get_pool()

    if use_flag_features is None:
        use_flag_features = train_params.get('use_flag_features', True) if train_params else True

    job_id = await pool.fetchval(
        """
        INSERT INTO ml_jobs (
            job_type, priority,
            train_model_type, train_target_var, train_operator, train_value,
            train_start, train_end, train_features, train_phases, train_params,
            test_model_id, test_start, test_end,
            compare_model_a_id, compare_model_b_id, compare_model_ids,
            compare_start, compare_end,
            progress_msg,
            train_future_minutes, train_price_change_percent, train_target_direction,
            use_flag_features
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9::jsonb, $10::jsonb, $11::jsonb,
            $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20,
            $21, $22, $23, $24
        ) RETURNING id
        """,
        job_type, priority,
        train_model_type, train_target_var, train_operator, train_value,
        train_start, train_end,
        to_jsonb(train_features), to_jsonb(train_phases), to_jsonb(train_params),
        test_model_id, test_start, test_end,
        compare_model_a_id, compare_model_b_id, to_jsonb(compare_model_ids),
        compare_start, compare_end,
        progress_msg,
        train_future_minutes, train_price_change_percent, train_target_direction,
        use_flag_features,
    )
    logger.info("Job created: %s (ID: %d)", job_type, job_id)
    return job_id


async def get_job(job_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a job by id."""
    pool = get_pool()
    row = await pool.fetchrow("SELECT * FROM ml_jobs WHERE id = $1", job_id)
    if not row:
        return None
    d = dict(row)
    jsonb_fields = ['train_features', 'train_phases', 'train_params', 'compare_model_ids', 'tune_param_space', 'tune_results']
    return convert_jsonb_fields(d, jsonb_fields, direction="from")


async def update_job_status(
    job_id: int,
    status: str,
    progress: Optional[float] = None,
    error_msg: Optional[str] = None,
    result_model_id: Optional[int] = None,
    result_test_id: Optional[int] = None,
    result_comparison_id: Optional[int] = None,
    progress_msg: Optional[str] = None,
) -> bool:
    """Update job status and optional fields."""
    pool = get_pool()

    updates = ["status = $1"]
    values: list = [status]
    pn = 2

    if progress is not None:
        updates.append(f"progress = ${pn}"); values.append(progress); pn += 1
    if error_msg is not None:
        updates.append(f"error_msg = ${pn}"); values.append(error_msg); pn += 1
    if result_model_id is not None:
        updates.append(f"result_model_id = ${pn}"); values.append(result_model_id); pn += 1
    if result_test_id is not None:
        updates.append(f"result_test_id = ${pn}"); values.append(result_test_id); pn += 1
    if result_comparison_id is not None:
        updates.append(f"result_comparison_id = ${pn}"); values.append(result_comparison_id); pn += 1
    if progress_msg is not None:
        updates.append(f"progress_msg = ${pn}"); values.append(progress_msg); pn += 1

    if status == "RUNNING":
        updates.append("started_at = COALESCE(started_at, NOW())")
    elif status in ("COMPLETED", "FAILED", "CANCELLED"):
        updates.append("completed_at = NOW()")

    values.append(job_id)
    query = f"UPDATE ml_jobs SET {', '.join(updates)} WHERE id = ${pn}"
    await pool.execute(query, *values)
    return True


async def list_jobs(
    status: Optional[str] = None,
    job_type: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List jobs with optional filters."""
    pool = get_pool()

    conditions: list = []
    params: list = []
    pn = 1

    if status:
        conditions.append(f"status = ${pn}"); params.append(status); pn += 1
    if job_type:
        conditions.append(f"job_type = ${pn}"); params.append(job_type); pn += 1

    where = " AND ".join(conditions) if conditions else "1=1"
    params.extend([limit, offset])

    rows = await pool.fetch(
        f"SELECT * FROM ml_jobs WHERE {where} ORDER BY created_at DESC LIMIT ${pn} OFFSET ${pn + 1}",
        *params,
    )
    result = []
    jsonb_fields = ['train_features', 'train_phases', 'train_params', 'compare_model_ids', 'tune_param_space', 'tune_results']
    for row in rows:
        d = dict(row)
        d = convert_jsonb_fields(d, jsonb_fields, direction="from")
        result.append(d)
    return result


async def get_next_pending_job() -> Optional[Dict[str, Any]]:
    """Atomically fetch the next PENDING job and set it to RUNNING."""
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE ml_jobs
        SET status = 'RUNNING',
            started_at = COALESCE(started_at, NOW()),
            progress = 0.0
        WHERE id = (
            SELECT id FROM ml_jobs
            WHERE status = 'PENDING'
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
        """,
    )
    if not row:
        return None
    d = dict(row)
    jsonb_fields = ['train_features', 'train_phases', 'train_params', 'compare_model_ids', 'tune_param_space', 'tune_results']
    return convert_jsonb_fields(d, jsonb_fields, direction="from")


# ============================================================
# Reference data helpers
# ============================================================

async def get_coin_phases() -> List[Dict[str, Any]]:
    """Load all coin phases from ref_coin_phases."""
    try:
        rows = await fetch(
            "SELECT id, name, interval_seconds, max_age_minutes FROM ref_coin_phases ORDER BY id ASC",
        )
        return [dict(row) for row in rows]
    except Exception as e:
        logger.error("Error loading coin phases: %s", e)
        return []


async def get_phase_intervals() -> Dict[int, int]:
    """Load {phase_id: interval_seconds} map."""
    try:
        rows = await fetch("SELECT id, interval_seconds FROM ref_coin_phases")
        return {row["id"]: row["interval_seconds"] for row in rows}
    except Exception as e:
        logger.error("Error loading phase intervals: %s", e)
        return {}


async def get_model_type_defaults(model_type: str) -> Dict[str, Any]:
    """Load default parameters for a model type from ref_model_types."""
    row = await fetchrow(
        "SELECT default_params FROM ref_model_types WHERE name = $1",
        model_type,
    )
    if row and row["default_params"]:
        params = from_jsonb(row["default_params"])
        return params if params is not None else {}
    return {}
