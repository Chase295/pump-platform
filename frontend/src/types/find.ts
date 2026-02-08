// TypeScript interfaces for the Find (Discovery) module

export interface CacheStats {
  total_coins: number;
  activated_coins: number;
  expired_coins: number;
  oldest_age_seconds: number;
  newest_age_seconds: number;
}

export interface TrackingStats {
  active_coins: number;
  total_trades: number;
  total_metrics_saved: number;
}

export interface DiscoveryStats {
  total_coins_discovered: number;
  n8n_available: boolean;
  n8n_buffer_size: number;
}

export interface FindHealthResponse {
  status: 'healthy' | 'degraded' | 'error';
  ws_connected: boolean;
  db_connected: boolean;
  uptime_seconds: number;
  last_message_ago: number | null;
  reconnect_count: number;
  last_error: string | null;
  cache_stats: CacheStats;
  tracking_stats: TrackingStats;
  discovery_stats: DiscoveryStats;
}

export interface FindConfigResponse {
  n8n_webhook_url: string;
  n8n_webhook_method: string;
  coin_cache_seconds: number;
  db_refresh_interval: number;
  batch_size: number;
  batch_timeout: number;
  bad_names_pattern: string;
  spam_burst_window: number;
  sol_reserves_full: number;
  whale_threshold_sol: number;
  trade_buffer_seconds: number;
}

export interface FindConfigUpdateRequest {
  n8n_webhook_url?: string;
  n8n_webhook_method?: string;
  coin_cache_seconds?: number;
  db_refresh_interval?: number;
  batch_size?: number;
  batch_timeout?: number;
  bad_names_pattern?: string;
  spam_burst_window?: number;
}

export interface FindConfigUpdateResponse {
  status: string;
  message: string;
  updated_fields: string[];
  new_config: Partial<FindConfigUpdateRequest>;
}

export interface Phase {
  id: number;
  name: string;
  interval_seconds: number;
  min_age_minutes: number;
  max_age_minutes: number;
}

export interface PhaseUpdateRequest {
  name?: string;
  interval_seconds?: number;
  min_age_minutes?: number;
  max_age_minutes?: number;
}

export interface PhaseUpdateResponse {
  status: string;
  message: string;
  phase: Phase;
  updated_streams: number;
}

export interface PhaseCreateRequest {
  name: string;
  interval_seconds: number;
  min_age_minutes: number;
  max_age_minutes: number;
}

export interface PhaseCreateResponse {
  status: string;
  message: string;
  phase: Phase;
}

export interface PhaseDeleteResponse {
  status: string;
  message: string;
  deleted_phase_id: number;
  affected_streams: number;
}

export interface Stream {
  token_address: string;
  current_phase_id: number;
  is_active: boolean;
  is_graduated: boolean;
  started_at: string;
  last_metric_at?: string;
}

export interface StreamStats {
  total_streams: number;
  active_streams: number;
  streams_by_phase: Record<number, number>;
}

export interface CoinDetail {
  mint: string;
  name?: string;
  symbol?: string;
  stream?: Stream;
  metrics?: unknown[];
  analytics?: unknown;
}
