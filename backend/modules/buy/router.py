"""
Buy Module Router - FastAPI endpoints for trading operations.

All endpoints are prefixed with /api/buy (set via APIRouter prefix).

Migrated from pump-buy/backend/app/routers/api.py
Route mapping:
    GET  /api/health                               -> SKIPPED (global)
    GET  /api/wallets                              -> GET  /api/buy/wallets
    GET  /api/wallets/{alias}                      -> GET  /api/buy/wallets/{alias}
    POST /api/wallets                              -> POST /api/buy/wallets
    PATCH /api/wallets/{alias}                     -> PATCH /api/buy/wallets/{alias}
    DELETE /api/wallets/{alias}                    -> DELETE /api/buy/wallets/{alias}
    PATCH /api/wallets/{alias}/toggle-trading      -> PATCH /api/buy/wallets/{alias}/toggle-trading
    PATCH /api/wallets/{alias}/toggle-transfer     -> PATCH /api/buy/wallets/{alias}/toggle-transfer
    PATCH /api/wallets/{alias}/add-balance         -> PATCH /api/buy/wallets/{alias}/add-balance
    POST /api/buy                                  -> POST /api/buy/execute-buy
    POST /api/sell                                 -> POST /api/buy/execute-sell
    POST /api/sell-all                             -> POST /api/buy/sell-all
    POST /api/transfer                             -> POST /api/buy/transfer
    GET  /api/positions                            -> GET  /api/buy/positions
    GET  /api/positions/{wallet_alias}/{mint}       -> GET  /api/buy/positions/{wallet_alias}/{mint}
    GET  /api/trades                               -> GET  /api/buy/trades
    GET  /api/transfers                            -> GET  /api/buy/transfers
    GET  /api/dashboard/stats                      -> GET  /api/buy/dashboard/stats
    GET  /api/dashboard/performance                -> GET  /api/buy/dashboard/performance
"""

from typing import List, Optional
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from backend.database import fetch, fetchrow, fetchval
from backend.modules.buy.schemas import (
    BuyRequest,
    SellRequest,
    SellAllRequest,
    TransferRequest,
    WalletCreate,
    WalletUpdate,
    WalletResponse,
    TradeResponse,
    TransferResponse,
    PositionResponse,
    TradeLogResponse,
    DashboardStats,
    WalletPerformanceResponse,
)
from backend.modules.buy.trading import TradingService
from backend.modules.buy.transfer import TransferService
from backend.modules.buy import wallets as wallet_ops
from backend.modules.buy import positions as position_ops


router = APIRouter(prefix="/api/buy", tags=["buy"])


# =================================================================
# HEALTH ENDPOINT
# =================================================================

@router.get("/health")
async def health_check():
    """Health check for the buy module."""
    try:
        row = await fetchrow("SELECT 1 AS ok")
        db_ok = row is not None
    except Exception:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "degraded",
        "db_connected": db_ok,
        "module": "buy",
    }


# =================================================================
# TRADING ENDPOINTS
# =================================================================

@router.post("/execute-buy", response_model=TradeResponse)
async def execute_buy(request: BuyRequest):
    """
    Execute a buy order.

    - TEST wallet: Simulates the trade with "Pain Mode"
    - REAL wallet: Returns "Not implemented" (for now)
    """
    result = await TradingService.execute_buy(
        wallet_alias=request.wallet_alias,
        mint=request.mint,
        amount_sol=request.amount_sol,
        slippage_bps=request.slippage_bps,
        use_jito=request.use_jito,
        jito_tip_lamports=request.jito_tip_lamports
    )
    return result


@router.post("/execute-sell", response_model=TradeResponse)
async def execute_sell(request: SellRequest):
    """
    Execute a sell order.

    - TEST wallet: Simulates the trade with "Pain Mode"
    - REAL wallet: Returns "Not implemented" (for now)
    """
    result = await TradingService.execute_sell(
        wallet_alias=request.wallet_alias,
        mint=request.mint,
        amount_pct=request.amount_pct,
        slippage_bps=request.slippage_bps,
        use_jito=request.use_jito,
        jito_tip_lamports=request.jito_tip_lamports
    )
    return result


@router.post("/sell-all")
async def sell_all_positions(request: SellAllRequest):
    """
    Sell 100% of ALL open positions for a wallet.

    Returns results per position and a summary.

    Example:
        POST /api/buy/sell-all {"wallet_alias": "worker_bot_01"}
    """
    result = await TradingService.sell_all_positions(
        wallet_alias=request.wallet_alias,
        slippage_bps=request.slippage_bps,
        use_jito=request.use_jito,
        jito_tip_lamports=request.jito_tip_lamports,
    )
    return result


@router.post("/transfer", response_model=TransferResponse)
async def execute_transfer(request: TransferRequest):
    """
    Execute a SOL transfer.

    - TEST wallet: Simulates the transfer
    - REAL wallet: Returns "Not implemented" (for now)
    """
    result = await TransferService.execute_transfer(
        wallet_alias=request.wallet_alias,
        to_address=request.to_address,
        amount_sol=request.amount_sol,
        force_sweep=request.force_sweep
    )
    return result


# =================================================================
# WALLET ENDPOINTS
# =================================================================

@router.get("/wallets", response_model=List[WalletResponse])
async def get_wallets(
    type: Optional[str] = Query(None, description="Filter by type (TEST/REAL)"),
    status: Optional[str] = Query(None, description="Filter by status")
):
    """Get all wallets with optional filters."""
    wallets = await wallet_ops.list_wallets(wallet_type=type, status=status)
    return [_wallet_to_response(w) for w in wallets]


@router.get("/wallets/{alias}", response_model=WalletResponse)
async def get_wallet(alias: str):
    """Get a specific wallet by alias."""
    wallet = await wallet_ops.get_wallet(alias)

    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

    return _wallet_to_response(wallet)


@router.post("/wallets", response_model=WalletResponse)
async def create_wallet(request: WalletCreate):
    """Create a new wallet."""
    try:
        wallet = await wallet_ops.create_wallet(
            alias=request.alias,
            address=request.address,
            wallet_type=request.type.value,
            tag=request.tag,
            virtual_sol_balance=request.virtual_sol_balance,
            virtual_loss_percent=request.virtual_loss_percent,
            max_consecutive_losses=request.max_consecutive_losses,
            max_daily_loss_pct=request.max_daily_loss_pct
        )
        return _wallet_to_response(wallet)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/wallets/{alias}")
async def delete_wallet(alias: str):
    """Delete a wallet and all associated data (positions, trades, transfers)."""
    try:
        await wallet_ops.delete_wallet(alias)
        return {"status": "success", "message": f"Wallet '{alias}' and all associated data deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.patch("/wallets/{alias}/toggle-trading")
async def toggle_trading(alias: str, enabled: bool = Query(...)):
    """Enable or disable trading for a wallet."""
    try:
        await wallet_ops.toggle_trading(alias, enabled)
        return {"status": "success", "trading_enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/wallets/{alias}/toggle-transfer")
async def toggle_transfer(alias: str, enabled: bool = Query(...)):
    """Enable or disable transfers for a wallet."""
    try:
        await wallet_ops.toggle_transfer(alias, enabled)
        return {"status": "success", "transfer_enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/wallets/{alias}/add-balance")
async def add_virtual_balance(alias: str, amount: float = Query(..., gt=0)):
    """Add virtual balance to a TEST wallet (for testing)."""
    try:
        new_balance = await wallet_ops.add_virtual_balance(alias, amount)
        return {"status": "success", "new_balance": new_balance}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/wallets/{alias}", response_model=WalletResponse)
async def update_wallet(alias: str, request: WalletUpdate):
    """Update wallet settings."""
    try:
        wallet = await wallet_ops.update_wallet(
            alias=alias,
            tag=request.tag,
            status=request.status.value if request.status else None,
            virtual_loss_percent=request.virtual_loss_percent,
            max_consecutive_losses=request.max_consecutive_losses,
            max_daily_loss_pct=request.max_daily_loss_pct
        )

        if not wallet:
            raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

        return _wallet_to_response(wallet)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# =================================================================
# POSITION ENDPOINTS
# =================================================================

@router.get("/positions", response_model=List[PositionResponse])
async def get_positions(
    wallet_alias: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="OPEN or CLOSED")
):
    """Get all positions with optional filters."""
    positions = await position_ops.get_positions(wallet_alias=wallet_alias, status=status)
    return [_position_to_response(p) for p in positions]


@router.get("/positions/{wallet_alias}/{mint}", response_model=PositionResponse)
async def get_position(wallet_alias: str, mint: str):
    """Get a specific open position."""
    position = await position_ops.get_position(wallet_alias, mint)

    if not position:
        raise HTTPException(
            status_code=404,
            detail=f"No open position found for {wallet_alias} / {mint}"
        )

    return _position_to_response(position)


# =================================================================
# TRADE LOG ENDPOINTS
# =================================================================

@router.get("/trades", response_model=List[TradeLogResponse])
async def get_trade_logs(
    wallet_alias: Optional[str] = Query(None),
    action: Optional[str] = Query(None, description="BUY or SELL"),
    limit: int = Query(default=100, le=1000)
):
    """Get trade history."""
    query = """
        SELECT t.* FROM trade_logs t
        JOIN wallets w ON t.wallet_id = w.id
        WHERE 1=1
    """
    params = []

    if wallet_alias:
        params.append(wallet_alias)
        query += f" AND w.alias = ${len(params)}"

    if action:
        params.append(action)
        query += f" AND t.action = ${len(params)}"

    params.append(limit)
    query += f" ORDER BY t.created_at DESC LIMIT ${len(params)}"

    trades = await fetch(query, *params)
    return [_trade_log_to_response(t) for t in trades]


# =================================================================
# TRANSFER LOG ENDPOINTS
# =================================================================

@router.get("/transfers")
async def get_transfer_logs(
    wallet_alias: Optional[str] = Query(None),
    limit: int = Query(default=100, le=1000)
):
    """Get transfer history."""
    if wallet_alias:
        return await TransferService.get_transfer_history(wallet_alias, limit)

    transfers = await fetch(
        """
        SELECT t.*, w.alias as from_alias
        FROM transfer_logs t
        JOIN wallets w ON t.from_wallet_id = w.id
        ORDER BY t.created_at DESC
        LIMIT $1
        """,
        limit
    )

    return [dict(t) for t in transfers]


# =================================================================
# DASHBOARD ENDPOINTS
# =================================================================

@router.get("/dashboard/stats", response_model=DashboardStats)
async def get_dashboard_stats():
    """Get dashboard statistics."""
    # Total wallets
    total = await fetchval("SELECT COUNT(*) FROM wallets")
    active = await fetchval("SELECT COUNT(*) FROM wallets WHERE status = 'ACTIVE'")
    test = await fetchval("SELECT COUNT(*) FROM wallets WHERE type = 'TEST'")
    real = await fetchval("SELECT COUNT(*) FROM wallets WHERE type = 'REAL'")

    # Positions
    open_positions = await fetchval("SELECT COUNT(*) FROM positions WHERE status = 'OPEN'")

    # Today's trades
    today = date.today()
    trades_today = await fetchval(
        "SELECT COUNT(*) FROM trade_logs WHERE DATE(created_at) = $1",
        today
    )

    volume_today = await fetchval(
        "SELECT COALESCE(SUM(amount_sol), 0) FROM trade_logs WHERE DATE(created_at) = $1",
        today
    ) or 0

    return DashboardStats(
        total_wallets=total or 0,
        active_wallets=active or 0,
        test_wallets=test or 0,
        real_wallets=real or 0,
        open_positions=open_positions or 0,
        total_trades_today=trades_today or 0,
        total_volume_today=float(volume_today)
    )


@router.get("/dashboard/performance", response_model=List[WalletPerformanceResponse])
async def get_wallet_performance():
    """Get wallet performance metrics including profit/loss."""
    performance = await fetch("""
        SELECT
            w.alias,
            w.type,
            w.consecutive_losses,
            CASE WHEN w.type = 'TEST' THEN w.virtual_sol_balance ELSE w.real_sol_balance END as current_balance,
            w.start_balance_day,
            COALESCE(SUM(CASE WHEN t.action = 'SELL' AND t.status = 'SUCCESS' THEN t.amount_sol ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.action = 'BUY' AND t.status = 'SUCCESS' THEN t.amount_sol ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.action = 'BUY' AND t.status = 'SUCCESS' THEN COALESCE(t.jito_tip_lamports, 0) / 1000000000.0 ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.action = 'BUY' AND t.status = 'SUCCESS' THEN COALESCE(t.network_fee_sol, 0) ELSE 0 END), 0) as net_profit_sol,
            COUNT(t.id) FILTER (WHERE t.status = 'SUCCESS') as trade_count,
            COALESCE(SUM(CASE WHEN t.action = 'SELL' AND t.status = 'SUCCESS' AND t.created_at > NOW() - INTERVAL '24 hours' THEN t.amount_sol ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.action = 'BUY' AND t.status = 'SUCCESS' AND t.created_at > NOW() - INTERVAL '24 hours' THEN t.amount_sol ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.action = 'BUY' AND t.status = 'SUCCESS' AND t.created_at > NOW() - INTERVAL '24 hours' THEN COALESCE(t.jito_tip_lamports, 0) / 1000000000.0 ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN t.action = 'BUY' AND t.status = 'SUCCESS' AND t.created_at > NOW() - INTERVAL '24 hours' THEN COALESCE(t.network_fee_sol, 0) ELSE 0 END), 0) as profit_24h
        FROM wallets w
        LEFT JOIN trade_logs t ON w.id = t.wallet_id
        GROUP BY w.id, w.alias, w.type, w.consecutive_losses, w.virtual_sol_balance, w.real_sol_balance, w.start_balance_day
        ORDER BY net_profit_sol DESC
    """)

    return [
        WalletPerformanceResponse(
            alias=p['alias'],
            type=p['type'],
            consecutive_losses=p['consecutive_losses'] or 0,
            current_balance=float(p['current_balance'] or 0),
            start_balance_day=float(p['start_balance_day'] or 0),
            net_profit_sol=float(p['net_profit_sol'] or 0),
            trade_count=p['trade_count'] or 0,
            profit_24h=float(p['profit_24h'] or 0)
        )
        for p in performance
    ]


# =================================================================
# HELPER FUNCTIONS
# =================================================================

def _wallet_to_response(wallet: dict) -> WalletResponse:
    """Convert database wallet record to response schema."""
    return WalletResponse(
        id=str(wallet['id']),
        alias=wallet['alias'],
        address=wallet['address'],
        type=wallet['type'],
        status=wallet['status'],
        tag=wallet.get('tag'),
        trading_enabled=wallet['trading_enabled'],
        transfer_enabled=wallet['transfer_enabled'],
        virtual_sol_balance=float(wallet['virtual_sol_balance'] or 0),
        real_sol_balance=float(wallet['real_sol_balance'] or 0),
        consecutive_losses=wallet['consecutive_losses'] or 0,
        max_consecutive_losses=wallet['max_consecutive_losses'] or 3,
        start_balance_day=float(wallet['start_balance_day'] or 0),
        max_daily_loss_pct=float(wallet['max_daily_loss_pct'] or 15),
        virtual_loss_percent=float(wallet['virtual_loss_percent'] or 0),
        created_at=wallet['created_at'],
        updated_at=wallet['updated_at']
    )


def _position_to_response(position: dict) -> PositionResponse:
    """Convert database position record to response schema."""
    return PositionResponse(
        id=str(position['id']),
        wallet_id=str(position['wallet_id']),
        mint=position['mint'],
        status=position['status'],
        tokens_held=float(position['tokens_held'] or 0),
        entry_price=float(position['entry_price'] or 0),
        initial_sol_spent=float(position['initial_sol_spent'] or 0),
        created_at=position['created_at'],
        closed_at=position.get('closed_at')
    )


def _trade_log_to_response(trade: dict) -> TradeLogResponse:
    """Convert database trade log record to response schema."""
    return TradeLogResponse(
        id=str(trade['id']),
        wallet_id=str(trade['wallet_id']),
        position_id=str(trade['position_id']) if trade['position_id'] else None,
        action=trade['action'],
        mint=trade['mint'],
        amount_sol=float(trade['amount_sol'] or 0),
        amount_tokens=float(trade['amount_tokens'] or 0),
        price_impact_bps=trade['price_impact_bps'],
        jito_tip_lamports=trade['jito_tip_lamports'],
        network_fee_sol=float(trade['network_fee_sol'] or 0),
        tx_signature=trade['tx_signature'],
        is_simulation=trade['is_simulation'],
        status=trade['status'],
        error_message=trade.get('error_message'),
        created_at=trade['created_at']
    )
