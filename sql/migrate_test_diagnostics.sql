-- Migration: Add proba_stats and feature_diagnostics to ml_test_results
-- proba_stats: probability distribution (min/max/mean/median/percentiles, counts above thresholds)
-- feature_diagnostics: zero-feature detection (total, zero count, zero %)

ALTER TABLE ml_test_results
    ADD COLUMN IF NOT EXISTS proba_stats JSONB;

ALTER TABLE ml_test_results
    ADD COLUMN IF NOT EXISTS feature_diagnostics JSONB;
