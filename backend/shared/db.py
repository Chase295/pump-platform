"""
Convenience re-exports from the unified database module.

Allows service modules to write:

    from backend.shared.db import fetch, fetchrow, execute
"""

from backend.database import (
    init_pool,
    close_pool,
    get_pool,
    fetch,
    fetchrow,
    fetchval,
    execute,
    execute_many,
    transaction,
    check_health,
)

__all__ = [
    "init_pool",
    "close_pool",
    "get_pool",
    "fetch",
    "fetchrow",
    "fetchval",
    "execute",
    "execute_many",
    "transaction",
    "check_health",
]
