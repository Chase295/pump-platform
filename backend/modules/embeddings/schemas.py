"""
Pydantic request/response schemas for the Embeddings module.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CreateConfigRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Unique config name")
    strategy: str = Field("handcrafted_v1", description="Embedding strategy")
    window_seconds: int = Field(300, ge=5, le=86400, description="Window size in seconds")
    window_overlap_seconds: int = Field(0, ge=0, description="Overlap between windows")
    min_snapshots: int = Field(3, ge=1, le=100, description="Min data points per window")
    phases: Optional[List[int]] = Field(None, description="Phase filter (null=all)")
    normalization: str = Field("minmax", description="Normalization strategy")


class UpdateConfigRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    is_active: Optional[bool] = None
    window_seconds: Optional[int] = Field(None, ge=5, le=86400)
    window_overlap_seconds: Optional[int] = Field(None, ge=0)
    min_snapshots: Optional[int] = Field(None, ge=1, le=100)
    phases: Optional[List[int]] = None
    normalization: Optional[str] = None


class GenerateRequest(BaseModel):
    config_id: Optional[int] = Field(None, description="Config ID (null=all active)")
    start: datetime = Field(..., description="Start of time range")
    end: datetime = Field(..., description="End of time range")


class SimilaritySearchRequest(BaseModel):
    embedding: Optional[List[float]] = Field(None, description="128-dim query vector")
    mint: Optional[str] = Field(None, description="Find similar to this mint")
    k: int = Field(20, ge=1, le=200, description="Number of results")
    phase_id: Optional[int] = Field(None, description="Filter by phase")
    label: Optional[str] = Field(None, description="Filter by label")
    strategy: Optional[str] = Field(None, description="Filter by strategy")
    min_similarity: float = Field(0.0, ge=0.0, le=1.0, description="Min cosine similarity")
    ef_search: int = Field(100, ge=10, le=1000, description="HNSW search accuracy")


class AddLabelRequest(BaseModel):
    embedding_id: int = Field(..., description="Embedding to label")
    label: str = Field(..., min_length=1, max_length=50)
    confidence: float = Field(1.0, ge=0.0, le=1.0)
    source: str = Field("manual", description="manual, ml, rule, propagated")
    notes: Optional[str] = None


class PropagateLabelRequest(BaseModel):
    source_label: str = Field(..., min_length=1, max_length=50)
    min_similarity: float = Field(0.85, ge=0.5, le=1.0)
    max_propagations: int = Field(100, ge=1, le=10000)


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------

class EmbeddingResponse(BaseModel):
    id: int
    mint: str
    window_start: datetime
    window_end: datetime
    phase_id: Optional[int] = None
    label: Optional[str] = None
    strategy: str
    num_snapshots: int
    quality_score: Optional[float] = None
    is_labeled: bool = False
    created_at: datetime


class SimilarityResult(BaseModel):
    id: int
    mint: str
    window_start: datetime
    window_end: datetime
    phase_id: Optional[int] = None
    label: Optional[str] = None
    similarity: float
    strategy: str


class SimilaritySearchResponse(BaseModel):
    query_mint: Optional[str] = None
    results: List[SimilarityResult]
    total_results: int
    search_time_ms: float


class ConfigResponse(BaseModel):
    id: int
    name: str
    strategy: str
    is_active: bool
    dimensions: int
    window_seconds: int
    window_overlap_seconds: int
    min_snapshots: int
    phases: Optional[List[int]] = None
    normalization: str
    total_embeddings: int
    last_run_at: Optional[datetime] = None
    created_at: datetime


class StatsResponse(BaseModel):
    total_embeddings: int
    total_labeled: int
    total_configs: int
    embeddings_by_strategy: Dict[str, int]
    embeddings_by_label: Dict[str, int]
    embeddings_by_phase: Dict[int, int]
    storage_size_mb: float


class HealthResponse(BaseModel):
    status: str
    service_running: bool
    active_configs: int
    last_run: Optional[str] = None
    total_embeddings: int
    stats: Dict[str, Any]


class JobResponse(BaseModel):
    id: int
    config_id: int
    status: str
    job_type: str
    process_start: datetime
    process_end: datetime
    progress: float
    mints_processed: int
    embeddings_created: int
    errors: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_msg: Optional[str] = None


class LabelStatsResponse(BaseModel):
    label: str
    count: int
    sources: Dict[str, int]
