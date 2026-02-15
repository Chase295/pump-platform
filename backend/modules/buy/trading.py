"""
TradingService - Buy and Sell Logic

Handles both TEST (simulation) and REAL (blockchain) execution.
Currently: TEST mode fully implemented, REAL mode stubbed.

The "Pain Mode" adds artificial losses to TEST trades to stress-test strategies.

Migrated from pump-buy/backend/app/services/trading.py
"""

import uuid
import logging
from datetime import datetime
from typing import Optional, Dict, Any
from decimal import Decimal

from backend.database import fetchrow, fetchval, transaction
from backend.config import settings
from backend.modules.buy.risk_manager import RiskManager
from backend.modules.buy.jupiter_client import jupiter_client, JupiterQuoteError, LAMPORTS_PER_SOL

logger = logging.getLogger(__name__)


class TradingService:
    """
    Trading service for buy/sell operations.

    TEST mode: Full simulation with "Pain Mode" loss factor
    REAL mode: Stubbed - raises NotImplementedError
    """

    # =================================================================
    # BUY OPERATIONS
    # =================================================================

    @staticmethod
    async def execute_buy(
        wallet_alias: str,
        mint: str,
        amount_sol: float,
        slippage_bps: int = 100,
        use_jito: bool = True,
        jito_tip_lamports: int = 50000
    ) -> Dict[str, Any]:
        """
        Execute a buy order.

        Args:
            wallet_alias: Wallet alias (e.g., "worker_bot_01")
            mint: Token mint address
            amount_sol: Amount of SOL to spend
            slippage_bps: Slippage tolerance in basis points (100 = 1%)
            use_jito: Whether to use Jito bundles (REAL mode)
            jito_tip_lamports: Jito tip amount in lamports

        Returns:
            Dict with status, signature, and trade data
        """
        # 1. Load wallet (initial read for risk checks -- re-read with lock inside transaction)
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

        # 2. Risk Manager checks (safe outside transaction -- not balance-dependent)
        risk_check = await RiskManager.check_trade_allowed(wallet_id)
        if not risk_check.allowed:
            return {
                "status": "blocked",
                "code": "RISK_BLOCK",
                "message": risk_check.reason
            }

        # 3. Balance check moved inside transaction (see _simulate_buy)

        # 4. Route to TEST or REAL execution
        if wallet['type'] == 'TEST':
            return await TradingService._simulate_buy(
                wallet=wallet,
                mint=mint,
                amount_sol=amount_sol,
                slippage_bps=slippage_bps,
                jito_tip_lamports=jito_tip_lamports
            )
        else:
            # REAL mode - not yet implemented
            return {
                "status": "error",
                "code": "NOT_IMPLEMENTED",
                "message": "REAL trading not yet implemented. Use TEST wallets."
            }

    @staticmethod
    async def _simulate_buy(
        wallet: dict,
        mint: str,
        amount_sol: float,
        slippage_bps: int,
        jito_tip_lamports: int
    ) -> Dict[str, Any]:
        """
        Simulate a buy order (TEST mode).

        Applies "Pain Mode" - artificial loss to simulate real-world conditions:
        - Slippage
        - virtual_loss_percent (extra loss factor)
        """
        network_fee = settings.NETWORK_FEE_SOL
        jito_tip_sol = jito_tip_lamports / 1_000_000_000

        # Calculate total cost
        total_cost = amount_sol + jito_tip_sol + network_fee

        # Get real market quote from Jupiter (includes real price impact/slippage)
        try:
            quote = await jupiter_client.get_buy_quote(mint, amount_sol, slippage_bps)
        except JupiterQuoteError as e:
            return {
                "status": "error",
                "code": "JUPITER_QUOTE_FAILED",
                "message": str(e)
            }

        tokens_from_jupiter = quote.out_amount  # in token's smallest unit
        price_impact_bps = int(quote.price_impact_pct * 100)

        # Apply "Pain Mode" - virtual loss percent (on top of real market price)
        virtual_loss_pct = float(wallet['virtual_loss_percent'] or 0)
        pain_factor = 1 - (virtual_loss_pct / 100)
        tokens_received = tokens_from_jupiter * pain_factor

        # Calculate effective entry price (includes all costs: amount + jito + network fee)
        entry_price = total_cost / tokens_received if tokens_received > 0 else 0

        # Generate simulation signature
        tx_signature = f"SIM-BUY-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"

        # Database transaction with row-level locking to prevent double-spend
        async with transaction() as conn:
            # 1. Lock wallet row and re-read balance
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

            # Balance check inside transaction (prevents race condition)
            if locked_wallet['virtual_sol_balance'] < Decimal(str(total_cost)):
                return {
                    "status": "error",
                    "code": "INSUFFICIENT_FUNDS",
                    "message": f"Insufficient funds. Available: {float(locked_wallet['virtual_sol_balance']):.6f} SOL, Required: {total_cost:.6f} SOL"
                }

            # 2. Deduct balance
            await conn.execute(
                """
                UPDATE wallets
                SET virtual_sol_balance = virtual_sol_balance - $1,
                    updated_at = NOW()
                WHERE id = $2
                """,
                Decimal(str(total_cost)),
                wallet['id']
            )

            # 3. Create or update position
            existing_position = await conn.fetchrow(
                """
                SELECT id, tokens_held, initial_sol_spent
                FROM positions
                WHERE wallet_id = $1 AND mint = $2 AND status = 'OPEN'
                """,
                wallet['id'],
                mint
            )

            if existing_position:
                # Add to existing position (initial_sol_spent includes all costs)
                new_tokens = float(existing_position['tokens_held']) + tokens_received
                new_cost = float(existing_position['initial_sol_spent']) + total_cost
                new_entry_price = new_cost / new_tokens if new_tokens > 0 else 0

                await conn.execute(
                    """
                    UPDATE positions
                    SET tokens_held = $1, entry_price = $2, initial_sol_spent = $3
                    WHERE id = $4
                    """,
                    Decimal(str(new_tokens)),
                    Decimal(str(new_entry_price)),
                    Decimal(str(new_cost)),
                    existing_position['id']
                )
                position_id = existing_position['id']
            else:
                # Create new position
                position_id = await conn.fetchval(
                    """
                    INSERT INTO positions (wallet_id, mint, status, tokens_held, entry_price, initial_sol_spent)
                    VALUES ($1, $2, 'OPEN', $3, $4, $5)
                    RETURNING id
                    """,
                    wallet['id'],
                    mint,
                    Decimal(str(tokens_received)),
                    Decimal(str(entry_price)),
                    Decimal(str(total_cost))
                )

            # 4. Create trade log
            await conn.execute(
                """
                INSERT INTO trade_logs (
                    wallet_id, position_id, action, mint,
                    amount_sol, amount_tokens, price_impact_bps,
                    jito_tip_lamports, network_fee_sol,
                    tx_signature, is_simulation, status
                ) VALUES ($1, $2, 'BUY', $3, $4, $5, $6, $7, $8, $9, TRUE, 'SUCCESS')
                """,
                wallet['id'],
                position_id,
                mint,
                Decimal(str(amount_sol)),
                Decimal(str(tokens_received)),
                price_impact_bps,
                jito_tip_lamports,
                Decimal(str(network_fee)),
                tx_signature
            )

        # Get updated balance
        new_balance = await fetchval(
            "SELECT virtual_sol_balance FROM wallets WHERE id = $1",
            wallet['id']
        )

        return {
            "status": "success",
            "signature": tx_signature,
            "data": {
                "mint": mint,
                "action": "buy",
                "sol_spent_total": round(total_cost, 9),
                "tokens_received": round(tokens_received, 6),
                "entry_price": round(entry_price, 9),
                "price_impact_bps": price_impact_bps,
                "applied_loss_pct": virtual_loss_pct,
                "wallet_balance_new": float(new_balance),
                "is_simulation": True
            }
        }

    # =================================================================
    # SELL OPERATIONS
    # =================================================================

    @staticmethod
    async def execute_sell(
        wallet_alias: str,
        mint: str,
        amount_pct: float = 100.0,
        slippage_bps: int = 100,
        use_jito: bool = True,
        jito_tip_lamports: int = 50000
    ) -> Dict[str, Any]:
        """
        Execute a sell order.

        Args:
            wallet_alias: Wallet alias
            mint: Token mint address
            amount_pct: Percentage of holdings to sell (1-100)
            slippage_bps: Slippage tolerance in basis points
            use_jito: Whether to use Jito bundles (REAL mode)
            jito_tip_lamports: Jito tip amount in lamports

        Returns:
            Dict with status, signature, and trade data
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

        # 2. Risk Manager check (basic - not full trade check for sells)
        if wallet['trading_enabled'] is False:
            return {
                "status": "blocked",
                "code": "TRADING_DISABLED",
                "message": f"Trading is disabled for wallet {wallet_alias}"
            }

        # FROZEN wallets cannot sell (PAUSED/DRAINED may still close positions)
        if wallet['status'] == 'FROZEN':
            return {
                "status": "blocked",
                "code": "WALLET_FROZEN",
                "message": f"Wallet {wallet_alias} is FROZEN. Sells are blocked."
            }

        # 3. Load position
        position = await fetchrow(
            """
            SELECT * FROM positions
            WHERE wallet_id = $1 AND mint = $2 AND status = 'OPEN'
            """,
            wallet['id'],
            mint
        )

        if not position:
            return {
                "status": "error",
                "code": "NO_POSITION",
                "message": f"No open position found for mint {mint}"
            }

        # 4. Route to TEST or REAL execution
        if wallet['type'] == 'TEST':
            return await TradingService._simulate_sell(
                wallet=wallet,
                position=position,
                amount_pct=amount_pct,
                slippage_bps=slippage_bps,
                jito_tip_lamports=jito_tip_lamports
            )
        else:
            return {
                "status": "error",
                "code": "NOT_IMPLEMENTED",
                "message": "REAL trading not yet implemented. Use TEST wallets."
            }

    @staticmethod
    async def _simulate_sell(
        wallet: dict,
        position: dict,
        amount_pct: float,
        slippage_bps: int,
        jito_tip_lamports: int
    ) -> Dict[str, Any]:
        """
        Simulate a sell order (TEST mode).

        Applies "Pain Mode" to the sell as well.
        """
        network_fee = settings.NETWORK_FEE_SOL
        jito_tip_sol = jito_tip_lamports / 1_000_000_000

        # Calculate tokens to sell
        total_tokens = float(position['tokens_held'])
        tokens_to_sell = total_tokens * (amount_pct / 100)

        if tokens_to_sell <= 0:
            return {
                "status": "error",
                "code": "INVALID_AMOUNT",
                "message": "No tokens to sell"
            }

        # Get real market quote from Jupiter (includes real price impact/slippage)
        try:
            quote = await jupiter_client.get_sell_quote(
                position['mint'], int(tokens_to_sell), slippage_bps
            )
        except JupiterQuoteError as e:
            return {
                "status": "error",
                "code": "JUPITER_QUOTE_FAILED",
                "message": str(e)
            }

        sol_from_jupiter = quote.out_amount / LAMPORTS_PER_SOL  # lamports -> SOL
        price_impact_bps = int(quote.price_impact_pct * 100)

        # Apply "Pain Mode" (on top of real market price)
        virtual_loss_pct = float(wallet['virtual_loss_percent'] or 0)
        pain_factor = 1 - (virtual_loss_pct / 100)
        sol_before_fees = sol_from_jupiter * pain_factor

        # Deduct fees (clamp to 0 to prevent negative proceeds)
        sol_received_net = max(0, sol_before_fees - jito_tip_sol - network_fee)

        # Calculate exit price and PnL
        exit_price = sol_before_fees / tokens_to_sell if tokens_to_sell > 0 else 0
        entry_price = float(position['entry_price'])

        # Calculate PnL for the portion sold
        cost_basis = tokens_to_sell * entry_price
        pnl = sol_received_net - cost_basis

        # Generate simulation signature
        tx_signature = f"SIM-SELL-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:8]}"

        # Determine if position should be closed
        remaining_tokens = total_tokens - tokens_to_sell
        close_position = remaining_tokens < 0.000001  # Essentially zero

        # Database transaction with row-level locking
        async with transaction() as conn:
            # 1. Lock wallet row to prevent concurrent modifications
            await conn.fetchrow(
                "SELECT id FROM wallets WHERE id = $1 FOR UPDATE",
                wallet['id']
            )

            # 2. Add balance
            await conn.execute(
                """
                UPDATE wallets
                SET virtual_sol_balance = virtual_sol_balance + $1,
                    updated_at = NOW()
                WHERE id = $2
                """,
                Decimal(str(sol_received_net)),
                wallet['id']
            )

            # 3. Update or close position
            if close_position:
                await conn.execute(
                    """
                    UPDATE positions
                    SET status = 'CLOSED', tokens_held = 0, closed_at = NOW()
                    WHERE id = $1
                    """,
                    position['id']
                )
            else:
                # Reduce initial_sol_spent proportionally to tokens sold
                sell_ratio = tokens_to_sell / total_tokens
                remaining_cost = float(position['initial_sol_spent']) * (1 - sell_ratio)
                await conn.execute(
                    """
                    UPDATE positions
                    SET tokens_held = $1, initial_sol_spent = $2
                    WHERE id = $3
                    """,
                    Decimal(str(remaining_tokens)),
                    Decimal(str(remaining_cost)),
                    position['id']
                )

            # 4. Create trade log
            await conn.execute(
                """
                INSERT INTO trade_logs (
                    wallet_id, position_id, action, mint,
                    amount_sol, amount_tokens, price_impact_bps,
                    jito_tip_lamports, network_fee_sol,
                    tx_signature, is_simulation, status
                ) VALUES ($1, $2, 'SELL', $3, $4, $5, $6, $7, $8, $9, TRUE, 'SUCCESS')
                """,
                wallet['id'],
                position['id'],
                position['mint'],
                Decimal(str(sol_received_net)),
                Decimal(str(tokens_to_sell)),
                price_impact_bps,
                jito_tip_lamports,
                Decimal(str(network_fee)),
                tx_signature
            )

            # 5. Update risk metrics (inside transaction for atomicity)
            await RiskManager.update_metrics_after_trade(wallet['id'], pnl, conn=conn)

        # Get updated balance
        new_balance = await fetchval(
            "SELECT virtual_sol_balance FROM wallets WHERE id = $1",
            wallet['id']
        )

        return {
            "status": "success",
            "signature": tx_signature,
            "data": {
                "mint": position['mint'],
                "action": "sell",
                "tokens_sold": round(tokens_to_sell, 6),
                "sol_received_net": round(sol_received_net, 9),
                "exit_price": round(exit_price, 9),
                "entry_price": round(entry_price, 9),
                "pnl_sol": round(pnl, 9),
                "position_closed": close_position,
                "wallet_balance_new": float(new_balance),
                "is_simulation": True
            }
        }

    # =================================================================
    # SELL ALL POSITIONS
    # =================================================================

    @staticmethod
    async def sell_all_positions(
        wallet_alias: str,
        slippage_bps: int = 100,
        use_jito: bool = True,
        jito_tip_lamports: int = 50000
    ) -> Dict[str, Any]:
        """
        Sell 100% of all open positions for a wallet.

        Returns a summary with results per position.
        """
        from backend.modules.buy.positions import get_open_positions

        positions = await get_open_positions(wallet_alias)

        if not positions:
            return {
                "status": "success",
                "message": "No open positions to sell",
                "results": [],
                "summary": {"total": 0, "sold": 0, "failed": 0}
            }

        results = []
        sold = 0
        failed = 0

        for pos in positions:
            result = await TradingService.execute_sell(
                wallet_alias=wallet_alias,
                mint=pos['mint'],
                amount_pct=100.0,
                slippage_bps=slippage_bps,
                use_jito=use_jito,
                jito_tip_lamports=jito_tip_lamports,
            )
            results.append({
                "mint": pos['mint'],
                **result
            })
            if result['status'] == 'success':
                sold += 1
            else:
                failed += 1

        return {
            "status": "success" if failed == 0 else "partial",
            "results": results,
            "summary": {
                "total": len(positions),
                "sold": sold,
                "failed": failed
            }
        }
