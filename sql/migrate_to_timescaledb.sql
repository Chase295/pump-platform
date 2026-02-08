-- ============================================================================
-- PUMP PLATFORM - Migration to TimescaleDB
-- ============================================================================
--
-- Run this MANUALLY after switching the Docker image from postgres:16-alpine
-- to timescale/timescaledb:latest-pg16, when the pgdata volume already
-- contains data.
--
-- Usage:
--   docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_to_timescaledb.sql
--
-- What this does:
--   1. Enables the TimescaleDB extension
--   2. Drops the id column from coin_metrics (not used in code)
--   3. Converts coin_metrics, model_predictions, alert_evaluations to hypertables
--   4. Sets up compression policies
--
-- IMPORTANT: Back up your data before running this script!
-- ============================================================================

\echo '=== Starting TimescaleDB Migration ==='

-- Step 1: Enable extension
CREATE EXTENSION IF NOT EXISTS timescaledb;
\echo '  [OK] TimescaleDB extension enabled'

-- ============================================================================
-- Step 2: Migrate coin_metrics
-- ============================================================================
\echo '  Migrating coin_metrics...'

-- Drop the id column (not referenced in any backend code)
ALTER TABLE coin_metrics DROP COLUMN IF EXISTS id;

-- Convert to hypertable (migrate_data moves existing rows into chunks)
SELECT create_hypertable('coin_metrics', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    migrate_data => TRUE,
    if_not_exists => TRUE
);

-- Compression
ALTER TABLE coin_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'mint',
    timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('coin_metrics', INTERVAL '3 days', if_not_exists => TRUE);

\echo '  [OK] coin_metrics migrated'

-- ============================================================================
-- Step 3: Migrate model_predictions
-- ============================================================================
\echo '  Migrating model_predictions...'

-- Change PK from (id) to (prediction_timestamp, id)
ALTER TABLE model_predictions DROP CONSTRAINT IF EXISTS model_predictions_pkey;
ALTER TABLE model_predictions ADD PRIMARY KEY (prediction_timestamp, id);

-- Add index on id for lookups by id (WHERE id = $1)
CREATE INDEX IF NOT EXISTS idx_model_predictions_id ON model_predictions(id);

-- Convert to hypertable
SELECT create_hypertable('model_predictions', 'prediction_timestamp',
    chunk_time_interval => INTERVAL '7 days',
    migrate_data => TRUE,
    if_not_exists => TRUE
);

-- Compression
ALTER TABLE model_predictions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'coin_id, active_model_id',
    timescaledb.compress_orderby = 'prediction_timestamp DESC'
);
SELECT add_compression_policy('model_predictions', INTERVAL '14 days', if_not_exists => TRUE);

\echo '  [OK] model_predictions migrated'

-- ============================================================================
-- Step 4: Migrate alert_evaluations
-- ============================================================================
\echo '  Migrating alert_evaluations...'

-- Change PK from (id) to (alert_timestamp, id)
ALTER TABLE alert_evaluations DROP CONSTRAINT IF EXISTS alert_evaluations_pkey;
ALTER TABLE alert_evaluations ADD PRIMARY KEY (alert_timestamp, id);

-- Add index on id for lookups by id
CREATE INDEX IF NOT EXISTS idx_alert_evaluations_id ON alert_evaluations(id);

-- Convert to hypertable
SELECT create_hypertable('alert_evaluations', 'alert_timestamp',
    chunk_time_interval => INTERVAL '7 days',
    migrate_data => TRUE,
    if_not_exists => TRUE
);

-- Compression
ALTER TABLE alert_evaluations SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'coin_id, model_id',
    timescaledb.compress_orderby = 'alert_timestamp DESC'
);
SELECT add_compression_policy('alert_evaluations', INTERVAL '14 days', if_not_exists => TRUE);

\echo '  [OK] alert_evaluations migrated'

-- ============================================================================
-- Step 5: Verify
-- ============================================================================
\echo ''
\echo '=== Migration Complete ==='
\echo ''
\echo 'Hypertables:'
SELECT hypertable_name, num_chunks, compression_enabled
FROM timescaledb_information.hypertables;

\echo ''
\echo 'Compression policies:'
SELECT hypertable_name, compress_after
FROM timescaledb_information.jobs j
JOIN timescaledb_information.compression_settings cs ON true
WHERE j.proc_name = 'policy_compression';

\echo ''
\echo 'To enable retention (deletes old data permanently):'
\echo '  SELECT add_retention_policy(''coin_metrics'', INTERVAL ''90 days'');'
\echo '  SELECT add_retention_policy(''model_predictions'', INTERVAL ''60 days'');'
\echo '  SELECT add_retention_policy(''alert_evaluations'', INTERVAL ''60 days'');'
