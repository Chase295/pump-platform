"""
Similarity search and Neo4j SIMILAR_TO sync.

Uses pgvector's HNSW index for approximate nearest neighbor search,
and syncs high-similarity pairs to Neo4j as SIMILAR_TO relationships.
"""

import logging
import time
from datetime import datetime
from typing import Dict, List, Optional

from backend.database import fetch, fetchrow, fetchval, execute, get_pool
from backend.modules.embeddings import db_queries as db
from backend.shared.prometheus import embeddings_similarity_queries

logger = logging.getLogger(__name__)


async def search_similar(
    query_embedding: List[float],
    k: int = 20,
    phase_id: Optional[int] = None,
    label: Optional[str] = None,
    strategy: Optional[str] = None,
    min_similarity: float = 0.0,
    exclude_mint: Optional[str] = None,
    ef_search: int = 100,
    created_before: Optional[datetime] = None,
) -> List[Dict]:
    """
    Find the k most similar embeddings to the query vector using pgvector HNSW.

    Args:
        query_embedding: 128-dim query vector
        k: Number of results
        phase_id: Filter by phase
        label: Filter by label
        strategy: Filter by strategy
        min_similarity: Minimum cosine similarity (0-1)
        exclude_mint: Exclude this mint from results
        ef_search: HNSW search accuracy (higher=more accurate, slower)
        created_before: Only include embeddings created at or before this
                        timestamp (for temporal filtering in backtests).

    Returns:
        List of dicts with id, mint, similarity, etc.
    """
    start_time = time.monotonic()
    pool = get_pool()

    vec_str = "[" + ",".join(str(float(v)) for v in query_embedding) + "]"

    conditions = []
    params: list = [vec_str]
    idx = 1

    if phase_id is not None:
        idx += 1
        conditions.append(f"phase_id_at_time = ${idx}")
        params.append(phase_id)
    if label is not None:
        idx += 1
        conditions.append(f"label = ${idx}")
        params.append(label)
    if strategy is not None:
        idx += 1
        conditions.append(f"strategy = ${idx}")
        params.append(strategy)
    if exclude_mint is not None:
        idx += 1
        conditions.append(f"mint != ${idx}")
        params.append(exclude_mint)
    if created_before is not None:
        idx += 1
        conditions.append(f"created_at <= ${idx}")
        params.append(created_before)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""
    idx += 1
    params.append(k)

    query = f"""
        SELECT
            id, mint, window_start, window_end, phase_id_at_time, label,
            num_snapshots, strategy, created_at,
            1 - (embedding <=> $1::vector) AS cosine_similarity
        FROM coin_pattern_embeddings
        {where}
        ORDER BY embedding <=> $1::vector
        LIMIT ${idx}
    """

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(f"SET LOCAL hnsw.ef_search = {int(ef_search)}")
            rows = await conn.fetch(query, *params)

    results = []
    for row in rows:
        sim = float(row["cosine_similarity"])
        if sim >= min_similarity:
            results.append({
                "id": row["id"],
                "mint": row["mint"],
                "window_start": row["window_start"],
                "window_end": row["window_end"],
                "phase_id": row["phase_id_at_time"],
                "label": row["label"],
                "similarity": round(sim, 6),
                "strategy": row["strategy"],
                "created_at": row["created_at"],
            })

    duration_ms = (time.monotonic() - start_time) * 1000
    embeddings_similarity_queries.inc()
    logger.debug("Similarity search: %d results in %.1fms", len(results), duration_ms)

    return results


async def search_similar_to_mint(
    mint: str,
    window_start: Optional[datetime] = None,
    k: int = 20,
    created_before: Optional[datetime] = None,
    **kwargs,
) -> List[Dict]:
    """Find patterns similar to a specific coin's latest embedding.

    Args:
        mint: Mint address to find similar patterns for.
        window_start: Optional window start for the query embedding.
        k: Number of similar results.
        created_before: Only consider embeddings created at or before this
                        timestamp (for temporal filtering in backtests).
        **kwargs: Passed to search_similar().
    """
    embedding = await db.get_embedding_vector(mint, window_start)
    if not embedding:
        return []
    return await search_similar(
        embedding, k=k, exclude_mint=mint,
        created_before=created_before, **kwargs,
    )


async def search_by_label(
    label: str,
    k: int = 50,
    strategy: Optional[str] = None,
) -> List[Dict]:
    """Get all embeddings with a specific label."""
    conditions = ["label = $1"]
    params: list = [label]
    idx = 1

    if strategy:
        idx += 1
        conditions.append(f"strategy = ${idx}")
        params.append(strategy)

    idx += 1
    params.append(k)

    rows = await fetch(
        f"""
        SELECT id, mint, window_start, window_end, phase_id_at_time, label,
               strategy, created_at
        FROM coin_pattern_embeddings
        WHERE {" AND ".join(conditions)}
        ORDER BY created_at DESC
        LIMIT ${idx}
        """,
        *params,
    )
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Similarity cache computation
# ---------------------------------------------------------------------------

async def compute_similarity_pairs(
    new_embedding_ids: Optional[List[int]] = None,
    threshold: float = 0.80,
    max_neighbors: int = 10,
) -> int:
    """
    Compute similarity pairs for new embeddings against all existing ones.
    Store in similarity_cache for Neo4j sync.

    If new_embedding_ids is None, compute for the last 100 unprocessed embeddings.
    """
    pool = get_pool()
    total_pairs = 0

    if new_embedding_ids is None:
        # Find recent embeddings not yet in similarity_cache
        rows = await fetch(
            """
            SELECT id FROM coin_pattern_embeddings
            WHERE id NOT IN (
                SELECT DISTINCT embedding_a_id FROM similarity_cache
                UNION
                SELECT DISTINCT embedding_b_id FROM similarity_cache
            )
            ORDER BY created_at DESC
            LIMIT 100
            """
        )
        new_embedding_ids = [r["id"] for r in rows]

    if not new_embedding_ids:
        return 0

    pairs = []
    for emb_id in new_embedding_ids:
        try:
            rows = await pool.fetch(
                """
                SELECT
                    b.id as neighbor_id,
                    1 - (a.embedding <=> b.embedding) as similarity
                FROM coin_pattern_embeddings a, coin_pattern_embeddings b
                WHERE a.id = $1 AND b.id != $1
                  AND a.strategy = b.strategy
                ORDER BY a.embedding <=> b.embedding
                LIMIT $2
                """,
                emb_id, max_neighbors,
            )

            for row in rows:
                sim = float(row["similarity"])
                if sim >= threshold:
                    id_a = min(emb_id, row["neighbor_id"])
                    id_b = max(emb_id, row["neighbor_id"])
                    pairs.append((id_a, id_b, sim))

        except Exception as e:
            logger.warning("Similarity computation failed for embedding %d: %s", emb_id, e)

    if pairs:
        total_pairs = await db.insert_similarity_pairs(pairs)
        logger.debug("Computed %d similarity pairs for %d embeddings", total_pairs, len(new_embedding_ids))

    return total_pairs


# ---------------------------------------------------------------------------
# Neo4j SIMILAR_TO sync
# ---------------------------------------------------------------------------

async def sync_similarities_to_neo4j(
    threshold: float = 0.85,
    batch_size: int = 100,
) -> int:
    """
    Sync high-similarity pairs to Neo4j as SIMILAR_TO relationships.
    Returns number of relationships created.
    """
    try:
        from backend.modules.graph.neo4j_client import run_write, check_health
    except ImportError:
        logger.debug("Neo4j client not available, skipping SIMILAR_TO sync")
        return 0

    # Check Neo4j health first
    try:
        healthy = await check_health()
        if not healthy:
            return 0
    except Exception:
        return 0

    rows = await db.get_unsynced_similarities(threshold=threshold, limit=batch_size)
    if not rows:
        return 0

    synced = 0
    synced_ids = []

    for row in rows:
        if row["mint_a"] == row["mint_b"]:
            synced_ids.append(row["id"])
            continue

        params = {
            "mint_a": row["mint_a"],
            "mint_b": row["mint_b"],
            "similarity": float(row["cosine_similarity"]),
            "window_a": row["window_a"].isoformat() if row["window_a"] else "",
            "window_b": row["window_b"].isoformat() if row["window_b"] else "",
        }

        try:
            await run_write(
                """
                MATCH (t1:Token {address: $mint_a})
                MATCH (t2:Token {address: $mint_b})
                MERGE (t1)-[r:SIMILAR_TO {window_a: $window_a, window_b: $window_b}]->(t2)
                ON CREATE SET r.created_at = datetime()
                SET r.similarity = $similarity, r.updated_at = datetime()
                """,
                params,
            )
            synced += 1
            synced_ids.append(row["id"])
        except Exception as e:
            logger.warning("Neo4j SIMILAR_TO sync failed: %s", e)

    if synced_ids:
        await db.mark_similarities_synced(synced_ids)

    if synced > 0:
        logger.info("Synced %d SIMILAR_TO relationships to Neo4j", synced)

    return synced
