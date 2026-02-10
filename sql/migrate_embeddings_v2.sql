-- ============================================================================
-- MIGRATION: Embeddings Pipeline v2
-- ============================================================================
--
-- Enhances coin_pattern_embeddings and adds supporting tables for the
-- embedding generation pipeline (configs, jobs, labels, similarity cache).
--
-- Safe to run multiple times (all statements use IF NOT EXISTS / IF EXISTS).
--
-- Usage:
--   docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_embeddings_v2.sql
--
-- Prerequisites:
--   - pgvector extension must be enabled (migrate_to_pgvector.sql)
--   - coin_pattern_embeddings table must exist
-- ============================================================================


-- 1. Enhance coin_pattern_embeddings with new columns
ALTER TABLE coin_pattern_embeddings
    ADD COLUMN IF NOT EXISTS strategy VARCHAR(50) DEFAULT 'handcrafted_v1',
    ADD COLUMN IF NOT EXISTS config_id BIGINT,
    ADD COLUMN IF NOT EXISTS feature_hash VARCHAR(64),
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5, 4),
    ADD COLUMN IF NOT EXISTS is_labeled BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_coin_patterns_strategy
    ON coin_pattern_embeddings(strategy);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_phase_label
    ON coin_pattern_embeddings(phase_id_at_time, label)
    WHERE label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_patterns_window
    ON coin_pattern_embeddings(window_start, window_end);


-- 2. embedding_configs: tracks different embedding strategies and their parameters
CREATE TABLE IF NOT EXISTS embedding_configs (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    strategy VARCHAR(50) NOT NULL,
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,

    -- Window configuration
    dimensions INTEGER NOT NULL DEFAULT 128,
    window_seconds INTEGER NOT NULL DEFAULT 300,
    window_overlap_seconds INTEGER DEFAULT 0,
    min_snapshots INTEGER DEFAULT 3,
    phases JSONB,

    -- Feature configuration
    feature_list JSONB NOT NULL DEFAULT '[]',
    normalization VARCHAR(20) DEFAULT 'minmax',

    -- PCA/Autoencoder specific
    source_dimensions INTEGER,
    explained_variance NUMERIC(5, 4),
    model_path TEXT,

    -- Statistics
    total_embeddings BIGINT DEFAULT 0,
    last_run_at TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT chk_emb_config_strategy CHECK (strategy IN (
        'handcrafted_v1', 'handcrafted_v2',
        'pca_v1', 'pca_v2',
        'autoencoder_v1', 'autoencoder_v2',
        'transformer_v1'
    )),
    CONSTRAINT chk_emb_config_normalization CHECK (normalization IN (
        'minmax', 'zscore', 'robust', 'none'
    ))
);

-- Add FK from coin_pattern_embeddings to embedding_configs (non-blocking)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_patterns_config'
    ) THEN
        ALTER TABLE coin_pattern_embeddings
            ADD CONSTRAINT fk_patterns_config
            FOREIGN KEY (config_id) REFERENCES embedding_configs(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_coin_patterns_config
    ON coin_pattern_embeddings(config_id)
    WHERE config_id IS NOT NULL;


-- 3. embedding_jobs: background generation job tracking
CREATE TABLE IF NOT EXISTS embedding_jobs (
    id BIGSERIAL PRIMARY KEY,
    config_id BIGINT NOT NULL REFERENCES embedding_configs(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'PENDING',
    job_type VARCHAR(20) DEFAULT 'GENERATE',

    -- Time range to process
    process_start TIMESTAMP WITH TIME ZONE NOT NULL,
    process_end TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Progress tracking
    progress NUMERIC(5, 4) DEFAULT 0.0,
    mints_processed INTEGER DEFAULT 0,
    embeddings_created INTEGER DEFAULT 0,
    errors INTEGER DEFAULT 0,

    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    error_msg TEXT,

    CONSTRAINT chk_emb_job_status CHECK (status IN (
        'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'
    )),
    CONSTRAINT chk_emb_job_type CHECK (job_type IN (
        'GENERATE', 'BACKFILL', 'RETRAIN'
    )),
    CONSTRAINT chk_emb_job_dates CHECK (process_start < process_end)
);

CREATE INDEX IF NOT EXISTS idx_emb_jobs_status
    ON embedding_jobs(status, created_at)
    WHERE status IN ('PENDING', 'RUNNING');
CREATE INDEX IF NOT EXISTS idx_emb_jobs_config
    ON embedding_jobs(config_id);


-- 4. pattern_labels: user/ML/rule-based labels for patterns
CREATE TABLE IF NOT EXISTS pattern_labels (
    id BIGSERIAL PRIMARY KEY,
    embedding_id BIGINT NOT NULL REFERENCES coin_pattern_embeddings(id) ON DELETE CASCADE,
    label VARCHAR(50) NOT NULL,
    confidence NUMERIC(5, 4) DEFAULT 1.0,
    source VARCHAR(20) DEFAULT 'manual',

    -- Context
    notes TEXT,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT chk_label_source CHECK (source IN (
        'manual', 'ml', 'rule', 'propagated'
    )),
    CONSTRAINT chk_label_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_pattern_labels_embedding
    ON pattern_labels(embedding_id);
CREATE INDEX IF NOT EXISTS idx_pattern_labels_label
    ON pattern_labels(label);


-- 5. similarity_cache: pre-computed similarity pairs for Neo4j sync
CREATE TABLE IF NOT EXISTS similarity_cache (
    id BIGSERIAL PRIMARY KEY,
    embedding_a_id BIGINT NOT NULL REFERENCES coin_pattern_embeddings(id) ON DELETE CASCADE,
    embedding_b_id BIGINT NOT NULL REFERENCES coin_pattern_embeddings(id) ON DELETE CASCADE,
    cosine_similarity NUMERIC(7, 6) NOT NULL,
    synced_to_neo4j BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT chk_different_embeddings CHECK (embedding_a_id < embedding_b_id),
    UNIQUE(embedding_a_id, embedding_b_id)
);

CREATE INDEX IF NOT EXISTS idx_similarity_cache_score
    ON similarity_cache(cosine_similarity DESC);
CREATE INDEX IF NOT EXISTS idx_similarity_cache_unsent
    ON similarity_cache(synced_to_neo4j)
    WHERE synced_to_neo4j = FALSE;


-- Done
DO $$ BEGIN RAISE NOTICE 'Migration complete: embeddings pipeline v2 (configs, jobs, labels, similarity_cache)'; END $$;
