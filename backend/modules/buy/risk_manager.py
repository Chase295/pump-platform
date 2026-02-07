"""
RiskManager - The Gatekeeper

This is the security layer that checks ALL conditions before ANY trade is allowed.
Think of it as a bouncer at a club - no one gets in without passing all checks.

Checks:
1. trading_enabled - Master switch (manual block)
2. status - Wallet must be ACTIVE
3. consecutive_losses - Streak protection
4. daily_drawdown - Loss limit protection
5. network_fees - (Optional) Gas price check

Migrated from pump-buy/backend/app/services/risk_manager.py
"""

import logging
from typing import Optional
from dataclasses import dataclass

from backend.database import fetchrow, execute
from backend.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RiskCheckResult:
    """Result of a risk check."""
    allowed: bool
    reason: Optional[str] = None


class RiskManager:
    """
    The Gatekeeper - Security checks before any trade.

    Usage:
        result = await RiskManager.check_trade_allowed(wallet_id)
        if not result.allowed:
            return {"status": "blocked", "reason": result.reason}
    """

    @staticmethod
    async def check_trade_allowed(wallet_id) -> RiskCheckResult:
        """
        Main function: Run ALL security checks before allowing a trade.

        Args:
            wallet_id: UUID of the wallet

        Returns:
            RiskCheckResult with allowed=True or allowed=False with reason
        """

        # 1. Load wallet from database
        wallet = await fetchrow(
            """
            SELECT
                id, alias, type, status,
                trading_enabled, transfer_enabled,
                virtual_sol_balance, real_sol_balance,
                consecutive_losses, max_consecutive_losses,
                start_balance_day, max_daily_loss_pct
            FROM wallets
            WHERE id = $1
            """,
            wallet_id
        )

        if not wallet:
            return RiskCheckResult(
                allowed=False,
                reason=f"CRITICAL: Wallet ID {wallet_id} not found in database"
            )

        # ---------------------------------------------------------
        # CHECK 1: Master Switch (Manual Block)
        # ---------------------------------------------------------
        if wallet['trading_enabled'] is False:
            return RiskCheckResult(
                allowed=False,
                reason=f"MANUAL BLOCK: Trading is disabled for wallet {wallet['alias']}"
            )

        # ---------------------------------------------------------
        # CHECK 2: Wallet Status
        # ---------------------------------------------------------
        if wallet['status'] != 'ACTIVE':
            return RiskCheckResult(
                allowed=False,
                reason=f"STATUS BLOCK: Wallet status is {wallet['status']}"
            )

        # ---------------------------------------------------------
        # CHECK 3: Consecutive Losses (Streak Protection)
        # ---------------------------------------------------------
        if wallet['consecutive_losses'] >= wallet['max_consecutive_losses']:
            return RiskCheckResult(
                allowed=False,
                reason=f"STREAK BLOCK: Too many consecutive losses ({wallet['consecutive_losses']}/{wallet['max_consecutive_losses']})"
            )

        # ---------------------------------------------------------
        # CHECK 4: Daily Drawdown Limit
        # ---------------------------------------------------------
        # Determine which balance to check (TEST vs REAL)
        current_balance = (
            wallet['virtual_sol_balance']
            if wallet['type'] == 'TEST'
            else wallet['real_sol_balance']
        )

        start_balance = wallet['start_balance_day']
        max_loss_pct = wallet['max_daily_loss_pct']

        if start_balance is None or float(start_balance) <= 0:
            return RiskCheckResult(
                allowed=False,
                reason="DRAWDOWN BLOCK: start_balance_day not initialized. Run daily reset first."
            )

        # Calculate loss limit: start - (start * percent / 100)
        loss_limit = float(start_balance) * (1 - (float(max_loss_pct) / 100))

        if float(current_balance) < loss_limit:
            return RiskCheckResult(
                allowed=False,
                reason=f"DRAWDOWN BLOCK: Daily loss limit reached. Current: {current_balance:.4f} < Limit: {loss_limit:.4f}"
            )

        # ---------------------------------------------------------
        # CHECK 5: Network Congestion (Optional - for REAL mode)
        # ---------------------------------------------------------
        # TODO: Implement when REAL mode is added
        # This would check if gas fees are too high

        # ---------------------------------------------------------
        # ALL CHECKS PASSED
        # ---------------------------------------------------------
        return RiskCheckResult(allowed=True)

    @staticmethod
    async def check_transfer_allowed(wallet_id) -> RiskCheckResult:
        """
        Check if transfers are allowed for this wallet.

        Args:
            wallet_id: UUID of the wallet

        Returns:
            RiskCheckResult
        """
        wallet = await fetchrow(
            """
            SELECT id, alias, transfer_enabled, status
            FROM wallets
            WHERE id = $1
            """,
            wallet_id
        )

        if not wallet:
            return RiskCheckResult(
                allowed=False,
                reason=f"CRITICAL: Wallet ID {wallet_id} not found"
            )

        if wallet['transfer_enabled'] is False:
            return RiskCheckResult(
                allowed=False,
                reason=f"SECURITY BLOCK: Transfer is disabled for wallet {wallet['alias']}"
            )

        if wallet['status'] != 'ACTIVE':
            return RiskCheckResult(
                allowed=False,
                reason=f"STATUS BLOCK: Wallet status is {wallet['status']}"
            )

        return RiskCheckResult(allowed=True)

    @staticmethod
    async def update_metrics_after_trade(wallet_id, pnl_sol: float, conn=None) -> None:
        """
        Update wallet metrics after a trade (SELL).

        - If profit (pnl >= 0): Reset consecutive_losses to 0
        - If loss (pnl < 0): Increment consecutive_losses

        Args:
            wallet_id: UUID of the wallet
            pnl_sol: Profit/Loss in SOL (positive = profit, negative = loss)
            conn: Optional database connection (for use within a transaction)
        """
        if pnl_sol >= 0:
            # PROFIT: Reset streak
            if conn:
                await conn.execute(
                    """
                    UPDATE wallets
                    SET consecutive_losses = 0, updated_at = NOW()
                    WHERE id = $1
                    """,
                    wallet_id
                )
            else:
                await execute(
                    """
                    UPDATE wallets
                    SET consecutive_losses = 0, updated_at = NOW()
                    WHERE id = $1
                    """,
                    wallet_id
                )
            logger.info("RiskManager: Streak reset for wallet %s (Profit: %.6f SOL)", wallet_id, pnl_sol)
        else:
            # LOSS: Increment streak
            if conn:
                await conn.execute(
                    """
                    UPDATE wallets
                    SET consecutive_losses = consecutive_losses + 1, updated_at = NOW()
                    WHERE id = $1
                    """,
                    wallet_id
                )
            else:
                await execute(
                    """
                    UPDATE wallets
                    SET consecutive_losses = consecutive_losses + 1, updated_at = NOW()
                    WHERE id = $1
                    """,
                    wallet_id
                )
            logger.warning("RiskManager: Streak increased for wallet %s (Loss: %.6f SOL)", wallet_id, pnl_sol)

    @staticmethod
    async def check_balance_sufficient(
        wallet_id,
        amount_sol: float,
        include_fees: bool = True,
        jito_tip_lamports: int = 0
    ) -> RiskCheckResult:
        """
        Check if wallet has sufficient balance for a trade.

        Args:
            wallet_id: UUID of the wallet
            amount_sol: Amount to spend
            include_fees: Whether to include network fee + safety buffer
            jito_tip_lamports: Jito tip in lamports (included in total cost)

        Returns:
            RiskCheckResult
        """
        wallet = await fetchrow(
            """
            SELECT type, virtual_sol_balance, real_sol_balance
            FROM wallets
            WHERE id = $1
            """,
            wallet_id
        )

        if not wallet:
            return RiskCheckResult(
                allowed=False,
                reason=f"Wallet {wallet_id} not found"
            )

        current_balance = (
            wallet['virtual_sol_balance']
            if wallet['type'] == 'TEST'
            else wallet['real_sol_balance']
        )

        # Calculate total cost including jito tip
        jito_tip_sol = jito_tip_lamports / 1_000_000_000
        total_cost = amount_sol + jito_tip_sol
        if include_fees:
            total_cost += settings.NETWORK_FEE_SOL + settings.SAFETY_BUFFER_SOL

        if float(current_balance) < total_cost:
            return RiskCheckResult(
                allowed=False,
                reason=f"INSUFFICIENT FUNDS: Balance {current_balance:.6f} < Required {total_cost:.6f}"
            )

        return RiskCheckResult(allowed=True)
