// ============================================================
// Buy (Trading) Module TypeScript Interfaces
// Based on pump-buy API schemas
// ============================================================

// ============================================================
// Wallet
// ============================================================
export type WalletType = 'TEST' | 'REAL';
export type WalletStatus = 'ACTIVE' | 'PAUSED' | 'DRAINED' | 'FROZEN';

export interface Wallet {
  id: string;
  alias: string;
  address: string;
  type: WalletType;
  status: WalletStatus;
  tag?: string;
  trading_enabled: boolean;
  transfer_enabled: boolean;
  virtual_sol_balance: number;
  real_sol_balance: number;
  consecutive_losses: number;
  max_consecutive_losses: number;
  start_balance_day: number;
  max_daily_loss_pct: number;
  virtual_loss_percent: number;
  created_at: string;
  updated_at: string;
}

export interface CreateWalletRequest {
  alias: string;
  address: string;
  type: WalletType;
  tag?: string;
  virtual_sol_balance?: number;
  virtual_loss_percent?: number;
  max_consecutive_losses?: number;
  max_daily_loss_pct?: number;
}

export interface UpdateWalletRequest {
  tag?: string;
  status?: WalletStatus;
  virtual_loss_percent?: number;
  max_consecutive_losses?: number;
  max_daily_loss_pct?: number;
}

// ============================================================
// Position
// ============================================================
export type PositionStatus = 'OPEN' | 'CLOSED';

export interface Position {
  id: string;
  wallet_id: string;
  mint: string;
  status: PositionStatus;
  tokens_held: number;
  entry_price: number;
  initial_sol_spent: number;
  created_at: string;
}

// ============================================================
// Trade Log
// ============================================================
export type TradeAction = 'BUY' | 'SELL';

export interface TradeLog {
  id: string;
  wallet_id: string;
  wallet_alias?: string;
  action: TradeAction;
  mint: string;
  amount_sol: number;
  amount_tokens: number;
  network_fee_sol: number;
  tx_signature: string | null;
  is_simulation: boolean;
  status: string;
  created_at: string;
}

// ============================================================
// Transfer Log
// ============================================================
export interface TransferLog {
  id: string;
  wallet_id: string;
  from_alias?: string;
  to_address: string;
  amount_sol: number;
  tx_signature: string | null;
  status: string;
  created_at: string;
}

// ============================================================
// Dashboard
// ============================================================
export interface DashboardStats {
  total_wallets: number;
  active_wallets: number;
  test_wallets: number;
  real_wallets: number;
  open_positions: number;
  total_trades_today: number;
  total_volume_today: number;
}

export interface WalletPerformance {
  alias: string;
  type: WalletType;
  consecutive_losses: number;
  current_balance: number;
  start_balance_day: number;
  net_profit_sol: number;
  trade_count: number;
  profit_24h: number;
}

// ============================================================
// Trade Execution
// ============================================================
export interface BuyRequest {
  wallet_alias: string;
  mint: string;
  amount_sol: number;
  slippage_bps?: number;
  use_jito?: boolean;
  jito_tip_lamports?: number;
}

export interface SellRequest {
  wallet_alias: string;
  mint: string;
  amount_pct?: number;
  slippage_bps?: number;
  use_jito?: boolean;
  jito_tip_lamports?: number;
}

export interface SellAllRequest {
  wallet_alias: string;
  slippage_bps?: number;
  use_jito?: boolean;
  jito_tip_lamports?: number;
}

export interface TransferRequest {
  wallet_alias: string;
  to_address: string;
  amount_sol?: number;
  force_sweep?: boolean;
}

export interface TradeResponse {
  status: 'success' | 'error';
  message?: string;
  data?: {
    tokens_received?: number;
    sol_received_net?: number;
    pnl_sol?: number;
    entry_price?: number;
    exit_price?: number;
    amount_sent?: number;
  };
}
