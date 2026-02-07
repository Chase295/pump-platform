/**
 * TypeScript types for the pump-server (predictions) module.
 * Migrated from pump-server/frontend/src/types/model.ts
 */

// Active model (imported into pump-server)
export interface ServerModel {
  id: number;
  model_id: number;
  name: string;
  custom_name?: string;
  model_type: string;
  target_variable: string;
  target_operator?: string;
  target_value?: number;
  future_minutes: number;
  price_change_percent: number;
  target_direction: string;
  features: string[];
  phases?: number[] | null;

  // Status
  is_active: boolean;

  // Alert configuration
  n8n_webhook_url?: string;
  n8n_enabled: boolean;
  n8n_send_mode:
    | ('all' | 'alerts_only' | 'positive_only' | 'negative_only')[]
    | 'all'
    | 'alerts_only'
    | 'positive_only'
    | 'negative_only';
  alert_threshold: number;
  coin_filter_mode: 'all' | 'whitelist';
  coin_whitelist?: string[];

  // Ignore settings
  ignore_bad_seconds: number;
  ignore_positive_seconds: number;
  ignore_alert_seconds: number;

  // Max log entries settings
  max_log_entries_per_coin_negative?: number;
  max_log_entries_per_coin_positive?: number;
  max_log_entries_per_coin_alert?: number;
  send_ignored_to_n8n?: boolean;

  // Training performance metrics
  accuracy?: number;
  f1_score?: number;
  precision?: number;
  recall?: number;
  roc_auc?: number;
  mcc?: number;
  simulated_profit_pct?: number;

  // Live performance metrics
  total_predictions?: number;
  positive_predictions?: number;
  average_probability?: number;
  last_prediction_at?: string;

  // Alert statistics (optional, loaded separately)
  alert_stats?: AlertStatistics;

  // Model file status
  model_file_exists?: boolean;

  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// Available model for import (from training service)
export interface AvailableModel {
  id: number;
  name: string;
  model_type: string;
  target_variable: string;
  target_operator?: string | null;
  target_value?: number | null;
  future_minutes: number;
  price_change_percent: number;
  target_direction: string;
  features: string[];
  phases?: number[] | null;
  training_accuracy?: number;
  training_f1?: number;
  training_precision?: number;
  training_recall?: number;
  created_at: string;
}

// Alert configuration for updates
export interface AlertConfig {
  n8n_webhook_url?: string;
  n8n_enabled: boolean;
  n8n_send_mode: string[];
  alert_threshold: number;
  coin_filter_mode: 'all' | 'whitelist';
  coin_whitelist?: string[];
  send_ignored_to_n8n?: boolean;
}

// Ignore settings
export interface IgnoreSettings {
  ignore_bad_seconds: number;
  ignore_positive_seconds: number;
  ignore_alert_seconds: number;
}

// Max log entries settings
export interface MaxLogEntriesSettings {
  max_log_entries_per_coin_negative: number;
  max_log_entries_per_coin_positive: number;
  max_log_entries_per_coin_alert: number;
}

// Alert evaluation
export interface AlertEvaluation {
  id: number;
  model_id: number;
  active_model_id?: number;
  coin_id: string;
  prediction_id?: number;
  probability: number;
  status: string;
  evaluation_result?: 'success' | 'failed' | null;
  alert_timestamp: string;
  evaluation_timestamp?: string;
  predicted_price_change?: number;
  actual_price_change?: number;
  actual_price_change_pct?: number;
  ath_price_change_pct?: number;
  ath_timestamp?: string;
  price_change_percent?: number;
  target_direction?: 'up' | 'down';
  prediction_type?: 'time_based' | 'classic';
  remaining_seconds?: number;
  model_name?: string;
  alert_threshold?: number;
  // model_predictions fields
  tag?: string;
  prediction_timestamp?: string;
  ath_highest_pct?: number;
  ath_lowest_pct?: number;
}

// Alert statistics
export interface AlertStatistics {
  total_alerts: number;
  pending: number;
  success: number;
  failed: number;
  expired: number;
  alerts_above_threshold?: number;
  non_alerts_count?: number;
  alerts_success?: number;
  alerts_failed?: number;
  alerts_pending?: number;
  non_alerts_success?: number;
  non_alerts_failed?: number;
  non_alerts_pending?: number;
  alerts_success_rate?: number;
  non_alerts_success_rate?: number;
  success_rate?: number;
  total_performance_pct?: number;
  alerts_profit_pct?: number;
  alerts_loss_pct?: number;
}

// Prediction
export interface Prediction {
  id: number;
  active_model_id: number;
  coin_id: string;
  prediction: number;
  probability: number;
  features_used: string[];
  predicted_at: string;
  created_at: string;
}

// Price data point for charts
export interface PriceDataPoint {
  timestamp: string;
  price_open?: number;
  price_high?: number;
  price_low?: number;
  price_close?: number;
  volume_sol?: number;
  market_cap_close?: number;
}

// Prediction marker for charts
export interface PredictionMarker {
  id: number;
  timestamp: string;
  prediction_timestamp?: string;
  evaluation_timestamp?: string;
  prediction: number;
  probability: number;
  alert_threshold: number;
  is_alert: boolean;
}

// Evaluation marker for charts
export interface EvaluationMarker {
  id: number;
  evaluation_timestamp?: string;
  prediction_timestamp: string;
  status: 'success' | 'failed' | 'pending' | 'expired';
  actual_price_change?: number;
  expected_price_change?: number;
  probability?: number;
}

// Coin details response
export interface CoinDetailsResponse {
  coin_id: string;
  model_id: number;
  prediction_timestamp: string;
  price_history: PriceDataPoint[];
  predictions: PredictionMarker[];
  evaluations: EvaluationMarker[];
}

// Import response
export interface ImportResponse {
  active_model_id: number;
  model_id: number;
  model_name: string;
  local_model_path: string;
  message: string;
}
