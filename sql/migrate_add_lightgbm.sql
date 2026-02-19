-- Migration: Allow 'lightgbm' model type in CHECK constraints
-- Run: docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_add_lightgbm.sql

BEGIN;

-- ml_models: drop old constraint, add new one with lightgbm
ALTER TABLE ml_models DROP CONSTRAINT IF EXISTS chk_ml_model_type;
ALTER TABLE ml_models ADD CONSTRAINT chk_ml_model_type CHECK (model_type IN ('xgboost', 'lightgbm'));

-- prediction_active_models: same fix
ALTER TABLE prediction_active_models DROP CONSTRAINT IF EXISTS chk_pam_model_type;
ALTER TABLE prediction_active_models ADD CONSTRAINT chk_pam_model_type CHECK (model_type IN ('xgboost', 'lightgbm'));

COMMIT;

-- Verify
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('chk_ml_model_type', 'chk_pam_model_type');
