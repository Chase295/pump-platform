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
// Recent Sell (with P&L)
// ============================================================
export interface RecentSell {
  id: string;
  mint: string;
  amount_sol: number;
  amount_tokens: number;
  network_fee_sol: number;
  jito_tip_lamports: number | null;
  is_simulation: boolean;
  created_at: string;
  tx_signature: string | null;
  wallet_alias: string;
  wallet_type: WalletType;
  entry_price: number;
  pnl_sol: number;
  pnl_percent: number;
  position_closed: boolean;
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

// ============================================================
// Dashboard Analytics
// ============================================================
export interface ExchangeRate {
  sol_price_usd: number;
  usd_to_eur_rate: number;
  sol_price_eur: number;
  timestamp: string;
}

export interface PnlBucket {
  bucket: string;
  cumulative_pnl_sol: number;
  fees_sol: number;
}

export interface PnlHistoryResponse {
  data: PnlBucket[];
  period: string;
  bucket_size: string;
}

export interface TradeActivityBucket {
  bucket: string;
  buy_count: number;
  sell_count: number;
}

export interface TradeActivityResponse {
  data: TradeActivityBucket[];
  period: string;
  bucket_size: string;
}

export interface TradeAnalytics {
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win_sol: number;
  avg_loss_sol: number;
  profit_factor: number;
  total_network_fees_sol: number;
  total_jito_tips_sol: number;
  total_fees_sol: number;
  gross_pnl_sol: number;
  net_pnl_sol: number;
  best_trade_sol: number;
  worst_trade_sol: number;
  best_trade_mint: string | null;
  worst_trade_mint: string | null;
}

// ============================================================
// Wallet Detail Analytics
// ============================================================
export interface WalletAnalytics {
  total_buys: number;
  total_sells: number;
  total_trades: number;
  total_volume_sol: number;
  total_fees_sol: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl_sol: number;
}

export interface ValuedPosition extends Position {
  current_value_sol: number | null;
  unrealized_pnl_sol: number | null;
}

// ============================================================
// Coin Trade Detail
// ============================================================
export interface CoinTradeDetailTrade {
  id: string;
  action: TradeAction;
  mint: string;
  amount_sol: number;
  amount_tokens: number;
  network_fee_sol: number;
  jito_tip_lamports: number | null;
  is_simulation: boolean;
  created_at: string;
  tx_signature: string | null;
  wallet_alias: string;
  entry_price: number;
  price_at_trade: number;
  pnl_sol: number;
  pnl_percent: number;
}

export interface CoinTradeDetailResponse {
  mint: string;
  price_history: Array<{ timestamp: string; price_close: number | null }>;
  trades: CoinTradeDetailTrade[];
}

// ============================================================
// Trading Workflows
// ============================================================
export type WorkflowType = 'BUY' | 'SELL';
export type BuyAmountMode = 'fixed' | 'percent';
export type WorkflowExecutionResult = 'EXECUTED' | 'REJECTED' | 'ERROR';

export interface BuyChainTrigger {
  type: 'prediction_alert';
  model_id: number;
  min_probability: number;
}

export interface BuyChainCondition {
  type: 'on_demand_prediction';
  model_id: number;
  operator: 'gte' | 'lte' | 'gt' | 'lt';
  threshold: number;
}

export interface BuyChain {
  trigger: BuyChainTrigger;
  conditions: BuyChainCondition[];
}

export interface SellRule {
  type: 'stop_loss' | 'trailing_stop' | 'take_profit' | 'timeout';
  percent?: number;
  from?: 'entry' | 'peak';
  minutes?: number;
}

export interface SellChain {
  rules: SellRule[];
}

export interface TradingWorkflow {
  id: string;
  wallet_id: string;
  wallet_alias?: string;
  name: string;
  type: WorkflowType;
  is_active: boolean;
  chain: BuyChain | SellChain;
  buy_amount_mode?: BuyAmountMode;
  buy_amount_value?: number;
  sell_amount_pct?: number;
  cooldown_seconds: number;
  max_open_positions: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  mint: string;
  trigger_data: Record<string, unknown>;
  steps_log: Array<Record<string, unknown>>;
  result: WorkflowExecutionResult;
  error_message?: string;
  trade_log_id?: string;
  created_at: string;
}

export interface WorkflowCreateRequest {
  wallet_alias: string;
  name: string;
  type: WorkflowType;
  chain: BuyChain | SellChain;
  buy_amount_mode?: BuyAmountMode;
  buy_amount_value?: number;
  sell_amount_pct?: number;
  cooldown_seconds?: number;
  max_open_positions?: number;
}
