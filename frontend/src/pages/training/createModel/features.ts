export interface BaseFeature {
  id: string;
  name: string;
  desc: string;
  importance: 'essential' | 'recommended' | 'optional';
  category: string;
}

export interface EngFeature {
  id: string;
  category: string;
  importance: 'high' | 'medium';
}

export interface FeatureCategory {
  id: string;
  name: string;
  desc: string;
}

// ── Base Features ─────────────────────────────────────────────
export const BASE_FEATURES: BaseFeature[] = [
  { id: 'price_close', name: 'Price Close', desc: 'Closing price', importance: 'essential', category: 'price' },
  { id: 'volume_sol', name: 'Volume SOL', desc: 'Trading volume in SOL', importance: 'essential', category: 'volume' },
  { id: 'buy_pressure_ratio', name: 'Buy Pressure', desc: 'Buys vs Sells ratio', importance: 'essential', category: 'momentum' },
  { id: 'dev_sold_amount', name: 'Dev Sold', desc: 'Developer sell amount (RUG indicator)', importance: 'recommended', category: 'safety' },
  { id: 'whale_buy_volume_sol', name: 'Whale Buys', desc: 'Whale buy volume', importance: 'recommended', category: 'whale' },
  { id: 'whale_sell_volume_sol', name: 'Whale Sells', desc: 'Whale sell volume', importance: 'recommended', category: 'whale' },
  { id: 'unique_signer_ratio', name: 'Community', desc: 'Unique buyer ratio', importance: 'recommended', category: 'community' },
  { id: 'volatility_pct', name: 'Volatility', desc: 'Risk indicator', importance: 'recommended', category: 'risk' },
  { id: 'market_cap_close', name: 'Market Cap', desc: 'Market capitalization', importance: 'recommended', category: 'market' },
  { id: 'price_open', name: 'Price Open', desc: 'Opening price', importance: 'optional', category: 'price' },
  { id: 'price_high', name: 'Price High', desc: 'Highest price', importance: 'optional', category: 'price' },
  { id: 'price_low', name: 'Price Low', desc: 'Lowest price', importance: 'optional', category: 'price' },
  { id: 'buy_volume_sol', name: 'Buy Volume', desc: 'Buy-only volume', importance: 'optional', category: 'volume' },
  { id: 'sell_volume_sol', name: 'Sell Volume', desc: 'Sell-only volume', importance: 'optional', category: 'volume' },
  { id: 'net_volume_sol', name: 'Net Volume', desc: 'Buys minus sells', importance: 'optional', category: 'volume' },
  { id: 'bonding_curve_pct', name: 'Bonding Curve', desc: 'Curve progress', importance: 'optional', category: 'market' },
  { id: 'virtual_sol_reserves', name: 'Virtual SOL', desc: 'Bonding curve reserves', importance: 'optional', category: 'market' },
  { id: 'is_koth', name: 'King of Hill', desc: 'KOTH status flag', importance: 'optional', category: 'market' },
  { id: 'phase_id_at_time', name: 'Phase ID', desc: 'Current coin phase', importance: 'optional', category: 'market' },
  { id: 'num_buys', name: 'Num Buys', desc: 'Number of buys', importance: 'optional', category: 'activity' },
  { id: 'num_sells', name: 'Num Sells', desc: 'Number of sells', importance: 'optional', category: 'activity' },
  { id: 'num_micro_trades', name: 'Micro Trades', desc: 'Trades < 0.01 SOL', importance: 'optional', category: 'activity' },
  { id: 'avg_trade_size_sol', name: 'Avg Trade', desc: 'Average trade size', importance: 'optional', category: 'activity' },
  { id: 'max_single_buy_sol', name: 'Max Buy', desc: 'Largest single buy', importance: 'optional', category: 'whale' },
  { id: 'max_single_sell_sol', name: 'Max Sell', desc: 'Largest single sell', importance: 'optional', category: 'whale' },
  { id: 'num_whale_buys', name: 'Whale Buy Count', desc: 'Number of whale buys', importance: 'optional', category: 'whale' },
  { id: 'num_whale_sells', name: 'Whale Sell Count', desc: 'Number of whale sells', importance: 'optional', category: 'whale' },
  { id: 'unique_wallets', name: 'Unique Wallets', desc: 'Unique wallets count', importance: 'optional', category: 'community' },
];

// ── Base Feature Categories ──────────────────────────────────
export const BASE_CATEGORIES: FeatureCategory[] = [
  { id: 'price', name: 'Price', desc: 'Price OHLC data' },
  { id: 'volume', name: 'Volume', desc: 'Trading volume metrics' },
  { id: 'momentum', name: 'Momentum', desc: 'Buy/sell pressure' },
  { id: 'safety', name: 'Safety', desc: 'Developer activity' },
  { id: 'whale', name: 'Whale', desc: 'Large wallet tracking' },
  { id: 'community', name: 'Community', desc: 'Wallet diversity' },
  { id: 'risk', name: 'Risk', desc: 'Volatility indicators' },
  { id: 'market', name: 'Market', desc: 'Market cap & bonding' },
  { id: 'activity', name: 'Activity', desc: 'Trade counts & sizes' },
];

// ── Engineering Feature Categories ───────────────────────────
export const ENGINEERING_CATEGORIES: FeatureCategory[] = [
  { id: 'dev', name: 'Dev Activity', desc: 'Developer sell detection' },
  { id: 'momentum', name: 'Momentum', desc: 'Buy pressure trends' },
  { id: 'whale', name: 'Whale Tracking', desc: 'Large investor behavior' },
  { id: 'risk', name: 'Risk Analysis', desc: 'Volatility indicators' },
  { id: 'safety', name: 'Safety', desc: 'Wash trading detection' },
  { id: 'volume', name: 'Volume Patterns', desc: 'Volume trends and flips' },
  { id: 'price', name: 'Price Momentum', desc: 'Price changes over time' },
  { id: 'market', name: 'Market Velocity', desc: 'Market cap speed' },
  { id: 'ath', name: 'ATH Analysis', desc: 'All-time-high tracking' },
  { id: 'power', name: 'Power Features', desc: 'Combined signals' },
];

// ── Engineering Features ─────────────────────────────────────
export const ENGINEERING_FEATURES: EngFeature[] = [
  { id: 'dev_sold_flag', category: 'dev', importance: 'high' },
  { id: 'dev_sold_cumsum', category: 'dev', importance: 'high' },
  { id: 'dev_sold_spike_5', category: 'dev', importance: 'high' },
  { id: 'dev_sold_spike_10', category: 'dev', importance: 'medium' },
  { id: 'dev_sold_spike_15', category: 'dev', importance: 'medium' },
  { id: 'buy_pressure_ma_5', category: 'momentum', importance: 'high' },
  { id: 'buy_pressure_trend_5', category: 'momentum', importance: 'high' },
  { id: 'buy_pressure_ma_10', category: 'momentum', importance: 'medium' },
  { id: 'buy_pressure_trend_10', category: 'momentum', importance: 'medium' },
  { id: 'buy_pressure_ma_15', category: 'momentum', importance: 'medium' },
  { id: 'buy_pressure_trend_15', category: 'momentum', importance: 'medium' },
  { id: 'whale_net_volume', category: 'whale', importance: 'high' },
  { id: 'whale_activity_5', category: 'whale', importance: 'high' },
  { id: 'whale_activity_10', category: 'whale', importance: 'medium' },
  { id: 'whale_activity_15', category: 'whale', importance: 'medium' },
  { id: 'volatility_ma_5', category: 'risk', importance: 'high' },
  { id: 'volatility_spike_5', category: 'risk', importance: 'high' },
  { id: 'volatility_ma_10', category: 'risk', importance: 'medium' },
  { id: 'volatility_spike_10', category: 'risk', importance: 'medium' },
  { id: 'volatility_ma_15', category: 'risk', importance: 'medium' },
  { id: 'volatility_spike_15', category: 'risk', importance: 'medium' },
  { id: 'wash_trading_flag_5', category: 'safety', importance: 'high' },
  { id: 'wash_trading_flag_10', category: 'safety', importance: 'medium' },
  { id: 'wash_trading_flag_15', category: 'safety', importance: 'medium' },
  { id: 'net_volume_ma_5', category: 'volume', importance: 'high' },
  { id: 'volume_flip_5', category: 'volume', importance: 'high' },
  { id: 'net_volume_ma_10', category: 'volume', importance: 'medium' },
  { id: 'volume_flip_10', category: 'volume', importance: 'medium' },
  { id: 'net_volume_ma_15', category: 'volume', importance: 'medium' },
  { id: 'volume_flip_15', category: 'volume', importance: 'medium' },
  { id: 'price_change_5', category: 'price', importance: 'high' },
  { id: 'price_change_10', category: 'price', importance: 'high' },
  { id: 'price_change_15', category: 'price', importance: 'medium' },
  { id: 'price_roc_5', category: 'price', importance: 'high' },
  { id: 'price_roc_10', category: 'price', importance: 'medium' },
  { id: 'price_roc_15', category: 'price', importance: 'medium' },
  { id: 'mcap_velocity_5', category: 'market', importance: 'high' },
  { id: 'mcap_velocity_10', category: 'market', importance: 'medium' },
  { id: 'mcap_velocity_15', category: 'market', importance: 'medium' },
  { id: 'rolling_ath', category: 'ath', importance: 'high' },
  { id: 'price_vs_ath_pct', category: 'ath', importance: 'high' },
  { id: 'ath_breakout', category: 'ath', importance: 'high' },
  { id: 'minutes_since_ath', category: 'ath', importance: 'high' },
  { id: 'ath_distance_trend_5', category: 'ath', importance: 'high' },
  { id: 'ath_approach_5', category: 'ath', importance: 'high' },
  { id: 'ath_breakout_count_5', category: 'ath', importance: 'high' },
  { id: 'ath_distance_trend_10', category: 'ath', importance: 'high' },
  { id: 'ath_approach_10', category: 'ath', importance: 'high' },
  { id: 'ath_breakout_count_10', category: 'ath', importance: 'high' },
  { id: 'ath_distance_trend_15', category: 'ath', importance: 'high' },
  { id: 'ath_approach_15', category: 'ath', importance: 'high' },
  { id: 'ath_breakout_count_15', category: 'ath', importance: 'high' },
  { id: 'ath_breakout_volume_ma_5', category: 'ath', importance: 'high' },
  { id: 'ath_breakout_volume_ma_10', category: 'ath', importance: 'high' },
  { id: 'ath_breakout_volume_ma_15', category: 'ath', importance: 'high' },
  { id: 'ath_age_trend_5', category: 'ath', importance: 'high' },
  { id: 'ath_age_trend_10', category: 'ath', importance: 'high' },
  { id: 'ath_age_trend_15', category: 'ath', importance: 'high' },
  { id: 'buy_sell_ratio', category: 'power', importance: 'high' },
  { id: 'whale_dominance', category: 'power', importance: 'high' },
  { id: 'price_acceleration_5', category: 'power', importance: 'high' },
  { id: 'price_acceleration_10', category: 'power', importance: 'medium' },
  { id: 'price_acceleration_15', category: 'power', importance: 'medium' },
  { id: 'volume_spike_5', category: 'power', importance: 'high' },
  { id: 'volume_spike_10', category: 'power', importance: 'medium' },
  { id: 'volume_spike_15', category: 'power', importance: 'medium' },
];

// ── Extra Source Features ────────────────────────────────────
export interface ExtraFeature {
  id: string;
  name: string;
  desc: string;
}

export const GRAPH_FEATURES: ExtraFeature[] = [
  { id: 'creator_total_tokens', name: 'Creator Tokens', desc: 'Tokens created by this creator' },
  { id: 'creator_avg_risk_score', name: 'Creator Risk', desc: 'Avg risk score of creator tokens' },
  { id: 'creator_any_graduated', name: 'Creator Graduated', desc: 'Any token by creator graduated' },
  { id: 'creator_is_serial', name: 'Serial Creator', desc: 'Creator has ≥5 tokens' },
  { id: 'wallet_cluster_count', name: 'Wallet Clusters', desc: 'Trading wallet cluster count' },
  { id: 'avg_cluster_risk', name: 'Cluster Risk', desc: 'Avg risk of wallet clusters' },
  { id: 'similar_token_count', name: 'Similar Tokens', desc: 'Graph-similar token count' },
  { id: 'similar_tokens_graduated_pct', name: 'Similar Graduated', desc: '% similar tokens graduated' },
];

export const EMBEDDING_FEATURES: ExtraFeature[] = [
  { id: 'similarity_to_pumps', name: 'Pump Similarity', desc: 'Avg similarity to pump patterns' },
  { id: 'similarity_to_rugs', name: 'Rug Similarity', desc: 'Avg similarity to rug patterns' },
  { id: 'max_pump_similarity', name: 'Max Pump', desc: 'Max similarity to any pump' },
  { id: 'max_rug_similarity', name: 'Max Rug', desc: 'Max similarity to any rug' },
  { id: 'nearest_pattern_label', name: 'Nearest Label', desc: 'Label of most similar pattern' },
  { id: 'nearest_pattern_similarity', name: 'Nearest Score', desc: 'Score of nearest pattern' },
];

export const TRANSACTION_FEATURES: ExtraFeature[] = [
  { id: 'tx_wallet_concentration', name: 'Wallet Concentration', desc: 'Gini coefficient of trader volumes' },
  { id: 'tx_top3_holder_pct', name: 'Top 3 Holders', desc: '% volume from top 3 traders' },
  { id: 'tx_unique_traders', name: 'Unique Traders', desc: 'Number of unique traders' },
  { id: 'tx_buy_sell_ratio', name: 'Buy/Sell Ratio', desc: 'Buy count / sell count' },
  { id: 'tx_avg_time_between_trades', name: 'Trade Interval', desc: 'Avg seconds between trades' },
  { id: 'tx_burst_count', name: 'Burst Count', desc: 'Trading bursts (>10 in 60s)' },
  { id: 'tx_whale_pct', name: 'Whale %', desc: '% volume from whale trades' },
  { id: 'tx_quick_reversal_count', name: 'Quick Reversals', desc: 'Buy→sell in <2min same trader' },
];

export const METADATA_FEATURES: ExtraFeature[] = [
  { id: 'meta_initial_buy_sol', name: 'Initial Buy SOL', desc: 'Creator investment in SOL (capped at 100)' },
  { id: 'meta_initial_buy_ratio', name: 'Buy Ratio', desc: 'Initial buy / market cap (skin-in-the-game)' },
  { id: 'meta_token_supply_log', name: 'Supply (log)', desc: 'Log10 of token supply' },
  { id: 'meta_has_socials', name: 'Has Socials', desc: 'Social media presence (0/1)' },
  { id: 'meta_social_count', name: 'Social Count', desc: 'Number of social links (0-4)' },
  { id: 'meta_metadata_mutable', name: 'Metadata Mutable', desc: 'Rug risk: metadata changeable (null=risky)' },
  { id: 'meta_mint_authority', name: 'Mint Authority', desc: 'Rug risk: can mint more tokens (null=risky)' },
  { id: 'meta_risk_score', name: 'Risk Score', desc: 'Pre-computed risk score (0-1)' },
  { id: 'meta_top10_holders_pct', name: 'Top10 Holders', desc: 'Holder concentration (0-1)' },
  { id: 'meta_liquidity_sol', name: 'Liquidity', desc: 'Initial liquidity log10(SOL+1)' },
  { id: 'meta_is_mayhem', name: 'Mayhem Mode', desc: 'Market chaos mode active (0/1)' },
  { id: 'meta_sol_price_usd', name: 'SOL Price', desc: 'SOL price at discovery as market context' },
  { id: 'meta_sol_price_change_1h', name: 'SOL Change 1h', desc: 'SOL price momentum (% change)' },
];

// ── Helpers ──────────────────────────────────────────────────
export function getBaseFeaturesByCategory(categoryId: string): BaseFeature[] {
  return BASE_FEATURES.filter((f) => f.category === categoryId);
}

export function getEngFeaturesByCategory(categoryId: string): EngFeature[] {
  return ENGINEERING_FEATURES.filter((f) => f.category === categoryId);
}

export function getHighImportanceEngFeatures(): string[] {
  return ENGINEERING_FEATURES.filter((f) => f.importance === 'high').map((f) => f.id);
}

export function getEssentialBaseFeatures(): string[] {
  return BASE_FEATURES.filter((f) => f.importance === 'essential').map((f) => f.id);
}

export function getRecommendedBaseFeatures(): string[] {
  return BASE_FEATURES.filter((f) => f.importance !== 'optional').map((f) => f.id);
}
