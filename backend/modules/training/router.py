"""
FastAPI Router for the Training module.

Migrated from pump-training/backend/app/api/routes.py.
Route prefix: /api/training

Route mapping:
  /api/models              -> /api/training/models
  /api/queue               -> /api/training/queue
  /api/features            -> /api/training/features
  /api/health              -> /api/training/health
  /api/config              -> /api/training/config
  /api/phases              -> /api/training/phases
  /api/comparisons         -> /api/training/comparisons
  /api/test-results        -> /api/training/test-results
  /api/data-availability   -> /api/training/data-availability
"""

import os
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query, Response, status
from fastapi.responses import FileResponse, JSONResponse

from backend.config import settings
from backend.database import get_pool, fetch, fetchrow
from backend.modules.training.schemas import (
    TrainModelRequest,
    UpdateModelRequest,
    ModelResponse,
    TestResultResponse,
    ComparisonResponse,
    JobResponse,
    CreateJobResponse,
    HealthResponse,
    ConfigResponse,
    ConfigUpdateRequest,
    ConfigUpdateResponse,
)
from backend.modules.training.db_queries import (
    create_model as db_create_model,
    get_model,
    update_model,
    list_models,
    delete_model,
    get_test_result,
    list_all_test_results,
    delete_test_result,
    get_comparison,
    list_comparisons,
    delete_comparison,
    create_job,
    get_job,
    list_jobs,
    get_coin_phases,
    convert_jsonb_fields,
)
from backend.modules.training.features import get_flag_feature_names, get_engineered_feature_names, BASE_FEATURES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/training", tags=["Training"])


# ============================================================
# Models Endpoints
# ============================================================

@router.post("/models/create/advanced", response_model=CreateJobResponse, status_code=status.HTTP_201_CREATED)
async def create_model_job_advanced(
    name: str,
    model_type: str,
    features: str,
    target_var: str = "price_close",
    use_time_based_prediction: bool = True,
    future_minutes: int = 5,
    min_percent_change: float = 2.0,
    direction: str = "up",
    train_start: str = "2026-01-06T10:00:00Z",
    train_end: str = "2026-01-06T10:05:00Z",
    use_engineered_features: bool = False,
    use_flag_features: bool = Query(True, description="Enable flag features"),
    use_smote: bool = False,
    scale_pos_weight: float = None,
    phases: str = None,
    use_graph_features: bool = False,
    use_embedding_features: bool = False,
    use_transaction_features: bool = False,
    use_metadata_features: bool = False,
    graph_feature_names: str = None,
    embedding_feature_names: str = None,
    transaction_feature_names: str = None,
    metadata_feature_names: str = None,
):
    """
    Advanced model creation endpoint with full configuration options.

    Features are comma-separated. Phases are comma-separated integers.
    Extra source feature names are comma-separated.
    """
    try:
        custom_params: Dict[str, Any] = {}
        if scale_pos_weight is not None:
            custom_params["scale_pos_weight"] = scale_pos_weight
        parsed_phases = None
        if phases:
            try:
                parsed_phases = [int(p.strip()) for p in phases.split(",")]
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid phases format: '{phases}'")

        parsed_graph_names = graph_feature_names.split(",") if graph_feature_names else None
        parsed_embedding_names = embedding_feature_names.split(",") if embedding_feature_names else None
        parsed_transaction_names = transaction_feature_names.split(",") if transaction_feature_names else None
        parsed_metadata_names = metadata_feature_names.split(",") if metadata_feature_names else None

        request = TrainModelRequest(
            name=name,
            model_type=model_type,
            features=features.split(",") if features else ["price_close"],
            train_start=datetime.fromisoformat(train_start.replace("Z", "+00:00")),
            train_end=datetime.fromisoformat(train_end.replace("Z", "+00:00")),
            use_time_based_prediction=use_time_based_prediction,
            future_minutes=future_minutes,
            min_percent_change=min_percent_change,
            direction=direction,
            target_var=target_var,
            use_engineered_features=use_engineered_features,
            use_smote=use_smote,
            phases=parsed_phases,
            use_graph_features=use_graph_features,
            use_embedding_features=use_embedding_features,
            use_transaction_features=use_transaction_features,
            use_metadata_features=use_metadata_features,
            use_flag_features=use_flag_features,
            graph_feature_names=parsed_graph_names,
            embedding_feature_names=parsed_embedding_names,
            transaction_feature_names=parsed_transaction_names,
            metadata_feature_names=parsed_metadata_names,
            params=custom_params if custom_params else None,
        )

        return await _create_model_job(request)

    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error creating model: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/models/create", response_model=CreateJobResponse, status_code=status.HTTP_201_CREATED)
async def create_model_job_body(request: TrainModelRequest):
    """Create a training job via JSON body (used by the frontend)."""
    return await _create_model_job(request)


async def _create_model_job(request: TrainModelRequest):
    """Internal: validate request and create a TRAIN job in the queue."""

    errors = []

    if request.use_time_based_prediction:
        if request.future_minutes is None or request.future_minutes <= 0:
            errors.append("future_minutes must be > 0")
        if request.min_percent_change is None or request.min_percent_change <= 0:
            errors.append("min_percent_change must be > 0")
        if request.direction not in ("up", "down"):
            errors.append("direction must be 'up' or 'down'")
    else:
        errors.append("Only time-based prediction is supported. Set use_time_based_prediction=true.")

    if request.train_start and request.train_end:
        duration_hours = (request.train_end - request.train_start).total_seconds() / 3600
        if duration_hours < 0.083:
            errors.append(f"Training period too short: {duration_hours:.1f}h (min 5 min)")
        elif duration_hours > 720:
            errors.append(f"Training period too long: {duration_hours:.1f}h (max 30 days)")

    if not request.features:
        errors.append("features list must not be empty")

    if request.model_type not in ("xgboost", "lightgbm"):
        errors.append(f"model_type must be 'xgboost' or 'lightgbm', not '{request.model_type}'")

    if request.cv_splits is not None and not (2 <= request.cv_splits <= 10):
        errors.append(f"cv_splits must be between 2 and 10")

    if errors:
        msg = f"Validation failed ({len(errors)} errors):\n" + "\n".join(f"- {e}" for e in errors)
        raise HTTPException(status_code=400, detail=msg)

    # Build final params
    final_params = request.params or {}
    if request.scale_pos_weight is not None:
        clamped = max(1.0, min(1000.0, request.scale_pos_weight))
        if clamped != request.scale_pos_weight:
            logger.warning("scale_pos_weight clamped from %.1f to %.1f (range: 1-1000)", request.scale_pos_weight, clamped)
        final_params["scale_pos_weight"] = clamped
    if request.use_time_based_prediction:
        final_params["_time_based"] = {
            "enabled": True,
            "future_minutes": request.future_minutes,
            "min_percent_change": request.min_percent_change,
            "direction": request.direction,
        }
    if request.use_engineered_features:
        final_params["use_engineered_features"] = True
        final_params["feature_engineering_windows"] = request.feature_engineering_windows or [5, 10, 15]
    final_params["use_smote"] = request.use_smote
    if not request.use_timeseries_split:
        final_params["use_timeseries_split"] = False
    if request.cv_splits:
        final_params["cv_splits"] = request.cv_splits
    if request.use_market_context:
        final_params["use_market_context"] = True
    if request.exclude_features:
        final_params["exclude_features"] = request.exclude_features
    if request.early_stopping_rounds > 0:
        final_params["early_stopping_rounds"] = request.early_stopping_rounds
    if request.compute_shap:
        final_params["compute_shap"] = True
    if request.use_graph_features:
        final_params["use_graph_features"] = True
    if request.use_embedding_features:
        final_params["use_embedding_features"] = True
    if request.use_transaction_features:
        final_params["use_transaction_features"] = True
    if request.use_metadata_features:
        final_params["use_metadata_features"] = True
    if request.graph_feature_names:
        final_params["graph_feature_names"] = request.graph_feature_names
    if request.embedding_feature_names:
        final_params["embedding_feature_names"] = request.embedding_feature_names
    if request.transaction_feature_names:
        final_params["transaction_feature_names"] = request.transaction_feature_names
    if request.metadata_feature_names:
        final_params["metadata_feature_names"] = request.metadata_feature_names

    use_flag = request.use_flag_features

    # Validate feature names (warn, don't block)
    known_features = set(BASE_FEATURES) | set(get_engineered_feature_names())
    # Add ATH features computed in Python
    known_features.update(["rolling_ath", "price_vs_ath_pct", "ath_breakout", "minutes_since_ath"])
    unknown_features = [f for f in request.features if f not in known_features]
    if unknown_features:
        logger.warning("Unknown feature names in request (will be ignored if not in data): %s", unknown_features)

    effective_target_var = request.target_var
    if request.use_time_based_prediction and not effective_target_var:
        effective_target_var = "price_close"

    job_id = await create_job(
        job_type="TRAIN",
        priority=5,
        train_model_type=request.model_type,
        train_target_var=effective_target_var,
        train_operator=request.operator,
        train_value=request.target_value,
        train_start=request.train_start,
        train_end=request.train_end,
        train_features=request.features,
        train_phases=request.phases,
        train_params=final_params,
        progress_msg=request.name,
        train_future_minutes=request.future_minutes if request.use_time_based_prediction else None,
        train_price_change_percent=request.min_percent_change if request.use_time_based_prediction else None,
        train_target_direction=request.direction if request.use_time_based_prediction else None,
        use_flag_features=use_flag,
    )

    logger.info("TRAIN job created: %d for model '%s'", job_id, request.name)

    return CreateJobResponse(
        job_id=job_id,
        message=f"Job created. Model '{request.name}' will be trained.",
        status="PENDING",
    )


@router.get("/models", response_model=List[ModelResponse])
async def list_models_endpoint(
    status_filter: Optional[str] = Query(None, alias="status"),
    is_deleted: bool = False,
):
    """List all models with optional filters."""
    try:
        try:
            models = await list_models(status=status_filter, is_deleted=is_deleted)
        except Exception:
            return []

        result = []
        for m in models:
            d = dict(m)
            if d.get("confusion_matrix") and isinstance(d["confusion_matrix"], dict):
                cm = d["confusion_matrix"]
                d["tp"] = cm.get("tp")
                d["tn"] = cm.get("tn")
                d["fp"] = cm.get("fp")
                d["fn"] = cm.get("fn")
            result.append(ModelResponse(**d))
        return result
    except Exception as exc:
        logger.error("Error listing models: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/models/{model_id}", response_model=ModelResponse)
async def get_model_endpoint(model_id: int):
    """Get model details."""
    model = await get_model(model_id)
    if not model or model.get("is_deleted"):
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

    d = dict(model)
    if d.get("confusion_matrix") and isinstance(d["confusion_matrix"], dict):
        cm = d["confusion_matrix"]
        d["tp"] = cm.get("tp")
        d["tn"] = cm.get("tn")
        d["fp"] = cm.get("fp")
        d["fn"] = cm.get("fn")
    return ModelResponse(**d)


@router.post("/models/{model_id}/test", response_model=CreateJobResponse, status_code=status.HTTP_201_CREATED)
async def test_model_job(model_id: int, test_start: str, test_end: str):
    """Create a TEST job for a model."""
    model = await get_model(model_id)
    if not model or model.get("is_deleted"):
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

    test_start_dt = datetime.fromisoformat(test_start.replace("Z", "+00:00"))
    test_end_dt = datetime.fromisoformat(test_end.replace("Z", "+00:00"))
    if test_start_dt.tzinfo is None:
        test_start_dt = test_start_dt.replace(tzinfo=timezone.utc)
    if test_end_dt.tzinfo is None:
        test_end_dt = test_end_dt.replace(tzinfo=timezone.utc)

    job_id = await create_job(
        job_type="TEST", priority=5,
        test_model_id=model_id, test_start=test_start_dt, test_end=test_end_dt,
    )
    return CreateJobResponse(
        job_id=job_id,
        message=f"Test job created for model {model_id}",
        status="PENDING",
    )


@router.post("/models/compare", response_model=CreateJobResponse, status_code=status.HTTP_201_CREATED)
async def compare_models_job(
    model_ids: str = Query(..., description="Comma-separated model IDs (2-4)"),
    test_start: str = Query(..., description="Test period start (ISO format)"),
    test_end: str = Query(..., description="Test period end (ISO format)"),
):
    """Create a COMPARE job for 2-4 models."""
    parsed = [int(x.strip()) for x in model_ids.split(",") if x.strip()]

    if len(parsed) < 2:
        raise HTTPException(status_code=400, detail="At least 2 models required")
    if len(parsed) > 4:
        raise HTTPException(status_code=400, detail="At most 4 models allowed")
    if len(parsed) != len(set(parsed)):
        raise HTTPException(status_code=400, detail="All model IDs must be distinct")

    for mid in parsed:
        m = await get_model(mid)
        if not m or m.get("is_deleted"):
            raise HTTPException(status_code=404, detail=f"Model {mid} not found")

    test_start_dt = datetime.fromisoformat(test_start.replace("Z", "+00:00"))
    test_end_dt = datetime.fromisoformat(test_end.replace("Z", "+00:00"))
    if test_start_dt >= test_end_dt:
        raise HTTPException(status_code=400, detail="test_start must be before test_end")

    job_id = await create_job(
        job_type="COMPARE", priority=5,
        compare_model_ids=parsed,
        compare_model_a_id=parsed[0] if len(parsed) >= 1 else None,
        compare_model_b_id=parsed[1] if len(parsed) >= 2 else None,
        compare_start=test_start_dt, compare_end=test_end_dt,
    )
    return CreateJobResponse(
        job_id=job_id,
        message=f"Compare job created for {len(parsed)} models: {parsed}",
        status="PENDING",
    )


@router.post("/models/{model_id}/tune", response_model=CreateJobResponse, status_code=status.HTTP_201_CREATED)
async def tune_model(
    model_id: int,
    strategy: str = Query("random", description="Tuning strategy: 'random'"),
    n_iterations: int = Query(20, description="Number of tuning iterations (10-100)", ge=10, le=100),
):
    """Create a TUNE job to find optimal hyperparameters for a model."""
    model = await get_model(model_id)
    if not model or model.get("is_deleted"):
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    if model.get("status") != "READY":
        raise HTTPException(status_code=400, detail="Model must be READY for tuning")

    pool = get_pool()
    job_id = await pool.fetchval(
        """
        INSERT INTO ml_jobs (job_type, priority, tune_model_id, tune_strategy, tune_n_iterations, status)
        VALUES ('TUNE', 5, $1, $2, $3, 'PENDING')
        RETURNING id
        """,
        model_id, strategy, n_iterations,
    )

    return CreateJobResponse(
        job_id=job_id,
        message=f"Tune job created for model {model_id} ({strategy}, {n_iterations} iterations)",
        status="PENDING",
    )


@router.patch("/models/{model_id}", response_model=ModelResponse)
async def update_model_endpoint(model_id: int, request: UpdateModelRequest):
    """Update model name or description."""
    model = await get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    if model.get("is_deleted"):
        raise HTTPException(status_code=404, detail=f"Model {model_id} was deleted")

    if request.name and request.name != model.get("name"):
        existing = await list_models()
        if any(m.get("name") == request.name and m.get("id") != model_id for m in existing):
            raise HTTPException(status_code=400, detail=f"Model name '{request.name}' already exists")

    update_data = request.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No update data provided")

    await update_model(model_id, name=update_data.get("name"), description=update_data.get("description"))
    updated = await get_model(model_id)
    return ModelResponse(**dict(updated))


@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model_endpoint(model_id: int):
    """Soft-delete a model."""
    model = await get_model(model_id)
    if not model:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")
    await delete_model(model_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/models/{model_id}/download")
async def download_model(model_id: int):
    """Download a model as .pkl file (filesystem or DB binary)."""
    model = await get_model(model_id)
    if not model or model.get("is_deleted"):
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

    model_path = model.get("model_file_path")
    filename = os.path.basename(model_path) if model_path else f"model_{model_id}.pkl"

    if model_path and os.path.exists(model_path):
        allowed_base = os.path.abspath(settings.MODEL_STORAGE_PATH)
        resolved = os.path.abspath(model_path)
        if not resolved.startswith(allowed_base):
            raise HTTPException(status_code=403, detail="Access denied")
        return FileResponse(path=model_path, filename=filename, media_type="application/octet-stream")

    if model.get("model_binary"):
        return Response(
            content=model["model_binary"],
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    raise HTTPException(status_code=404, detail=f"Model file not found: {model_path}")


# ============================================================
# Queue Endpoints
# ============================================================

@router.get("/queue", response_model=List[JobResponse])
async def list_jobs_endpoint(
    status_filter: Optional[str] = Query(None, alias="status"),
    job_type: Optional[str] = None,
):
    """List all jobs with optional filters."""
    try:
        try:
            jobs = await list_jobs(status=status_filter, job_type=job_type)
        except Exception:
            return []

        converted = []
        for job in jobs:
            job_dict = convert_jsonb_fields(dict(job), ["train_features", "train_phases", "train_params", "compare_model_ids", "tune_param_space", "tune_results"], direction="from")

            result_model = None
            result_test = None
            result_comparison = None

            if job_dict.get("status") == "COMPLETED":
                if job_dict.get("result_model_id"):
                    m = await get_model(job_dict["result_model_id"])
                    if m:
                        result_model = ModelResponse(**dict(m))
                if job_dict.get("result_test_id"):
                    t = await get_test_result(job_dict["result_test_id"])
                    if t:
                        result_test = TestResultResponse(**dict(t))
                if job_dict.get("result_comparison_id"):
                    c = await get_comparison(job_dict["result_comparison_id"])
                    if c:
                        result_comparison = ComparisonResponse(**dict(c))

            jr = JobResponse(**job_dict)
            jr.result_model = result_model
            jr.result_test = result_test
            jr.result_comparison = result_comparison
            converted.append(jr)

        return converted
    except Exception as exc:
        logger.error("Error listing jobs: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/queue/{job_id}", response_model=JobResponse)
async def get_job_endpoint(job_id: int):
    """Get job details with results."""
    job = await get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

    job_dict = convert_jsonb_fields(dict(job), ["train_features", "train_phases", "train_params", "compare_model_ids", "tune_param_space", "tune_results"], direction="from")

    result_model = None
    result_test = None
    result_comparison = None

    if job_dict.get("result_model_id"):
        m = await get_model(job_dict["result_model_id"])
        if m:
            result_model = ModelResponse(**dict(m))
    if job_dict.get("result_test_id"):
        t = await get_test_result(job_dict["result_test_id"])
        if t:
            result_test = TestResultResponse(**dict(t))
    if job_dict.get("result_comparison_id"):
        c = await get_comparison(job_dict["result_comparison_id"])
        if c:
            result_comparison = ComparisonResponse(**dict(c))

    jr = JobResponse(**job_dict)
    jr.result_model = result_model
    jr.result_test = result_test
    jr.result_comparison = result_comparison
    return jr


# ============================================================
# Features Endpoint
# ============================================================

@router.get("/features")
async def get_available_features(include_flags: bool = Query(True, description="Include flag features?")):
    """Return all available features (base, engineered, flags)."""
    base_features = [
        "price_open", "price_high", "price_low", "price_close",
        "volume_sol", "buy_volume_sol", "sell_volume_sol", "net_volume_sol",
        "market_cap_close", "bonding_curve_pct", "virtual_sol_reserves", "is_koth",
        "num_buys", "num_sells", "unique_wallets", "num_micro_trades",
        "max_single_buy_sol", "max_single_sell_sol",
        "whale_buy_volume_sol", "whale_sell_volume_sol", "num_whale_buys", "num_whale_sells",
        "dev_sold_amount", "volatility_pct", "avg_trade_size_sol",
        "buy_pressure_ratio", "unique_signer_ratio", "phase_id_at_time",
    ]

    engineered_features = [
        "dev_sold_flag", "dev_sold_cumsum",
        "dev_sold_spike_5", "dev_sold_spike_10", "dev_sold_spike_15",
        "buy_pressure_ma_5", "buy_pressure_trend_5",
        "buy_pressure_ma_10", "buy_pressure_trend_10",
        "buy_pressure_ma_15", "buy_pressure_trend_15",
        "whale_net_volume", "whale_activity_5", "whale_activity_10", "whale_activity_15",
        "volatility_ma_5", "volatility_spike_5",
        "volatility_ma_10", "volatility_spike_10",
        "volatility_ma_15", "volatility_spike_15",
        "wash_trading_flag_5", "wash_trading_flag_10", "wash_trading_flag_15",
        "net_volume_ma_5", "volume_flip_5",
        "net_volume_ma_10", "volume_flip_10",
        "net_volume_ma_15", "volume_flip_15",
        "price_change_5", "price_roc_5",
        "price_change_10", "price_roc_10",
        "price_change_15", "price_roc_15",
        "mcap_velocity_5", "mcap_velocity_10", "mcap_velocity_15",
        "rolling_ath", "price_vs_ath_pct", "ath_breakout", "minutes_since_ath",
        "ath_distance_trend_5", "ath_approach_5", "ath_breakout_count_5",
        "ath_distance_trend_10", "ath_approach_10", "ath_breakout_count_10",
        "ath_distance_trend_15", "ath_approach_15", "ath_breakout_count_15",
        "ath_breakout_volume_ma_5", "ath_breakout_volume_ma_10", "ath_breakout_volume_ma_15",
        "ath_age_trend_5", "ath_age_trend_10", "ath_age_trend_15",
        "buy_sell_ratio", "whale_dominance",
        "price_acceleration_5", "price_acceleration_10", "price_acceleration_15",
        "volume_spike_5", "volume_spike_10", "volume_spike_15",
    ]

    flag_features = []
    if include_flags:
        flag_features = get_flag_feature_names(engineered_features)

    graph_features = [
        "creator_total_tokens", "creator_avg_risk_score",
        "creator_any_graduated", "creator_is_serial",
        "wallet_cluster_count", "avg_cluster_risk",
        "similar_token_count", "similar_tokens_graduated_pct",
    ]

    embedding_features = [
        "similarity_to_pumps", "similarity_to_rugs",
        "max_pump_similarity", "max_rug_similarity",
        "nearest_pattern_label", "nearest_pattern_similarity",
    ]

    transaction_features = [
        "tx_wallet_concentration", "tx_top3_holder_pct",
        "tx_unique_traders", "tx_buy_sell_ratio",
        "tx_avg_time_between_trades", "tx_burst_count",
        "tx_whale_pct", "tx_quick_reversal_count",
    ]

    metadata_features = [
        "meta_initial_buy_sol", "meta_initial_buy_ratio",
        "meta_token_supply_log", "meta_has_socials",
        "meta_social_count", "meta_metadata_mutable",
        "meta_metadata_mutable_known", "meta_mint_authority",
        "meta_mint_authority_known", "meta_risk_score",
        "meta_top10_holders_pct", "meta_liquidity_sol",
        "meta_is_mayhem", "meta_sol_price_usd",
        "meta_sol_price_change_1h",
    ]

    total = (len(base_features) + len(engineered_features) + len(flag_features)
             + len(graph_features) + len(embedding_features) + len(transaction_features)
             + len(metadata_features))

    return {
        "base": sorted(base_features),
        "engineered": sorted(engineered_features),
        "flag_features": sorted(flag_features) if include_flags else [],
        "graph": sorted(graph_features),
        "embedding": sorted(embedding_features),
        "transaction": sorted(transaction_features),
        "metadata": sorted(metadata_features),
        "total": total,
        "base_count": len(base_features),
        "engineered_count": len(engineered_features),
        "flag_count": len(flag_features),
        "graph_count": len(graph_features),
        "embedding_count": len(embedding_features),
        "transaction_count": len(transaction_features),
        "metadata_count": len(metadata_features),
    }


# ============================================================
# System / Health Endpoints
# ============================================================

@router.get("/health")
async def health_check():
    """Health check for the training module."""
    try:
        pool = get_pool()
        row = await pool.fetchrow("SELECT 1 as ok")
        db_ok = row is not None
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "db_connected": db_ok,
        "module": "training",
    }


# ============================================================
# Configuration Endpoints
# ============================================================

@router.get("/config")
async def get_config():
    """Return current training configuration."""
    return {
        "model_storage_path": settings.MODEL_STORAGE_PATH,
        "max_concurrent_jobs": settings.MAX_CONCURRENT_JOBS,
        "job_poll_interval": settings.JOB_POLL_INTERVAL,
    }


# ============================================================
# Phases Endpoint
# ============================================================

@router.get("/phases")
async def get_phases_endpoint():
    """Load all coin phases from ref_coin_phases."""
    try:
        phases = await get_coin_phases()
        return phases
    except Exception as exc:
        logger.error("Error loading phases: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


# ============================================================
# Comparison Endpoints
# ============================================================

@router.get("/comparisons", response_model=List[ComparisonResponse])
async def list_comparisons_endpoint(limit: int = 100, offset: int = 0):
    """List all comparison results."""
    try:
        comparisons = await list_comparisons(limit=limit, offset=offset)
        result = []
        for comp in comparisons:
            try:
                result.append(ComparisonResponse(**dict(comp)))
            except Exception:
                continue
        return result
    except Exception as exc:
        logger.error("Error listing comparisons: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/comparisons/{comparison_id}", response_model=ComparisonResponse)
async def get_comparison_endpoint(comparison_id: int):
    """Get a single comparison."""
    comp = await get_comparison(comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail=f"Comparison {comparison_id} not found")
    return ComparisonResponse(**dict(comp))


@router.delete("/comparisons/{comparison_id}")
async def delete_comparison_endpoint(comparison_id: int):
    """Delete a comparison."""
    comp = await get_comparison(comparison_id)
    if not comp:
        raise HTTPException(status_code=404, detail=f"Comparison {comparison_id} not found")
    deleted = await delete_comparison(comparison_id)
    if deleted:
        return {"message": f"Comparison {comparison_id} deleted"}
    raise HTTPException(status_code=500, detail="Delete failed")


# ============================================================
# Test Results Endpoints
# ============================================================

@router.get("/test-results", response_model=List[TestResultResponse])
async def list_test_results_endpoint(limit: int = 100, offset: int = 0):
    """List all test results."""
    try:
        test_results = await list_all_test_results(limit=limit, offset=offset)
        result = []
        for t in test_results:
            try:
                result.append(TestResultResponse(**dict(t)))
            except Exception:
                continue
        return result
    except Exception as exc:
        logger.error("Error listing test results: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/test-results/{test_id}", response_model=TestResultResponse)
async def get_test_result_endpoint(test_id: int):
    """Get a single test result."""
    tr = await get_test_result(test_id)
    if not tr:
        raise HTTPException(status_code=404, detail=f"Test result {test_id} not found")
    return TestResultResponse(**dict(tr))


@router.delete("/test-results/{test_id}")
async def delete_test_result_endpoint(test_id: int):
    """Delete a test result."""
    tr = await get_test_result(test_id)
    if not tr:
        raise HTTPException(status_code=404, detail=f"Test result {test_id} not found")
    deleted = await delete_test_result(test_id)
    if deleted:
        return {"message": f"Test result {test_id} deleted"}
    raise HTTPException(status_code=500, detail="Delete failed")


# ============================================================
# Training Settings Endpoints
# ============================================================

@router.get("/settings")
async def get_training_settings():
    """Get all training settings."""
    from backend.modules.training.auto_retrain import get_all_training_settings
    return await get_all_training_settings()


@router.patch("/settings")
async def update_training_settings_endpoint(updates: Dict[str, Any]):
    """Update training settings."""
    from backend.modules.training.auto_retrain import update_training_settings
    result = await update_training_settings(updates)
    return {"message": "Settings updated", "settings": result}


# ============================================================
# Data Availability Endpoint
# ============================================================

@router.get("/data-availability")
async def get_data_availability():
    """Return min/max timestamps from coin_metrics."""
    try:
        pool = get_pool()
        row = await pool.fetchrow(
            "SELECT MIN(timestamp) as min_ts, MAX(timestamp) as max_ts FROM coin_metrics"
        )

        if not row or not row["min_ts"]:
            return {"min_timestamp": None, "max_timestamp": None}

        min_ts = row["min_ts"]
        max_ts = row["max_ts"]
        if min_ts.tzinfo is None:
            min_ts = min_ts.replace(tzinfo=timezone.utc)
        if max_ts.tzinfo is None:
            max_ts = max_ts.replace(tzinfo=timezone.utc)

        return {
            "min_timestamp": min_ts.isoformat().replace("+00:00", "Z"),
            "max_timestamp": max_ts.isoformat().replace("+00:00", "Z"),
        }
    except Exception as exc:
        logger.error("Error getting data availability: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))
