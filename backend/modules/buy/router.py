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
from datetime import date, datetime, timedelta

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
    ExchangeRateResponse,
    PnlHistoryResponse,
    PnlBucket,
    TradeActivityResponse,
    TradeActivityBucket,
    TradeAnalyticsResponse,
)
from backend.modules.buy.trading import TradingService
from backend.modules.buy.transfer import TransferService
from backend.modules.buy import wallets as wallet_ops
from backend.modules.buy import positions as position_ops


router = APIRouter(prefix="/api/buy", tags=["buy"])


# =================================================================
# HEALTH ENDPOINT
# =================================================================

@router.get("/health", operation_id="buy_health")
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

@router.post("/execute-buy", response_model=TradeResponse, operation_id="buy_execute_buy")
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


@router.post("/execute-sell", response_model=TradeResponse, operation_id="buy_execute_sell")
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


@router.post("/sell-all", operation_id="buy_sell_all")
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


@router.post("/transfer", response_model=TransferResponse, operation_id="buy_transfer")
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

@router.get("/wallets", response_model=List[WalletResponse], operation_id="buy_get_wallets")
async def get_wallets(
    type: Optional[str] = Query(None, description="Filter by type (TEST/REAL)"),
    status: Optional[str] = Query(None, description="Filter by status")
):
    """Get all wallets with optional filters."""
    wallets = await wallet_ops.list_wallets(wallet_type=type, status=status)
    return [_wallet_to_response(w) for w in wallets]


@router.get("/wallets/{alias}", response_model=WalletResponse, operation_id="buy_get_wallet")
async def get_wallet(alias: str):
    """Get a specific wallet by alias."""
    wallet = await wallet_ops.get_wallet(alias)

    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

    return _wallet_to_response(wallet)


@router.post("/wallets", response_model=WalletResponse, operation_id="buy_create_wallet")
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


@router.delete("/wallets/{alias}", operation_id="buy_delete_wallet")
async def delete_wallet(alias: str):
    """Delete a wallet and all associated data (positions, trades, transfers)."""
    try:
        await wallet_ops.delete_wallet(alias)
        return {"status": "success", "message": f"Wallet '{alias}' and all associated data deleted"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.patch("/wallets/{alias}/toggle-trading", operation_id="buy_toggle_trading")
async def toggle_trading(alias: str, enabled: bool = Query(...)):
    """Enable or disable trading for a wallet."""
    try:
        await wallet_ops.toggle_trading(alias, enabled)
        return {"status": "success", "trading_enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/wallets/{alias}/toggle-transfer", operation_id="buy_toggle_transfer")
async def toggle_transfer(alias: str, enabled: bool = Query(...)):
    """Enable or disable transfers for a wallet."""
    try:
        await wallet_ops.toggle_transfer(alias, enabled)
        return {"status": "success", "transfer_enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.patch("/wallets/{alias}/add-balance", operation_id="buy_add_balance")
async def add_virtual_balance(alias: str, amount: float = Query(..., gt=0)):
    """Add virtual balance to a TEST wallet (for testing)."""
    try:
        new_balance = await wallet_ops.add_virtual_balance(alias, amount)
        return {"status": "success", "new_balance": new_balance}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/wallets/{alias}/analytics", operation_id="buy_wallet_analytics")
async def get_wallet_analytics(alias: str):
    """Get comprehensive analytics for a single wallet."""
    wallet = await wallet_ops.get_wallet(alias)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")
    wallet_id = wallet['id']

    stats = await fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE action = 'BUY' AND status = 'SUCCESS') AS total_buys,
            COUNT(*) FILTER (WHERE action = 'SELL' AND status = 'SUCCESS') AS total_sells,
            COALESCE(SUM(CASE WHEN action = 'BUY' AND status = 'SUCCESS' THEN amount_sol ELSE 0 END), 0) AS total_buy_volume,
            COALESCE(SUM(CASE WHEN action = 'SELL' AND status = 'SUCCESS' THEN amount_sol ELSE 0 END), 0) AS total_sell_volume,
            COALESCE(SUM(COALESCE(network_fee_sol, 0)), 0) AS total_fees
        FROM trade_logs WHERE wallet_id = $1
    """, wallet_id)

    pnl = await fetchrow("""
        WITH pos_pnl AS (
            SELECT
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl
            FROM positions p
            LEFT JOIN trade_logs t ON t.position_id = p.id AND t.status = 'SUCCESS'
            WHERE p.wallet_id = $1 AND p.status = 'CLOSED'
            GROUP BY p.id
        )
        SELECT
            COUNT(*) FILTER (WHERE pnl > 0) AS wins,
            COUNT(*) FILTER (WHERE pnl <= 0) AS losses,
            COALESCE(SUM(pnl), 0) AS total_pnl
        FROM pos_pnl
    """, wallet_id)

    wins = pnl['wins'] or 0 if pnl else 0
    losses = pnl['losses'] or 0 if pnl else 0
    total = wins + losses

    return {
        "total_buys": stats['total_buys'] or 0,
        "total_sells": stats['total_sells'] or 0,
        "total_trades": (stats['total_buys'] or 0) + (stats['total_sells'] or 0),
        "total_volume_sol": float(stats['total_buy_volume'] or 0) + float(stats['total_sell_volume'] or 0),
        "total_fees_sol": float(stats['total_fees'] or 0),
        "wins": wins,
        "losses": losses,
        "win_rate": round((wins / total * 100) if total > 0 else 0, 1),
        "total_pnl_sol": float(pnl['total_pnl'] or 0) if pnl else 0,
    }


@router.get("/wallets/{alias}/pnl-history", operation_id="buy_wallet_pnl_history")
async def get_wallet_pnl_history(
    alias: str,
    period: str = Query("7d", description="24h, 7d, 30d, or all"),
):
    """Get P&L history for a specific wallet."""
    wallet = await wallet_ops.get_wallet(alias)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

    bucket_map = {"24h": ("1 hour", "1h"), "7d": ("4 hours", "4h"), "30d": ("1 day", "1d"), "all": ("1 day", "1d")}
    bucket_interval, bucket_label = bucket_map.get(period, ("1 hour", "1h"))
    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    rows = await fetch(f"""
        WITH trade_data AS (
            SELECT
                time_bucket('{bucket_interval}', t.created_at) AS bucket,
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl_sol,
                COALESCE(SUM(COALESCE(t.network_fee_sol, 0)), 0) AS fees_sol
            FROM trade_logs t
            WHERE t.wallet_id = $1 AND t.status = 'SUCCESS' {time_filter}
            GROUP BY bucket ORDER BY bucket
        )
        SELECT bucket, SUM(pnl_sol) OVER (ORDER BY bucket) AS cumulative_pnl_sol, fees_sol
        FROM trade_data
    """, wallet['id'])

    return {
        "data": [{"bucket": r['bucket'], "cumulative_pnl_sol": float(r['cumulative_pnl_sol'] or 0), "fees_sol": float(r['fees_sol'] or 0)} for r in rows],
        "period": period,
        "bucket_size": bucket_label,
    }


@router.get("/wallets/{alias}/positions-valued", operation_id="buy_positions_valued")
async def get_wallet_positions_valued(alias: str):
    """Get open positions with current Jupiter valuations."""
    from backend.modules.buy.jupiter_client import JupiterClient

    wallet = await wallet_ops.get_wallet(alias)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

    positions = await position_ops.get_open_positions(alias)
    result = []

    for pos in positions:
        current_value_sol = None
        unrealized_pnl_sol = None
        try:
            quote = await JupiterClient.get_sell_quote(
                token_mint=pos['mint'],
                token_amount=pos['tokens_held'],
                slippage_bps=100,
            )
            if quote and quote.get('out_amount'):
                current_value_sol = float(quote['out_amount']) / 1e9
                unrealized_pnl_sol = current_value_sol - float(pos['initial_sol_spent'])
        except Exception:
            pass

        result.append({
            **_position_to_response(pos).model_dump(),
            "current_value_sol": current_value_sol,
            "unrealized_pnl_sol": unrealized_pnl_sol,
        })

    return result


@router.patch("/wallets/{alias}", response_model=WalletResponse, operation_id="buy_update_wallet")
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

@router.get("/positions", response_model=List[PositionResponse], operation_id="buy_get_positions")
async def get_positions(
    wallet_alias: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="OPEN or CLOSED")
):
    """Get all positions with optional filters."""
    positions = await position_ops.get_positions(wallet_alias=wallet_alias, status=status)
    return [_position_to_response(p) for p in positions]


@router.get("/positions/{wallet_alias}/{mint}", response_model=PositionResponse, operation_id="buy_get_position")
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

@router.get("/trades", response_model=List[TradeLogResponse], operation_id="buy_get_trades")
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

@router.get("/transfers", operation_id="buy_get_transfers")
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

@router.get("/dashboard/stats", response_model=DashboardStats, operation_id="buy_dashboard_stats")
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


@router.get("/dashboard/performance", response_model=List[WalletPerformanceResponse], operation_id="buy_dashboard_performance")
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


@router.get("/exchange-rate", response_model=ExchangeRateResponse, operation_id="buy_exchange_rate")
async def get_exchange_rate():
    """Get current SOL/EUR exchange rate from exchange_rates table."""
    row = await fetchrow(
        """
        SELECT sol_price_usd, usd_to_eur_rate, created_at
        FROM exchange_rates
        ORDER BY created_at DESC
        LIMIT 1
        """
    )

    if not row:
        raise HTTPException(status_code=404, detail="No exchange rate data available")

    sol_usd = float(row['sol_price_usd'] or 0)
    usd_eur = float(row['usd_to_eur_rate'] or 0)

    return ExchangeRateResponse(
        sol_price_usd=sol_usd,
        usd_to_eur_rate=usd_eur,
        sol_price_eur=round(sol_usd * usd_eur, 6) if usd_eur else 0,
        timestamp=row['created_at']
    )


@router.get("/dashboard/pnl-history", response_model=PnlHistoryResponse, operation_id="buy_pnl_history")
async def get_pnl_history(
    wallet_type: Optional[str] = Query(None, description="TEST or REAL"),
    period: str = Query("24h", description="24h, 7d, 30d, or all"),
):
    """Get cumulative P&L history bucketed over time."""
    bucket_map = {"24h": ("1 hour", "1h"), "7d": ("4 hours", "4h"), "30d": ("1 day", "1d"), "all": ("1 day", "1d")}
    bucket_interval, bucket_label = bucket_map.get(period, ("1 hour", "1h"))

    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    wallet_filter = ""
    params: list = []
    if wallet_type:
        wallet_filter = f"AND w.type = ${len(params) + 1}"
        params.append(wallet_type)

    rows = await fetch(f"""
        WITH trade_data AS (
            SELECT
                time_bucket('{bucket_interval}', t.created_at) AS bucket,
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl_sol,
                COALESCE(SUM(COALESCE(t.jito_tip_lamports, 0) / 1000000000.0), 0) +
                COALESCE(SUM(COALESCE(t.network_fee_sol, 0)), 0) AS fees_sol
            FROM trade_logs t
            JOIN wallets w ON t.wallet_id = w.id
            WHERE t.status = 'SUCCESS'
            {time_filter}
            {wallet_filter}
            GROUP BY bucket
            ORDER BY bucket
        )
        SELECT
            bucket,
            SUM(pnl_sol) OVER (ORDER BY bucket) AS cumulative_pnl_sol,
            fees_sol
        FROM trade_data
    """, *params)

    return PnlHistoryResponse(
        data=[
            PnlBucket(
                bucket=r['bucket'],
                cumulative_pnl_sol=float(r['cumulative_pnl_sol'] or 0),
                fees_sol=float(r['fees_sol'] or 0),
            )
            for r in rows
        ],
        period=period,
        bucket_size=bucket_label,
    )


@router.get("/dashboard/trade-activity", response_model=TradeActivityResponse, operation_id="buy_trade_activity")
async def get_trade_activity(
    wallet_type: Optional[str] = Query(None, description="TEST or REAL"),
    period: str = Query("24h", description="24h, 7d, 30d, or all"),
):
    """Get trade counts (BUY/SELL) bucketed over time."""
    bucket_map = {"24h": ("1 hour", "1h"), "7d": ("4 hours", "4h"), "30d": ("1 day", "1d"), "all": ("1 day", "1d")}
    bucket_interval, bucket_label = bucket_map.get(period, ("1 hour", "1h"))

    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    wallet_filter = ""
    params: list = []
    if wallet_type:
        wallet_filter = f"AND w.type = ${len(params) + 1}"
        params.append(wallet_type)

    rows = await fetch(f"""
        SELECT
            time_bucket('{bucket_interval}', t.created_at) AS bucket,
            COUNT(*) FILTER (WHERE t.action = 'BUY') AS buy_count,
            COUNT(*) FILTER (WHERE t.action = 'SELL') AS sell_count
        FROM trade_logs t
        JOIN wallets w ON t.wallet_id = w.id
        WHERE t.status = 'SUCCESS'
        {time_filter}
        {wallet_filter}
        GROUP BY bucket
        ORDER BY bucket
    """, *params)

    return TradeActivityResponse(
        data=[
            TradeActivityBucket(
                bucket=r['bucket'],
                buy_count=r['buy_count'] or 0,
                sell_count=r['sell_count'] or 0,
            )
            for r in rows
        ],
        period=period,
        bucket_size=bucket_label,
    )


@router.get("/dashboard/trade-analytics", response_model=TradeAnalyticsResponse, operation_id="buy_trade_analytics")
async def get_trade_analytics(
    wallet_type: Optional[str] = Query(None, description="TEST or REAL"),
    period: str = Query("24h", description="24h, 7d, 30d, or all"),
):
    """Get win/loss analytics and fee breakdown."""
    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND p.closed_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""
    fee_time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    wallet_filter = ""
    fee_wallet_filter = ""
    params: list = []
    if wallet_type:
        wallet_filter = f"AND w.type = ${len(params) + 1}"
        fee_wallet_filter = f"AND w2.type = ${len(params) + 1}"
        params.append(wallet_type)

    # Win/loss per closed position
    positions_row = await fetchrow(f"""
        WITH position_pnl AS (
            SELECT
                p.id,
                p.mint,
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl_sol
            FROM positions p
            JOIN wallets w ON p.wallet_id = w.id
            LEFT JOIN trade_logs t ON t.position_id = p.id AND t.status = 'SUCCESS'
            WHERE p.status = 'CLOSED'
            {time_filter}
            {wallet_filter}
            GROUP BY p.id, p.mint
        )
        SELECT
            COUNT(*) FILTER (WHERE pnl_sol > 0) AS winning_trades,
            COUNT(*) FILTER (WHERE pnl_sol <= 0) AS losing_trades,
            COALESCE(AVG(pnl_sol) FILTER (WHERE pnl_sol > 0), 0) AS avg_win_sol,
            COALESCE(AVG(pnl_sol) FILTER (WHERE pnl_sol <= 0), 0) AS avg_loss_sol,
            COALESCE(SUM(pnl_sol) FILTER (WHERE pnl_sol > 0), 0) AS gross_wins,
            ABS(COALESCE(SUM(pnl_sol) FILTER (WHERE pnl_sol <= 0), 0)) AS gross_losses,
            COALESCE(SUM(pnl_sol), 0) AS gross_pnl_sol,
            (SELECT pnl_sol FROM position_pnl ORDER BY pnl_sol DESC LIMIT 1) AS best_trade_sol,
            (SELECT mint FROM position_pnl ORDER BY pnl_sol DESC LIMIT 1) AS best_trade_mint,
            (SELECT pnl_sol FROM position_pnl ORDER BY pnl_sol ASC LIMIT 1) AS worst_trade_sol,
            (SELECT mint FROM position_pnl ORDER BY pnl_sol ASC LIMIT 1) AS worst_trade_mint
        FROM position_pnl
    """, *params)

    # Fee breakdown (independent of positions - uses all trades in period)
    fees_row = await fetchrow(f"""
        SELECT
            COALESCE(SUM(COALESCE(t.network_fee_sol, 0)), 0) AS total_network_fees_sol,
            COALESCE(SUM(COALESCE(t.jito_tip_lamports, 0) / 1000000000.0), 0) AS total_jito_tips_sol
        FROM trade_logs t
        JOIN wallets w2 ON t.wallet_id = w2.id
        WHERE t.status = 'SUCCESS'
        {fee_time_filter}
        {fee_wallet_filter}
    """, *params)

    winning = positions_row['winning_trades'] or 0 if positions_row else 0
    losing = positions_row['losing_trades'] or 0 if positions_row else 0
    total = winning + losing
    gross_wins = float(positions_row['gross_wins'] or 0) if positions_row else 0
    gross_losses = float(positions_row['gross_losses'] or 0) if positions_row else 0
    network_fees = float(fees_row['total_network_fees_sol'] or 0) if fees_row else 0
    jito_tips = float(fees_row['total_jito_tips_sol'] or 0) if fees_row else 0
    total_fees = network_fees + jito_tips
    gross_pnl = float(positions_row['gross_pnl_sol'] or 0) if positions_row else 0

    return TradeAnalyticsResponse(
        winning_trades=winning,
        losing_trades=losing,
        win_rate=round((winning / total * 100) if total > 0 else 0, 1),
        avg_win_sol=float(positions_row['avg_win_sol'] or 0) if positions_row else 0,
        avg_loss_sol=float(positions_row['avg_loss_sol'] or 0) if positions_row else 0,
        profit_factor=round(gross_wins / gross_losses, 2) if gross_losses > 0 else 0,
        total_network_fees_sol=network_fees,
        total_jito_tips_sol=jito_tips,
        total_fees_sol=total_fees,
        gross_pnl_sol=gross_pnl,
        net_pnl_sol=gross_pnl - total_fees,
        best_trade_sol=float(positions_row['best_trade_sol'] or 0) if positions_row else 0,
        worst_trade_sol=float(positions_row['worst_trade_sol'] or 0) if positions_row else 0,
        best_trade_mint=positions_row['best_trade_mint'] if positions_row else None,
        worst_trade_mint=positions_row['worst_trade_mint'] if positions_row else None,
    )


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
