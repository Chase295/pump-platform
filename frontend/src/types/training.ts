// ============================================================
// Training Module TypeScript Interfaces
// Based on pump-training API schemas
// ============================================================

// ============================================================
// Model
// ============================================================
export interface ModelResponse {
  id: number;
  name: string;
  model_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  target_variable: string;
  target_operator?: string;
  target_value?: number;
  train_start: string;
  train_end: string;
  features: string[];
  phases?: number[];
  params?: Record<string, any>;
  feature_importance?: Record<string, number>;
  training_accuracy?: number;
  training_f1?: number;
  training_precision?: number;
  training_recall?: number;
  roc_auc?: number;
  mcc?: number;
  fpr?: number;
  fnr?: number;
  confusion_matrix?: Record<string, number>;
  simulated_profit_pct?: number;
  tp?: number;
  tn?: number;
  fp?: number;
  fn?: number;
  cv_scores?: Record<string, any>;
  cv_overfitting_gap?: number;
  model_file_path?: string;
  description?: string;
  future_minutes?: number;
  price_change_percent?: number;
  min_percent_change?: number;
  target_direction?: string;

  // Advanced training features
  best_iteration?: number;
  best_score?: number;
  low_importance_features?: string[];
  shap_values?: Record<string, number>;
  early_stopping_rounds?: number;
  threshold_sweep?: ThresholdSweepEntry[];
}

// ============================================================
// Threshold Sweep
// ============================================================
export interface ThresholdSweepEntry {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  simulated_profit_pct: number;
}

// ============================================================
// Diagnostics
// ============================================================
export interface ProbaStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p25: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  above_05: number;
  above_10: number;
  above_20: number;
  above_30: number;
  above_50: number;
}

export interface FeatureDiagnostics {
  total_features: number;
  zero_features_count: number;
  zero_features_pct: number;
  zero_features: string[];
}

// ============================================================
// Test Result
// ============================================================
export interface TestResultResponse {
  id: number;
  model_id: number;
  created_at: string;
  test_start: string;
  test_end: string;
  accuracy?: number;
  f1_score?: number;
  precision_score?: number;
  recall?: number;
  roc_auc?: number;
  mcc?: number;
  fpr?: number;
  fnr?: number;
  confusion_matrix?: Record<string, number>;
  simulated_profit_pct?: number;
  tp?: number;
  tn?: number;
  fp?: number;
  fn?: number;
  num_samples?: number;
  num_positive?: number;
  num_negative?: number;
  has_overlap: boolean;
  overlap_note?: string;
  feature_importance?: Record<string, number>;
  train_accuracy?: number;
  train_f1?: number;
  train_precision?: number;
  train_recall?: number;
  accuracy_degradation?: number;
  f1_degradation?: number;
  is_overfitted?: boolean;
  test_duration_days?: number;
  model_name?: string;
  total_predictions?: number;
  threshold_sweep?: ThresholdSweepEntry[];
  proba_stats?: ProbaStats;
  feature_diagnostics?: FeatureDiagnostics;
}

// ============================================================
// Comparison
// ============================================================
export interface ComparisonResponse {
  id: number;
  created_at: string;
  model_a_id?: number;
  model_b_id?: number;
  model_ids: number[];
  test_start: string;
  test_end: string;
  num_samples?: number;
  winner_id?: number;
  winner_reason?: string;
  results?: ComparisonResult[];

  // Legacy dual-model fields
  a_accuracy?: number;
  a_f1?: number;
  a_precision?: number;
  a_recall?: number;
  a_mcc?: number;
  b_accuracy?: number;
  b_f1?: number;
  b_precision?: number;
  b_recall?: number;
  b_mcc?: number;
}

export interface ComparisonResult {
  model_id: number;
  accuracy?: number;
  f1_score?: number;
  precision_score?: number;
  recall?: number;
  roc_auc?: number;
  mcc?: number;
  fpr?: number;
  fnr?: number;
  simulated_profit_pct?: number;
  tp?: number;
  tn?: number;
  fp?: number;
  fn?: number;
  num_samples?: number;
  avg_score?: number;
}

// ============================================================
// Job
// ============================================================
export interface JobResponse {
  id: number;
  job_type: string;
  status: string;
  priority: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  progress: number;
  progress_msg?: string;
  error_msg?: string;
  worker_id?: string;
  train_model_type?: string;
  train_target_var?: string;
  train_operator?: string;
  train_value?: number;
  train_start?: string;
  train_end?: string;
  train_features?: string[];
  train_phases?: number[];
  train_params?: Record<string, any>;
  result_model_id?: number;
  test_model_id?: number;
  test_start?: string;
  test_end?: string;
  result_test_id?: number;
  compare_model_a_id?: number;
  compare_model_b_id?: number;
  compare_start?: string;
  compare_end?: string;
  result_comparison_id?: number;
  result_model?: ModelResponse;
  result_test?: TestResultResponse;
  result_comparison?: ComparisonResponse;
}

// ============================================================
// Features & Data
// ============================================================
export interface Feature {
  id: string;
  name: string;
  description?: string;
  category: string;
  importance?: string;
}

export interface FeatureCategory {
  id: string;
  name: string;
  description?: string;
  features: Feature[];
}

export interface DataAvailability {
  min_timestamp: string;
  max_timestamp: string;
  total_records: number;
}

export interface CoinPhase {
  id: number;
  name: string;
  interval_seconds: number;
  max_age_minutes: number;
  description?: string;
}

// ============================================================
// Requests
// ============================================================
export interface CreateModelRequest {
  name: string;
  model_type: 'xgboost';
  features: string[];
  train_start: string;
  train_end: string;
  description?: string;
  phases?: number[];
  future_minutes?: number;
  min_percent_change?: number;
  direction?: 'up' | 'down';
  use_engineered_features?: boolean;
  use_flag_features?: boolean;
  use_smote?: boolean;
  scale_pos_weight?: number;
  target_var?: string;
}

export interface TestModelRequest {
  test_start: string;
  test_end: string;
}

export interface CompareModelsRequest {
  model_ids: number[];
  test_start: string;
  test_end: string;
}

// ============================================================
// API Responses
// ============================================================
export interface CreateJobResponse {
  job_id: number;
  message: string;
  status: string;
}

export interface HealthResponse {
  status: string;
  db_connected: boolean;
  uptime_seconds: number;
  start_time?: number;
  total_jobs_processed: number;
  last_error?: string;
}
