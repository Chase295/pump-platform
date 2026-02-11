"""
Graph Module API Router

Prefix: /api/graph/
Provides health, stats, sync status, sync trigger, and read-only Cypher queries.
"""

import asyncio
import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.modules.graph.neo4j_client import check_health as neo4j_health, run_query
from backend.modules.graph.sync import get_graph_sync

logger = logging.getLogger(__name__)

QUERY_TIMEOUT_SECONDS = 30

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/health")
async def graph_health():
    """Neo4j connection status."""
    ok = await neo4j_health()
    sync = get_graph_sync()
    return {
        "neo4j_connected": ok,
        "sync_running": sync.running if sync else False,
    }


@router.get("/stats")
async def graph_stats():
    """Node and relationship counts in Neo4j."""
    try:
        node_counts = await run_query("""
            CALL db.labels() YIELD label
            CALL apoc.cypher.run('MATCH (n:`' + label + '`) RETURN count(n) AS cnt', {}) YIELD value
            RETURN label, value.cnt AS count
        """)
    except Exception:
        # APOC not available - use simpler queries
        node_counts = []
        for label in [
            "Token", "Creator", "Wallet", "Model", "Address",
            # Phase 1: Event-System
            "Event", "Outcome",
            # Phase 2: Phasen-Analyse
            "PhaseSnapshot", "PriceCheckpoint",
            # Phase 3: Wallet-Intelligence
            "MarketTrader", "WalletCluster",
            # Phase 4: Marktkontext
            "SolPrice",
            # Phase 5: Enrichment
            "SocialProfile", "ImageHash", "Tokenomics",
            # Reference Nodes
            "Phase",
        ]:
            try:
                result = await run_query(
                    f"MATCH (n:{label}) RETURN '{label}' AS label, count(n) AS count"
                )
                node_counts.extend(result)
            except Exception as e:
                logger.debug("Count query failed for %s: %s", label, e)

    try:
        rel_counts = []
        for rel_type in [
            "CREATED", "HOLDS", "BOUGHT", "SOLD", "PREDICTED", "TRANSFERRED_TO", "SIMILAR_TO",
            # Phase 1
            "HAD_EVENT", "FOLLOWED_BY", "RESULTED_IN",
            # Phase 2
            "PHASE_SUMMARY", "NEXT_PHASE", "PRICE_AT", "NEXT_CHECKPOINT",
            # Phase 3
            "BELONGS_TO", "TRADES_WITH", "FUNDED_BY", "MARKET_BOUGHT", "MARKET_SOLD", "IS_CREATOR",
            # Phase 4
            "DURING_MARKET",
            # Phase 5
            "HAS_TWITTER", "HAS_TELEGRAM", "HAS_WEBSITE", "HAS_IMAGE", "HAS_TOKENOMICS",
            # Gap closures
            "HAS_DISCORD", "LAUNCHED_WITH", "CURRENT_PHASE",
        ]:
            try:
                result = await run_query(
                    f"MATCH ()-[r:{rel_type}]->() RETURN '{rel_type}' AS type, count(r) AS count"
                )
                rel_counts.extend(result)
            except Exception as e:
                logger.debug("Count query failed for %s: %s", rel_type, e)
    except Exception as e:
        logger.warning("Relationship count query failed: %s", e)
        rel_counts = []

    return {
        "nodes": {r["label"]: r["count"] for r in node_counts},
        "relationships": {r["type"]: r["count"] for r in rel_counts},
    }


@router.get("/sync/status")
async def sync_status():
    """Last sync timestamps and stats per entity."""
    sync = get_graph_sync()
    if not sync:
        return {"error": "Sync service not running"}
    return sync.get_status()


@router.post("/sync/trigger")
async def sync_trigger():
    """Trigger a manual sync run."""
    sync = get_graph_sync()
    if not sync:
        raise HTTPException(status_code=503, detail="Sync service not running")
    results = await sync.run_once()
    return {"status": "ok", "results": results}


@router.get("/query")
async def execute_query(
    q: str = Query(..., description="Read-only Cypher query"),
    limit: int = Query(100, ge=1, le=1000, description="Max rows"),
):
    """Execute a read-only Cypher query.

    Only allows MATCH/RETURN/WITH/UNWIND/CALL - no writes.
    """
    # Safety: block write operations
    q_upper = q.strip().upper()
    forbidden = ["CREATE", "MERGE", "DELETE", "DETACH", "REMOVE", "DROP", "LOAD"]
    for word in forbidden:
        if re.search(rf'\b{word}\b', q_upper):
            raise HTTPException(status_code=400, detail=f"Write operations not allowed: {word}")
    # SET is special - only block "SET " at word boundary (not inside "OFFSET" etc.)
    if re.search(r'\bSET\s', q_upper):
        raise HTTPException(status_code=400, detail="Write operations not allowed: SET")
    # Block APOC write procedures and schema introspection
    if re.search(r'\bAPOC\b', q_upper):
        raise HTTPException(status_code=400, detail="APOC procedures not allowed in user queries")
    if re.search(r'\b(EXPLAIN|PROFILE)\b', q_upper):
        raise HTTPException(status_code=400, detail="EXPLAIN/PROFILE not allowed in user queries")

    # Append LIMIT if not present
    if "LIMIT" not in q_upper:
        q = q.rstrip().rstrip(";") + f" LIMIT {limit}"

    try:
        records = await asyncio.wait_for(
            run_query(q), timeout=QUERY_TIMEOUT_SECONDS
        )
        return {"rows": records, "count": len(records)}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=408, detail=f"Query timed out after {QUERY_TIMEOUT_SECONDS}s")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
