"""
SQL queries and database operations for the Embeddings module.

All database interactions go through the shared asyncpg pool from backend.database.
"""

import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from backend.database import fetch, fetchrow, fetchval, execute, execute_many, get_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Embedding Configs
# ---------------------------------------------------------------------------

async def get_active_configs() -> List[dict]:
    """Get all active embedding configurations."""
    rows = await fetch(
        "SELECT * FROM embedding_configs WHERE is_active = TRUE ORDER BY id"
    )
    return [dict(r) for r in rows]


async def get_all_configs() -> List[dict]:
    """Get all embedding configurations."""
    rows = await fetch("SELECT * FROM embedding_configs ORDER BY id")
    return [dict(r) for r in rows]


async def get_config(config_id: int) -> Optional[dict]:
    """Get a single config by ID."""
    row = await fetchrow("SELECT * FROM embedding_configs WHERE id = $1", config_id)
    return dict(row) if row else None


async def create_config(
    name: str,
    strategy: str,
    window_seconds: int = 300,
    window_overlap_seconds: int = 0,
    min_snapshots: int = 3,
    phases: Optional[list] = None,
    normalization: str = "minmax",
    feature_list: Optional[list] = None,
) -> dict:
    """Create a new embedding configuration."""
    import json
    row = await fetchrow(
        """
        INSERT INTO embedding_configs
            (name, strategy, window_seconds, window_overlap_seconds,
             min_snapshots, phases, normalization, feature_list)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
        RETURNING *
        """,
        name, strategy, window_seconds, window_overlap_seconds,
        min_snapshots,
        json.dumps(phases) if phases else None,
        normalization,
        json.dumps(feature_list or []),
    )
    return dict(row)


async def update_config(config_id: int, updates: Dict[str, Any]) -> Optional[dict]:
    """Update a config with the given fields."""
    import json
    allowed = {
        "name", "is_active", "window_seconds", "window_overlap_seconds",
        "min_snapshots", "phases", "normalization",
    }
    sets = []
    params = []
    idx = 1
    for key, value in updates.items():
        if key not in allowed or value is None:
            continue
        idx += 1
        if key == "phases":
            sets.append(f"{key} = ${idx}::jsonb")
            params.append(json.dumps(value))
        else:
            sets.append(f"{key} = ${idx}")
            params.append(value)

    if not sets:
        return await get_config(config_id)

    sets.append(f"updated_at = NOW()")
    query = f"UPDATE embedding_configs SET {', '.join(sets)} WHERE id = $1 RETURNING *"
    row = await fetchrow(query, config_id, *params)
    return dict(row) if row else None


async def delete_config(config_id: int) -> bool:
    """Delete a config and all its embeddings."""
    await execute("DELETE FROM coin_pattern_embeddings WHERE config_id = $1", config_id)
    result = await execute("DELETE FROM embedding_configs WHERE id = $1", config_id)
    return "DELETE 1" in result


async def update_config_stats(config_id: int, new_embeddings: int) -> None:
    """Increment total_embeddings and set last_run_at."""
    await execute(
        """
        UPDATE embedding_configs
        SET total_embeddings = total_embeddings + $1, last_run_at = NOW(), updated_at = NOW()
        WHERE id = $2
        """,
        new_embeddings, config_id,
    )


# ---------------------------------------------------------------------------
# Embeddings CRUD
# ---------------------------------------------------------------------------

async def insert_embeddings_batch(rows: List[tuple]) -> int:
    """
    Batch insert embeddings into coin_pattern_embeddings.

    Each tuple: (mint, window_start, window_end, embedding_str, phase_id,
                 num_snapshots, label, strategy, config_id, feature_hash)
    """
    if not rows:
        return 0
    sql = """
        INSERT INTO coin_pattern_embeddings
            (mint, window_start, window_end, embedding, phase_id_at_time,
             num_snapshots, label, strategy, config_id, feature_hash)
        VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8, $9, $10)
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(sql, rows)
    return len(rows)


async def get_embeddings(
    config_id: Optional[int] = None,
    mint: Optional[str] = None,
    label: Optional[str] = None,
    phase_id: Optional[int] = None,
    strategy: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[dict]:
    """Get embeddings with optional filters."""
    conditions = []
    params: list = []
    idx = 0

    if config_id is not None:
        idx += 1
        conditions.append(f"config_id = ${idx}")
        params.append(config_id)
    if mint is not None:
        idx += 1
        conditions.append(f"mint = ${idx}")
        params.append(mint)
    if label is not None:
        idx += 1
        conditions.append(f"label = ${idx}")
        params.append(label)
    if phase_id is not None:
        idx += 1
        conditions.append(f"phase_id_at_time = ${idx}")
        params.append(phase_id)
    if strategy is not None:
        idx += 1
        conditions.append(f"strategy = ${idx}")
        params.append(strategy)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    idx += 1
    limit_param = idx
    idx += 1
    offset_param = idx
    params.extend([limit, offset])

    rows = await fetch(
        f"""
        SELECT id, mint, window_start, window_end, phase_id_at_time, label,
               num_snapshots, strategy, config_id, quality_score, is_labeled,
               feature_hash, created_at
        FROM coin_pattern_embeddings
        {where}
        ORDER BY created_at DESC
        LIMIT ${limit_param} OFFSET ${offset_param}
        """,
        *params,
    )
    return [dict(r) for r in rows]


async def get_embedding_by_id(embedding_id: int) -> Optional[dict]:
    """Get a single embedding with its vector."""
    row = await fetchrow(
        "SELECT * FROM coin_pattern_embeddings WHERE id = $1",
        embedding_id,
    )
    return dict(row) if row else None


async def get_embedding_vector(mint: str, window_start: Optional[datetime] = None) -> Optional[list]:
    """Get the embedding vector for a coin (latest or at specific window)."""
    if window_start:
        row = await fetchrow(
            """
            SELECT embedding FROM coin_pattern_embeddings
            WHERE mint = $1 AND window_start = $2
            ORDER BY created_at DESC LIMIT 1
            """,
            mint, window_start,
        )
    else:
        row = await fetchrow(
            """
            SELECT embedding FROM coin_pattern_embeddings
            WHERE mint = $1
            ORDER BY created_at DESC LIMIT 1
            """,
            mint,
        )
    if not row:
        return None
    emb = row["embedding"]
    if isinstance(emb, str):
        return [float(x) for x in emb.strip("[]").split(",")]
    return list(emb)


async def get_latest_window_end(config_id: int) -> Optional[datetime]:
    """Get the latest window_end for a given config."""
    return await fetchval(
        "SELECT MAX(window_end) FROM coin_pattern_embeddings WHERE config_id = $1",
        config_id,
    )


async def get_mints_in_window(window_start: datetime, window_end: datetime) -> List[str]:
    """Get distinct mints that have coin_metrics data in the given window."""
    rows = await fetch(
        """
        SELECT DISTINCT mint FROM coin_metrics
        WHERE timestamp >= $1 AND timestamp < $2
        """,
        window_start, window_end,
    )
    return [r["mint"] for r in rows]


async def update_embedding_label(embedding_id: int, label: str) -> None:
    """Update the label and is_labeled flag on an embedding."""
    await execute(
        "UPDATE coin_pattern_embeddings SET label = $1, is_labeled = TRUE WHERE id = $2",
        label, embedding_id,
    )


async def count_embeddings(
    config_id: Optional[int] = None,
    strategy: Optional[str] = None,
) -> int:
    """Count total embeddings with optional filter."""
    if config_id is not None:
        return await fetchval(
            "SELECT COUNT(*) FROM coin_pattern_embeddings WHERE config_id = $1",
            config_id,
        )
    if strategy is not None:
        return await fetchval(
            "SELECT COUNT(*) FROM coin_pattern_embeddings WHERE strategy = $1",
            strategy,
        )
    return await fetchval("SELECT COUNT(*) FROM coin_pattern_embeddings")


# ---------------------------------------------------------------------------
# Embedding Jobs
# ---------------------------------------------------------------------------

async def create_job(
    config_id: int,
    process_start: datetime,
    process_end: datetime,
    job_type: str = "GENERATE",
) -> dict:
    """Create a new embedding generation job."""
    row = await fetchrow(
        """
        INSERT INTO embedding_jobs (config_id, process_start, process_end, job_type)
        VALUES ($1, $2, $3, $4)
        RETURNING *
        """,
        config_id, process_start, process_end, job_type,
    )
    return dict(row)


async def update_job(
    job_id: int,
    status: Optional[str] = None,
    progress: Optional[float] = None,
    mints_processed: Optional[int] = None,
    embeddings_created: Optional[int] = None,
    errors: Optional[int] = None,
    error_msg: Optional[str] = None,
) -> None:
    """Update job progress and status."""
    sets = []
    params: list = [job_id]
    idx = 1

    if status is not None:
        idx += 1
        sets.append(f"status = ${idx}")
        params.append(status)
        if status == "RUNNING":
            sets.append("started_at = NOW()")
        elif status in ("COMPLETED", "FAILED", "CANCELLED"):
            sets.append("completed_at = NOW()")
    if progress is not None:
        idx += 1
        sets.append(f"progress = ${idx}")
        params.append(progress)
    if mints_processed is not None:
        idx += 1
        sets.append(f"mints_processed = ${idx}")
        params.append(mints_processed)
    if embeddings_created is not None:
        idx += 1
        sets.append(f"embeddings_created = ${idx}")
        params.append(embeddings_created)
    if errors is not None:
        idx += 1
        sets.append(f"errors = ${idx}")
        params.append(errors)
    if error_msg is not None:
        idx += 1
        sets.append(f"error_msg = ${idx}")
        params.append(error_msg)

    if sets:
        await execute(
            f"UPDATE embedding_jobs SET {', '.join(sets)} WHERE id = $1",
            *params,
        )


async def get_jobs(
    config_id: Optional[int] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[dict]:
    """Get embedding jobs with optional filters."""
    conditions = []
    params: list = []
    idx = 0

    if config_id is not None:
        idx += 1
        conditions.append(f"config_id = ${idx}")
        params.append(config_id)
    if status is not None:
        idx += 1
        conditions.append(f"status = ${idx}")
        params.append(status)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    idx += 1
    params.append(limit)

    rows = await fetch(
        f"SELECT * FROM embedding_jobs {where} ORDER BY created_at DESC LIMIT ${idx}",
        *params,
    )
    return [dict(r) for r in rows]


async def get_job(job_id: int) -> Optional[dict]:
    """Get a single job by ID."""
    row = await fetchrow("SELECT * FROM embedding_jobs WHERE id = $1", job_id)
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Pattern Labels
# ---------------------------------------------------------------------------

async def add_label(
    embedding_id: int,
    label: str,
    confidence: float = 1.0,
    source: str = "manual",
    notes: Optional[str] = None,
    created_by: str = "system",
) -> dict:
    """Add a label to an embedding."""
    row = await fetchrow(
        """
        INSERT INTO pattern_labels (embedding_id, label, confidence, source, notes, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
        """,
        embedding_id, label, confidence, source, notes, created_by,
    )
    # Also update the embedding's label and is_labeled flag
    await execute(
        "UPDATE coin_pattern_embeddings SET label = $1, is_labeled = TRUE WHERE id = $2",
        label, embedding_id,
    )
    return dict(row)


async def get_label_stats() -> List[dict]:
    """Get label counts with source breakdown."""
    rows = await fetch(
        """
        SELECT label, source, COUNT(*) as count
        FROM pattern_labels
        GROUP BY label, source
        ORDER BY label, source
        """
    )
    return [dict(r) for r in rows]


async def delete_label(label_id: int) -> bool:
    """Delete a label."""
    result = await execute("DELETE FROM pattern_labels WHERE id = $1", label_id)
    return "DELETE 1" in result


# ---------------------------------------------------------------------------
# Similarity Cache
# ---------------------------------------------------------------------------

async def insert_similarity_pairs(pairs: List[tuple]) -> int:
    """
    Batch insert similarity pairs into similarity_cache.
    Each tuple: (embedding_a_id, embedding_b_id, cosine_similarity)
    """
    if not pairs:
        return 0
    sql = """
        INSERT INTO similarity_cache (embedding_a_id, embedding_b_id, cosine_similarity)
        VALUES ($1, $2, $3)
        ON CONFLICT (embedding_a_id, embedding_b_id)
        DO UPDATE SET cosine_similarity = EXCLUDED.cosine_similarity
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(sql, pairs)
    return len(pairs)


async def get_unsynced_similarities(
    threshold: float = 0.85,
    limit: int = 100,
) -> List[dict]:
    """Get unsynced similarity pairs above threshold."""
    rows = await fetch(
        """
        SELECT sc.id, sc.cosine_similarity,
               e1.mint as mint_a, e1.window_start as window_a,
               e2.mint as mint_b, e2.window_start as window_b,
               e1.label as label_a, e2.label as label_b
        FROM similarity_cache sc
        JOIN coin_pattern_embeddings e1 ON e1.id = sc.embedding_a_id
        JOIN coin_pattern_embeddings e2 ON e2.id = sc.embedding_b_id
        WHERE sc.synced_to_neo4j = FALSE
          AND sc.cosine_similarity >= $1
        ORDER BY sc.cosine_similarity DESC
        LIMIT $2
        """,
        threshold, limit,
    )
    return [dict(r) for r in rows]


async def mark_similarities_synced(cache_ids: List[int]) -> None:
    """Mark similarity pairs as synced to Neo4j."""
    if not cache_ids:
        return
    placeholders = ", ".join(f"${i+1}" for i in range(len(cache_ids)))
    await execute(
        f"UPDATE similarity_cache SET synced_to_neo4j = TRUE WHERE id IN ({placeholders})",
        *cache_ids,
    )


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

async def get_stats() -> dict:
    """Get comprehensive embedding statistics."""
    total = await fetchval("SELECT COUNT(*) FROM coin_pattern_embeddings")
    total_labeled = await fetchval(
        "SELECT COUNT(*) FROM coin_pattern_embeddings WHERE is_labeled = TRUE"
    )
    total_configs = await fetchval("SELECT COUNT(*) FROM embedding_configs")

    # By strategy
    rows = await fetch(
        "SELECT strategy, COUNT(*) as cnt FROM coin_pattern_embeddings GROUP BY strategy"
    )
    by_strategy = {r["strategy"]: r["cnt"] for r in rows}

    # By label
    rows = await fetch(
        """
        SELECT COALESCE(label, 'unlabeled') as lbl, COUNT(*) as cnt
        FROM coin_pattern_embeddings GROUP BY label
        """
    )
    by_label = {r["lbl"]: r["cnt"] for r in rows}

    # By phase
    rows = await fetch(
        """
        SELECT COALESCE(phase_id_at_time, 0) as phase, COUNT(*) as cnt
        FROM coin_pattern_embeddings GROUP BY phase_id_at_time
        """
    )
    by_phase = {r["phase"]: r["cnt"] for r in rows}

    # Storage size
    size_mb = await fetchval(
        "SELECT pg_total_relation_size('coin_pattern_embeddings') / 1048576.0"
    ) or 0.0

    return {
        "total_embeddings": total or 0,
        "total_labeled": total_labeled or 0,
        "total_configs": total_configs or 0,
        "embeddings_by_strategy": by_strategy,
        "embeddings_by_label": by_label,
        "embeddings_by_phase": by_phase,
        "storage_size_mb": round(float(size_mb), 2),
    }
