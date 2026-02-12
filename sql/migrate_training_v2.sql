-- ============================================================
-- Training Module V2 Migration
-- Adds: TUNE jobs, SHAP/Early Stopping metadata, Training Settings
-- ============================================================

-- 1. Allow TUNE job type
ALTER TABLE ml_jobs DROP CONSTRAINT IF EXISTS chk_job_type;
ALTER TABLE ml_jobs ADD CONSTRAINT chk_job_type
  CHECK (job_type IN ('TRAIN', 'TEST', 'COMPARE', 'TUNE'));

-- 2. TUNE job columns
ALTER TABLE ml_jobs ADD COLUMN IF NOT EXISTS tune_model_id BIGINT REFERENCES ml_models(id);
ALTER TABLE ml_jobs ADD COLUMN IF NOT EXISTS tune_strategy VARCHAR(20) DEFAULT 'random';
ALTER TABLE ml_jobs ADD COLUMN IF NOT EXISTS tune_n_iterations INTEGER DEFAULT 20;
ALTER TABLE ml_jobs ADD COLUMN IF NOT EXISTS tune_param_space JSONB;
ALTER TABLE ml_jobs ADD COLUMN IF NOT EXISTS tune_results JSONB;

-- 3. SHAP + Early Stopping metadata on models
ALTER TABLE ml_models ADD COLUMN IF NOT EXISTS shap_values JSONB;
ALTER TABLE ml_models ADD COLUMN IF NOT EXISTS best_iteration INTEGER;
ALTER TABLE ml_models ADD COLUMN IF NOT EXISTS best_score NUMERIC(10, 6);
ALTER TABLE ml_models ADD COLUMN IF NOT EXISTS low_importance_features JSONB;
ALTER TABLE ml_models ADD COLUMN IF NOT EXISTS early_stopping_rounds INTEGER;

-- 4. Training Settings table (key-value store)
CREATE TABLE IF NOT EXISTS training_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Default settings
INSERT INTO training_settings (key, value) VALUES
  ('auto_retrain_enabled', 'false'),
  ('auto_retrain_schedule', '"daily"'),
  ('auto_retrain_base_model_id', 'null'),
  ('auto_retrain_auto_deploy', 'false'),
  ('drift_detection_enabled', 'false'),
  ('drift_accuracy_threshold', '0.5'),
  ('drift_check_interval_hours', '6'),
  ('default_model_type', '"xgboost"'),
  ('default_early_stopping_rounds', '10'),
  ('default_enable_shap', 'false'),
  ('graph_features_enabled', 'true'),
  ('embedding_features_enabled', 'true'),
  ('transaction_features_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
