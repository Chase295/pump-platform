"""
FastAPI router for the Embeddings module.

Endpoints at /api/embeddings/ for health, configs, generation, browsing,
similarity search, labeling, analysis, and Neo4j sync.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.database import get_pool
from backend.modules.embeddings import db_queries as db
from backend.modules.embeddings.schemas import (
    CreateConfigRequest,
    UpdateConfigRequest,
    GenerateRequest,
    SimilaritySearchRequest,
    AddLabelRequest,
    PropagateLabelRequest,
)
from backend.modules.embeddings.similarity import (
    search_similar,
    search_similar_to_mint,
    search_by_label,
    sync_similarities_to_neo4j,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/embeddings", tags=["embeddings"])


# ---------------------------------------------------------------------------
# Health & Status
# ---------------------------------------------------------------------------

@router.get("/health", operation_id="embeddings_health")
async def health():
    """Service status, active configs, stats."""
    from backend.modules.embeddings.service import get_embedding_service
    svc = get_embedding_service()
    total = await db.count_embeddings()
    configs = await db.get_active_configs()
    return {
        "status": "running" if (svc and svc.running) else "stopped",
        "service_running": bool(svc and svc.running),
        "active_configs": len(configs),
        "last_run": svc.last_run.isoformat() if svc and svc.last_run else None,
        "total_embeddings": total,
        "stats": svc.stats if svc else {},
    }


@router.get("/stats", operation_id="embeddings_stats")
async def stats():
    """Comprehensive embedding statistics."""
    return await db.get_stats()


# ---------------------------------------------------------------------------
# Configs
# ---------------------------------------------------------------------------

@router.get("/configs", operation_id="embeddings_list_configs")
async def list_configs():
    """List all embedding configurations."""
    return await db.get_all_configs()


@router.post("/configs", operation_id="embeddings_create_config")
async def create_config(req: CreateConfigRequest):
    """Create a new embedding configuration."""
    try:
        return await db.create_config(
            name=req.name,
            strategy=req.strategy,
            window_seconds=req.window_seconds,
            window_overlap_seconds=req.window_overlap_seconds,
            min_snapshots=req.min_snapshots,
            phases=req.phases,
            normalization=req.normalization,
        )
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail=f"Config name '{req.name}' already exists")
        raise


@router.get("/configs/{config_id}", operation_id="embeddings_get_config")
async def get_config(config_id: int):
    """Get config details."""
    cfg = await db.get_config(config_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    return cfg


@router.patch("/configs/{config_id}", operation_id="embeddings_update_config")
async def update_config(config_id: int, req: UpdateConfigRequest):
    """Update a config."""
    updates = req.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.update_config(config_id, updates)
    if not result:
        raise HTTPException(status_code=404, detail="Config not found")
    return result


@router.delete("/configs/{config_id}", operation_id="embeddings_delete_config")
async def delete_config(config_id: int):
    """Delete a config and all its embeddings."""
    deleted = await db.delete_config(config_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Config not found")
    return {"status": "deleted", "config_id": config_id}


# ---------------------------------------------------------------------------
# Generation
# ---------------------------------------------------------------------------

@router.post("/generate", operation_id="embeddings_generate")
async def trigger_generation(req: GenerateRequest):
    """Trigger manual embedding generation for a time range."""
    if req.config_id:
        cfg = await db.get_config(req.config_id)
        if not cfg:
            raise HTTPException(status_code=404, detail="Config not found")
        configs = [cfg]
    else:
        configs = await db.get_active_configs()
        if not configs:
            raise HTTPException(status_code=400, detail="No active configs")

    jobs = []
    for cfg in configs:
        job = await db.create_job(
            config_id=cfg["id"],
            process_start=req.start,
            process_end=req.end,
            job_type="GENERATE",
        )
        jobs.append(job)

    return {"status": "queued", "jobs_created": len(jobs), "jobs": jobs}


@router.get("/jobs", operation_id="embeddings_list_jobs")
async def list_jobs(
    config_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    """List embedding generation jobs."""
    return await db.get_jobs(config_id=config_id, status=status, limit=limit)


@router.get("/jobs/{job_id}", operation_id="embeddings_get_job")
async def get_job(job_id: int):
    """Get job details."""
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ---------------------------------------------------------------------------
# Browsing
# ---------------------------------------------------------------------------

@router.get("/browse", operation_id="embeddings_browse")
async def browse_embeddings(
    config_id: Optional[int] = Query(None),
    mint: Optional[str] = Query(None),
    label: Optional[str] = Query(None),
    phase_id: Optional[int] = Query(None),
    strategy: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    """Browse embeddings with filters."""
    return await db.get_embeddings(
        config_id=config_id, mint=mint, label=label,
        phase_id=phase_id, strategy=strategy,
        limit=limit, offset=offset,
    )


@router.get("/browse/by-mint/{mint}", operation_id="embeddings_browse_by_mint")
async def get_embeddings_by_mint(
    mint: str,
    limit: int = Query(50, ge=1, le=500),
):
    """Get all embeddings for a specific coin."""
    return await db.get_embeddings(mint=mint, limit=limit)


@router.get("/browse/{embedding_id}", operation_id="embeddings_get_embedding")
async def get_embedding(embedding_id: int):
    """Get single embedding details."""
    emb = await db.get_embedding_by_id(embedding_id)
    if not emb:
        raise HTTPException(status_code=404, detail="Embedding not found")
    return emb


# ---------------------------------------------------------------------------
# Similarity Search
# ---------------------------------------------------------------------------

@router.post("/search/similar", operation_id="embeddings_search_similar")
async def search_similar_endpoint(req: SimilaritySearchRequest):
    """Find similar patterns by embedding vector or mint."""
    start_time = time.monotonic()

    if req.embedding and len(req.embedding) == 128:
        results = await search_similar(
            query_embedding=req.embedding,
            k=req.k,
            phase_id=req.phase_id,
            label=req.label,
            strategy=req.strategy,
            min_similarity=req.min_similarity,
            ef_search=req.ef_search,
        )
        query_mint = None
    elif req.mint:
        results = await search_similar_to_mint(
            mint=req.mint,
            k=req.k,
            phase_id=req.phase_id,
            label=req.label,
            strategy=req.strategy,
            min_similarity=req.min_similarity,
            ef_search=req.ef_search,
        )
        query_mint = req.mint
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either 'embedding' (128 floats) or 'mint' address",
        )

    duration_ms = (time.monotonic() - start_time) * 1000
    return {
        "query_mint": query_mint,
        "results": results,
        "total_results": len(results),
        "search_time_ms": round(duration_ms, 2),
    }


@router.get("/search/by-mint/{mint}", operation_id="embeddings_search_by_mint")
async def search_by_mint(
    mint: str,
    k: int = Query(20, ge=1, le=200),
    phase_id: Optional[int] = Query(None),
    label: Optional[str] = Query(None),
    min_similarity: float = Query(0.0, ge=0.0, le=1.0),
):
    """Find patterns similar to a coin."""
    start_time = time.monotonic()
    results = await search_similar_to_mint(
        mint=mint, k=k, phase_id=phase_id, label=label,
        min_similarity=min_similarity,
    )
    duration_ms = (time.monotonic() - start_time) * 1000
    return {
        "query_mint": mint,
        "results": results,
        "total_results": len(results),
        "search_time_ms": round(duration_ms, 2),
    }


@router.get("/search/by-label/{label}", operation_id="embeddings_search_by_label")
async def search_by_label_endpoint(
    label: str,
    k: int = Query(50, ge=1, le=500),
    strategy: Optional[str] = Query(None),
):
    """Get all patterns with a specific label."""
    return await search_by_label(label=label, k=k, strategy=strategy)


# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------

@router.post("/labels", operation_id="embeddings_add_label")
async def add_label(req: AddLabelRequest):
    """Add a label to an embedding."""
    emb = await db.get_embedding_by_id(req.embedding_id)
    if not emb:
        raise HTTPException(status_code=404, detail="Embedding not found")
    return await db.add_label(
        embedding_id=req.embedding_id,
        label=req.label,
        confidence=req.confidence,
        source=req.source,
        notes=req.notes,
    )


@router.get("/labels", operation_id="embeddings_list_labels")
async def get_labels():
    """Get all labels with counts."""
    raw = await db.get_label_stats()
    # Aggregate by label
    labels: dict = {}
    for r in raw:
        lbl = r["label"]
        if lbl not in labels:
            labels[lbl] = {"label": lbl, "count": 0, "sources": {}}
        labels[lbl]["count"] += r["count"]
        labels[lbl]["sources"][r["source"]] = r["count"]
    return list(labels.values())


@router.delete("/labels/{label_id}", operation_id="embeddings_delete_label")
async def delete_label(label_id: int):
    """Delete a label."""
    deleted = await db.delete_label(label_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Label not found")
    return {"status": "deleted"}


@router.post("/labels/propagate", operation_id="embeddings_propagate_labels")
async def propagate_labels(req: PropagateLabelRequest):
    """Propagate labels to similar unlabeled patterns."""
    # Find all embeddings with the source label
    labeled = await db.get_embeddings(label=req.source_label, limit=500)
    if not labeled:
        raise HTTPException(status_code=404, detail=f"No embeddings with label '{req.source_label}'")

    propagated = 0
    for emb in labeled:
        if propagated >= req.max_propagations:
            break
        # Get the embedding vector
        vec = await db.get_embedding_vector(emb["mint"])
        if not vec:
            continue
        # Find similar unlabeled patterns
        similar = await search_similar(
            query_embedding=vec,
            k=10,
            min_similarity=req.min_similarity,
            exclude_mint=emb["mint"],
        )
        for s in similar:
            if s.get("label") is None and propagated < req.max_propagations:
                await db.add_label(
                    embedding_id=s["id"],
                    label=req.source_label,
                    confidence=s["similarity"],
                    source="propagated",
                    notes=f"Propagated from embedding in mint {emb['mint']}",
                )
                propagated += 1

    return {"status": "done", "propagated": propagated, "source_label": req.source_label}


# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

@router.get("/analysis/distribution", operation_id="embeddings_label_distribution")
async def label_distribution():
    """Label distribution statistics."""
    stats = await db.get_stats()
    return {
        "by_label": stats["embeddings_by_label"],
        "by_strategy": stats["embeddings_by_strategy"],
        "by_phase": stats["embeddings_by_phase"],
        "total": stats["total_embeddings"],
        "labeled": stats["total_labeled"],
        "unlabeled": stats["total_embeddings"] - stats["total_labeled"],
    }


@router.get("/analysis/clusters", operation_id="embeddings_cluster_analysis")
async def cluster_analysis(
    k: int = Query(5, ge=2, le=20, description="Number of clusters"),
    strategy: Optional[str] = Query(None),
    limit: int = Query(5000, ge=100, le=50000),
):
    """K-means cluster analysis on embeddings."""
    pool = get_pool()

    conditions = []
    params: list = []
    idx = 0

    if strategy:
        idx += 1
        conditions.append(f"strategy = ${idx}")
        params.append(strategy)

    idx += 1
    params.append(limit)
    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    rows = await pool.fetch(
        f"""
        SELECT id, mint, label, embedding
        FROM coin_pattern_embeddings
        {where}
        ORDER BY created_at DESC
        LIMIT ${idx}
        """,
        *params,
    )

    if len(rows) < k:
        raise HTTPException(status_code=400, detail=f"Not enough embeddings ({len(rows)}) for {k} clusters")

    import numpy as np
    from sklearn.cluster import KMeans

    embeddings = []
    ids = []
    mints = []
    labels = []
    for r in rows:
        emb = r["embedding"]
        if isinstance(emb, str):
            emb = [float(x) for x in emb.strip("[]").split(",")]
        embeddings.append(emb)
        ids.append(r["id"])
        mints.append(r["mint"])
        labels.append(r["label"])

    X = np.array(embeddings)
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(X)

    # Build cluster summaries
    clusters = []
    for c in range(k):
        mask = cluster_labels == c
        cluster_mints = [mints[i] for i in range(len(mints)) if mask[i]]
        cluster_labels_list = [labels[i] for i in range(len(labels)) if mask[i] and labels[i]]
        label_counts = {}
        for lbl in cluster_labels_list:
            label_counts[lbl] = label_counts.get(lbl, 0) + 1

        clusters.append({
            "cluster_id": c,
            "size": int(mask.sum()),
            "label_distribution": label_counts,
            "sample_mints": cluster_mints[:5],
        })

    return {
        "k": k,
        "total_embeddings": len(rows),
        "clusters": clusters,
        "inertia": float(kmeans.inertia_),
    }


@router.get("/analysis/outliers", operation_id="embeddings_find_outliers")
async def find_outliers(
    strategy: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Find outlier patterns (low average similarity to others)."""
    pool = get_pool()

    conditions = []
    params: list = []
    idx = 0

    if strategy:
        idx += 1
        conditions.append(f"a.strategy = ${idx}")
        params.append(strategy)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    idx += 1
    params.append(limit)

    # Use a sample-based approach: for each embedding, compute avg distance to 10 random neighbors
    rows = await pool.fetch(
        f"""
        SELECT a.id, a.mint, a.label, a.strategy,
               AVG(a.embedding <=> b.embedding) as avg_distance
        FROM coin_pattern_embeddings a
        CROSS JOIN LATERAL (
            SELECT embedding FROM coin_pattern_embeddings b
            WHERE b.id != a.id AND b.strategy = a.strategy
            ORDER BY RANDOM()
            LIMIT 10
        ) b
        {where}
        GROUP BY a.id, a.mint, a.label, a.strategy
        ORDER BY avg_distance DESC
        LIMIT ${idx}
        """,
        *params,
    )

    return [
        {
            "id": r["id"],
            "mint": r["mint"],
            "label": r["label"],
            "strategy": r["strategy"],
            "avg_distance": round(float(r["avg_distance"]), 6),
            "isolation_score": round(float(r["avg_distance"]), 6),
        }
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Neo4j Sync
# ---------------------------------------------------------------------------

@router.post("/neo4j/sync", operation_id="embeddings_neo4j_sync")
async def trigger_neo4j_sync():
    """Trigger manual SIMILAR_TO sync to Neo4j."""
    synced = await sync_similarities_to_neo4j()
    return {"status": "done", "synced": synced}


@router.get("/neo4j/status", operation_id="embeddings_neo4j_status")
async def neo4j_sync_status():
    """Neo4j sync status."""
    from backend.database import fetchval
    total_pairs = await fetchval("SELECT COUNT(*) FROM similarity_cache") or 0
    synced_pairs = await fetchval(
        "SELECT COUNT(*) FROM similarity_cache WHERE synced_to_neo4j = TRUE"
    ) or 0
    pending = total_pairs - synced_pairs
    return {
        "total_pairs": total_pairs,
        "synced": synced_pairs,
        "pending": pending,
    }
