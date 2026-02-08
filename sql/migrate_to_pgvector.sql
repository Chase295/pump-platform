-- ============================================================================
-- MIGRATION: pgvector + coin_transactions + coin_pattern_embeddings
-- ============================================================================
--
-- For existing databases that already have the base schema.
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS).
--
-- Usage:
--   docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_to_pgvector.sql
--
-- Prerequisites:
--   - Docker image must be timescale/timescaledb-ha:pg16 (contains pgvector)
-- ============================================================================


-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;


-- 2. Create coin_transactions table
CREATE TABLE IF NOT EXISTS coin_transactions (
    mint VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    trader_public_key VARCHAR(44) NOT NULL,
    sol_amount NUMERIC(20, 9) NOT NULL,
    tx_type VARCHAR(4) NOT NULL CHECK (tx_type IN ('buy', 'sell')),
    price_sol NUMERIC(30, 18) NOT NULL,
    is_whale BOOLEAN NOT NULL DEFAULT FALSE,
    phase_id_at_time INTEGER
);

CREATE INDEX IF NOT EXISTS idx_coin_tx_mint_timestamp ON coin_transactions(mint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_trader ON coin_transactions(trader_public_key, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_timestamp ON coin_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_whale ON coin_transactions(is_whale) WHERE is_whale = TRUE;
CREATE INDEX IF NOT EXISTS idx_coin_tx_type ON coin_transactions(tx_type);

SELECT create_hypertable('coin_transactions', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

ALTER TABLE coin_transactions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'mint',
    timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('coin_transactions', INTERVAL '1 day', if_not_exists => TRUE);


-- 3. Create coin_pattern_embeddings table
CREATE TABLE IF NOT EXISTS coin_pattern_embeddings (
    id BIGSERIAL PRIMARY KEY,
    mint VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    window_end TIMESTAMP WITH TIME ZONE NOT NULL,
    embedding vector(128) NOT NULL,
    phase_id_at_time INTEGER,
    num_snapshots INTEGER NOT NULL DEFAULT 0,
    label VARCHAR(50),
    CONSTRAINT chk_window_order CHECK (window_start < window_end)
);

CREATE INDEX IF NOT EXISTS idx_coin_patterns_embedding
    ON coin_pattern_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_coin_patterns_mint ON coin_pattern_embeddings(mint);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_created ON coin_pattern_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_label ON coin_pattern_embeddings(label) WHERE label IS NOT NULL;


-- Done
DO $$ BEGIN RAISE NOTICE 'Migration complete: pgvector + coin_transactions + coin_pattern_embeddings'; END $$;
