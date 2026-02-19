"""
Pydantic schemas for Buy module API request/response validation.

Migrated from pump-buy/backend/app/models/schemas.py
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


# =================================================================
# ENUMS
# =================================================================

class WalletType(str, Enum):
    TEST = "TEST"
    REAL = "REAL"


class WalletStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    DRAINED = "DRAINED"
    FROZEN = "FROZEN"


class TradeAction(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


# =================================================================
# REQUEST SCHEMAS
# =================================================================

class BuyRequest(BaseModel):
    """Request schema for buy orders."""
    wallet_alias: str = Field(..., description="Wallet alias (e.g., 'worker_bot_01')")
    mint: str = Field(..., description="Token mint address")
    amount_sol: float = Field(..., gt=0, description="Amount of SOL to spend")
    slippage_bps: int = Field(default=100, ge=1, le=5000, description="Slippage in basis points (100 = 1%)")
    use_jito: bool = Field(default=True, description="Use Jito bundles (REAL mode)")
    jito_tip_lamports: int = Field(default=50000, ge=0, description="Jito tip in lamports")

    class Config:
        json_schema_extra = {
            "example": {
                "wallet_alias": "worker_bot_01",
                "mint": "7BadU...",
                "amount_sol": 0.15,
                "slippage_bps": 100,
                "use_jito": True,
                "jito_tip_lamports": 50000
            }
        }


class SellRequest(BaseModel):
    """Request schema for sell orders."""
    wallet_alias: str = Field(..., description="Wallet alias")
    mint: str = Field(..., description="Token mint address")
    amount_pct: float = Field(default=100.0, ge=0.01, le=100.0, description="Percentage to sell (1-100)")
    slippage_bps: int = Field(default=100, ge=1, le=5000, description="Slippage in basis points")
    use_jito: bool = Field(default=True, description="Use Jito bundles")
    jito_tip_lamports: int = Field(default=50000, ge=0, description="Jito tip in lamports")

    class Config:
        json_schema_extra = {
            "example": {
                "wallet_alias": "worker_bot_01",
                "mint": "7BadU...",
                "amount_pct": 100,
                "slippage_bps": 500,
                "use_jito": True,
                "jito_tip_lamports": 100000
            }
        }


class SellAllRequest(BaseModel):
    """Request schema for selling all positions in a wallet."""
    wallet_alias: str = Field(..., description="Wallet alias")
    slippage_bps: int = Field(default=100, ge=1, le=5000, description="Slippage in basis points")
    use_jito: bool = Field(default=True, description="Use Jito bundles")
    jito_tip_lamports: int = Field(default=50000, ge=0, description="Jito tip in lamports")

    class Config:
        json_schema_extra = {
            "example": {
                "wallet_alias": "worker_bot_01",
                "slippage_bps": 200,
                "jito_tip_lamports": 50000
            }
        }


class TransferRequest(BaseModel):
    """Request schema for SOL transfers."""
    wallet_alias: str = Field(..., description="Source wallet alias")
    to_address: str = Field(..., description="Destination address")
    amount_sol: float = Field(default=0.0, ge=0, description="Amount to transfer (0 if force_sweep)")
    force_sweep: bool = Field(default=False, description="Send all available balance")

    class Config:
        json_schema_extra = {
            "example": {
                "wallet_alias": "worker_bot_01",
                "to_address": "VAULT_ADDRESS_XYZ",
                "amount_sol": 2.5,
                "force_sweep": False
            }
        }


class WalletCreate(BaseModel):
    """Request schema for creating a wallet."""
    alias: str = Field(..., min_length=1, max_length=50, description="Unique wallet alias")
    address: Optional[str] = Field(default=None, min_length=32, max_length=44, description="Solana public key (auto-generated for TEST wallets if omitted)")
    type: WalletType = Field(default=WalletType.TEST, description="Wallet type")
    tag: Optional[str] = Field(default=None, description="Strategy tag")
    virtual_sol_balance: float = Field(default=10.0, ge=0, description="Initial virtual balance (TEST)")
    virtual_loss_percent: float = Field(default=1.0, ge=0, le=50, description="Pain mode loss percent")
    max_consecutive_losses: int = Field(default=3, ge=1, le=20, description="Max losses before block")
    max_daily_loss_pct: float = Field(default=15.0, ge=1, le=100, description="Max daily loss percent")


class WalletUpdate(BaseModel):
    """Request schema for updating a wallet."""
    tag: Optional[str] = Field(default=None, description="Strategy tag")
    status: Optional[WalletStatus] = Field(default=None, description="Wallet status")
    virtual_loss_percent: Optional[float] = Field(default=None, ge=0, le=50, description="Pain mode loss percent")
    max_consecutive_losses: Optional[int] = Field(default=None, ge=1, le=20, description="Max losses before block")
    max_daily_loss_pct: Optional[float] = Field(default=None, ge=1, le=100, description="Max daily loss percent")


# =================================================================
# RESPONSE SCHEMAS
# =================================================================

class TradeData(BaseModel):
    """Trade execution data."""
    mint: str
    action: str
    sol_spent_total: Optional[float] = None
    tokens_received: Optional[float] = None
    tokens_sold: Optional[float] = None
    sol_received_net: Optional[float] = None
    entry_price: Optional[float] = None
    exit_price: Optional[float] = None
    pnl_sol: Optional[float] = None
    applied_loss_pct: Optional[float] = None
    position_closed: Optional[bool] = None
    wallet_balance_new: float
    is_simulation: bool


class TradeResponse(BaseModel):
    """Response schema for trade operations."""
    status: str
    signature: Optional[str] = None
    code: Optional[str] = None
    message: Optional[str] = None
    data: Optional[TradeData] = None


class TransferData(BaseModel):
    """Transfer execution data."""
    tx_signature: str
    from_wallet: str = Field(alias="from")
    to: str
    amount_sent: float
    fee_paid: float
    wallet_balance_new: float
    is_simulation: bool

    class Config:
        populate_by_name = True


class TransferResponse(BaseModel):
    """Response schema for transfer operations."""
    status: str
    action: Optional[str] = None
    code: Optional[str] = None
    message: Optional[str] = None
    data: Optional[TransferData] = None


class WalletResponse(BaseModel):
    """Response schema for wallet data."""
    id: str
    alias: str
    address: str
    type: WalletType
    status: WalletStatus
    tag: Optional[str]
    trading_enabled: bool
    transfer_enabled: bool
    virtual_sol_balance: float
    real_sol_balance: float
    consecutive_losses: int
    max_consecutive_losses: int
    start_balance_day: float
    max_daily_loss_pct: float
    virtual_loss_percent: float
    created_at: datetime
    updated_at: datetime


class PositionResponse(BaseModel):
    """Response schema for position data."""
    id: str
    wallet_id: str
    mint: str
    status: str
    tokens_held: float
    entry_price: float
    initial_sol_spent: float
    created_at: datetime
    closed_at: Optional[datetime] = None


class TradeLogResponse(BaseModel):
    """Response schema for trade log data."""
    id: str
    wallet_id: str
    position_id: Optional[str]
    action: TradeAction
    mint: str
    amount_sol: float
    amount_tokens: float
    price_impact_bps: Optional[int]
    jito_tip_lamports: Optional[int]
    network_fee_sol: float
    tx_signature: str
    is_simulation: bool
    status: str
    error_message: Optional[str] = None
    created_at: datetime


class DashboardStats(BaseModel):
    """Dashboard statistics."""
    total_wallets: int
    active_wallets: int
    test_wallets: int
    real_wallets: int
    open_positions: int
    total_trades_today: int
    total_volume_today: float


class WalletPerformanceResponse(BaseModel):
    """Wallet performance metrics."""
    alias: str
    type: WalletType
    consecutive_losses: int
    current_balance: float
    start_balance_day: float
    net_profit_sol: float
    trade_count: int
    profit_24h: float


# =================================================================
# DASHBOARD ANALYTICS SCHEMAS
# =================================================================

class ExchangeRateResponse(BaseModel):
    """Current exchange rates."""
    sol_price_usd: float
    usd_to_eur_rate: float
    sol_price_eur: float
    timestamp: datetime


class PnlBucket(BaseModel):
    """Single time bucket for P&L history."""
    bucket: datetime
    cumulative_pnl_sol: float
    fees_sol: float


class PnlHistoryResponse(BaseModel):
    """P&L history over time."""
    data: list[PnlBucket]
    period: str
    bucket_size: str


class TradeActivityBucket(BaseModel):
    """Single time bucket for trade activity."""
    bucket: datetime
    buy_count: int
    sell_count: int


class TradeActivityResponse(BaseModel):
    """Trade activity over time."""
    data: list[TradeActivityBucket]
    period: str
    bucket_size: str


class TradeAnalyticsResponse(BaseModel):
    """Win/loss analytics and fee breakdown."""
    winning_trades: int
    losing_trades: int
    win_rate: float
    avg_win_sol: float
    avg_loss_sol: float
    profit_factor: float
    total_network_fees_sol: float
    total_jito_tips_sol: float
    total_fees_sol: float
    gross_pnl_sol: float
    net_pnl_sol: float
    best_trade_sol: float
    worst_trade_sol: float
    best_trade_mint: Optional[str] = None
    worst_trade_mint: Optional[str] = None


# =================================================================
# WORKFLOW SCHEMAS
# =================================================================

class WorkflowType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

class BuyAmountMode(str, Enum):
    FIXED = "fixed"
    PERCENT = "percent"

class WorkflowCreate(BaseModel):
    wallet_alias: str = Field(..., description="Wallet alias")
    name: str = Field(..., min_length=1, max_length=100)
    type: WorkflowType
    chain: dict = Field(..., description="Chain definition JSON")
    buy_amount_mode: Optional[BuyAmountMode] = None
    buy_amount_value: Optional[float] = Field(None, gt=0)
    sell_amount_pct: Optional[float] = Field(100.0, ge=1, le=100)
    cooldown_seconds: int = Field(60, ge=0)
    max_open_positions: int = Field(5, ge=1, le=100)

class WorkflowUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    chain: Optional[dict] = None
    buy_amount_mode: Optional[BuyAmountMode] = None
    buy_amount_value: Optional[float] = Field(None, gt=0)
    sell_amount_pct: Optional[float] = Field(None, ge=1, le=100)
    cooldown_seconds: Optional[int] = Field(None, ge=0)
    max_open_positions: Optional[int] = Field(None, ge=1, le=100)

class WorkflowResponse(BaseModel):
    id: str
    wallet_id: str
    wallet_alias: Optional[str] = None
    name: str
    type: str
    is_active: bool
    chain: dict
    buy_amount_mode: Optional[str] = None
    buy_amount_value: Optional[float] = None
    sell_amount_pct: Optional[float] = None
    cooldown_seconds: int
    max_open_positions: int
    created_at: datetime
    updated_at: datetime

class WorkflowExecutionResponse(BaseModel):
    id: str
    workflow_id: str
    workflow_name: Optional[str] = None
    mint: str
    trigger_data: dict
    steps_log: list
    result: str
    error_message: Optional[str] = None
    trade_log_id: Optional[str] = None
    created_at: datetime
