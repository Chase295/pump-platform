"""
Neo4j Driver Pool for Pump Platform

Async-compatible Neo4j driver with connection pooling.
Pattern follows backend/database.py (global singleton, init/close lifecycle).

Usage:
    from backend.modules.graph.neo4j_client import init_neo4j, close_neo4j, run_query

    await init_neo4j("bolt://neo4j:7687", "neo4j", "pump123")
    records = await run_query("MATCH (n:Token) RETURN count(n) AS cnt")
    await close_neo4j()
"""

import logging
from typing import Optional, List, Dict, Any

from neo4j import AsyncGraphDatabase, AsyncDriver

logger = logging.getLogger(__name__)

_driver: Optional[AsyncDriver] = None


async def init_neo4j(uri: str, user: str = "", password: str = "") -> AsyncDriver:
    """Create the global Neo4j async driver.

    Args:
        uri: Bolt URI (e.g. bolt://neo4j:7687)
        user: Neo4j username (empty if auth disabled)
        password: Neo4j password (empty if auth disabled)

    Returns:
        The created AsyncDriver instance.
    """
    global _driver
    if _driver is not None:
        raise RuntimeError("Neo4j driver already initialised. Call close_neo4j() first.")

    auth = (user, password) if user and password else None
    _driver = AsyncGraphDatabase.driver(uri, auth=auth)

    # Verify connectivity
    try:
        await _driver.verify_connectivity()
        logger.info("Neo4j driver connected -> %s", uri)
    except Exception as e:
        logger.error("Neo4j connectivity check failed: %s", e)
        await _driver.close()
        _driver = None
        raise

    return _driver


async def close_neo4j() -> None:
    """Close the global Neo4j driver gracefully."""
    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None
        logger.info("Neo4j driver closed")


def get_driver() -> AsyncDriver:
    """Return the current driver instance.

    Raises:
        RuntimeError: If the driver has not been initialised via init_neo4j().
    """
    if _driver is None:
        raise RuntimeError("Neo4j driver not initialised. Call init_neo4j() during startup.")
    return _driver


async def run_query(
    cypher: str,
    params: Optional[Dict[str, Any]] = None,
    database: str = "neo4j",
) -> List[Dict[str, Any]]:
    """Execute a Cypher query and return results as list of dicts.

    Args:
        cypher: Cypher query string.
        params: Query parameters.
        database: Target database name.

    Returns:
        List of record dicts.
    """
    driver = get_driver()
    async with driver.session(database=database) as session:
        result = await session.run(cypher, params or {})
        records = await result.data()
        return records


async def run_write(
    cypher: str,
    params: Optional[Dict[str, Any]] = None,
    database: str = "neo4j",
) -> None:
    """Execute a write transaction (CREATE, MERGE, DELETE).

    Args:
        cypher: Cypher write query.
        params: Query parameters.
        database: Target database name.
    """
    driver = get_driver()
    async with driver.session(database=database) as session:
        await session.run(cypher, params or {})


async def check_health() -> bool:
    """Test Neo4j connectivity.

    Returns:
        True if connected, False otherwise.
    """
    try:
        driver = get_driver()
        await driver.verify_connectivity()
        return True
    except Exception as e:
        logger.warning("Neo4j health check failed: %s", e)
        return False
