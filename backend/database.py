"""
Unified Database Connection Pool for Pump Platform

Single asyncpg connection pool shared by all service modules (find, training, server, buy).
Replaces 4 separate connection pools with 1 shared pool.

Usage:
    from backend.database import init_pool, close_pool, fetch, fetchrow, fetchval, execute

    # At startup
    await init_pool("postgresql://user:pass@host:5432/db")

    # Query helpers
    rows = await fetch("SELECT * FROM coins WHERE phase = $1", 1)
    row = await fetchrow("SELECT * FROM coins WHERE mint = $1", mint)
    count = await fetchval("SELECT COUNT(*) FROM coins")
    await execute("INSERT INTO coins (mint) VALUES ($1)", mint)

    # Transactions
    async with transaction() as conn:
        await conn.execute("UPDATE wallets SET balance = balance - $1 WHERE id = $2", amount, wallet_id)
        await conn.execute("INSERT INTO trades (wallet_id, amount) VALUES ($1, $2)", wallet_id, amount)

    # At shutdown
    await close_pool()
"""

import asyncpg
import logging
from contextlib import asynccontextmanager
from typing import Optional, List, Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global connection pool
# ---------------------------------------------------------------------------

_pool: Optional[asyncpg.Pool] = None


async def init_pool(
    dsn: str,
    min_size: int = 2,
    max_size: int = 10,
    command_timeout: int = 60,
) -> asyncpg.Pool:
    """Create the global asyncpg connection pool.

    Args:
        dsn: PostgreSQL connection string.
        min_size: Minimum number of connections in the pool.
        max_size: Maximum number of connections in the pool.
        command_timeout: Default timeout for commands in seconds.

    Returns:
        The created asyncpg.Pool instance.

    Raises:
        RuntimeError: If the pool is already initialised.
        Exception: If the connection to the database fails.
    """
    global _pool
    if _pool is not None:
        raise RuntimeError("Database pool is already initialised. Call close_pool() first.")

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=min_size,
        max_size=max_size,
        command_timeout=command_timeout,
    )

    # Mask password in log output
    safe_dsn = dsn.split("@")[1] if "@" in dsn else "localhost"
    logger.info("Database pool created (min=%d, max=%d) -> %s", min_size, max_size, safe_dsn)
    return _pool


async def close_pool() -> None:
    """Close the global connection pool gracefully."""
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
        logger.info("Database pool closed")


def get_pool() -> asyncpg.Pool:
    """Return the current pool instance.

    Raises:
        RuntimeError: If the pool has not been initialised via ``init_pool()``.
    """
    if _pool is None:
        raise RuntimeError(
            "Database pool is not initialised. Call init_pool() during application startup."
        )
    return _pool


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

async def fetch(query: str, *args: Any) -> List[asyncpg.Record]:
    """Execute a SELECT and return multiple rows."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> Optional[asyncpg.Record]:
    """Execute a SELECT and return a single row (or None)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchrow(query, *args)


async def fetchval(query: str, *args: Any) -> Any:
    """Execute a SELECT and return a single scalar value."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.fetchval(query, *args)


async def execute(query: str, *args: Any) -> str:
    """Execute an INSERT / UPDATE / DELETE and return the command status string."""
    pool = get_pool()
    async with pool.acquire() as conn:
        return await conn.execute(query, *args)


async def execute_many(query: str, args_list: List[tuple]) -> None:
    """Execute a query multiple times with different argument tuples (batch operation)."""
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.executemany(query, args_list)


# ---------------------------------------------------------------------------
# Transaction context manager
# ---------------------------------------------------------------------------

@asynccontextmanager
async def transaction():
    """Acquire a connection wrapped in a PostgreSQL transaction.

    Usage::

        async with transaction() as conn:
            await conn.execute("UPDATE ...", ...)
            await conn.execute("INSERT ...", ...)

    If the block exits normally the transaction is committed.
    If an exception is raised the transaction is rolled back.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            yield conn


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

async def check_health() -> bool:
    """Test the database connection with a simple query.

    Returns:
        True if the database responds correctly, False otherwise.
    """
    try:
        pool = get_pool()
        result = await pool.fetchval("SELECT 1")
        return result == 1
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc)
        return False
