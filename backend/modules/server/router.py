"""
FastAPI Router for Server module (Predictions & Alerts).

Migrated from pump-server/backend/app/api/routes.py.
All API routes have /api/server prefix.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, status, Query
from fastapi.responses import PlainTextResponse, JSONResponse
from pydantic import BaseModel, Field

from backend.database import get_pool
from backend.modules.server.db_queries import (
    get_available_models_for_import,
    get_model_from_training_module,
    get_active_models,
    import_model,
    activate_model,
    deactivate_model,
    delete_active_model,
    rename_active_model,
    update_alert_config,
    update_ignore_settings,
    get_ignore_settings,
    update_max_log_entries_settings,
    get_max_log_entries_settings,
    save_prediction,
    get_predictions,
    get_latest_prediction,
    delete_model_predictions,
)
from backend.modules.server.predictor import (
    load_model_for_prediction,
    predict_coin,
    predict_coin_all_models,
    preload_all_models,
    cache_model,
    remove_from_cache,
)
from backend.modules.server.alerts import (
    send_n8n_webhook,
    check_n8n_status,
    get_alert_evaluator,
)
from backend.modules.server.prediction_defaults import (
    get_all_prediction_defaults,
    update_prediction_defaults,
    PREDICTION_DEFAULTS_SCHEMA,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/server", tags=["Server"])


# ============================================================
# Pydantic Models (API Schemas)
# ============================================================

class AvailableModel(BaseModel):
    id: int
    name: str
    model_type: str
    target_variable: Optional[str] = None
    target_operator: Optional[str] = None
    target_value: Optional[float] = None
    future_minutes: Optional[int] = None
    price_change_percent: Optional[float] = None
    target_direction: Optional[str] = None
    features: List[str] = []
    phases: Optional[List[int]] = None
    training_accuracy: Optional[float] = None
    training_f1: Optional[float] = None
    training_precision: Optional[float] = None
    training_recall: Optional[float] = None
    created_at: Optional[datetime] = None


class AvailableModelsResponse(BaseModel):
    models: List[AvailableModel]
    total: int


class ModelImportRequest(BaseModel):
    model_id: int


class ImportModelResponse(BaseModel):
    active_model_id: int
    model_id: int
    model_name: str
    message: str


class ModelInfo(BaseModel):
    id: int
    model_id: int
    name: str
    custom_name: Optional[str] = None
    model_type: str
    target_variable: Optional[str] = None
    target_operator: Optional[str] = None
    target_value: Optional[float] = None
    future_minutes: Optional[int] = None
    price_change_percent: Optional[float] = None
    target_direction: Optional[str] = None
    features: List[str] = []
    phases: Optional[List[int]] = None
    params: Optional[Dict[str, Any]] = None
    is_active: bool
    total_predictions: int = 0
    average_probability: Optional[float] = None
    last_prediction_at: Optional[datetime] = None
    alert_threshold: float = 0.7
    n8n_webhook_url: Optional[str] = None
    n8n_send_mode: List[str] = ['all']
    n8n_enabled: bool = True
    coin_filter_mode: str = 'all'
    coin_whitelist: Optional[List[str]] = None
    ignore_bad_seconds: int = 0
    ignore_positive_seconds: int = 0
    ignore_alert_seconds: int = 0
    max_log_entries_per_coin_negative: int = 0
    max_log_entries_per_coin_positive: int = 0
    max_log_entries_per_coin_alert: int = 0
    send_ignored_to_n8n: bool = False
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    roc_auc: Optional[float] = None
    mcc: Optional[float] = None
    simulated_profit_pct: Optional[float] = None
    positive_predictions: int = 0
    stats: Optional[Dict[str, Any]] = None
    model_file_exists: bool = True
    created_at: Optional[datetime] = None


class ModelsListResponse(BaseModel):
    models: List[ModelInfo]
    total: int


class RenameModelRequest(BaseModel):
    name: str


class UpdateAlertConfigRequest(BaseModel):
    n8n_webhook_url: Optional[str] = None
    n8n_enabled: Optional[bool] = None
    n8n_send_mode: Optional[List[str]] = None
    alert_threshold: Optional[float] = None
    coin_filter_mode: Optional[str] = None
    coin_whitelist: Optional[List[str]] = None
    min_scan_interval_seconds: Optional[int] = None
    send_ignored_to_n8n: Optional[bool] = None


class UpdateIgnoreSettingsRequest(BaseModel):
    ignore_bad_seconds: int = Field(..., ge=0, le=86400)
    ignore_positive_seconds: int = Field(..., ge=0, le=86400)
    ignore_alert_seconds: int = Field(..., ge=0, le=86400)


class IgnoreSettingsResponse(BaseModel):
    ignore_bad_seconds: int
    ignore_positive_seconds: int
    ignore_alert_seconds: int


class UpdateMaxLogEntriesRequest(BaseModel):
    max_log_entries_per_coin_negative: int = Field(..., ge=0, le=1000)
    max_log_entries_per_coin_positive: int = Field(..., ge=0, le=1000)
    max_log_entries_per_coin_alert: int = Field(..., ge=0, le=1000)


class MaxLogEntriesResponse(BaseModel):
    max_log_entries_per_coin_negative: int
    max_log_entries_per_coin_positive: int
    max_log_entries_per_coin_alert: int


class PredictRequest(BaseModel):
    coin_id: str
    model_ids: Optional[List[int]] = None


class PredictionResult(BaseModel):
    model_id: int
    active_model_id: int
    model_name: str
    prediction: int
    probability: float


class PredictionResponse(BaseModel):
    coin_id: str
    predictions: List[PredictionResult]
    timestamp: datetime


class HealthResponse(BaseModel):
    status: str
    database: str
    alert_evaluator: Optional[Dict[str, Any]] = None


class StatsResponse(BaseModel):
    active_models: int
    total_predictions: int
    predictions_24h: int
    alert_evaluator: Optional[Dict[str, Any]] = None


# ============================================================
# Models Endpoints
# ============================================================

@router.get("/models/available", response_model=AvailableModelsResponse)
async def get_available_models_endpoint():
    """
    List all available models from training module (for import).

    Filter: status = 'READY' AND is_deleted = false
    """
    try:
        models = await get_available_models_for_import()

        available_models = [
            AvailableModel(
                id=m['id'],
                name=m['name'],
                model_type=m['model_type'],
                target_variable=m['target_variable'],
                target_operator=m['target_operator'],
                target_value=m['target_value'],
                future_minutes=m['future_minutes'],
                price_change_percent=m['price_change_percent'],
                target_direction=m['target_direction'],
                features=m['features'],
                phases=m['phases'],
                training_accuracy=m['training_accuracy'],
                training_f1=m['training_f1'],
                training_precision=m.get('training_precision'),
                training_recall=m.get('training_recall'),
                created_at=m['created_at']
            )
            for m in models
        ]

        return AvailableModelsResponse(
            models=available_models,
            total=len(available_models)
        )
    except Exception as e:
        logger.error(f"Error loading available models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/available/{model_id}", response_model=AvailableModel, operation_id="server_get_available_model")
async def get_available_model_details_endpoint(model_id: int):
    """Get details of an available model from training module."""
    try:
        model = await get_model_from_training_module(model_id)

        if not model:
            raise HTTPException(status_code=404, detail=f"Model {model_id} not found")

        return AvailableModel(
            id=model['id'],
            name=model['name'],
            model_type=model['model_type'],
            target_variable=model['target_variable'],
            target_operator=model.get('target_operator'),
            target_value=model.get('target_value'),
            future_minutes=model.get('future_minutes'),
            price_change_percent=model.get('price_change_percent'),
            target_direction=model.get('target_direction'),
            features=model.get('features', []),
            phases=model.get('phases'),
            training_accuracy=model.get('training_accuracy'),
            training_f1=model.get('training_f1'),
            training_precision=model.get('training_precision'),
            training_recall=model.get('training_recall'),
            created_at=model.get('created_at')
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading model details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/import", response_model=ImportModelResponse, status_code=status.HTTP_201_CREATED)
async def import_model_endpoint(request: ModelImportRequest):
    """
    Import model from training module.

    Uses direct Python import instead of HTTP download.
    """
    try:
        logger.info(f"Import request for model ID: {request.model_id} at {datetime.now().isoformat()}")
        logger.info(f"Checking if model {request.model_id} is already imported...")

        # Check if model already imported
        pool = get_pool()
        existing_db = await pool.fetchrow("""
            SELECT id, is_active FROM prediction_active_models WHERE model_id = $1
        """, request.model_id)

        if existing_db:
            existing_id = existing_db['id']
            is_active = existing_db.get('is_active', False)
            status_str = "active" if is_active else "paused"
            logger.warning(f"Model {request.model_id} is already imported (active_model_id: {existing_id}, status: {status_str})")
            raise HTTPException(
                status_code=400,
                detail=f"Model {request.model_id} is already imported (active_model_id: {existing_id}, status: {status_str}). Delete it first to re-import."
            )

        logger.info(f"Model {request.model_id} not yet imported - proceeding...")

        # Load model from training module
        logger.info(f"Loading model {request.model_id} from training module...")
        model_obj = await load_model_for_prediction(request.model_id)
        logger.info(f"Model loaded successfully")

        # Import model into prediction_active_models
        logger.info(f"Saving model {request.model_id} to database...")
        try:
            active_model_id = await import_model(
                model_id=request.model_id,
                model_obj=model_obj
            )
            logger.info(f"Model {request.model_id} successfully imported (active_model_id: {active_model_id})")

            # Cache the model
            cache_model(active_model_id, model_obj)
        except ValueError as e:
            logger.error(f"Model {request.model_id} is already imported (second check): {e}")
            raise HTTPException(status_code=400, detail=str(e))

        # Get model information
        active_models = await get_active_models()
        imported_model = next((m for m in active_models if m['id'] == active_model_id), None)

        if not imported_model:
            # Try also inactive models
            active_models_all = await get_active_models(include_inactive=True)
            imported_model = next((m for m in active_models_all if m['id'] == active_model_id), None)

        if not imported_model:
            logger.error(f"Imported model {active_model_id} not found after import")
            raise HTTPException(status_code=404, detail="Imported model not found")

        return ImportModelResponse(
            active_model_id=active_model_id,
            model_id=request.model_id,
            model_name=imported_model['name'],
            message=f"Model {request.model_id} successfully imported"
        )
    except HTTPException:
        raise
    except ValueError as e:
        logger.warning(f"Validation error during import: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error during model import: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models", response_model=ModelsListResponse)
async def get_models_endpoint(include_inactive: str = "false"):
    """List all models (alias for /models/active)"""
    return await get_active_models_endpoint(include_inactive)


@router.get("/models/active", response_model=ModelsListResponse)
async def get_active_models_endpoint(include_inactive: str = "false"):
    """
    List all active models (from prediction_active_models)

    Args:
        include_inactive: Query parameter as string ("true" or "false")
    """
    try:
        include_inactive_bool = include_inactive.lower() == "true"
        models = await get_active_models(include_inactive=include_inactive_bool)

        model_infos = [
            ModelInfo(
                id=m['id'],
                model_id=m['model_id'],
                name=m['name'],
                custom_name=m.get('custom_name'),
                model_type=m['model_type'],
                target_variable=m['target_variable'],
                target_operator=m['target_operator'],
                target_value=m['target_value'],
                future_minutes=m['future_minutes'],
                price_change_percent=m['price_change_percent'],
                target_direction=m['target_direction'],
                features=m['features'],
                phases=m['phases'],
                params=m['params'],
                is_active=m['is_active'],
                total_predictions=m['total_predictions'],
                average_probability=m.get('average_probability'),
                last_prediction_at=m['last_prediction_at'],
                alert_threshold=m.get('alert_threshold', 0.7),
                n8n_webhook_url=m.get('n8n_webhook_url'),
                n8n_send_mode=m.get('n8n_send_mode', ['all']),
                n8n_enabled=m.get('n8n_enabled', True),
                coin_filter_mode=m.get('coin_filter_mode', 'all'),
                coin_whitelist=m.get('coin_whitelist'),
                ignore_bad_seconds=m.get('ignore_bad_seconds', 0),
                ignore_positive_seconds=m.get('ignore_positive_seconds', 0),
                ignore_alert_seconds=m.get('ignore_alert_seconds', 0),
                max_log_entries_per_coin_negative=m.get('max_log_entries_per_coin_negative', 0),
                max_log_entries_per_coin_positive=m.get('max_log_entries_per_coin_positive', 0),
                max_log_entries_per_coin_alert=m.get('max_log_entries_per_coin_alert', 0),
                send_ignored_to_n8n=m.get('send_ignored_to_n8n', False),
                accuracy=m.get('accuracy'),
                f1_score=m.get('f1_score'),
                precision=m.get('precision'),
                recall=m.get('recall'),
                roc_auc=m.get('roc_auc'),
                mcc=m.get('mcc'),
                simulated_profit_pct=m.get('simulated_profit_pct'),
                positive_predictions=m.get('positive_predictions', 0),
                stats=m.get('stats'),
                model_file_exists=m.get('model_file_exists', True),
                created_at=m['created_at']
            )
            for m in models
        ]

        return ModelsListResponse(
            models=model_infos,
            total=len(model_infos)
        )
    except Exception as e:
        logger.error(f"Error loading active models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{active_model_id}", response_model=ModelInfo, operation_id="server_get_model")
async def get_active_model_endpoint(active_model_id: int):
    """Get details of an active model"""
    try:
        models = await get_active_models(include_inactive=True)
        model = next((m for m in models if m['id'] == active_model_id), None)

        if not model:
            raise HTTPException(status_code=404, detail="Model not found")

        return ModelInfo(
            id=model['id'],
            model_id=model['model_id'],
            name=model['name'],
            custom_name=model.get('custom_name'),
            model_type=model['model_type'],
            target_variable=model['target_variable'],
            target_operator=model.get('target_operator'),
            target_value=model.get('target_value'),
            future_minutes=model.get('future_minutes'),
            price_change_percent=model.get('price_change_percent'),
            target_direction=model.get('target_direction'),
            features=model.get('features', []),
            phases=model.get('phases'),
            params=model.get('params'),
            is_active=model.get('is_active', True),
            total_predictions=model.get('total_predictions', 0),
            last_prediction_at=model.get('last_prediction_at'),
            alert_threshold=model.get('alert_threshold', 0.7),
            n8n_webhook_url=model.get('n8n_webhook_url'),
            n8n_send_mode=model.get('n8n_send_mode', ['all']),
            n8n_enabled=model.get('n8n_enabled', True),
            coin_filter_mode=model.get('coin_filter_mode', 'all'),
            coin_whitelist=model.get('coin_whitelist'),
            ignore_bad_seconds=model.get('ignore_bad_seconds'),
            ignore_positive_seconds=model.get('ignore_positive_seconds'),
            ignore_alert_seconds=model.get('ignore_alert_seconds'),
            max_log_entries_per_coin_negative=model.get('max_log_entries_per_coin_negative', 0),
            max_log_entries_per_coin_positive=model.get('max_log_entries_per_coin_positive', 0),
            max_log_entries_per_coin_alert=model.get('max_log_entries_per_coin_alert', 0),
            send_ignored_to_n8n=model.get('send_ignored_to_n8n', False),
            accuracy=model.get('accuracy'),
            f1_score=model.get('f1_score'),
            precision=model.get('precision'),
            recall=model.get('recall'),
            roc_auc=model.get('roc_auc'),
            mcc=model.get('mcc'),
            simulated_profit_pct=model.get('simulated_profit_pct'),
            positive_predictions=model.get('positive_predictions', 0),
            average_probability=model.get('average_probability'),
            stats=model.get('stats'),
            model_file_exists=model.get('model_file_exists', True),
            created_at=model.get('created_at')
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading model {active_model_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/{active_model_id}/activate", status_code=status.HTTP_200_OK, operation_id="server_activate_model")
async def activate_model_endpoint(active_model_id: int):
    """Activate model (set is_active = true)"""
    try:
        success = await activate_model(active_model_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")
        return {"message": f"Model {active_model_id} activated", "active_model_id": active_model_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error activating: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/models/{active_model_id}/deactivate", status_code=status.HTTP_200_OK, operation_id="server_deactivate_model")
async def deactivate_model_endpoint(active_model_id: int):
    """Deactivate model (set is_active = false)"""
    try:
        success = await deactivate_model(active_model_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")
        return {"message": f"Model {active_model_id} deactivated", "active_model_id": active_model_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deactivating: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/models/{active_model_id}/rename", status_code=status.HTTP_200_OK, operation_id="server_rename_model")
async def rename_model_endpoint(active_model_id: int, request: RenameModelRequest):
    """Rename model (set custom_name)"""
    try:
        success = await rename_active_model(active_model_id, request.name)
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")
        return {"message": f"Model {active_model_id} renamed to '{request.name}'", "active_model_id": active_model_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renaming: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/models/{active_model_id}", status_code=status.HTTP_200_OK)
async def delete_model_endpoint(active_model_id: int):
    """Delete model and all associated predictions"""
    try:
        success = await delete_active_model(active_model_id)
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")
        remove_from_cache(active_model_id)
        return {"message": f"Model {active_model_id} deleted", "active_model_id": active_model_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/models/{active_model_id}/alert-config", status_code=status.HTTP_200_OK, operation_id="server_update_alert_config")
async def update_alert_config_endpoint(active_model_id: int, request: UpdateAlertConfigRequest):
    """Update complete alert configuration for an active model"""
    try:
        success = await update_alert_config(
            active_model_id=active_model_id,
            n8n_webhook_url=request.n8n_webhook_url,
            n8n_enabled=request.n8n_enabled,
            n8n_send_mode=request.n8n_send_mode,
            alert_threshold=request.alert_threshold,
            coin_filter_mode=request.coin_filter_mode,
            coin_whitelist=request.coin_whitelist,
            min_scan_interval_seconds=request.min_scan_interval_seconds,
            send_ignored_to_n8n=request.send_ignored_to_n8n
        )
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found or no changes made")

        return {
            "message": f"Alert configuration for model {active_model_id} successfully updated",
            "active_model_id": active_model_id,
            "config": {
                "n8n_webhook_url": request.n8n_webhook_url,
                "n8n_enabled": request.n8n_enabled,
                "n8n_send_mode": request.n8n_send_mode,
                "alert_threshold": request.alert_threshold,
                "coin_filter_mode": request.coin_filter_mode,
                "coin_whitelist": request.coin_whitelist,
                "min_scan_interval_seconds": request.min_scan_interval_seconds
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating alert configuration: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/models/{active_model_id}/ignore-settings", status_code=status.HTTP_200_OK, operation_id="server_update_ignore_settings")
async def update_ignore_settings_endpoint(active_model_id: int, request: UpdateIgnoreSettingsRequest):
    """Update coin-ignore settings for a model"""
    try:
        success = await update_ignore_settings(
            active_model_id=active_model_id,
            ignore_bad_seconds=request.ignore_bad_seconds,
            ignore_positive_seconds=request.ignore_positive_seconds,
            ignore_alert_seconds=request.ignore_alert_seconds
        )
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")

        return {
            "message": f"Ignore settings for model {active_model_id} updated",
            "active_model_id": active_model_id,
            "ignore_bad_seconds": request.ignore_bad_seconds,
            "ignore_positive_seconds": request.ignore_positive_seconds,
            "ignore_alert_seconds": request.ignore_alert_seconds
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ignore settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{active_model_id}/ignore-settings", response_model=IgnoreSettingsResponse, operation_id="server_get_ignore_settings")
async def get_ignore_settings_endpoint(active_model_id: int):
    """Get coin-ignore settings for a model"""
    try:
        settings = await get_ignore_settings(active_model_id)
        if not settings:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")

        return IgnoreSettingsResponse(
            ignore_bad_seconds=settings['ignore_bad_seconds'],
            ignore_positive_seconds=settings['ignore_positive_seconds'],
            ignore_alert_seconds=settings['ignore_alert_seconds']
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ignore settings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/models/{active_model_id}/max-log-entries", status_code=status.HTTP_200_OK, operation_id="server_update_max_log_entries")
async def update_max_log_entries_endpoint(active_model_id: int, request: UpdateMaxLogEntriesRequest):
    """Update max-log-entries settings for a model"""
    try:
        success = await update_max_log_entries_settings(
            active_model_id=active_model_id,
            max_log_entries_per_coin_negative=request.max_log_entries_per_coin_negative,
            max_log_entries_per_coin_positive=request.max_log_entries_per_coin_positive,
            max_log_entries_per_coin_alert=request.max_log_entries_per_coin_alert
        )
        if not success:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")

        return {
            "message": f"Max log entries settings for model {active_model_id} updated",
            "active_model_id": active_model_id,
            "max_log_entries_per_coin_negative": request.max_log_entries_per_coin_negative,
            "max_log_entries_per_coin_positive": request.max_log_entries_per_coin_positive,
            "max_log_entries_per_coin_alert": request.max_log_entries_per_coin_alert
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating max log entries: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{active_model_id}/max-log-entries", response_model=MaxLogEntriesResponse, operation_id="server_get_max_log_entries")
async def get_max_log_entries_endpoint(active_model_id: int):
    """Get max-log-entries settings for a model"""
    try:
        settings = await get_max_log_entries_settings(active_model_id)
        if not settings:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")

        return MaxLogEntriesResponse(
            max_log_entries_per_coin_negative=settings['max_log_entries_per_coin_negative'],
            max_log_entries_per_coin_positive=settings['max_log_entries_per_coin_positive'],
            max_log_entries_per_coin_alert=settings['max_log_entries_per_coin_alert']
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting max log entries: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models/{active_model_id}/n8n-status", operation_id="server_get_n8n_status")
async def get_n8n_status_endpoint(active_model_id: int):
    """Check n8n webhook status for a model"""
    try:
        models = await get_active_models(include_inactive=True)
        model = next((m for m in models if m['id'] == active_model_id), None)

        if not model:
            raise HTTPException(status_code=404, detail=f"Model {active_model_id} not found")

        webhook_url = model.get('n8n_webhook_url')
        if not webhook_url:
            return {"status": "no_url", "message": "No webhook URL configured"}

        status_str = await check_n8n_status(webhook_url)
        return {"status": status_str, "webhook_url": webhook_url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking n8n status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Predictions Endpoints
# ============================================================

@router.post("/predict", response_model=PredictionResponse)
async def predict_endpoint(request: PredictRequest):
    """Make predictions for a coin with specified models"""
    try:
        timestamp = datetime.now(timezone.utc)

        # Get models
        if request.model_ids:
            all_models = await get_active_models(include_inactive=False)
            active_models = [m for m in all_models if m['id'] in request.model_ids]
            if not active_models:
                raise HTTPException(status_code=404, detail="No active models found with specified IDs")
        else:
            active_models = await get_active_models(include_inactive=False)

        if not active_models:
            raise HTTPException(status_code=404, detail="No active models available")

        # Make predictions
        predictions = await predict_coin_all_models(
            coin_id=request.coin_id,
            timestamp=timestamp,
            active_models=active_models
        )

        if not predictions:
            raise HTTPException(status_code=500, detail="All predictions failed")

        return PredictionResponse(
            coin_id=request.coin_id,
            predictions=[
                PredictionResult(
                    model_id=p['model_id'],
                    active_model_id=p['active_model_id'],
                    model_name=p['model_name'],
                    prediction=p['prediction'],
                    probability=p['probability']
                )
                for p in predictions
            ],
            timestamp=timestamp
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predictions")
async def get_predictions_endpoint(
    active_model_id: Optional[int] = Query(None),
    coin_id: Optional[str] = Query(None),
    prediction: Optional[int] = Query(None),
    min_probability: Optional[float] = Query(None),
    tag: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    evaluation_result: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=10000),
    offset: int = Query(0, ge=0)
):
    """Get predictions with filters"""
    try:
        predictions = await get_predictions(
            active_model_id=active_model_id,
            coin_id=coin_id,
            prediction=prediction,
            min_probability=min_probability,
            tag=tag,
            status=status,
            evaluation_result=evaluation_result,
            limit=limit,
            offset=offset
        )

        return {"predictions": predictions, "total": len(predictions)}
    except Exception as e:
        logger.error(f"Error getting predictions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/predictions/latest/{coin_id}", operation_id="server_get_latest_prediction")
async def get_latest_prediction_endpoint(
    coin_id: str,
    model_id: Optional[int] = Query(None)
):
    """Get latest prediction for a coin"""
    try:
        prediction = await get_latest_prediction(coin_id, model_id)
        if not prediction:
            raise HTTPException(status_code=404, detail="No prediction found")

        return prediction
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting latest prediction: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/models/{active_model_id}/predictions", status_code=status.HTTP_200_OK, operation_id="server_delete_predictions")
async def delete_model_predictions_endpoint(active_model_id: int):
    """Delete all predictions for a model"""
    try:
        count = await delete_model_predictions(active_model_id)
        return {"message": f"Deleted {count} predictions for model {active_model_id}", "deleted_count": count}
    except Exception as e:
        logger.error(f"Error deleting predictions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Coin Details Endpoint
# ============================================================

@router.get("/models/{active_model_id}/coin/{coin_id}", operation_id="server_get_coin_details")
async def get_coin_details_endpoint(active_model_id: int, coin_id: str):
    """Get coin details including price history, predictions, and evaluations for a specific model+coin"""
    try:
        pool = get_pool()

        # Get predictions for this model+coin
        pred_rows = await pool.fetch("""
            SELECT id, coin_id, prediction, probability, tag,
                   prediction_timestamp, evaluation_timestamp, evaluated_at,
                   evaluation_result, actual_price_change_pct,
                   ath_highest_pct, ath_lowest_pct,
                   price_close_at_prediction, price_close_at_evaluation
            FROM model_predictions
            WHERE active_model_id = $1 AND coin_id = $2
            ORDER BY prediction_timestamp DESC
            LIMIT 100
        """, active_model_id, coin_id)

        # Get the model's alert threshold
        models = await get_active_models(include_inactive=True)
        model = next((m for m in models if m['id'] == active_model_id), None)
        alert_threshold = float(model.get('alert_threshold', 0.7)) if model else 0.7

        # Get price history from coin_metrics
        metric_rows = await pool.fetch("""
            SELECT mint, timestamp, price_open, price_high, price_low, price_close,
                   market_cap_close, volume_sol
            FROM coin_metrics
            WHERE mint = $1
            ORDER BY timestamp ASC
            LIMIT 500
        """, coin_id)

        # Build price history
        price_history = []
        for r in metric_rows:
            price_history.append({
                "timestamp": r['timestamp'].isoformat() if r['timestamp'] else None,
                "price_open": float(r['price_open']) if r['price_open'] else None,
                "price_high": float(r['price_high']) if r['price_high'] else None,
                "price_low": float(r['price_low']) if r['price_low'] else None,
                "price_close": float(r['price_close']) if r['price_close'] else None,
                "volume_sol": float(r['volume_sol']) if r['volume_sol'] else None,
                "market_cap_close": float(r['market_cap_close']) if r['market_cap_close'] else None,
            })

        # Build predictions list
        predictions = []
        for r in pred_rows:
            prob = float(r['probability'])
            predictions.append({
                "id": r['id'],
                "timestamp": r['prediction_timestamp'].isoformat() if r['prediction_timestamp'] else None,
                "prediction_timestamp": r['prediction_timestamp'].isoformat() if r['prediction_timestamp'] else None,
                "evaluation_timestamp": r['evaluation_timestamp'].isoformat() if r['evaluation_timestamp'] else None,
                "evaluated_at": r['evaluated_at'].isoformat() if r['evaluated_at'] else None,
                "prediction": r['prediction'],
                "probability": prob,
                "alert_threshold": alert_threshold,
                "is_alert": r['tag'] == 'alert',
                "evaluation_result": r['evaluation_result'],
                "actual_price_change_pct": float(r['actual_price_change_pct']) if r['actual_price_change_pct'] is not None else None,
                "ath_highest_pct": float(r['ath_highest_pct']) if r['ath_highest_pct'] is not None else None,
                "ath_lowest_pct": float(r['ath_lowest_pct']) if r['ath_lowest_pct'] is not None else None,
                "price_close_at_prediction": float(r['price_close_at_prediction']) if r['price_close_at_prediction'] is not None else None,
                "price_close_at_evaluation": float(r['price_close_at_evaluation']) if r['price_close_at_evaluation'] is not None else None,
            })

        # Build evaluations list
        evaluations = []
        for r in pred_rows:
            eval_result = r['evaluation_result']
            if eval_result:
                status_val = eval_result
            elif r['evaluated_at']:
                status_val = 'pending'
            else:
                status_val = 'pending'
            evaluations.append({
                "id": r['id'],
                "prediction_timestamp": r['prediction_timestamp'].isoformat() if r['prediction_timestamp'] else None,
                "status": status_val,
                "actual_price_change": float(r['actual_price_change_pct']) if r['actual_price_change_pct'] is not None else None,
                "probability": float(r['probability']),
            })

        # Earliest prediction timestamp for response
        earliest_ts = pred_rows[-1]['prediction_timestamp'].isoformat() if pred_rows else None

        return {
            "coin_id": coin_id,
            "model_id": active_model_id,
            "prediction_timestamp": earliest_ts,
            "price_history": price_history,
            "predictions": predictions,
            "evaluations": evaluations,
        }

    except Exception as e:
        logger.error(f"Error loading coin details: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Alert Statistics Endpoint
# ============================================================

@router.get("/alerts/statistics")
async def get_alert_statistics_endpoint(
    model_id: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Get alert statistics, optionally filtered by model"""
    try:
        pool = get_pool()

        where_clauses = ["1=1"]
        params = []
        idx = 1

        if model_id is not None:
            where_clauses.append(f"active_model_id = ${idx}")
            params.append(model_id)
            idx += 1
        if date_from:
            where_clauses.append(f"prediction_timestamp >= ${idx}::timestamptz")
            params.append(date_from)
            idx += 1
        if date_to:
            where_clauses.append(f"prediction_timestamp <= ${idx}::timestamptz")
            params.append(date_to)
            idx += 1

        where = " AND ".join(where_clauses)

        row = await pool.fetchrow(f"""
            SELECT
                COUNT(*) FILTER (WHERE tag = 'alert') as total_alerts,
                COUNT(*) FILTER (WHERE tag = 'alert' AND status = 'aktiv') as pending,
                COUNT(*) FILTER (WHERE tag = 'alert' AND evaluation_result = 'success') as success,
                COUNT(*) FILTER (WHERE tag = 'alert' AND evaluation_result = 'failed') as failed,
                COUNT(*) FILTER (WHERE tag = 'alert' AND evaluation_result = 'not_applicable') as expired,
                COUNT(*) FILTER (WHERE tag = 'alert') as alerts_above_threshold,
                COUNT(*) FILTER (WHERE tag != 'alert') as non_alerts_count,
                COUNT(*) FILTER (WHERE tag = 'alert' AND evaluation_result = 'success') as alerts_success,
                COUNT(*) FILTER (WHERE tag = 'alert' AND evaluation_result = 'failed') as alerts_failed,
                COUNT(*) FILTER (WHERE tag = 'alert' AND status = 'aktiv') as alerts_pending,
                COUNT(*) FILTER (WHERE tag != 'alert' AND evaluation_result = 'success') as non_alerts_success,
                COUNT(*) FILTER (WHERE tag != 'alert' AND evaluation_result = 'failed') as non_alerts_failed,
                COUNT(*) FILTER (WHERE tag != 'alert' AND status = 'aktiv') as non_alerts_pending,
                COALESCE(SUM(actual_price_change_pct) FILTER (WHERE tag = 'alert' AND evaluation_result IN ('success', 'failed')), 0) as total_performance_pct,
                COALESCE(SUM(actual_price_change_pct) FILTER (WHERE tag = 'alert' AND evaluation_result = 'success' AND actual_price_change_pct > 0), 0) as alerts_profit_pct,
                COALESCE(SUM(actual_price_change_pct) FILTER (WHERE tag = 'alert' AND evaluation_result = 'failed' AND actual_price_change_pct < 0), 0) as alerts_loss_pct
            FROM model_predictions
            WHERE {where}
        """, *params)

        total_alerts = row['total_alerts'] or 0
        alerts_success = row['alerts_success'] or 0
        alerts_failed = row['alerts_failed'] or 0
        non_alerts_success = row['non_alerts_success'] or 0
        non_alerts_failed = row['non_alerts_failed'] or 0

        alerts_evaluated = alerts_success + alerts_failed
        non_alerts_evaluated = non_alerts_success + non_alerts_failed

        return {
            "total_alerts": total_alerts,
            "pending": row['pending'] or 0,
            "success": row['success'] or 0,
            "failed": row['failed'] or 0,
            "expired": row['expired'] or 0,
            "alerts_above_threshold": row['alerts_above_threshold'] or 0,
            "non_alerts_count": row['non_alerts_count'] or 0,
            "alerts_success": alerts_success,
            "alerts_failed": alerts_failed,
            "alerts_pending": row['alerts_pending'] or 0,
            "non_alerts_success": non_alerts_success,
            "non_alerts_failed": non_alerts_failed,
            "non_alerts_pending": row['non_alerts_pending'] or 0,
            "alerts_success_rate": round(alerts_success / alerts_evaluated * 100, 1) if alerts_evaluated > 0 else 0,
            "non_alerts_success_rate": round(non_alerts_success / non_alerts_evaluated * 100, 1) if non_alerts_evaluated > 0 else 0,
            "total_performance_pct": round(float(row['total_performance_pct']), 2),
            "alerts_profit_pct": round(float(row['alerts_profit_pct']), 2),
            "alerts_loss_pct": round(float(row['alerts_loss_pct']), 2),
        }
    except Exception as e:
        logger.error(f"Error getting alert statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# Prediction Defaults Endpoints
# ============================================================

@router.get("/defaults")
async def get_defaults_endpoint():
    """Get prediction defaults applied to newly imported models."""
    try:
        defaults = await get_all_prediction_defaults()
        return defaults
    except Exception as e:
        logger.error(f"Error getting prediction defaults: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/defaults")
async def update_defaults_endpoint(updates: Dict[str, Any]):
    """Update prediction defaults. Returns the full updated dict."""
    try:
        result = await update_prediction_defaults(updates)
        return result
    except Exception as e:
        logger.error(f"Error updating prediction defaults: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# System Endpoints
# ============================================================

@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    from backend.database import check_health

    db_ok = await check_health()
    evaluator = get_alert_evaluator()

    return HealthResponse(
        status="healthy" if db_ok else "degraded",
        database="connected" if db_ok else "disconnected",
        alert_evaluator=evaluator.get_stats() if evaluator else None
    )


@router.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Get service statistics"""
    try:
        models = await get_active_models(include_inactive=False)

        pool = get_pool()
        total_predictions = await pool.fetchval("""
            SELECT COUNT(*) FROM model_predictions
        """)

        predictions_24h = await pool.fetchval("""
            SELECT COUNT(*) FROM model_predictions
            WHERE created_at >= NOW() - INTERVAL '24 hours'
        """)

        evaluator = get_alert_evaluator()

        return StatsResponse(
            active_models=len(models),
            total_predictions=total_predictions or 0,
            predictions_24h=predictions_24h or 0,
            alert_evaluator=evaluator.get_stats() if evaluator else None
        )
    except Exception as e:
        logger.error(f"Error getting stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/system/preload-models")
async def preload_models_endpoint():
    """Preload all active models into memory"""
    try:
        result = await preload_all_models()
        return {
            "message": "Models preloaded",
            "loaded": result["loaded"],
            "failed": result["failed"]
        }
    except Exception as e:
        logger.error(f"Error preloading models: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
