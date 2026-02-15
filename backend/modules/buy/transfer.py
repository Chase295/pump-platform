"""
TransferService - SOL Transfer Logic

Handles transfers between wallets (sweeping to vault, etc.)
Currently: TEST mode fully implemented, REAL mode stubbed.

Migrated from pump-buy/backend/app/services/transfer.py
"""

import uuid
import logging
from datetime import datetime
from typing import Dict, Any
from decimal import Decimal

from backend.database import fetch, fetchrow, fetchval, transaction
from backend.config import settings
from backend.modules.buy.risk_manager import RiskManager

logger = logging.getLogger(__name__)


class TransferService:
    """
    Transfer service for moving SOL between wallets.

    TEST mode: Full simulation
    REAL mode: Stubbed - raises NotImplementedError
    """

    @staticmethod
    async def execute_transfer(
        wallet_alias: str,
        to_address: str,
        amount_sol: float,
        force_sweep: bool = False
    ) -> Dict[str, Any]:
        """
        Execute a SOL transfer.

        Args:
            wallet_alias: Source wallet alias
            to_address: Destination address (doesn't need to be in DB)
            amount_sol: Amount to transfer (ignored if force_sweep=True)
            force_sweep: If True, send all available balance minus fees

        Returns:
            Dict with status, signature, and transfer data
        """
        # 1. Load wallet
        wallet = await fetchrow(
            "SELECT * FROM wallets WHERE alias = $1",
            wallet_alias
        )

        if not wallet:
            return {
                "status": "error",
                "code": "WALLET_NOT_FOUND",
                "message": f"Wallet '{wallet_alias}' not found"
            }

        wallet_id = wallet['id']

        # 2. Security check - transfer_enabled
        transfer_check = await RiskManager.check_transfer_allowed(wallet_id)
        if not transfer_check.allowed:
            return {
                "status": "error",
                "code": "SECURITY_BLOCK",
                "message": transfer_check.reason
            }

        # 3. Calculate amount and check balance
        network_fee = settings.NETWORK_FEE_SOL
        safety_buffer = settings.SAFETY_BUFFER_SOL

        current_balance = (
            float(wallet['virtual_sol_balance'])
            if wallet['type'] == 'TEST'
            else float(wallet['real_sol_balance'])
        )

        # Available = Balance - Network Fee - Safety Buffer
        available = current_balance - network_fee - safety_buffer

        if force_sweep:
            amount_sol = max(0, available)

        if amount_sol <= 0:
            return {
                "status": "error",
                "code": "INVALID_AMOUNT",
                "message": "Amount must be greater than 0"
            }

        if amount_sol > available:
            return {
                "status": "error",
                "code": "INSUFFICIENT_FUNDS",
                "message": f"Insufficient funds. Available: {available:.6f} SOL, Requested: {amount_sol:.6f} SOL"
            }

        # 4. Route to TEST or REAL execution
        if wallet['type'] == 'TEST':
            return await TransferService._simulate_transfer(
                wallet=wallet,
                to_address=to_address,
                amount_sol=amount_sol,
                network_fee=network_fee
            )
        else:
            return {
                "status": "error",
                "code": "NOT_IMPLEMENTED",
                "message": "REAL transfers not yet implemented. Use TEST wallets."
            }

    @staticmethod
    async def _simulate_transfer(
        wallet: dict,
        to_address: str,
        amount_sol: float,
        network_fee: float
    ) -> Dict[str, Any]:
        """
        Simulate a transfer (TEST mode).
        """
        total_deduction = amount_sol + network_fee

        # Generate simulation signature
        tx_signature = f"SIM-TRANSFER-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"

        # Database transaction with row-level locking
        async with transaction() as conn:
            # 1. Lock wallet row and re-check balance
            locked_wallet = await conn.fetchrow(
                "SELECT * FROM wallets WHERE id = $1 FOR UPDATE",
                wallet['id']
            )
            if not locked_wallet:
                return {
                    "status": "error",
                    "code": "WALLET_NOT_FOUND",
                    "message": "Wallet disappeared during transaction"
                }

            current_balance = float(locked_wallet['virtual_sol_balance'])
            if current_balance < total_deduction:
                return {
                    "status": "error",
                    "code": "INSUFFICIENT_FUNDS",
                    "message": f"Insufficient funds. Available: {current_balance:.6f} SOL, Required: {total_deduction:.6f} SOL"
                }

            # 2. Deduct from sender
            await conn.execute(
                """
                UPDATE wallets
                SET virtual_sol_balance = virtual_sol_balance - $1,
                    updated_at = NOW()
                WHERE id = $2
                """,
                Decimal(str(total_deduction)),
                wallet['id']
            )

            # 4. Check if recipient is in our database
            recipient_wallet = await conn.fetchrow(
                "SELECT id, type FROM wallets WHERE address = $1",
                to_address
            )

            if recipient_wallet and recipient_wallet['type'] == 'TEST':
                # Add to recipient's virtual balance
                await conn.execute(
                    """
                    UPDATE wallets
                    SET virtual_sol_balance = virtual_sol_balance + $1,
                        updated_at = NOW()
                    WHERE id = $2
                    """,
                    Decimal(str(amount_sol)),
                    recipient_wallet['id']
                )

            # 5. Create transfer log
            await conn.execute(
                """
                INSERT INTO transfer_logs (
                    from_wallet_id, to_address, amount_sol,
                    tx_signature, status, is_simulation
                ) VALUES ($1, $2, $3, $4, 'SUCCESS', TRUE)
                """,
                wallet['id'],
                to_address,
                Decimal(str(amount_sol)),
                tx_signature
            )

        # Get updated balance
        new_balance = await fetchval(
            "SELECT virtual_sol_balance FROM wallets WHERE id = $1",
            wallet['id']
        )

        return {
            "status": "success",
            "action": "transfer",
            "data": {
                "tx_signature": tx_signature,
                "from": wallet['alias'],
                "to": to_address,
                "amount_sent": round(amount_sol, 9),
                "fee_paid": round(network_fee, 9),
                "wallet_balance_new": float(new_balance),
                "is_simulation": True
            }
        }

    @staticmethod
    async def get_transfer_history(
        wallet_alias: str,
        limit: int = 50
    ) -> list:
        """Get transfer history for a wallet."""
        transfers = await fetch(
            """
            SELECT t.*, w.alias as from_alias
            FROM transfer_logs t
            JOIN wallets w ON t.from_wallet_id = w.id
            WHERE w.alias = $1
            ORDER BY t.created_at DESC
            LIMIT $2
            """,
            wallet_alias,
            limit
        )

        return [dict(t) for t in transfers]
