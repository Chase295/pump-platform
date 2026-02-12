"""
Graph Features for ML Training.

Computes features from Neo4j graph data (creator history, wallet clusters,
similar tokens) for use in the training pipeline.
"""

import logging
from typing import List, Dict

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


async def compute_graph_features(mints: List[str]) -> Dict[str, Dict[str, float]]:
    """Compute graph-based features for a list of mints.

    Queries Neo4j for creator history, wallet clusters, and similar tokens.
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

        # Batch query: creator stats per token
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

        # Batch query: wallet cluster stats
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

        # Batch query: similar token stats
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

        # Initialize defaults
        for mint in mints:
            result[mint] = dict(default_features)

        # Execute queries (batch all mints at once)
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

        logger.info("Graph features computed for %d mints", len(result))
        return result

    except ImportError:
        logger.warning("Neo4j client not available -- graph features will be zero")
        return {mint: dict(default_features) for mint in mints}
    except Exception as e:
        logger.warning("Graph features computation failed: %s", e)
        return {mint: dict(default_features) for mint in mints}
