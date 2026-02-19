-- Migration: Add threshold_sweep JSONB column to ml_models and ml_test_results
-- This stores metrics (precision, recall, f1, tp/fp/tn/fn, simulated_profit_pct)
-- at multiple probability thresholds (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9).

ALTER TABLE ml_models
    ADD COLUMN IF NOT EXISTS threshold_sweep JSONB;

ALTER TABLE ml_test_results
    ADD COLUMN IF NOT EXISTS threshold_sweep JSONB;
