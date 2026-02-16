"""
Prediction Engine for Server module.

Migrated from pump-server/backend/app/prediction/engine.py and model_manager.py.
Uses direct Python imports from training module instead of HTTP calls for model loading.
"""

import asyncio
import io
import logging
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

import joblib
import numpy as np
import pandas as pd

from backend.config import settings
from backend.database import get_pool
from backend.modules.training.trainer import ModelCache, load_model_from_binary
from backend.modules.training.features import add_pump_detection_features

logger = logging.getLogger(__name__)


# ============================================================
# Model cache for server module
# ============================================================

# Local cache for loaded models (active_model_id -> model_obj)
_SERVER_MODEL_CACHE: Dict[int, Any] = {}


def get_cached_model(active_model_id: int) -> Optional[Any]:
    """Get model from server cache."""
    return _SERVER_MODEL_CACHE.get(active_model_id)


def cache_model(active_model_id: int, model_obj: Any):
    """Put model into server cache."""
    _SERVER_MODEL_CACHE[active_model_id] = model_obj
    logger.debug(f"Model cached: active_model_id={active_model_id}")


def remove_from_cache(active_model_id: int):
    """Remove model from server cache."""
    _SERVER_MODEL_CACHE.pop(active_model_id, None)
    logger.debug(f"Model removed from cache: active_model_id={active_model_id}")


def clear_model_cache():
    """Clear all cached models."""
    _SERVER_MODEL_CACHE.clear()
    logger.info("Server model cache cleared")


# ============================================================
# Model loading (from training module)
# ============================================================

async def load_model_for_prediction(model_id: int) -> Any:
    """
    Load model from training module.

    This function replaces HTTP download with direct Python import.

    Args:
        model_id: ID of the model in ml_models

    Returns:
        Loaded model object

    Raises:
        ValueError: If model not found or cannot be loaded
    """
    from backend.modules.training.db_queries import get_model

    # Check if model is in training module cache first
    cached = ModelCache.get(model_id)
    if cached:
        logger.debug(f"Model {model_id} loaded from training module cache")
        return cached

    # Get model from training module database
    model_record = await get_model(model_id)
    if not model_record:
        raise ValueError(f"Model {model_id} not found in training module")

    # Load model binary if available
    if model_record.get('model_binary'):
        logger.debug(f"Loading model {model_id} from database binary")
        model_obj = load_model_from_binary(model_record['model_binary'])
        ModelCache.put(model_id, model_obj)
        return model_obj

    # Load from file path if available
    model_file_path = model_record.get('model_file_path')
    if model_file_path:
        from backend.modules.training.trainer import load_model as load_model_from_file
        logger.debug(f"Loading model {model_id} from file: {model_file_path}")
        model_obj = load_model_from_file(model_file_path)
        ModelCache.put(model_id, model_obj)
        return model_obj

    raise ValueError(f"Model {model_id} has no binary or file path")


def get_model(model_config: Dict[str, Any]) -> Any:
    """
    Get model for prediction (from cache or load it).

    Args:
        model_config: Model configuration from prediction_active_models

    Returns:
        Loaded model object

    Raises:
        ValueError: If model cannot be loaded
    """
    active_model_id = model_config['id']
    model_id = model_config['model_id']

    # Check server cache first
    cached = get_cached_model(active_model_id)
    if cached:
        return cached

    # Check training module cache
    cached = ModelCache.get(model_id)
    if cached:
        cache_model(active_model_id, cached)
        return cached

    # Need to load synchronously (will be called from async context via run_in_executor if needed)
    raise ValueError(f"Model {model_id} not loaded. Call load_model_for_prediction first.")


# ============================================================
# Feature preparation
# ============================================================

async def prepare_features(
    coin_id: str,
    model_config: Dict[str, Any],
    pool: Optional[Any] = None
) -> pd.DataFrame:
    """
    Prepare features for prediction.

    Loads base features from coin_metrics and computes extra-source features
    (graph, embedding, transaction) if the model was trained with them.

    Args:
        coin_id: Coin mint address
        model_config: Model configuration
        pool: Database pool (optional)

    Returns:
        DataFrame with features

    Raises:
        ValueError: If features cannot be prepared
    """
    if pool is None:
        pool = get_pool()

    # Get required features from model config
    required_features = model_config.get('features', [])
    if not required_features:
        raise ValueError("Model has no features defined")

    # Read model params for feature engineering config
    params = model_config.get('params', {}) or {}
    use_engineered = params.get('use_engineered_features', False)
    window_sizes = params.get('feature_engineering_windows', [5, 10, 15])
    use_flags = params.get('use_flag_features', True)
    history_limit = (max(window_sizes) + 5) if use_engineered else 1

    # Get coin metrics (enough history for rolling windows if needed)
    rows = await pool.fetch("""
        SELECT *
        FROM coin_metrics
        WHERE mint = $1
        ORDER BY timestamp DESC
        LIMIT $2
    """, coin_id, history_limit)

    if not rows:
        raise ValueError(f"No metrics found for coin {coin_id}")

    if use_engineered and len(rows) > 1:
        # Build DataFrame for feature engineering (chronological order)
        df = pd.DataFrame([dict(r) for r in reversed(rows)])
        # Convert Decimal to float for numeric columns
        from decimal import Decimal
        for col in df.columns:
            if df[col].dtype == object:
                first_val = df[col].dropna().iloc[0] if len(df[col].dropna()) > 0 else None
                if isinstance(first_val, Decimal):
                    df[col] = df[col].astype(float)
        df = add_pump_detection_features(df, window_sizes=window_sizes, include_flags=use_flags)
        row = df.iloc[-1]  # latest row with all computed features
    else:
        row = rows[0]  # single row, dict-like asyncpg Record

    extra_features: Dict[str, float] = {}

    if params.get('use_graph_features'):
        try:
            from backend.modules.training.graph_features import compute_graph_features
            graph_data = await compute_graph_features([coin_id])
            extra_features.update(graph_data.get(coin_id, {}))
        except Exception as e:
            logger.warning(f"Failed to compute graph features for {coin_id[:8]}...: {e}")

    if params.get('use_embedding_features'):
        try:
            from backend.modules.training.embedding_features import compute_embedding_features
            emb_data = await compute_embedding_features([coin_id])
            extra_features.update(emb_data.get(coin_id, {}))
        except Exception as e:
            logger.warning(f"Failed to compute embedding features for {coin_id[:8]}...: {e}")

    if params.get('use_transaction_features'):
        try:
            from backend.modules.training.transaction_features import compute_transaction_features
            tx_data = await compute_transaction_features([coin_id])
            extra_features.update(tx_data.get(coin_id, {}))
        except Exception as e:
            logger.warning(f"Failed to compute transaction features for {coin_id[:8]}...: {e}")

    if params.get('use_metadata_features') or params.get('use_market_context'):
        try:
            from backend.modules.training.metadata_features import compute_metadata_features
            meta_data = await compute_metadata_features([coin_id])
            extra_features.update(meta_data.get(coin_id, {}))
        except Exception as e:
            logger.warning(f"Failed to compute metadata features for {coin_id[:8]}...: {e}")

    # Extract features from metrics + extra sources
    feature_values = []
    is_series = isinstance(row, pd.Series)
    for feature in required_features:
        # Try coin_metrics / engineered features first
        if is_series:
            value = row.get(feature)
            # pandas returns NaN for missing, treat as None
            if value is not None and pd.isna(value):
                value = None
        else:
            value = row.get(feature)

        # Then try extra-source features
        if value is None and feature in extra_features:
            value = extra_features[feature]

        if value is None:
            # Try to compute missing features if possible
            price_close = row.get('price_close') if is_series else row.get('price_close')
            if feature == 'price_vs_ath_pct' and price_close and row.get('ath_price_sol'):
                value = ((float(price_close) - float(row.get('ath_price_sol'))) / float(row.get('ath_price_sol'))) * 100
            elif feature == 'buy_pressure_ratio':
                buy_vol = float(row.get('buy_volume_sol') or 0)
                sell_vol = float(row.get('sell_volume_sol') or 0)
                value = buy_vol / (buy_vol + sell_vol) if (buy_vol + sell_vol) > 0 else 0.5
            else:
                value = 0.0  # Default for missing features

        feature_values.append(float(value))

    # Create DataFrame
    df = pd.DataFrame([feature_values], columns=required_features)
    return df


# ============================================================
# Prediction
# ============================================================

async def predict_coin(
    coin_id: str,
    timestamp: datetime,
    model_config: Dict[str, Any],
    pool: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Make prediction for a coin with a model.

    Args:
        coin_id: Coin ID (mint)
        timestamp: Timestamp of data
        model_config: Model configuration (from prediction_active_models)
        pool: Database pool (optional)

    Returns:
        Dict with 'prediction' (0 or 1) and 'probability' (0.0 - 1.0)

    Raises:
        ValueError: If features missing or model error
    """
    start_time = time.time()

    try:
        # Get model (from cache)
        try:
            model = get_model(model_config)
        except ValueError:
            # Model not loaded yet - load it first
            model_id = model_config['model_id']
            logger.info(f"Loading model {model_id} for first prediction")
            model_obj = await load_model_for_prediction(model_id)
            cache_model(model_config['id'], model_obj)
            model = model_obj

        # Prepare features
        feature_start = time.time()
        features_df = await prepare_features(
            coin_id=coin_id,
            model_config=model_config,
            pool=pool
        )
        feature_duration = time.time() - feature_start

        # Make prediction
        X = features_df.values

        # Model expects 2D array (n_samples, n_features)
        if X.ndim == 1:
            X = X.reshape(1, -1)

        prediction = model.predict(X)
        probability = model.predict_proba(X)[:, 1]  # Probability for class 1

        # Last entry (newest prediction)
        result = {
            "prediction": int(prediction[-1]),
            "probability": float(probability[-1])
        }

        prediction_duration = time.time() - start_time

        model_name = model_config.get('custom_name') or model_config.get('name', 'Unknown')

        logger.debug(
            f"Prediction for coin {coin_id[:8]}... with model {model_config['model_id']}: "
            f"prediction={result['prediction']}, probability={result['probability']:.4f} "
            f"(duration: {prediction_duration:.3f}s)"
        )

        return result

    except ValueError as e:
        logger.warning(
            f"Feature error for coin {coin_id[:8]}... with model {model_config.get('id', 'unknown')} "
            f"(Model ID: {model_config['model_id']}): {e}"
        )
        raise
    except Exception as e:
        logger.error(
            f"Error in prediction for coin {coin_id[:8]}... with model {model_config.get('id', 'unknown')} "
            f"(Model ID: {model_config['model_id']}): {e}",
            exc_info=True
        )
        raise


async def predict_coin_all_models(
    coin_id: str,
    timestamp: datetime,
    active_models: List[Dict[str, Any]],
    pool: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Make predictions with ALL active models.

    Optimized: Parallel processing - all models run simultaneously.

    Args:
        coin_id: Coin ID (mint)
        timestamp: Timestamp of data
        active_models: List of active model configurations
        pool: Database pool (optional)

    Returns:
        List of predictions (one dict per model)
    """

    async def predict_single_model(model_config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Helper function for parallel processing of a model"""
        try:
            result = await predict_coin(
                coin_id=coin_id,
                timestamp=timestamp,
                model_config=model_config,
                pool=pool
            )

            return {
                "model_id": model_config['model_id'],
                "active_model_id": model_config['id'],
                "model_name": model_config.get('custom_name') or model_config.get('name', 'Unknown'),
                "prediction": result['prediction'],
                "probability": result['probability']
            }

        except ValueError as e:
            logger.warning(
                f"Feature error for model ID {model_config.get('id', 'unknown')} "
                f"(Model ID: {model_config['model_id']}, Name: {model_config.get('custom_name') or model_config.get('name', 'Unknown')}) "
                f"for coin {coin_id[:8]}...: {e}"
            )
            return None
        except Exception as e:
            logger.error(
                f"Error for model ID {model_config.get('id', 'unknown')} "
                f"(Model ID: {model_config['model_id']}, Name: {model_config.get('custom_name') or model_config.get('name', 'Unknown')}) "
                f"for coin {coin_id[:8]}...: {e}",
                exc_info=True
            )
            return None

    # PARALLEL PROCESSING: All models run simultaneously
    tasks = [predict_single_model(model_config) for model_config in active_models]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Filter out None and Exceptions
    valid_results = [r for r in results if r is not None and not isinstance(r, Exception)]

    if len(valid_results) == 0 and len(active_models) > 0:
        logger.error(
            f"CRITICAL: ALL {len(active_models)} models failed for coin {coin_id[:8]}... "
            f"Probably feature mismatch or data problem."
        )
    elif len(valid_results) < len(active_models):
        failed_count = len(active_models) - len(valid_results)
        logger.warning(
            f"Predictions for coin {coin_id[:8]}...: {len(valid_results)}/{len(active_models)} successful, {failed_count} failed"
        )
    else:
        logger.info(f"Predictions for coin {coin_id[:8]}...: {len(valid_results)}/{len(active_models)} successful (parallel processed)")

    return valid_results


# ============================================================
# Preload models at startup
# ============================================================

async def preload_all_models():
    """
    Preload all active models at startup.

    This loads all models from the training module into memory
    for faster predictions.
    """
    from backend.modules.server.db_queries import get_active_models

    models = await get_active_models(include_inactive=False)
    loaded_count = 0
    failed_count = 0

    for model_config in models:
        try:
            model_id = model_config['model_id']
            active_model_id = model_config['id']

            model_obj = await load_model_for_prediction(model_id)
            cache_model(active_model_id, model_obj)
            loaded_count += 1

            logger.info(f"Preloaded model {model_id} (active_model_id: {active_model_id})")
        except Exception as e:
            failed_count += 1
            logger.error(f"Failed to preload model {model_config.get('model_id')}: {e}")

    logger.info(f"Preloaded {loaded_count} models ({failed_count} failed)")
    return {"loaded": loaded_count, "failed": failed_count}
