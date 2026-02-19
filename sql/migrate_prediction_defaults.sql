-- Migration: Create prediction_defaults table
-- Run on existing DB: docker exec -i pump-platform-db psql -U pump -d pump_platform < /etc/komodo/stacks/pump/sql/migrate_prediction_defaults.sql

CREATE TABLE IF NOT EXISTS prediction_defaults (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE prediction_defaults IS 'Key-value defaults for newly imported prediction models (alert threshold, n8n, ignore, log retention)';

INSERT INTO prediction_defaults (key, value) VALUES
  ('alert_threshold', '0.7'),
  ('n8n_enabled', 'true'),
  ('n8n_webhook_url', '""'),
  ('n8n_send_mode', '["all"]'),
  ('ignore_bad_seconds', '0'),
  ('ignore_positive_seconds', '0'),
  ('ignore_alert_seconds', '0'),
  ('max_log_entries_per_coin_negative', '0'),
  ('max_log_entries_per_coin_positive', '0'),
  ('max_log_entries_per_coin_alert', '0'),
  ('send_ignored_to_n8n', 'false')
ON CONFLICT (key) DO NOTHING;
