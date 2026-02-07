"""
Position tracking DB operations.

Extracted from pump-buy's trading.py and api.py into standalone functions.
All position-related database queries for the Buy module.
"""

import logging
from typing import Optional, List, Dict, Any

from backend.database import fetch, fetchrow

logger = logging.getLogger(__name__)


async def get_positions(
    wallet_alias: Optional[str] = None,
    status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all positions with optional filters.

    Args:
        wallet_alias: Filter by wallet alias
        status: Filter by status (OPEN/CLOSED)

    Returns:
        List of position dicts
    """
    query = """
        SELECT p.* FROM positions p
        JOIN wallets w ON p.wallet_id = w.id
        WHERE 1=1
    """
    params = []

    if wallet_alias:
        params.append(wallet_alias)
        query += f" AND w.alias = ${len(params)}"

    if status:
        params.append(status)
        query += f" AND p.status = ${len(params)}"

    query += " ORDER BY p.created_at DESC"

    rows = await fetch(query, *params)
    return [dict(r) for r in rows]


async def get_position(wallet_alias: str, mint: str) -> Optional[Dict[str, Any]]:
    """
    Get a specific open position for a wallet and mint.

    Args:
        wallet_alias: Wallet alias
        mint: Token mint address

    Returns:
        Position dict or None
    """
    row = await fetchrow(
        """
        SELECT p.*, w.alias as wallet_alias
        FROM positions p
        JOIN wallets w ON p.wallet_id = w.id
        WHERE w.alias = $1 AND p.mint = $2 AND p.status = 'OPEN'
        """,
        wallet_alias,
        mint
    )

    return dict(row) if row else None


async def get_open_positions(wallet_alias: str) -> List[Dict[str, Any]]:
    """
    Get all open positions for a wallet.

    Args:
        wallet_alias: Wallet alias

    Returns:
        List of open position dicts
    """
    rows = await fetch(
        """
        SELECT p.*
        FROM positions p
        JOIN wallets w ON p.wallet_id = w.id
        WHERE w.alias = $1 AND p.status = 'OPEN'
        """,
        wallet_alias
    )

    return [dict(r) for r in rows]


async def get_position_by_wallet_and_mint(
    wallet_id,
    mint: str,
    conn=None
) -> Optional[Dict[str, Any]]:
    """
    Get an open position by wallet ID and mint (used within transactions).

    Args:
        wallet_id: Wallet UUID
        mint: Token mint address
        conn: Optional database connection (for use within a transaction)

    Returns:
        Position dict or None
    """
    if conn:
        row = await conn.fetchrow(
            """
            SELECT id, tokens_held, initial_sol_spent
            FROM positions
            WHERE wallet_id = $1 AND mint = $2 AND status = 'OPEN'
            """,
            wallet_id,
            mint
        )
    else:
        row = await fetchrow(
            """
            SELECT id, tokens_held, initial_sol_spent
            FROM positions
            WHERE wallet_id = $1 AND mint = $2 AND status = 'OPEN'
            """,
            wallet_id,
            mint
        )

    return dict(row) if row else None
