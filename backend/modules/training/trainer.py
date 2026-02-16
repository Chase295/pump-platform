"""
XGBoost Training Engine, Model Loader, and Model Cache.

Migrated from:
  - pump-training/backend/app/training/engine.py
  - pump-training/backend/app/training/model_loader.py
  - pump-training/backend/app/utils/model_cache.py

CPU-bound work (model.fit, predict) runs via ``run_in_executor`` so the
FastAPI event loop is never blocked.
"""

import asyncio
import io
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    roc_auc_score, confusion_matrix, matthews_corrcoef,
)
from sklearn.model_selection import train_test_split

from backend.config import settings
from backend.database import get_pool
from backend.modules.training.db_queries import get_model_type_defaults
from backend.modules.training.features import (
    load_training_data,
    create_time_based_labels,
    create_rule_based_labels as create_labels,
    check_overlap,
    get_engineered_feature_names,
    get_flag_feature_names,
    add_pump_detection_features as create_pump_detection_features,
    validate_critical_features,
    validate_ath_data_availability,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# ML imports (soft dependencies)
# ---------------------------------------------------------------------------
XGBOOST_AVAILABLE = False
XGBClassifier = None
try:
    from xgboost import XGBClassifier  # type: ignore
    XGBOOST_AVAILABLE = True
except Exception:
    logger.warning("XGBoost not available; training will fail if attempted.")

LIGHTGBM_AVAILABLE = False
LGBMClassifier = None
try:
    from lightgbm import LGBMClassifier  # type: ignore
    LIGHTGBM_AVAILABLE = True
except Exception:
    logger.warning("LightGBM not available; lightgbm training will fail if attempted.")

# ---------------------------------------------------------------------------
# Default features
# ---------------------------------------------------------------------------
DEFAULT_FEATURES = [
    "price_open", "price_high", "price_low", "price_close",
    "volume_sol", "buy_volume_sol", "sell_volume_sol", "net_volume_sol",
    "market_cap_close", "phase_id_at_time",
    "dev_sold_amount",
    "buy_pressure_ratio", "unique_signer_ratio",
    "whale_buy_volume_sol", "whale_sell_volume_sol",
    "volatility_pct", "avg_trade_size_sol",
    "ath_price_sol", "price_vs_ath_pct", "minutes_since_ath",
]


# ============================================================================
# MODEL CACHE
# ============================================================================

class ModelCache:
    """In-memory cache for deserialized ML model objects (model_id -> object)."""

    _models: Dict[int, Any] = {}

    @classmethod
    async def preload_all(cls):
        """Load all models that have a ``model_binary`` into RAM."""
        pool = get_pool()
        rows = await pool.fetch(
            "SELECT id, name FROM ml_models WHERE model_binary IS NOT NULL AND is_deleted = FALSE"
        )
        loaded = 0
        for row in rows:
            model_id = row["id"]
            try:
                binary = await pool.fetchval(
                    "SELECT model_binary FROM ml_models WHERE id = $1", model_id
                )
                if binary:
                    model_obj = joblib.load(io.BytesIO(binary))
                    cls._models[model_id] = model_obj
                    loaded += 1
            except Exception as exc:
                logger.warning("Model %d (%s) could not be loaded: %s", model_id, row["name"], exc)
        logger.info("%d models preloaded into cache (of %d with binary)", loaded, len(rows))

    @classmethod
    def get(cls, model_id: int) -> Optional[Any]:
        return cls._models.get(model_id)

    @classmethod
    def put(cls, model_id: int, model_obj: Any):
        cls._models[model_id] = model_obj

    @classmethod
    def remove(cls, model_id: int):
        cls._models.pop(model_id, None)

    @classmethod
    def size(cls) -> int:
        return len(cls._models)


# ============================================================================
# MODEL CREATION
# ============================================================================

def create_model_instance(model_type: str, params: Dict[str, Any]) -> Any:
    """Instantiate an XGBoost or LightGBM model with the given hyper-parameters."""
    excluded_keys = {
        "n_estimators", "max_depth", "learning_rate", "random_state",
        "min_samples_split", "class_weight",
        "_time_based", "use_engineered_features", "feature_engineering_windows",
        "use_smote", "use_timeseries_split", "cv_splits",
        "use_market_context", "exclude_features", "use_flag_features",
        "early_stopping_rounds", "compute_shap",
        "use_graph_features", "use_embedding_features", "use_transaction_features",
        "use_metadata_features",
        "graph_feature_names", "embedding_feature_names", "transaction_feature_names",
        "metadata_feature_names",
    }
    extra = {k: v for k, v in params.items() if k not in excluded_keys and not isinstance(v, (dict, list, bool))}

    if model_type == "lightgbm":
        if not LIGHTGBM_AVAILABLE:
            raise ValueError("LightGBM is not available in this environment.")
        return LGBMClassifier(
            n_estimators=params.get("n_estimators", 100),
            max_depth=params.get("max_depth", 6),
            learning_rate=params.get("learning_rate", 0.1),
            random_state=params.get("random_state", 42),
            verbose=-1,
            **extra,
        )

    if model_type == "xgboost":
        if not XGBOOST_AVAILABLE:
            raise ValueError("XGBoost is not available in this environment.")
        return XGBClassifier(
            n_estimators=params.get("n_estimators", 100),
            max_depth=params.get("max_depth", 6),
            learning_rate=params.get("learning_rate", 0.1),
            random_state=params.get("random_state", 42),
            eval_metric="logloss",
            **extra,
        )

    raise ValueError(f"Unknown model type: {model_type}. Supported: 'xgboost', 'lightgbm'.")


# ============================================================================
# DATA LEAKAGE PREVENTION
# ============================================================================

def prepare_features_for_training(
    features: List[str],
    target_var: Optional[str],
    use_time_based: bool,
) -> tuple:
    """Return ``(features_for_loading, features_for_training)``.

    When time-based prediction is active the *target_var* is removed from
    the training features to prevent data leakage.
    """
    features_for_loading = list(features)
    target_var_was_explicit = target_var and target_var in features

    if target_var and target_var not in features_for_loading:
        features_for_loading.append(target_var)

    features_for_training = list(features)
    if use_time_based and target_var and target_var in features_for_training:
        features_for_training.remove(target_var)
        if target_var_was_explicit:
            logger.warning("DATA LEAKAGE prevented: target_var '%s' removed from training features.", target_var)
        else:
            logger.info("target_var '%s' removed from training features (time-based mode).", target_var)

    return features_for_loading, features_for_training


# ============================================================================
# SYNCHRONOUS TRAINING (run in executor)
# ============================================================================

def train_model_sync(
    data: pd.DataFrame,
    model_type: str,
    features: List[str],
    target_var: Optional[str],
    target_operator: Optional[str],
    target_value: Optional[float],
    params: dict,
    model_storage_path: str = "/app/models",
    use_time_based: bool = False,
    future_minutes: Optional[int] = None,
    min_percent_change: Optional[float] = None,
    direction: str = "up",
    phase_intervals: Optional[Dict[int, int]] = None,
    original_requested_features: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Synchronous XGBoost training -- called via ``run_in_executor``."""

    logger.info("Starting training: %s with %d rows", model_type, len(data))

    original_features_before_engineering = (
        original_requested_features.copy() if original_requested_features else features.copy()
    )

    # ------------------------------------------------------------------
    # 1. Create labels
    # ------------------------------------------------------------------
    if use_time_based:
        if not target_var:
            raise ValueError("target_var is required for time-based prediction (e.g. 'price_close')")
        result = create_time_based_labels(
            data, target_var, future_minutes, min_percent_change, direction, phase_intervals,
        )
        if isinstance(result, tuple):
            labels, data = result
        else:
            labels = result
    else:
        if not target_var or not target_operator or target_value is None:
            raise ValueError("target_var, target_operator and target_value are required for rule-based prediction")
        labels = create_labels(data, target_var, target_operator, target_value)

    positive_count = int(labels.sum())
    negative_count = len(labels) - positive_count

    # Auto-adjust labels if extremely imbalanced (time-based only)
    if positive_count == 0 or negative_count == 0:
        if use_time_based:
            logger.warning("Labels extremely imbalanced: %d positive, %d negative -- auto-adjusting", positive_count, negative_count)
            adjustment = 0.5 if positive_count == 0 else 2.0
            adjusted_change = max(0.1, min(50.0, (min_percent_change or 5.0) * adjustment))
            result = create_time_based_labels(data, target_var, future_minutes, adjusted_change, direction, phase_intervals)
            if isinstance(result, tuple):
                labels, data = result
            else:
                labels = result
            positive_count = int(labels.sum())
            negative_count = len(labels) - positive_count
            logger.info("After auto-adjustment: %d positive, %d negative", positive_count, negative_count)
        else:
            raise ValueError(
                f"Labels are not balanced: {positive_count} positive, {negative_count} negative. "
                "Adjust threshold or switch to time-based prediction."
            )

    balance_ratio = min(positive_count, negative_count) / max(positive_count, negative_count) if max(positive_count, negative_count) > 0 else 0
    if balance_ratio < 0.1:
        logger.warning("Labels imbalanced (ratio %.2f) -- SMOTE will be applied", balance_ratio)

    # ------------------------------------------------------------------
    # 1.5 Feature engineering
    # ------------------------------------------------------------------
    use_engineered_features = params.get("use_engineered_features", False)
    use_flag_features = params.get("use_flag_features", True)
    window_sizes = params.get("feature_engineering_windows", [5, 10, 15])

    original_columns = set(data.columns)
    selected_engineered_original: List[str] = []

    if use_engineered_features:
        all_possible_engineered = get_engineered_feature_names(window_sizes)
        selected_engineered_original = [
            f for f in original_features_before_engineering if f in all_possible_engineered
        ]

        data = create_pump_detection_features(data, window_sizes=window_sizes, include_flags=use_flag_features)

        new_columns = set(data.columns) - original_columns
        all_new_features = list(new_columns)

        if selected_engineered_original:
            engineered_features_created = [
                f for f in all_new_features
                if f in selected_engineered_original and not f.endswith("_has_data") and f not in features
            ]
            flag_features_created = []
            if use_flag_features:
                for eng in selected_engineered_original:
                    flag_name = f"{eng}_has_data"
                    if flag_name in all_new_features and flag_name not in features:
                        flag_features_created.append(flag_name)
        else:
            engineered_features_created = [f for f in all_new_features if not f.endswith("_has_data")]
            flag_features_created = [f for f in all_new_features if f.endswith("_has_data")]

        # Extend features list (no duplicates)
        new_eng = [f for f in engineered_features_created if f not in features]
        if new_eng:
            features.extend(new_eng)
        if use_flag_features and flag_features_created:
            new_flags = [f for f in flag_features_created if f not in features]
            if new_flags:
                features.extend(new_flags)

        features = list(dict.fromkeys(features))

        # Fill missing engineered features with 0
        expected_engineered = get_engineered_feature_names(window_sizes)
        missing_eng = [f for f in expected_engineered if f not in data.columns]
        for mf in missing_eng:
            data[mf] = 0.0

        logger.info("%d engineering features created, total features: %d", len(engineered_features_created), len(features))

    # Validate critical features
    validate_critical_features(features)

    # ------------------------------------------------------------------
    # 2. Prepare X, y
    # ------------------------------------------------------------------
    # Handle flag features addition
    if use_flag_features:
        if use_engineered_features and selected_engineered_original and len(selected_engineered_original) < 50:
            for eng in selected_engineered_original:
                flag_name = f"{eng}_has_data"
                if flag_name in data.columns and flag_name not in features:
                    features.append(flag_name)
        else:
            all_flags_in_data = [f for f in data.columns if f.endswith("_has_data") and f not in features]
            features.extend(all_flags_in_data)

    # Filter features to selected engineering + base if specific selection made
    if use_engineered_features and selected_engineered_original:
        all_possible = get_engineered_feature_names(window_sizes)
        base_feats = [f for f in features if f not in all_possible and not f.endswith("_has_data")]
        eng_feats = list(set(selected_engineered_original))
        flag_feats = [f"{e}_has_data" for e in selected_engineered_original if f"{e}_has_data" in data.columns]
        features = list(dict.fromkeys(base_feats + eng_feats + flag_feats))

    features = list(dict.fromkeys(features))
    available_features = [f for f in features if f in data.columns]

    # Remove flag features if disabled
    if not params.get("use_flag_features", True):
        available_features = [f for f in available_features if not f.endswith("_has_data")]

    available_features = list(dict.fromkeys(available_features))

    if not available_features:
        raise ValueError("No features found in data!")

    X = data[available_features]
    y = labels.values
    logger.info("Training with %d features, %d samples", len(available_features), len(data))

    # ------------------------------------------------------------------
    # 3. TimeSeriesSplit CV
    # ------------------------------------------------------------------
    use_timeseries_split = params.get("use_timeseries_split", True)
    cv_results = None

    if use_timeseries_split:
        from sklearn.model_selection import TimeSeriesSplit, cross_validate

        n_splits = params.get("cv_splits", 5)
        tscv = TimeSeriesSplit(n_splits=n_splits)
        temp_model = create_model_instance(model_type, params)
        cv_results = cross_validate(
            estimator=temp_model, X=X, y=y, cv=tscv,
            scoring=["accuracy", "f1", "precision", "recall"],
            return_train_score=True, n_jobs=-1,
        )
        train_test_gap = cv_results["train_accuracy"].mean() - cv_results["test_accuracy"].mean()
        if train_test_gap > 0.1:
            logger.warning("OVERFITTING detected: train-test gap %.2f%%", train_test_gap * 100)

        splits = list(tscv.split(X))
        last_train_idx, last_test_idx = splits[-1]
        X_final_train, X_final_test = X.iloc[last_train_idx], X.iloc[last_test_idx]
        y_final_train, y_final_test = y[last_train_idx], y[last_test_idx]
    else:
        X_final_train, X_final_test, y_final_train, y_final_test = train_test_split(
            X, y, test_size=0.2, random_state=42,
        )

    # ------------------------------------------------------------------
    # 3.5 SMOTE
    # ------------------------------------------------------------------
    use_smote = params.get("use_smote", True)
    if use_smote:
        positive_ratio = y_final_train.sum() / len(y_final_train) if len(y_final_train) > 0 else 0
        if positive_ratio < 0.3 or positive_ratio > 0.7:
            try:
                from imblearn.over_sampling import SMOTE
                from imblearn.under_sampling import RandomUnderSampler
                from imblearn.pipeline import Pipeline as ImbPipeline

                k_neighbors = min(5, max(1, int(y_final_train.sum()) - 1))
                smote = SMOTE(sampling_strategy=0.5, random_state=42, k_neighbors=k_neighbors)
                under = RandomUnderSampler(sampling_strategy=0.8, random_state=42)
                pipeline = ImbPipeline([("smote", smote), ("under", under)])

                X_balanced, y_balanced = pipeline.fit_resample(X_final_train, y_final_train)
                logger.info("SMOTE: %d -> %d samples", len(X_final_train), len(X_balanced))

                X_final_train = pd.DataFrame(X_balanced, columns=available_features)
                y_final_train = y_balanced
            except Exception as exc:
                logger.warning("SMOTE failed: %s -- continuing without", exc)

    # ------------------------------------------------------------------
    # 4. Train
    # ------------------------------------------------------------------
    # Auto scale_pos_weight if not set and data is imbalanced
    if "scale_pos_weight" not in params:
        n_pos = int(y_final_train.sum())
        n_neg = len(y_final_train) - n_pos
        if n_pos > 0 and n_neg / n_pos > 5:
            auto_weight = n_neg / n_pos
            params["scale_pos_weight"] = auto_weight
            logger.info("Auto scale_pos_weight=%.1f (ratio: %d:%d)", auto_weight, n_neg, n_pos)

    model = create_model_instance(model_type, params)

    # Early stopping
    early_stopping_rounds = params.get("early_stopping_rounds", 0)
    best_iteration = None
    best_score = None

    if early_stopping_rounds > 0 and len(X_final_train) > 100:
        split_idx = int(len(X_final_train) * 0.8)
        X_tr, X_val = X_final_train.iloc[:split_idx], X_final_train.iloc[split_idx:]
        y_tr, y_val = y_final_train[:split_idx], y_final_train[split_idx:]

        try:
            if model_type == "xgboost":
                model.set_params(early_stopping_rounds=early_stopping_rounds)
                model.fit(X_tr, y_tr, eval_set=[(X_val, y_val)], verbose=False)
            elif model_type == "lightgbm":
                model.fit(
                    X_tr, y_tr,
                    eval_set=[(X_val, y_val)],
                    callbacks=[__import__('lightgbm').early_stopping(early_stopping_rounds, verbose=False)],
                )

            best_iteration = getattr(model, 'best_iteration_', getattr(model, 'best_iteration', None))
            best_score_attr = getattr(model, 'best_score_', getattr(model, 'best_score', None))
            if isinstance(best_score_attr, dict):
                for ds in best_score_attr.values():
                    for metric_val in ds.values():
                        best_score = metric_val
                        break
                    break
            elif best_score_attr is not None:
                best_score = float(best_score_attr)
            logger.info("Early stopping: best_iteration=%s, best_score=%s", best_iteration, best_score)
        except Exception as es_exc:
            logger.warning("Early stopping failed, training without: %s", es_exc)
            model = create_model_instance(model_type, params)
            model.fit(X_final_train, y_final_train)
    else:
        model.fit(X_final_train, y_final_train)

    if not hasattr(model, "feature_names_in_") or model.feature_names_in_ is None:
        try:
            model.feature_names_in_ = np.array(available_features)
        except AttributeError:
            pass

    logger.info("Training complete (%d features)", len(available_features))

    # ------------------------------------------------------------------
    # 5. Metrics
    # ------------------------------------------------------------------
    y_pred = model.predict(X_final_test)
    accuracy = accuracy_score(y_final_test, y_pred)
    f1 = f1_score(y_final_test, y_pred)
    precision = precision_score(y_final_test, y_pred)
    recall_val = recall_score(y_final_test, y_pred)

    roc_auc = None
    if hasattr(model, "predict_proba"):
        try:
            y_proba = model.predict_proba(X_final_test)[:, 1]
            roc_auc = roc_auc_score(y_final_test, y_proba)
        except Exception:
            pass

    cm = confusion_matrix(y_final_test, y_pred)
    if cm.size == 4:
        tn, fp, fn, tp = cm.ravel()
    else:
        tn, fp, fn, tp = 0, 0, 0, 0

    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    mcc = matthews_corrcoef(y_final_test, y_pred)

    profit_per_tp = 0.01
    loss_per_fp = -0.005
    simulated_profit = (tp * profit_per_tp) + (fp * loss_per_fp)
    simulated_profit_pct = simulated_profit / len(y_final_test) * 100 if len(y_final_test) > 0 else 0.0

    # Feature importance
    feature_importance = {}
    if hasattr(model, "feature_importances_"):
        feature_importance = dict(zip(available_features, model.feature_importances_.tolist()))

    # Low importance features
    low_importance = [f for f, imp in feature_importance.items() if imp < 0.005] if feature_importance else []

    # SHAP values
    shap_summary = None
    if params.get("compute_shap", False):
        try:
            import shap
            explainer = shap.TreeExplainer(model)
            shap_vals = explainer.shap_values(X_final_test)
            if isinstance(shap_vals, list):
                shap_vals = shap_vals[1]  # positive class
            shap_summary = dict(zip(
                available_features,
                np.abs(shap_vals).mean(axis=0).tolist()
            ))
            logger.info("SHAP values computed for %d features", len(shap_summary))
        except Exception as e:
            logger.warning("SHAP computation failed: %s", e)

    # ------------------------------------------------------------------
    # 6. Save model
    # ------------------------------------------------------------------
    os.makedirs(model_storage_path, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    model_filename = f"model_{model_type}_{timestamp}.pkl"
    model_path = os.path.join(model_storage_path, model_filename)

    model_buffer = io.BytesIO()
    joblib.dump(model, model_buffer)
    model_data = model_buffer.getvalue()

    joblib.dump(model, model_path)
    logger.info("Model saved: %s (%d bytes)", model_path, len(model_data))

    # ------------------------------------------------------------------
    # 7. Return
    # ------------------------------------------------------------------
    result: Dict[str, Any] = {
        "accuracy": float(accuracy),
        "f1": float(f1),
        "precision": float(precision),
        "recall": float(recall_val),
        "roc_auc": float(roc_auc) if roc_auc else None,
        "mcc": float(mcc),
        "fpr": float(fpr),
        "fnr": float(fnr),
        "confusion_matrix": {"tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn)},
        "simulated_profit_pct": float(simulated_profit_pct),
        "model_path": model_path,
        "model_data": model_data,
        "feature_importance": feature_importance,
        "num_samples": len(data),
        "num_features": len(available_features),
        "features": list(dict.fromkeys(available_features)),
        "best_iteration": best_iteration,
        "best_score": float(best_score) if best_score is not None else None,
        "low_importance_features": low_importance,
        "shap_values": shap_summary,
        "early_stopping_rounds": early_stopping_rounds if early_stopping_rounds > 0 else None,
    }

    if cv_results is not None:
        result["cv_scores"] = {
            "train_accuracy": cv_results["train_accuracy"].tolist(),
            "test_accuracy": cv_results["test_accuracy"].tolist(),
            "train_f1": cv_results["train_f1"].tolist(),
            "test_f1": cv_results["test_f1"].tolist(),
            "train_precision": cv_results["train_precision"].tolist(),
            "test_precision": cv_results["test_precision"].tolist(),
            "train_recall": cv_results["train_recall"].tolist(),
            "test_recall": cv_results["test_recall"].tolist(),
        }
        result["cv_overfitting_gap"] = float(
            cv_results["train_accuracy"].mean() - cv_results["test_accuracy"].mean()
        )

    return result


# ============================================================================
# ASYNC TRAIN WRAPPER
# ============================================================================

async def train_model(
    model_type: str,
    features: List[str],
    target_var: Optional[str],
    target_operator: Optional[str],
    target_value: Optional[float],
    train_start,
    train_end,
    phases: Optional[List[int]] = None,
    params: Optional[Dict[str, Any]] = None,
    model_name: Optional[str] = None,
    model_storage_path: str = "/app/models",
    use_time_based: bool = False,
    future_minutes: Optional[int] = None,
    min_percent_change: Optional[float] = None,
    direction: str = "up",
    original_requested_features: Optional[List[str]] = None,
    use_graph_features: bool = False,
    use_embedding_features: bool = False,
    use_transaction_features: bool = False,
    use_metadata_features: bool = False,
) -> Dict[str, Any]:
    """Async wrapper: loads data, then delegates CPU work to executor."""

    if original_requested_features is None:
        original_requested_features = features.copy() if features else []

    # Defaults / excludes
    exclude_features = (params or {}).get("exclude_features", [])
    if not features:
        features = DEFAULT_FEATURES.copy()
        original_requested_features = features.copy()
    if exclude_features:
        features = [f for f in features if f not in exclude_features]
        original_requested_features = [f for f in original_requested_features if f not in exclude_features]

    # Merge default params
    default_params = await get_model_type_defaults(model_type)
    final_params = {**default_params, **(params or {})}

    use_engineered_features = final_params.get("use_engineered_features", False)

    # Market context flag activates metadata features (SOL price + macro context)
    if final_params.get("use_market_context") and not use_metadata_features:
        use_metadata_features = True
        logger.info("use_market_context enabled → activating metadata features")

    # Remove ATH features from DB loading list (they are computed in Python)
    ath_feature_names = [
        "rolling_ath", "ath_distance_pct", "ath_breakout", "minutes_since_ath",
        "ath_age_hours", "ath_is_recent", "ath_is_old",
    ]
    features_for_db = [f for f in features if f not in ath_feature_names]

    features_for_loading, features_for_training = prepare_features_for_training(
        features=features_for_db, target_var=target_var, use_time_based=use_time_based,
    )
    features = features_for_training.copy()

    include_ath = final_params.get("include_ath", use_engineered_features)
    if include_ath:
        ath_validation = await validate_ath_data_availability(train_start, train_end)
        if not ath_validation["available"]:
            logger.warning("No ATH data available for training period (coverage: %.1f%%)", ath_validation.get("coverage_pct", 0))

    # Load training data
    data = await load_training_data(
        train_start=train_start,
        train_end=train_end,
        features=features_for_loading,
        phases=phases,
        include_ath=include_ath,
        use_graph_features=use_graph_features,
        use_embedding_features=use_embedding_features,
        use_transaction_features=use_transaction_features,
        use_metadata_features=use_metadata_features,
    )
    if len(data) == 0:
        raise ValueError("No training data found!")

    # Append selected extra-source features to the features list
    if use_graph_features:
        from backend.modules.training.graph_features import GRAPH_FEATURE_NAMES
        selected = (params or {}).get("graph_feature_names") or GRAPH_FEATURE_NAMES
        features.extend([f for f in selected if f in data.columns and f not in features])

    if use_embedding_features:
        from backend.modules.training.embedding_features import EMBEDDING_FEATURE_NAMES
        selected = (params or {}).get("embedding_feature_names") or EMBEDDING_FEATURE_NAMES
        features.extend([f for f in selected if f in data.columns and f not in features])

    if use_transaction_features:
        from backend.modules.training.transaction_features import TRANSACTION_FEATURE_NAMES
        selected = (params or {}).get("transaction_feature_names") or TRANSACTION_FEATURE_NAMES
        features.extend([f for f in selected if f in data.columns and f not in features])

    if use_metadata_features:
        from backend.modules.training.metadata_features import METADATA_FEATURE_NAMES
        selected = (params or {}).get("metadata_feature_names") or METADATA_FEATURE_NAMES
        features.extend([f for f in selected if f in data.columns and f not in features])

    # Phase intervals (time-based only)
    phase_intervals = None
    if use_time_based:
        from backend.modules.training.db_queries import get_phase_intervals
        phase_intervals = await get_phase_intervals()

    # Run CPU-bound training in executor
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        train_model_sync,
        data,
        model_type,
        features,
        target_var,
        target_operator,
        target_value,
        final_params,
        model_storage_path,
        use_time_based,
        future_minutes,
        min_percent_change,
        direction,
        phase_intervals,
        original_requested_features,
    )
    logger.info("Training completed successfully.")
    return result


# ============================================================================
# MODEL LOADER / TESTING
# ============================================================================

def load_model(model_path: str) -> Any:
    """Load a saved model from a .pkl file."""
    return joblib.load(model_path)


def load_model_from_binary(model_binary: bytes) -> Any:
    """Deserialize a model from BYTEA data."""
    return joblib.load(io.BytesIO(model_binary))


def _test_model_sync(
    model_obj: Any,
    test_data: pd.DataFrame,
    features: list,
    model: Dict[str, Any],
    phase_intervals: list,
    test_start: str,
    test_end: str,
    use_engineered_features: bool,
    feature_engineering_windows: list,
    is_time_based: bool,
    params: dict,
) -> Dict[str, Any]:
    """Synchronous test logic -- called via ``run_in_executor``."""

    # Apply feature engineering (same as training)
    if use_engineered_features:
        use_flag = model.get("use_flag_features", True)
        test_data = create_pump_detection_features(
            test_data, window_sizes=feature_engineering_windows, include_flags=use_flag,
        )

        model_features = set(features)
        available = set(test_data.columns)
        missing = model_features - available
        for mf in missing:
            test_data[mf] = 0.0

        features = [f for f in model_features if f in test_data.columns]

        target_var = model["target_variable"]
        expected = set(model_features) | {target_var}
        extra = set(test_data.columns) - expected
        if extra:
            test_data = test_data[list(expected & set(test_data.columns))]

        if target_var not in test_data.columns:
            raise ValueError(f"Target variable {target_var} not found in test data")
    else:
        missing = [f for f in features if f not in test_data.columns]
        for mf in missing:
            test_data[mf] = 0.0

    # Create labels
    if is_time_based:
        time_cfg = params.get("_time_based", {})
        fm = time_cfg.get("future_minutes", 10)
        mpc = time_cfg.get("min_percent_change", 5.0)
        d = time_cfg.get("direction", "up")
        labels = create_time_based_labels(test_data, model["target_variable"], fm, mpc, d, phase_intervals)
    else:
        if model.get("target_operator") is None or model.get("target_value") is None:
            raise ValueError("Model has no target_operator/target_value for rule-based prediction")
        labels = create_labels(test_data, model["target_variable"], model["target_operator"], float(model["target_value"]))

    # Predict
    avail = [f for f in features if f in test_data.columns]
    X_test = test_data[avail].values
    y_test = labels.values
    y_pred = model_obj.predict(X_test)
    y_proba = model_obj.predict_proba(X_test)[:, 1] if hasattr(model_obj, "predict_proba") else None

    # Metrics
    acc = accuracy_score(y_test, y_pred)
    f1_val = f1_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred)
    rec = recall_score(y_test, y_pred)
    roc = roc_auc_score(y_test, y_proba) if y_proba is not None else None

    cm = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = (cm.ravel() if cm.size == 4 else (0, 0, 0, 0))
    mcc_val = matthews_corrcoef(y_test, y_pred)
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    sim_profit = ((tp * 0.01) + (fp * -0.005)) / len(y_test) * 100 if len(y_test) > 0 else 0.0

    # Overlap check
    overlap = check_overlap(model["train_start"], model["train_end"], test_start, test_end)

    # Parse test duration
    def _parse_dt(v):
        if isinstance(v, str):
            return datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v
    ts = _parse_dt(test_start)
    te = _parse_dt(test_end)
    test_duration_days = (te - ts).total_seconds() / 86400.0

    # Train vs test comparison
    train_acc = model.get("training_accuracy")
    train_f1 = model.get("training_f1")
    train_prec = model.get("training_precision")
    train_rec = model.get("training_recall")

    acc_deg = float(train_acc) - float(acc) if train_acc is not None else None
    f1_deg = float(train_f1) - float(f1_val) if train_f1 is not None else None
    is_overfitted = acc_deg > 0.1 if acc_deg is not None else None

    return {
        "accuracy": float(acc),
        "f1_score": float(f1_val),
        "precision_score": float(prec),
        "recall": float(rec),
        "roc_auc": float(roc) if roc is not None else None,
        "mcc": float(mcc_val),
        "fpr": float(fpr),
        "fnr": float(fnr),
        "simulated_profit_pct": float(sim_profit),
        "confusion_matrix": {"tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn)},
        "tp": int(tp), "tn": int(tn), "fp": int(fp), "fn": int(fn),
        "num_samples": len(test_data),
        "num_positive": int(labels.sum()),
        "num_negative": int(len(labels) - labels.sum()),
        "has_overlap": overlap["has_overlap"],
        "overlap_note": overlap["overlap_note"],
        "train_accuracy": float(train_acc) if train_acc is not None else None,
        "train_f1": float(train_f1) if train_f1 is not None else None,
        "train_precision": float(train_prec) if train_prec is not None else None,
        "train_recall": float(train_rec) if train_rec is not None else None,
        "accuracy_degradation": float(acc_deg) if acc_deg is not None else None,
        "f1_degradation": float(f1_deg) if f1_deg is not None else None,
        "is_overfitted": bool(is_overfitted) if is_overfitted is not None else None,
        "test_duration_days": float(test_duration_days),
    }


async def test_model(
    model_id: int,
    test_start: str,
    test_end: str,
    model_storage_path: str = "/app/models",
) -> Dict[str, Any]:
    """Async: load model + data then run CPU-bound test in executor."""

    from backend.modules.training.db_queries import get_model as db_get_model, get_phase_intervals

    model = await db_get_model(model_id)
    if not model or model.get("is_deleted"):
        raise ValueError(f"Model {model_id} not found or deleted")

    # Load model object: cache -> DB binary -> filesystem
    model_obj = ModelCache.get(model_id)
    if model_obj is not None:
        logger.info("Model %d loaded from cache", model_id)
    elif model.get("model_binary"):
        model_obj = load_model_from_binary(model["model_binary"])
        ModelCache.put(model_id, model_obj)
    else:
        model_obj = load_model(model["model_file_path"])
        ModelCache.put(model_id, model_obj)

    features = model["features"]
    phases = model["phases"] if model["phases"] else None
    params = model.get("params", {}) or {}
    if isinstance(params, str):
        import json
        params = json.loads(params) or {}

    use_engineered = params.get("use_engineered_features", False)
    eng_windows = params.get("feature_engineering_windows", [5, 10, 15])
    is_time_based = model.get("target_operator") is None or model.get("target_value") is None

    # Determine base features (without engineered)
    if use_engineered:
        eng_names = get_engineered_feature_names(eng_windows)
        eng_set = set(eng_names)
        base_features = [f for f in features if f not in eng_set]
    else:
        base_features = list(features)

    features_for_loading = list(base_features)
    if model["target_variable"] not in features_for_loading:
        features_for_loading.append(model["target_variable"])

    # Read extra-source feature flags from params (same as training)
    use_graph_features = params.get("use_graph_features", False)
    use_embedding_features = params.get("use_embedding_features", False)
    use_transaction_features = params.get("use_transaction_features", False)
    use_metadata_features = params.get("use_metadata_features", False)
    if params.get("use_market_context") and not use_metadata_features:
        use_metadata_features = True
    include_ath = params.get("include_ath", use_engineered)

    # Load test data
    test_data = await load_training_data(
        train_start=test_start, train_end=test_end,
        features=features_for_loading, phases=phases, include_ath=include_ath,
        use_graph_features=use_graph_features,
        use_embedding_features=use_embedding_features,
        use_transaction_features=use_transaction_features,
        use_metadata_features=use_metadata_features,
    )
    if len(test_data) == 0:
        raise ValueError("No test data found!")

    phase_intervals = await get_phase_intervals() if is_time_based else []

    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, _test_model_sync,
        model_obj, test_data, features, model, phase_intervals,
        test_start, test_end, use_engineered, eng_windows, is_time_based, params,
    )
    return result


# ============================================================================
# HYPERPARAMETER TUNING
# ============================================================================

DEFAULT_PARAM_SPACE_XGBOOST = {
    "n_estimators": [50, 100, 200, 300],
    "max_depth": [3, 4, 6, 8, 10],
    "learning_rate": [0.01, 0.05, 0.1, 0.2],
    "min_child_weight": [1, 3, 5, 7],
    "subsample": [0.6, 0.8, 1.0],
    "colsample_bytree": [0.6, 0.8, 1.0],
}

DEFAULT_PARAM_SPACE_LIGHTGBM = {
    "n_estimators": [50, 100, 200, 300],
    "max_depth": [3, 4, 6, 8, 10],
    "learning_rate": [0.01, 0.05, 0.1, 0.2],
    "num_leaves": [15, 31, 63, 127],
    "subsample": [0.6, 0.8, 1.0],
    "colsample_bytree": [0.6, 0.8, 1.0],
}


def tune_hyperparameters_sync(
    model_type: str,
    X_train: pd.DataFrame,
    y_train: np.ndarray,
    strategy: str = "random",
    n_iterations: int = 20,
    param_space: Optional[Dict] = None,
    base_params: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Synchronous hyperparameter tuning using RandomizedSearchCV."""
    from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

    if param_space is None:
        param_space = (DEFAULT_PARAM_SPACE_LIGHTGBM if model_type == "lightgbm"
                       else DEFAULT_PARAM_SPACE_XGBOOST)

    base = base_params or {}
    model = create_model_instance(model_type, base)

    tscv = TimeSeriesSplit(n_splits=3)

    search = RandomizedSearchCV(
        estimator=model,
        param_distributions=param_space,
        n_iter=n_iterations,
        scoring="f1",
        cv=tscv,
        random_state=42,
        n_jobs=-1,
        verbose=0,
    )
    search.fit(X_train, y_train)

    all_results = []
    for i in range(len(search.cv_results_["params"])):
        all_results.append({
            "params": search.cv_results_["params"][i],
            "mean_score": float(search.cv_results_["mean_test_score"][i]),
            "std_score": float(search.cv_results_["std_test_score"][i]),
        })
    all_results.sort(key=lambda x: x["mean_score"], reverse=True)

    return {
        "best_params": search.best_params_,
        "best_score": float(search.best_score_),
        "all_results": all_results[:20],
    }
