"""
Job Queue Manager for the Training module.

Migrated from pump-training/backend/app/queue/job_manager.py.

Provides a ``JobManager`` class with ``start()`` / ``stop()`` methods that
poll ``ml_jobs`` for PENDING jobs and dispatch them to
TRAIN / TEST / COMPARE handlers.  CPU-bound work runs in ``run_in_executor``
via the trainer module.
"""

import asyncio
import io
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import joblib

from backend.config import settings
from backend.database import get_pool
from backend.modules.training.db_queries import (
    get_next_pending_job,
    update_job_status,
    get_job,
    create_model as db_create_model,
    create_test_result,
    get_or_create_test_result,
    create_comparison_v2,
    from_jsonb,
)
from backend.modules.training.trainer import (
    train_model,
    test_model,
    ModelCache,
    tune_hyperparameters_sync,
    create_model_instance,
)

logger = logging.getLogger(__name__)


# ============================================================================
# Job processing functions
# ============================================================================

async def process_job(job_id: int) -> None:
    """Process a single job (TRAIN / TEST / COMPARE)."""
    job = await get_job(job_id)
    if not job:
        logger.error("Job %d not found!", job_id)
        return

    job_type = job["job_type"]
    logger.info("Starting job %d: %s", job_id, job_type)

    try:
        if job_type == "TRAIN":
            await process_train_job(job)
        elif job_type == "TEST":
            await process_test_job(job)
        elif job_type == "COMPARE":
            await process_compare_job(job)
        elif job_type == "TUNE":
            await process_tune_job(job)
        else:
            raise ValueError(f"Unknown job type: {job_type}")

        await update_job_status(job_id, status="COMPLETED", progress=1.0)
        logger.info("Job %d completed successfully", job_id)

    except Exception as exc:
        error_msg = str(exc)
        logger.error("Job %d failed: %s", job_id, error_msg, exc_info=True)
        await update_job_status(job_id, status="FAILED", progress=0.0, error_msg=error_msg)


async def process_train_job(job: Dict[str, Any]) -> None:
    """Process a TRAIN job: create a new ML model."""
    job_id = job["id"]
    logger.info("Processing TRAIN job %d", job_id)

    # Model name stored in progress_msg
    model_name = job.get("progress_msg") or f"Model_{job_id}"
    original_model_name = model_name

    model_type = job.get("train_model_type", "xgboost")
    features = job.get("train_features", [])
    phases = job.get("train_phases", [])
    target_var = job["train_target_var"]
    target_operator = job["train_operator"]
    target_value = float(job["train_value"]) if job["train_value"] is not None else None
    train_start = job["train_start"]
    train_end = job["train_end"]
    params = job["train_params"]

    if params is not None and isinstance(params, str):
        params = from_jsonb(params) or {}

    # Extract use_flag_features from params
    use_flag_features = True
    if params and isinstance(params, dict):
        use_flag_features = params.get("use_flag_features", True)
    if params is None:
        params = {}
    params["use_flag_features"] = use_flag_features

    # Extract time-based parameters
    use_time_based = False
    future_minutes = None
    min_percent_change = None
    direction = "up"

    if params and isinstance(params, dict) and "_time_based" in params:
        tb = params["_time_based"]
        use_time_based = tb.get("enabled", False)
        future_minutes = tb.get("future_minutes")
        min_percent_change = tb.get("min_percent_change")
        direction = tb.get("direction", "up")

    # Extract new feature source flags
    use_graph_features = False
    use_embedding_features = False
    use_transaction_features = False
    use_metadata_features = False
    if params and isinstance(params, dict):
        use_graph_features = params.get("use_graph_features", False)
        use_embedding_features = params.get("use_embedding_features", False)
        use_transaction_features = params.get("use_transaction_features", False)
        use_metadata_features = params.get("use_metadata_features", False)

    # Progress 10%
    await update_job_status(job_id, status="RUNNING", progress=0.1, progress_msg="Loading training data...")

    # Save original features before any modification
    original_requested_features = features.copy() if features else []

    # Progress 20%
    await update_job_status(job_id, status="RUNNING", progress=0.2, progress_msg="Training started...")

    # Run training
    try:
        training_result = await train_model(
            model_type=model_type,
            features=features,
            target_var=target_var,
            target_operator=target_operator,
            target_value=target_value,
            train_start=train_start,
            train_end=train_end,
            phases=phases,
            params=params,
            model_storage_path=settings.MODEL_STORAGE_PATH,
            use_time_based=use_time_based,
            future_minutes=future_minutes,
            min_percent_change=min_percent_change,
            direction=direction,
            original_requested_features=original_requested_features,
            use_graph_features=use_graph_features,
            use_embedding_features=use_embedding_features,
            use_transaction_features=use_transaction_features,
            use_metadata_features=use_metadata_features,
        )
        logger.info(
            "Job %d training done: accuracy=%.4f, f1=%.4f",
            job_id, training_result["accuracy"], training_result["f1"],
        )
    except Exception as train_error:
        await update_job_status(job_id, status="FAILED", progress=0.0, error_msg=f"Training error: {train_error}")
        raise

    # Progress 60%
    await update_job_status(job_id, status="RUNNING", progress=0.6, progress_msg="Saving model...")

    final_features = training_result.get("features", features)

    # Convert timestamps
    train_start_dt = train_start
    train_end_dt = train_end
    if isinstance(train_start_dt, str):
        train_start_dt = datetime.fromisoformat(train_start_dt.replace("Z", "+00:00"))
    if isinstance(train_end_dt, str):
        train_end_dt = datetime.fromisoformat(train_end_dt.replace("Z", "+00:00"))
    if train_start_dt.tzinfo is None:
        train_start_dt = train_start_dt.replace(tzinfo=timezone.utc)
    if train_end_dt.tzinfo is None:
        train_end_dt = train_end_dt.replace(tzinfo=timezone.utc)

    # Progress 80%
    await update_job_status(job_id, status="RUNNING", progress=0.8, progress_msg="Storing model in DB...")

    model_id = await db_create_model(
        name=original_model_name,
        model_type=model_type,
        target_variable=target_var,
        train_start=train_start_dt,
        train_end=train_end_dt,
        target_operator=target_operator,
        target_value=target_value,
        features=final_features,
        phases=phases,
        params=params,
        training_accuracy=training_result["accuracy"],
        training_f1=training_result["f1"],
        training_precision=training_result["precision"],
        training_recall=training_result["recall"],
        feature_importance=training_result["feature_importance"],
        model_file_path=training_result["model_path"],
        status="READY",
        cv_scores=training_result.get("cv_scores"),
        cv_overfitting_gap=training_result.get("cv_overfitting_gap"),
        roc_auc=training_result.get("roc_auc"),
        mcc=training_result.get("mcc"),
        fpr=training_result.get("fpr"),
        fnr=training_result.get("fnr"),
        confusion_matrix=training_result.get("confusion_matrix"),
        simulated_profit_pct=training_result.get("simulated_profit_pct"),
        future_minutes=job.get("train_future_minutes"),
        price_change_percent=job.get("train_price_change_percent"),
        target_direction=job.get("train_target_direction"),
        use_flag_features=use_flag_features,
        model_binary=training_result.get("model_data"),
        best_iteration=training_result.get("best_iteration"),
        best_score=training_result.get("best_score"),
        low_importance_features=training_result.get("low_importance_features"),
        shap_values=training_result.get("shap_values"),
        early_stopping_rounds=training_result.get("early_stopping_rounds"),
        threshold_sweep=training_result.get("threshold_sweep"),
    )

    # Put deserialized model into cache
    model_data_bytes = training_result.get("model_data")
    if model_data_bytes:
        model_obj = joblib.load(io.BytesIO(model_data_bytes))
        ModelCache.put(model_id, model_obj)

    logger.info("Job %d: model %d created (name: %s)", job_id, model_id, original_model_name)

    # Auto-trigger tuning if requested via _tune_after_training param
    tune_after = params.get('_tune_after_training', False)
    if tune_after and model_id:
        tune_iters = params.get('_tune_iterations', 20)
        tune_iters = min(max(int(tune_iters), 10), 100)
        try:
            pool = get_pool()
            tune_job_id = await pool.fetchval(
                """
                INSERT INTO ml_jobs (job_type, priority, tune_model_id, tune_strategy, tune_n_iterations, status)
                VALUES ('TUNE', 5, $1, 'random', $2, 'PENDING')
                RETURNING id
                """,
                model_id, tune_iters,
            )
            logger.info("Auto-triggered tuning for model %d (%d iterations, job %d)", model_id, tune_iters, tune_job_id)
        except Exception as e:
            logger.warning("Failed to auto-trigger tuning for model %d: %s", model_id, e)

    # Auto-deploy check for auto-retrain jobs
    if params.get('_auto_retrain_source') and model_id:
        try:
            from backend.modules.training.auto_retrain import get_training_setting
            auto_deploy = await get_training_setting('auto_retrain_auto_deploy', False)
            base_model_id = params.get('_auto_retrain_base_model_id')
            if auto_deploy and base_model_id:
                logger.info(
                    "Auto-retrain complete. New model %d (F1=%.4f) vs base model %s. "
                    "Auto-deploy is enabled — consider activating via prediction_active_models.",
                    model_id, training_result.get("f1", 0), base_model_id,
                )
        except Exception as e:
            logger.warning("Auto-deploy check failed: %s", e)

    # Progress 100%
    await update_job_status(
        job_id, status="COMPLETED", progress=1.0,
        result_model_id=model_id,
        progress_msg=f"Model {original_model_name} created successfully",
    )


async def process_test_job(job: Dict[str, Any]) -> None:
    """Process a TEST job: test model on new data."""
    job_id = job["id"]
    model_id = job["test_model_id"]
    test_start = job["test_start"]
    test_end = job["test_end"]

    logger.info("Processing TEST job %d for model %d", job_id, model_id)

    await update_job_status(job_id, status="RUNNING", progress=0.2, progress_msg="Loading test data...")

    test_result = await test_model(
        model_id=model_id,
        test_start=test_start,
        test_end=test_end,
        model_storage_path=settings.MODEL_STORAGE_PATH,
    )
    logger.info("Test done for model %d: accuracy=%.4f", model_id, test_result["accuracy"])

    await update_job_status(job_id, status="RUNNING", progress=0.8, progress_msg="Saving test result...")

    # Convert timestamps
    test_start_dt = test_start
    test_end_dt = test_end
    if isinstance(test_start_dt, str):
        test_start_dt = datetime.fromisoformat(test_start_dt.replace("Z", "+00:00"))
    if isinstance(test_end_dt, str):
        test_end_dt = datetime.fromisoformat(test_end_dt.replace("Z", "+00:00"))
    if test_start_dt.tzinfo is None:
        test_start_dt = test_start_dt.replace(tzinfo=timezone.utc)
    if test_end_dt.tzinfo is None:
        test_end_dt = test_end_dt.replace(tzinfo=timezone.utc)

    test_id = await create_test_result(
        model_id=model_id,
        test_start=test_start_dt,
        test_end=test_end_dt,
        accuracy=test_result["accuracy"],
        f1_score=test_result["f1_score"],
        precision_score=test_result["precision_score"],
        recall=test_result["recall"],
        roc_auc=test_result.get("roc_auc"),
        mcc=test_result.get("mcc"),
        fpr=test_result.get("fpr"),
        fnr=test_result.get("fnr"),
        simulated_profit_pct=test_result.get("simulated_profit_pct"),
        confusion_matrix=test_result.get("confusion_matrix"),
        tp=test_result["tp"],
        tn=test_result["tn"],
        fp=test_result["fp"],
        fn=test_result["fn"],
        num_samples=test_result["num_samples"],
        num_positive=test_result["num_positive"],
        num_negative=test_result["num_negative"],
        has_overlap=test_result["has_overlap"],
        overlap_note=test_result.get("overlap_note"),
        train_accuracy=test_result.get("train_accuracy"),
        train_f1=test_result.get("train_f1"),
        train_precision=test_result.get("train_precision"),
        train_recall=test_result.get("train_recall"),
        accuracy_degradation=test_result.get("accuracy_degradation"),
        f1_degradation=test_result.get("f1_degradation"),
        is_overfitted=test_result.get("is_overfitted"),
        test_duration_days=test_result.get("test_duration_days"),
        threshold_sweep=test_result.get("threshold_sweep"),
        proba_stats=test_result.get("proba_stats"),
        feature_diagnostics=test_result.get("feature_diagnostics"),
    )

    await update_job_status(
        job_id, status="COMPLETED", progress=1.0,
        result_test_id=test_id,
        progress_msg="Test completed successfully",
    )
    logger.info("TEST job %d done: test result %d", job_id, test_id)


async def process_compare_job(job: Dict[str, Any]) -> None:
    """Process a COMPARE job: compare up to 4 models."""
    job_id = job["id"]
    logger.info("Processing COMPARE job %d", job_id)

    model_ids = job.get("compare_model_ids")
    if not model_ids:
        a = job.get("compare_model_a_id")
        b = job.get("compare_model_b_id")
        if a and b:
            model_ids = [a, b]
        else:
            raise ValueError("No model IDs found for comparison!")

    test_start = job["compare_start"]
    test_end = job["compare_end"]

    # Convert timestamps
    test_start_dt = test_start
    test_end_dt = test_end
    if isinstance(test_start_dt, str):
        test_start_dt = datetime.fromisoformat(test_start_dt.replace("Z", "+00:00"))
    if isinstance(test_end_dt, str):
        test_end_dt = datetime.fromisoformat(test_end_dt.replace("Z", "+00:00"))
    if test_start_dt.tzinfo is None:
        test_start_dt = test_start_dt.replace(tzinfo=timezone.utc)
    if test_end_dt.tzinfo is None:
        test_end_dt = test_end_dt.replace(tzinfo=timezone.utc)

    results = []
    test_result_ids = []
    num_models = len(model_ids)

    for i, mid in enumerate(model_ids):
        progress = 0.1 + (i / num_models) * 0.7
        await update_job_status(
            job_id, status="RUNNING", progress=progress,
            progress_msg=f"Testing model {i + 1}/{num_models} (ID: {mid})...",
        )

        result = await test_model(
            model_id=mid, test_start=test_start, test_end=test_end,
            model_storage_path=settings.MODEL_STORAGE_PATH,
        )

        test_id = await get_or_create_test_result(
            model_id=mid,
            test_start=test_start_dt, test_end=test_end_dt,
            accuracy=result["accuracy"],
            f1_score=result["f1_score"],
            precision_score=result["precision_score"],
            recall=result["recall"],
            roc_auc=result.get("roc_auc"),
            mcc=result.get("mcc"),
            fpr=result.get("fpr"),
            fnr=result.get("fnr"),
            simulated_profit_pct=result.get("simulated_profit_pct"),
            confusion_matrix=result.get("confusion_matrix"),
            tp=result["tp"], tn=result["tn"], fp=result["fp"], fn=result["fn"],
            num_samples=result["num_samples"],
            num_positive=result["num_positive"],
            num_negative=result["num_negative"],
            has_overlap=result["has_overlap"],
            overlap_note=result.get("overlap_note"),
            train_accuracy=result.get("train_accuracy"),
            train_f1=result.get("train_f1"),
            train_precision=result.get("train_precision"),
            train_recall=result.get("train_recall"),
            accuracy_degradation=result.get("accuracy_degradation"),
            f1_degradation=result.get("f1_degradation"),
            is_overfitted=result.get("is_overfitted"),
            test_duration_days=result.get("test_duration_days"),
            threshold_sweep=result.get("threshold_sweep"),
            proba_stats=result.get("proba_stats"),
            feature_diagnostics=result.get("feature_diagnostics"),
        )

        test_result_ids.append(test_id)

        accuracy = result["accuracy"] or 0
        f1_val = result["f1_score"] or 0
        profit = result.get("simulated_profit_pct") or 0
        profit_normalized = max(0, min(1, (profit + 10) / 20))
        avg_score = (accuracy + f1_val + profit_normalized) / 3

        results.append({
            "model_id": mid,
            "test_result_id": test_id,
            "accuracy": accuracy,
            "f1_score": f1_val,
            "precision": result["precision_score"] or 0,
            "recall": result["recall"] or 0,
            "roc_auc": result.get("roc_auc") or 0,
            "mcc": result.get("mcc") or 0,
            "fpr": result.get("fpr") or 0,
            "fnr": result.get("fnr") or 0,
            "simulated_profit_pct": profit,
            "confusion_matrix": result.get("confusion_matrix"),
            "avg_score": avg_score,
        })

    # Rank by avg_score
    results.sort(key=lambda x: x["avg_score"], reverse=True)
    for rank, r in enumerate(results, 1):
        r["rank"] = rank

    winner = results[0]
    winner_id = winner["model_id"]
    winner_reason = (
        f"Best average (Acc: {winner['accuracy']:.2%}, F1: {winner['f1_score']:.2%}, "
        f"Profit: {winner['simulated_profit_pct']:.2f}%) = Score: {winner['avg_score']:.4f}"
    )

    await update_job_status(job_id, status="RUNNING", progress=0.9, progress_msg="Saving comparison...")

    comparison_id = await create_comparison_v2(
        model_ids=model_ids,
        test_result_ids=test_result_ids,
        results=results,
        test_start=test_start_dt,
        test_end=test_end_dt,
        num_samples=results[0].get("num_samples") if results else None,
        winner_id=winner_id,
        winner_reason=winner_reason,
    )

    await update_job_status(
        job_id, status="COMPLETED", progress=1.0,
        result_comparison_id=comparison_id,
        progress_msg=f"Comparison done: {len(model_ids)} models compared",
    )
    logger.info("COMPARE job %d done: comparison %d, winner model %d", job_id, comparison_id, winner_id)


async def process_tune_job(job: Dict[str, Any]) -> None:
    """Process a TUNE job: find optimal hyperparameters for a model."""
    job_id = job["id"]
    tune_model_id = job.get("tune_model_id")
    strategy = job.get("tune_strategy", "random")
    n_iterations = job.get("tune_n_iterations", 20)
    param_space = job.get("tune_param_space")

    if not tune_model_id:
        raise ValueError("tune_model_id is required for TUNE jobs")

    logger.info("Processing TUNE job %d for model %d", job_id, tune_model_id)

    from backend.modules.training.db_queries import get_model as db_get_model
    model_record = await db_get_model(tune_model_id)
    if not model_record or model_record.get("is_deleted"):
        raise ValueError(f"Model {tune_model_id} not found or deleted")

    await update_job_status(job_id, status="RUNNING", progress=0.1, progress_msg="Loading data for tuning...")

    # Load data using the original model's config
    from backend.modules.training.features import load_training_data
    from backend.modules.training.trainer import prepare_features_for_training

    features = model_record["features"]
    phases = model_record["phases"]
    params = model_record.get("params", {}) or {}
    model_type = model_record["model_type"]
    target_var = model_record["target_variable"]
    use_time_based = model_record.get("target_operator") is None
    use_engineered = params.get("use_engineered_features", False)

    features_for_loading, features_for_training = prepare_features_for_training(
        features=features, target_var=target_var, use_time_based=use_time_based,
    )

    data = await load_training_data(
        train_start=model_record["train_start"],
        train_end=model_record["train_end"],
        features=features_for_loading,
        phases=phases,
        include_ath=use_engineered,
    )
    if len(data) == 0:
        raise ValueError("No training data found for tuning!")

    await update_job_status(job_id, status="RUNNING", progress=0.2, progress_msg="Creating labels...")

    # Create labels
    from backend.modules.training.features import create_time_based_labels, create_rule_based_labels
    from backend.modules.training.db_queries import get_phase_intervals

    if use_time_based:
        tb = params.get("_time_based", {})
        phase_intervals = await get_phase_intervals()
        labels = create_time_based_labels(
            data, target_var,
            tb.get("future_minutes", 5),
            tb.get("min_percent_change", 2.0),
            tb.get("direction", "up"),
            phase_intervals,
        )
    else:
        labels = create_rule_based_labels(
            data, target_var,
            model_record["target_operator"],
            float(model_record["target_value"]),
        )

    available_features = [f for f in features_for_training if f in data.columns]
    X = data[available_features]
    y = labels.values

    await update_job_status(job_id, status="RUNNING", progress=0.3, progress_msg=f"Tuning ({n_iterations} iterations)...")

    # Run tuning in executor
    loop = asyncio.get_running_loop()
    tune_result = await loop.run_in_executor(
        None, tune_hyperparameters_sync,
        model_type, X, y, strategy, n_iterations, param_space, params,
    )

    await update_job_status(job_id, status="RUNNING", progress=0.7, progress_msg="Training model with best params...")

    # Train a new model with the best params
    best_params = {**params, **tune_result["best_params"]}
    tb_config = params.get("_time_based", {})
    training_result = await train_model(
        model_type=model_type,
        features=features,
        target_var=target_var,
        target_operator=model_record.get("target_operator"),
        target_value=float(model_record["target_value"]) if model_record.get("target_value") else None,
        train_start=model_record["train_start"],
        train_end=model_record["train_end"],
        phases=phases,
        params=best_params,
        model_storage_path=settings.MODEL_STORAGE_PATH,
        use_time_based=use_time_based,
        future_minutes=tb_config.get("future_minutes"),
        min_percent_change=tb_config.get("min_percent_change"),
        direction=tb_config.get("direction", "up"),
    )

    await update_job_status(job_id, status="RUNNING", progress=0.9, progress_msg="Saving tuned model...")

    # Store the tuned model
    train_start_dt = model_record["train_start"]
    train_end_dt = model_record["train_end"]
    original_name = model_record.get("name", f"Model_{tune_model_id}")
    tuned_name = f"{original_name}_tuned"

    model_id = await db_create_model(
        name=tuned_name,
        model_type=model_type,
        target_variable=target_var,
        train_start=train_start_dt,
        train_end=train_end_dt,
        target_operator=model_record.get("target_operator"),
        target_value=float(model_record["target_value"]) if model_record.get("target_value") else None,
        features=training_result.get("features", features),
        phases=phases,
        params=best_params,
        training_accuracy=training_result["accuracy"],
        training_f1=training_result["f1"],
        training_precision=training_result["precision"],
        training_recall=training_result["recall"],
        feature_importance=training_result["feature_importance"],
        model_file_path=training_result["model_path"],
        status="READY",
        cv_scores=training_result.get("cv_scores"),
        cv_overfitting_gap=training_result.get("cv_overfitting_gap"),
        roc_auc=training_result.get("roc_auc"),
        mcc=training_result.get("mcc"),
        fpr=training_result.get("fpr"),
        fnr=training_result.get("fnr"),
        confusion_matrix=training_result.get("confusion_matrix"),
        simulated_profit_pct=training_result.get("simulated_profit_pct"),
        model_binary=training_result.get("model_data"),
        best_iteration=training_result.get("best_iteration"),
        best_score=training_result.get("best_score"),
        low_importance_features=training_result.get("low_importance_features"),
        shap_values=training_result.get("shap_values"),
        early_stopping_rounds=training_result.get("early_stopping_rounds"),
        threshold_sweep=training_result.get("threshold_sweep"),
        description=f"Tuned from model {tune_model_id} ({strategy}, {n_iterations} iterations)",
    )

    # Cache the model
    model_data_bytes = training_result.get("model_data")
    if model_data_bytes:
        model_obj = joblib.load(io.BytesIO(model_data_bytes))
        ModelCache.put(model_id, model_obj)

    # Store tune results in job
    pool = get_pool()
    from backend.modules.training.db_queries import to_jsonb
    await pool.execute(
        "UPDATE ml_jobs SET tune_results = $1::jsonb, result_model_id = $2 WHERE id = $3",
        to_jsonb(tune_result), model_id, job_id,
    )

    await update_job_status(
        job_id, status="COMPLETED", progress=1.0,
        result_model_id=model_id,
        progress_msg=f"Tuned model created (ID: {model_id}, best F1: {tune_result['best_score']:.4f})",
    )
    logger.info("TUNE job %d done: new model %d", job_id, model_id)


# ============================================================================
# JOB MANAGER
# ============================================================================

class JobManager:
    """Polls for PENDING jobs and dispatches them to handlers.

    Usage::

        manager = JobManager()
        await manager.start()   # runs forever
        await manager.stop()    # graceful shutdown
    """

    def __init__(self):
        self._running = False
        self._active_tasks: set = set()
        self._task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the worker loop."""
        if self._running:
            logger.warning("JobManager already running")
            return
        self._running = True
        self._task = asyncio.create_task(self._worker_loop())
        logger.info(
            "JobManager started (poll=%ds, max_concurrent=%d)",
            settings.JOB_POLL_INTERVAL, settings.MAX_CONCURRENT_JOBS,
        )

    async def stop(self):
        """Stop the worker loop gracefully."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("JobManager stopped")

    async def _worker_loop(self):
        """Infinite loop that polls for pending jobs."""
        while self._running:
            try:
                if len(self._active_tasks) < settings.MAX_CONCURRENT_JOBS:
                    job = await get_next_pending_job()
                    if job:
                        logger.info("New job found: %d (%s)", job["id"], job["job_type"])
                        task = asyncio.create_task(process_job(job["id"]))
                        self._active_tasks.add(task)

                        def _on_done(t):
                            self._active_tasks.discard(t)
                        task.add_done_callback(_on_done)
                    else:
                        await asyncio.sleep(settings.JOB_POLL_INTERVAL)
                else:
                    await asyncio.sleep(settings.JOB_POLL_INTERVAL)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("Worker loop error: %s", exc, exc_info=True)
                await asyncio.sleep(settings.JOB_POLL_INTERVAL)
