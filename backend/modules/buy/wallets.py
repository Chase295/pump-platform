"""
Wallet management DB operations.

Extracted from pump-buy/backend/app/routers/api.py into standalone functions.
All wallet-related database queries for the Buy module.
"""

import logging
from typing import Optional, List, Dict, Any

from backend.database import fetch, fetchrow, fetchval, execute

logger = logging.getLogger(__name__)


async def list_wallets(
    wallet_type: Optional[str] = None,
    status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all wallets with optional filters.

    Args:
        wallet_type: Filter by type (TEST/REAL)
        status: Filter by status (ACTIVE/PAUSED/DRAINED/FROZEN)

    Returns:
        List of wallet dicts
    """
    query = "SELECT * FROM wallets WHERE 1=1"
    params = []

    if wallet_type:
        params.append(wallet_type)
        query += f" AND type = ${len(params)}"

    if status:
        params.append(status)
        query += f" AND status = ${len(params)}"

    query += " ORDER BY created_at DESC"

    rows = await fetch(query, *params)
    return [dict(r) for r in rows]


async def get_wallet(alias: str) -> Optional[Dict[str, Any]]:
    """
    Get a specific wallet by alias.

    Args:
        alias: Wallet alias

    Returns:
        Wallet dict or None
    """
    row = await fetchrow(
        "SELECT * FROM wallets WHERE alias = $1",
        alias
    )
    return dict(row) if row else None


async def get_wallet_by_id(wallet_id) -> Optional[Dict[str, Any]]:
    """
    Get a specific wallet by ID.

    Args:
        wallet_id: Wallet UUID

    Returns:
        Wallet dict or None
    """
    row = await fetchrow(
        "SELECT * FROM wallets WHERE id = $1",
        wallet_id
    )
    return dict(row) if row else None


async def create_wallet(
    alias: str,
    address: str,
    wallet_type: str,
    tag: Optional[str] = None,
    virtual_sol_balance: float = 10.0,
    virtual_loss_percent: float = 1.0,
    max_consecutive_losses: int = 3,
    max_daily_loss_pct: float = 15.0
) -> Dict[str, Any]:
    """
    Create a new wallet.

    Args:
        alias: Unique wallet alias
        address: Solana public key
        wallet_type: TEST or REAL
        tag: Optional strategy tag
        virtual_sol_balance: Initial virtual balance (TEST)
        virtual_loss_percent: Pain mode loss percent
        max_consecutive_losses: Max losses before block
        max_daily_loss_pct: Max daily loss percent

    Returns:
        Created wallet dict

    Raises:
        ValueError: If alias or address already exists
    """
    # Check if alias already exists
    existing = await fetchval(
        "SELECT id FROM wallets WHERE alias = $1",
        alias
    )
    if existing:
        raise ValueError(f"Wallet alias '{alias}' already exists")

    # Check if address already exists
    existing_addr = await fetchval(
        "SELECT id FROM wallets WHERE address = $1",
        address
    )
    if existing_addr:
        raise ValueError("Wallet address already registered")

    # Insert wallet
    wallet_id = await fetchval(
        """
        INSERT INTO wallets (
            alias, address, type, tag,
            virtual_sol_balance, start_balance_day,
            virtual_loss_percent, max_consecutive_losses, max_daily_loss_pct,
            enc_private_key
        ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, '')
        RETURNING id
        """,
        alias,
        address,
        wallet_type,
        tag,
        virtual_sol_balance,
        virtual_loss_percent,
        max_consecutive_losses,
        max_daily_loss_pct
    )

    row = await fetchrow("SELECT * FROM wallets WHERE id = $1", wallet_id)
    return dict(row)


async def update_wallet(
    alias: str,
    tag: Optional[str] = None,
    status: Optional[str] = None,
    virtual_loss_percent: Optional[float] = None,
    max_consecutive_losses: Optional[int] = None,
    max_daily_loss_pct: Optional[float] = None
) -> Optional[Dict[str, Any]]:
    """
    Update wallet settings.

    Args:
        alias: Wallet alias to update
        tag: New strategy tag
        status: New wallet status
        virtual_loss_percent: New pain mode loss percent
        max_consecutive_losses: New max losses before block
        max_daily_loss_pct: New max daily loss percent

    Returns:
        Updated wallet dict or None if not found

    Raises:
        ValueError: If no fields to update
    """
    # Check wallet exists
    wallet = await fetchrow(
        "SELECT * FROM wallets WHERE alias = $1",
        alias
    )

    if not wallet:
        return None

    # Build dynamic update query
    updates = []
    params = []
    param_idx = 1

    if tag is not None:
        params.append(tag)
        updates.append(f"tag = ${param_idx}")
        param_idx += 1

    if status is not None:
        params.append(status)
        updates.append(f"status = ${param_idx}")
        param_idx += 1

    if virtual_loss_percent is not None:
        params.append(virtual_loss_percent)
        updates.append(f"virtual_loss_percent = ${param_idx}")
        param_idx += 1

    if max_consecutive_losses is not None:
        params.append(max_consecutive_losses)
        updates.append(f"max_consecutive_losses = ${param_idx}")
        param_idx += 1

    if max_daily_loss_pct is not None:
        params.append(max_daily_loss_pct)
        updates.append(f"max_daily_loss_pct = ${param_idx}")
        param_idx += 1

    if not updates:
        raise ValueError("No fields to update")

    # Add alias as last param
    params.append(alias)

    query = f"""
        UPDATE wallets
        SET {', '.join(updates)}, updated_at = NOW()
        WHERE alias = ${param_idx}
    """

    await execute(query, *params)

    updated = await fetchrow("SELECT * FROM wallets WHERE alias = $1", alias)
    return dict(updated)


async def delete_wallet(alias: str) -> bool:
    """
    Delete a wallet and all associated data (positions, trades, transfers).

    Args:
        alias: Wallet alias to delete

    Returns:
        True if deleted

    Raises:
        ValueError: If wallet not found
        PermissionError: If wallet is REAL type
    """
    wallet = await fetchrow(
        "SELECT type FROM wallets WHERE alias = $1",
        alias
    )

    if not wallet:
        raise ValueError(f"Wallet '{alias}' not found")

    if wallet['type'] == 'REAL':
        raise PermissionError(
            "REAL wallets cannot be deleted. Change type to TEST first or contact admin."
        )

    await execute("DELETE FROM wallets WHERE alias = $1", alias)
    return True


async def toggle_trading(alias: str, enabled: bool) -> bool:
    """
    Enable or disable trading for a wallet.

    Args:
        alias: Wallet alias
        enabled: True to enable, False to disable

    Returns:
        True if updated

    Raises:
        ValueError: If wallet not found
    """
    result = await execute(
        "UPDATE wallets SET trading_enabled = $1, updated_at = NOW() WHERE alias = $2",
        enabled,
        alias
    )

    if result == "UPDATE 0":
        raise ValueError(f"Wallet '{alias}' not found")

    return True


async def toggle_transfer(alias: str, enabled: bool) -> bool:
    """
    Enable or disable transfers for a wallet.

    Args:
        alias: Wallet alias
        enabled: True to enable, False to disable

    Returns:
        True if updated

    Raises:
        ValueError: If wallet not found
    """
    result = await execute(
        "UPDATE wallets SET transfer_enabled = $1, updated_at = NOW() WHERE alias = $2",
        enabled,
        alias
    )

    if result == "UPDATE 0":
        raise ValueError(f"Wallet '{alias}' not found")

    return True


async def add_virtual_balance(alias: str, amount: float) -> float:
    """
    Add virtual balance to a TEST wallet.

    Args:
        alias: Wallet alias
        amount: Amount to add (must be > 0)

    Returns:
        New balance after addition

    Raises:
        ValueError: If wallet not found or not TEST type
    """
    wallet = await fetchrow(
        "SELECT type FROM wallets WHERE alias = $1",
        alias
    )

    if not wallet:
        raise ValueError(f"Wallet '{alias}' not found")

    if wallet['type'] != 'TEST':
        raise ValueError("Can only add virtual balance to TEST wallets")

    await execute(
        """
        UPDATE wallets
        SET virtual_sol_balance = virtual_sol_balance + $1, updated_at = NOW()
        WHERE alias = $2
        """,
        amount,
        alias
    )

    new_balance = await fetchval(
        "SELECT virtual_sol_balance FROM wallets WHERE alias = $1",
        alias
    )

    return float(new_balance)
