"""
Graph Features for ML Training.

Computes features from Neo4j graph data (creator history, wallet clusters,
similar tokens) for use in the training pipeline.

Supports optional temporal filtering via per-mint cutoff timestamps to
prevent data leakage during backtests: only relationships that existed
at or before the cutoff are considered.
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Feature names exported by this module
GRAPH_FEATURE_NAMES = [
    "creator_total_tokens",
    "creator_avg_risk_score",
    "creator_any_graduated",
    "creator_is_serial",
    "wallet_cluster_count",
    "avg_cluster_risk",
    "similar_token_count",
    "similar_tokens_graduated_pct",
]


async def compute_graph_features(
    mints: List[str],
    timestamps: Optional[Dict[str, datetime]] = None,
) -> Dict[str, Dict[str, float]]:
    """Compute graph-based features for a list of mints.

    Queries Neo4j for creator history, wallet clusters, and similar tokens.

    Args:
        mints: List of mint addresses.
        timestamps: Optional {mint: cutoff_timestamp} for temporal filtering.
                    When provided, only graph relationships created at or before
                    the cutoff are included to prevent data leakage in backtests.

    Returns {mint: {feature_name: value}}.
    Falls back to zeros if Neo4j is unavailable.
    """
    result: Dict[str, Dict[str, float]] = {}
    default_features = {name: 0.0 for name in GRAPH_FEATURE_NAMES}

    try:
        from backend.modules.graph.neo4j_client import run_query, check_health

        if not await check_health():
            logger.warning("Neo4j not available -- graph features will be zero")
            return {mint: dict(default_features) for mint in mints}

        # Initialize defaults
        for mint in mints:
            result[mint] = dict(default_features)

        use_cutoff = timestamps is not None and len(timestamps) > 0

        if use_cutoff:
            # Per-mint queries with temporal filtering
            await _compute_with_cutoff(mints, timestamps, result, run_query)
        else:
            # Batch queries without filtering (live prediction path)
            await _compute_without_cutoff(mints, result, run_query)

        logger.info("Graph features computed for %d mints (temporal_filter=%s)", len(result), use_cutoff)
        return result

    except ImportError:
        logger.warning("Neo4j client not available -- graph features will be zero")
        return {mint: dict(default_features) for mint in mints}
    except Exception as e:
        logger.warning("Graph features computation failed: %s", e)
        return {mint: dict(default_features) for mint in mints}


async def _compute_without_cutoff(
    mints: List[str],
    result: Dict[str, Dict[str, float]],
    run_query,
) -> None:
    """Batch queries without temporal filtering (live prediction path)."""

    creator_query = """
    UNWIND $mints AS mint_addr
    OPTIONAL MATCH (t:Token {address: mint_addr})<-[:CREATED]-(c:Creator)
    OPTIONAL MATCH (c)-[:CREATED]->(other:Token)
    WITH mint_addr, c,
         count(DISTINCT other) AS total_tokens,
         avg(COALESCE(other.risk_score, 0)) AS avg_risk,
         max(CASE WHEN other.graduated = true THEN 1 ELSE 0 END) AS any_graduated
    RETURN mint_addr,
           COALESCE(total_tokens, 0) AS creator_total_tokens,
           COALESCE(avg_risk, 0.0) AS creator_avg_risk_score,
           COALESCE(any_graduated, 0) AS creator_any_graduated,
           CASE WHEN COALESCE(total_tokens, 0) >= 5 THEN 1 ELSE 0 END AS creator_is_serial
    """

    cluster_query = """
    UNWIND $mints AS mint_addr
    OPTIONAL MATCH (t:Token {address: mint_addr})<-[:TRADED]-(w:Wallet)-[:MEMBER_OF]->(cl:WalletCluster)
    WITH mint_addr,
         count(DISTINCT cl) AS cluster_count,
         avg(COALESCE(cl.risk_score, 0)) AS avg_risk
    RETURN mint_addr,
           COALESCE(cluster_count, 0) AS wallet_cluster_count,
           COALESCE(avg_risk, 0.0) AS avg_cluster_risk
    """

    similar_query = """
    UNWIND $mints AS mint_addr
    OPTIONAL MATCH (t:Token {address: mint_addr})-[:SIMILAR_TO]-(s:Token)
    WITH mint_addr,
         count(DISTINCT s) AS sim_count,
         CASE WHEN count(DISTINCT s) > 0
              THEN toFloat(sum(CASE WHEN s.graduated = true THEN 1 ELSE 0 END)) / count(DISTINCT s)
              ELSE 0.0
         END AS graduated_pct
    RETURN mint_addr,
           COALESCE(sim_count, 0) AS similar_token_count,
           COALESCE(graduated_pct, 0.0) AS similar_tokens_graduated_pct
    """

    for query, fields in [
        (creator_query, ["creator_total_tokens", "creator_avg_risk_score", "creator_any_graduated", "creator_is_serial"]),
        (cluster_query, ["wallet_cluster_count", "avg_cluster_risk"]),
        (similar_query, ["similar_token_count", "similar_tokens_graduated_pct"]),
    ]:
        try:
            records = await run_query(query, {"mints": mints})
            for record in records:
                mint_addr = record.get("mint_addr")
                if mint_addr and mint_addr in result:
                    for field in fields:
                        val = record.get(field, 0)
                        result[mint_addr][field] = float(val) if val is not None else 0.0
        except Exception as e:
            logger.warning("Graph query failed: %s", e)


async def _compute_with_cutoff(
    mints: List[str],
    timestamps: Dict[str, datetime],
    result: Dict[str, Dict[str, float]],
    run_query,
) -> None:
    """Queries with temporal filtering for backtests.

    Only includes relationships that have a timestamp/created_at property
    at or before the per-mint cutoff.  Relationships without any timestamp
    property are excluded (conservative approach to prevent future leakage).
    """

    # Creator query: only count tokens created BEFORE the cutoff
    # Uses r.timestamp which is set to discovered_at in sync_base.py
    creator_query = """
    UNWIND $mints AS mint_addr
    OPTIONAL MATCH (t:Token {address: mint_addr})<-[cr:CREATED]-(c:Creator)
    WHERE cr.timestamp IS NOT NULL AND cr.timestamp <= $cutoff
    OPTIONAL MATCH (c)-[cr2:CREATED]->(other:Token)
    WHERE cr2.timestamp IS NOT NULL AND cr2.timestamp <= $cutoff
    WITH mint_addr, c,
         count(DISTINCT other) AS total_tokens,
         avg(COALESCE(other.risk_score, 0)) AS avg_risk,
         max(CASE WHEN other.graduated = true THEN 1 ELSE 0 END) AS any_graduated
    RETURN mint_addr,
           COALESCE(total_tokens, 0) AS creator_total_tokens,
           COALESCE(avg_risk, 0.0) AS creator_avg_risk_score,
           COALESCE(any_graduated, 0) AS creator_any_graduated,
           CASE WHEN COALESCE(total_tokens, 0) >= 5 THEN 1 ELSE 0 END AS creator_is_serial
    """

    # Cluster query: only TRADED relationships before cutoff
    cluster_query = """
    UNWIND $mints AS mint_addr
    OPTIONAL MATCH (t:Token {address: mint_addr})<-[tr:TRADED]-(w:Wallet)-[:MEMBER_OF]->(cl:WalletCluster)
    WHERE tr.timestamp IS NOT NULL AND tr.timestamp <= $cutoff
    WITH mint_addr,
         count(DISTINCT cl) AS cluster_count,
         avg(COALESCE(cl.risk_score, 0)) AS avg_risk
    RETURN mint_addr,
           COALESCE(cluster_count, 0) AS wallet_cluster_count,
           COALESCE(avg_risk, 0.0) AS avg_cluster_risk
    """

    # Similar query: only SIMILAR_TO relationships created before cutoff
    similar_query = """
    UNWIND $mints AS mint_addr
    OPTIONAL MATCH (t:Token {address: mint_addr})-[sr:SIMILAR_TO]-(s:Token)
    WHERE sr.created_at IS NOT NULL AND sr.created_at <= $cutoff
    WITH mint_addr,
         count(DISTINCT s) AS sim_count,
         CASE WHEN count(DISTINCT s) > 0
              THEN toFloat(sum(CASE WHEN s.graduated = true THEN 1 ELSE 0 END)) / count(DISTINCT s)
              ELSE 0.0
         END AS graduated_pct
    RETURN mint_addr,
           COALESCE(sim_count, 0) AS similar_token_count,
           COALESCE(graduated_pct, 0.0) AS similar_tokens_graduated_pct
    """

    # Group mints by cutoff timestamp to reduce query count
    from collections import defaultdict
    cutoff_groups: Dict[str, List[str]] = defaultdict(list)
    for mint in mints:
        cutoff = timestamps.get(mint)
        if cutoff:
            cutoff_key = cutoff.isoformat()
            cutoff_groups[cutoff_key].append(mint)
        else:
            # No cutoff for this mint — use unfiltered path
            cutoff_groups["__no_cutoff__"].append(mint)

    for cutoff_key, group_mints in cutoff_groups.items():
        if cutoff_key == "__no_cutoff__":
            await _compute_without_cutoff(group_mints, result, run_query)
            continue

        cutoff_dt = datetime.fromisoformat(cutoff_key)

        for query, fields in [
            (creator_query, ["creator_total_tokens", "creator_avg_risk_score", "creator_any_graduated", "creator_is_serial"]),
            (cluster_query, ["wallet_cluster_count", "avg_cluster_risk"]),
            (similar_query, ["similar_token_count", "similar_tokens_graduated_pct"]),
        ]:
            try:
                records = await run_query(query, {"mints": group_mints, "cutoff": cutoff_dt})
                for record in records:
                    mint_addr = record.get("mint_addr")
                    if mint_addr and mint_addr in result:
                        for field in fields:
                            val = record.get(field, 0)
                            result[mint_addr][field] = float(val) if val is not None else 0.0
            except Exception as e:
                logger.warning("Graph query (temporal) failed: %s", e)
