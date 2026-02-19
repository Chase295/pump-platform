"""
Pydantic Schemas for the Training module API.

Migrated from pump-training/backend/app/api/schemas.py.
Route prefix changed: /api -> /api/training
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, validator, Field


# ============================================================
# Request Schemas
# ============================================================

class TrainModelRequest(BaseModel):
    """Request for model training."""
    name: str = Field(..., description="Model name (unique)")
    model_type: str = Field(..., description="Model type: 'xgboost' or 'lightgbm'")
    features: List[str] = Field(..., description="List of feature names")
    phases: Optional[List[int]] = Field(None, description="List of coin phases (e.g. [1, 2, 3])")
    params: Optional[Dict[str, Any]] = Field(None, description="Hyperparameters (optional)")
    train_start: datetime = Field(..., description="Start time (ISO format with UTC)")
    train_end: datetime = Field(..., description="End time (ISO format with UTC)")
    description: Optional[str] = Field(None, description="Model description")

    # Time-based prediction
    use_time_based_prediction: bool = Field(False, description="Enable time-based prediction")
    future_minutes: Optional[int] = Field(None, description="Minutes into the future")
    min_percent_change: Optional[float] = Field(None, description="Minimum percent change")
    direction: Optional[str] = Field("up", description="Direction: 'up' or 'down'")

    # Feature engineering
    use_engineered_features: bool = Field(False, description="Use engineered pump-detection features")
    feature_engineering_windows: Optional[List[int]] = Field(None, description="Window sizes for feature engineering")
    use_flag_features: bool = Field(True, description="Enable flag features for data availability")

    # SMOTE
    use_smote: bool = Field(False, description="Use SMOTE for imbalanced data")

    # TimeSeriesSplit
    use_timeseries_split: bool = Field(True, description="Use TimeSeriesSplit for cross-validation")
    cv_splits: Optional[int] = Field(5, description="Number of CV splits (2-10)")

    # Market context (phase 2)
    use_market_context: bool = Field(False, description="Use market context for training")

    # Scale positive weight (alternative to SMOTE)
    scale_pos_weight: Optional[float] = Field(None, description="Class weight for positive samples")

    # Early Stopping
    early_stopping_rounds: int = Field(10, description="Early stopping rounds (0=disabled)")

    # SHAP
    compute_shap: bool = Field(False, description="Compute SHAP values after training")

    # Feature categories
    use_graph_features: bool = Field(False, description="Include Neo4j graph features")
    use_embedding_features: bool = Field(False, description="Include embedding similarity features")
    use_transaction_features: bool = Field(False, description="Include transaction-level features")
    use_metadata_features: bool = Field(False, description="Include metadata features from discovered_coins")
    # Individual feature selection per extra source (None = all when flag=True)
    graph_feature_names: Optional[List[str]] = Field(None, description="Selected graph feature names")
    embedding_feature_names: Optional[List[str]] = Field(None, description="Selected embedding feature names")
    transaction_feature_names: Optional[List[str]] = Field(None, description="Selected transaction feature names")
    metadata_feature_names: Optional[List[str]] = Field(None, description="Selected metadata feature names")

    # Feature exclusion (phase 2)
    exclude_features: Optional[List[str]] = Field(None, description="Features to exclude")

    # Target variables -- optional when time-based prediction is active
    target_var: Optional[str] = Field(None, description="Target variable")
    operator: Optional[str] = Field(None, description="Comparison operator")
    target_value: Optional[float] = Field(None, description="Threshold value")

    @validator('model_type', allow_reuse=True)
    def validate_model_type(cls, v):
        allowed = ('xgboost', 'lightgbm')
        if v not in allowed:
            raise ValueError(f"model_type must be one of {allowed}, not '{v}'.")
        return v

    @validator('operator')
    def validate_operator(cls, v):
        if v is None:
            return v
        allowed = ['>', '<', '>=', '<=', '=']
        if v not in allowed:
            raise ValueError(f'operator must be one of {allowed}')
        return v

    @validator('target_var')
    def validate_target_var(cls, v):
        if v is None:
            return 'price_close'
        return v

    @validator('target_value')
    def validate_target_value(cls, v):
        return v

    @validator('future_minutes')
    def validate_future_minutes(cls, v, values):
        if values.get('use_time_based_prediction', False):
            if v is None or v <= 0:
                raise ValueError('future_minutes must be > 0 for time-based prediction')
        return v

    @validator('min_percent_change')
    def validate_min_percent_change(cls, v, values):
        if values.get('use_time_based_prediction', False):
            if v is None or v <= 0:
                raise ValueError('min_percent_change must be > 0 for time-based prediction')
        return v

    @validator('direction')
    def validate_direction(cls, v, values):
        if values.get('use_time_based_prediction', False):
            allowed = ['up', 'down']
            if v not in allowed:
                raise ValueError(f'direction must be one of {allowed}')
        return v

    @validator('train_start', 'train_end', pre=True)
    def ensure_utc(cls, v):
        from datetime import timezone as tz
        if isinstance(v, str):
            v = v.replace('Z', '+00:00')
            v = datetime.fromisoformat(v)
        if isinstance(v, datetime):
            if v.tzinfo is None:
                v = v.replace(tzinfo=tz.utc)
            else:
                v = v.astimezone(tz.utc)
        return v


class UpdateModelRequest(BaseModel):
    """Request for updating model name/description."""
    name: Optional[str] = Field(None, description="New model name")
    description: Optional[str] = Field(None, description="New description")

    @validator('name')
    def validate_name_not_empty(cls, v):
        if v is not None and not v.strip():
            raise ValueError('Name must not be empty')
        return v


# ============================================================
# Response Schemas
# ============================================================

class ModelResponse(BaseModel):
    """Response for model details."""
    id: int
    name: str
    model_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    is_deleted: bool
    target_variable: str
    target_operator: Optional[str] = None
    target_value: Optional[float] = None
    train_start: datetime
    train_end: datetime
    features: List[str]
    phases: Optional[List[int]] = None
    params: Optional[Dict[str, Any]] = None
    feature_importance: Optional[Dict[str, float]] = None
    training_accuracy: Optional[float] = None
    training_f1: Optional[float] = None
    training_precision: Optional[float] = None
    training_recall: Optional[float] = None
    roc_auc: Optional[float] = None
    mcc: Optional[float] = None
    fpr: Optional[float] = None
    fnr: Optional[float] = None
    confusion_matrix: Optional[Dict[str, int]] = None
    simulated_profit_pct: Optional[float] = None
    tp: Optional[int] = None
    tn: Optional[int] = None
    fp: Optional[int] = None
    fn: Optional[int] = None
    cv_scores: Optional[Dict[str, Any]] = None
    cv_overfitting_gap: Optional[float] = None
    model_file_path: Optional[str] = None
    description: Optional[str] = None
    best_iteration: Optional[int] = None
    best_score: Optional[float] = None
    low_importance_features: Optional[List[str]] = None
    shap_values: Optional[Dict[str, float]] = None
    early_stopping_rounds: Optional[int] = None
    threshold_sweep: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True


class TestResultResponse(BaseModel):
    """Response for test results."""
    id: int
    model_id: int
    created_at: datetime
    test_start: datetime
    test_end: datetime
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    precision_score: Optional[float] = None
    recall: Optional[float] = None
    roc_auc: Optional[float] = None
    mcc: Optional[float] = None
    fpr: Optional[float] = None
    fnr: Optional[float] = None
    confusion_matrix: Optional[Dict[str, int]] = None
    simulated_profit_pct: Optional[float] = None
    tp: Optional[int] = None
    tn: Optional[int] = None
    fp: Optional[int] = None
    fn: Optional[int] = None
    num_samples: Optional[int] = None
    num_positive: Optional[int] = None
    num_negative: Optional[int] = None
    has_overlap: bool = False
    overlap_note: Optional[str] = None
    feature_importance: Optional[Dict[str, float]] = None
    train_accuracy: Optional[float] = None
    train_f1: Optional[float] = None
    train_precision: Optional[float] = None
    train_recall: Optional[float] = None
    accuracy_degradation: Optional[float] = None
    f1_degradation: Optional[float] = None
    is_overfitted: Optional[bool] = None
    test_duration_days: Optional[float] = None
    threshold_sweep: Optional[List[Dict[str, Any]]] = None
    proba_stats: Optional[Dict[str, Any]] = None
    feature_diagnostics: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class ModelComparisonResult(BaseModel):
    """Single model result within a comparison."""
    model_id: int
    model_name: Optional[str] = None
    test_result_id: Optional[int] = None
    accuracy: Optional[float] = None
    f1_score: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    roc_auc: Optional[float] = None
    mcc: Optional[float] = None
    fpr: Optional[float] = None
    fnr: Optional[float] = None
    simulated_profit_pct: Optional[float] = None
    confusion_matrix: Optional[Dict[str, int]] = None
    avg_score: Optional[float] = None
    rank: Optional[int] = None


class ComparisonResponse(BaseModel):
    """Response for model comparison."""
    id: int
    created_at: datetime
    test_start: datetime
    test_end: datetime
    num_samples: Optional[int] = None
    model_ids: Optional[List[int]] = None
    test_result_ids: Optional[List[int]] = None
    results: Optional[List[ModelComparisonResult]] = None
    winner_id: Optional[int] = None
    winner_reason: Optional[str] = None
    # Legacy fields
    model_a_id: Optional[int] = None
    model_b_id: Optional[int] = None
    a_accuracy: Optional[float] = None
    a_f1: Optional[float] = None
    a_precision: Optional[float] = None
    a_recall: Optional[float] = None
    b_accuracy: Optional[float] = None
    b_f1: Optional[float] = None
    b_precision: Optional[float] = None
    b_recall: Optional[float] = None
    a_mcc: Optional[float] = None
    a_fpr: Optional[float] = None
    a_fnr: Optional[float] = None
    a_simulated_profit_pct: Optional[float] = None
    a_confusion_matrix: Optional[Dict[str, int]] = None
    b_mcc: Optional[float] = None
    b_fpr: Optional[float] = None
    b_fnr: Optional[float] = None
    b_simulated_profit_pct: Optional[float] = None
    b_confusion_matrix: Optional[Dict[str, int]] = None

    class Config:
        from_attributes = True


class JobResponse(BaseModel):
    """Response for job details."""
    id: int
    job_type: str
    status: str
    priority: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: float = 0.0
    progress_msg: Optional[str] = None
    error_msg: Optional[str] = None
    worker_id: Optional[str] = None
    train_model_type: Optional[str] = None
    train_target_var: Optional[str] = None
    train_operator: Optional[str] = None
    train_value: Optional[float] = None
    train_start: Optional[datetime] = None
    train_end: Optional[datetime] = None
    train_features: Optional[List[str]] = None
    train_phases: Optional[List[int]] = None
    train_params: Optional[Dict[str, Any]] = None
    result_model_id: Optional[int] = None
    test_model_id: Optional[int] = None
    test_start: Optional[datetime] = None
    test_end: Optional[datetime] = None
    result_test_id: Optional[int] = None
    compare_model_a_id: Optional[int] = None
    compare_model_b_id: Optional[int] = None
    compare_model_ids: Optional[List[int]] = None
    compare_start: Optional[datetime] = None
    compare_end: Optional[datetime] = None
    result_comparison_id: Optional[int] = None
    tune_model_id: Optional[int] = None
    tune_strategy: Optional[str] = None
    tune_n_iterations: Optional[int] = None
    tune_param_space: Optional[Dict[str, Any]] = None
    tune_results: Optional[Dict[str, Any]] = None
    result_model: Optional[ModelResponse] = None
    result_test: Optional[TestResultResponse] = None
    result_comparison: Optional[ComparisonResponse] = None

    class Config:
        from_attributes = True


class CreateJobResponse(BaseModel):
    """Response for job creation."""
    job_id: int
    message: str
    status: str


class HealthResponse(BaseModel):
    """Response for health check."""
    status: str
    db_connected: bool
    uptime_seconds: int
    start_time: Optional[float] = None
    total_jobs_processed: int = 0
    last_error: Optional[str] = None


class ConfigResponse(BaseModel):
    """Response for configuration."""
    model_storage_path: str
    max_concurrent_jobs: int
    job_poll_interval: int


class ConfigUpdateRequest(BaseModel):
    """Request for configuration update."""
    max_concurrent_jobs: Optional[int] = None
    job_poll_interval: Optional[int] = None


class ConfigUpdateResponse(BaseModel):
    """Response for configuration update."""
    message: str
    status: str
    updated_fields: List[str]
