-- ============================================================================
-- PUMP PLATFORM - Combined Database Schema
-- ============================================================================
--
-- Auto-initializes the unified database when mounted as:
--   /docker-entrypoint-initdb.d/init.sql
--
-- Modules:
--   1. FIND      - Token discovery, streams, metrics, phases
--   2. TRAINING  - ML models, test results, comparisons, jobs
--   3. SERVER    - Active models, predictions, alerts, evaluations
--   4. BUY       - Wallets, positions, trades, transfers
--
-- Order: Extensions -> Enums -> Tables -> Indexes -> Views -> Functions -> Seed
-- ============================================================================


-- ============================================================================
-- SEPARATE DATABASE: n8n (workflow automation)
-- n8n manages its own schema automatically on first start
-- ============================================================================

SELECT 'CREATE DATABASE pump_platform_n8n OWNER pump'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'pump_platform_n8n')\gexec


-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid() for pump-buy
CREATE EXTENSION IF NOT EXISTS timescaledb;  -- Hypertables, compression, retention
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector for similarity search


-- ============================================================================
-- ENUM TYPES (MODULE: BUY)
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE wallet_type_enum AS ENUM ('REAL', 'TEST');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE wallet_status_enum AS ENUM ('ACTIVE', 'PAUSED', 'DRAINED', 'FROZEN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE position_status_enum AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE trade_action_enum AS ENUM ('BUY', 'SELL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE trade_status_enum AS ENUM ('SUCCESS', 'FAILED', 'PENDING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- ############################################################################
-- MODULE: FIND
-- Token discovery, coin streams, metrics, and phase management
-- ############################################################################

-- ============================================================================
-- TABLE: ref_coin_phases (referenced by coin_streams, coin_metrics)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ref_coin_phases (
    id INT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    interval_seconds INT NOT NULL,
    min_age_minutes INT NOT NULL,
    max_age_minutes INT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_coin_phases_id ON ref_coin_phases(id);

COMMENT ON TABLE ref_coin_phases IS 'Reference table for coin tracking phases (Baby Zone, Survival Zone, etc.)';
COMMENT ON COLUMN ref_coin_phases.interval_seconds IS 'Interval in seconds for metrics updates in this phase';
COMMENT ON COLUMN ref_coin_phases.min_age_minutes IS 'Minimum age in minutes for this phase';
COMMENT ON COLUMN ref_coin_phases.max_age_minutes IS 'Maximum age in minutes for this phase';


-- ============================================================================
-- TABLE: discovered_coins
-- ============================================================================

CREATE TABLE IF NOT EXISTS discovered_coins (
    -- Identification
    token_address VARCHAR(64) NOT NULL,
    blockchain_id INT NOT NULL DEFAULT 1,
    symbol VARCHAR(30),
    name VARCHAR(255),
    token_decimals INT,
    token_supply NUMERIC(30, 6),
    deploy_platform VARCHAR(50),

    PRIMARY KEY (token_address),

    -- Transaction information
    signature VARCHAR(88),
    trader_public_key VARCHAR(44),

    -- Bonding curve & pool
    bonding_curve_key VARCHAR(44),
    pool_address VARCHAR(64),
    pool_type VARCHAR(20) DEFAULT 'pump',
    v_tokens_in_bonding_curve NUMERIC(30, 6),
    v_sol_in_bonding_curve NUMERIC(20, 6),

    -- Initial buy
    initial_buy_sol NUMERIC(20, 6),
    initial_buy_tokens NUMERIC(30, 6),

    -- Timestamps
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    token_created_at TIMESTAMP WITH TIME ZONE,

    -- Price & market cap (SOL only)
    price_sol NUMERIC(30, 18),
    market_cap_sol NUMERIC(20, 2),
    liquidity_sol NUMERIC(20, 6),

    -- Graduation
    open_market_cap_sol NUMERIC(20, 2) DEFAULT 85000,
    phase_id INT,

    -- Status flags
    is_mayhem_mode BOOLEAN DEFAULT FALSE,
    is_graduated BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,

    -- Risk & analysis
    risk_score INT,
    top_10_holders_pct NUMERIC(5, 2),
    has_socials BOOLEAN DEFAULT FALSE,
    social_count INT DEFAULT 0,
    metadata_is_mutable BOOLEAN,
    mint_authority_enabled BOOLEAN,
    image_hash VARCHAR(64),

    -- Metadata & social
    metadata_uri TEXT,
    description TEXT,
    image_url TEXT,
    twitter_url TEXT,
    telegram_url TEXT,
    website_url TEXT,
    discord_url TEXT,

    -- Management & classification
    final_outcome VARCHAR(20) DEFAULT 'PENDING',
    classification VARCHAR(50) DEFAULT 'UNKNOWN',
    status_note VARCHAR(255)
);

-- Indexes for discovered_coins
CREATE INDEX IF NOT EXISTS idx_dc_active ON discovered_coins(is_active);
CREATE INDEX IF NOT EXISTS idx_dc_graduated ON discovered_coins(is_graduated);
CREATE INDEX IF NOT EXISTS idx_dc_discovered ON discovered_coins(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_dc_created_at ON discovered_coins(token_created_at);
CREATE INDEX IF NOT EXISTS idx_dc_trader ON discovered_coins(trader_public_key);
CREATE INDEX IF NOT EXISTS idx_dc_signature ON discovered_coins(signature);
CREATE INDEX IF NOT EXISTS idx_dc_initial_buy ON discovered_coins(initial_buy_sol DESC);
CREATE INDEX IF NOT EXISTS idx_dc_market_cap_sol ON discovered_coins(market_cap_sol DESC);
CREATE INDEX IF NOT EXISTS idx_dc_phase_id ON discovered_coins(phase_id);
CREATE INDEX IF NOT EXISTS idx_dc_deploy_platform ON discovered_coins(deploy_platform);
CREATE INDEX IF NOT EXISTS idx_dc_risk_score ON discovered_coins(risk_score);
CREATE INDEX IF NOT EXISTS idx_dc_classification ON discovered_coins(classification);
CREATE INDEX IF NOT EXISTS idx_dc_social_count ON discovered_coins(social_count);
CREATE INDEX IF NOT EXISTS idx_dc_metadata_mutable ON discovered_coins(metadata_is_mutable);
CREATE INDEX IF NOT EXISTS idx_dc_mint_authority ON discovered_coins(mint_authority_enabled);
CREATE INDEX IF NOT EXISTS idx_dc_image_hash ON discovered_coins(image_hash);

COMMENT ON TABLE discovered_coins IS 'All discovered Pump.fun tokens with full metadata';


-- ============================================================================
-- TABLE: coin_streams
-- ============================================================================

CREATE TABLE IF NOT EXISTS coin_streams (
    id BIGSERIAL PRIMARY KEY,
    token_address VARCHAR(64) NOT NULL,
    current_phase_id INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    is_graduated BOOLEAN DEFAULT false,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ath_price_sol DOUBLE PRECISION DEFAULT 0,
    ath_timestamp TIMESTAMP WITH TIME ZONE,
    CONSTRAINT unique_active_stream UNIQUE (token_address)
);

CREATE INDEX IF NOT EXISTS idx_coin_streams_token_address ON coin_streams(token_address);
CREATE INDEX IF NOT EXISTS idx_coin_streams_phase_id ON coin_streams(current_phase_id);
CREATE INDEX IF NOT EXISTS idx_coin_streams_active ON coin_streams(is_active);
CREATE INDEX IF NOT EXISTS idx_coin_streams_graduated ON coin_streams(is_graduated);

COMMENT ON TABLE coin_streams IS 'Active coin streams for continuous metrics tracking';


-- ============================================================================
-- TABLE: coin_metrics (authoritative - written by FIND, read by TRAINING/SERVER)
-- Contains ~30 OHLCV and trading columns per metrics snapshot
-- ============================================================================

CREATE TABLE IF NOT EXISTS coin_metrics (
    mint VARCHAR(64) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    phase_id_at_time INTEGER,

    -- OHLCV price data
    price_open NUMERIC(30, 18),
    price_high NUMERIC(30, 18),
    price_low NUMERIC(30, 18),
    price_close NUMERIC(30, 18),

    -- Market data
    market_cap_close NUMERIC(20, 2),
    bonding_curve_pct NUMERIC(10, 4),
    virtual_sol_reserves NUMERIC(20, 6),
    is_koth BOOLEAN DEFAULT FALSE,

    -- Volume data
    volume_sol NUMERIC(20, 6),
    buy_volume_sol NUMERIC(20, 6),
    sell_volume_sol NUMERIC(20, 6),

    -- Trade counts
    num_buys INTEGER DEFAULT 0,
    num_sells INTEGER DEFAULT 0,
    unique_wallets INTEGER DEFAULT 0,
    num_micro_trades INTEGER DEFAULT 0,

    -- Dev tracking
    dev_sold_amount NUMERIC(20, 6) DEFAULT 0,

    -- Whale data
    max_single_buy_sol NUMERIC(20, 6),
    max_single_sell_sol NUMERIC(20, 6),
    net_volume_sol NUMERIC(20, 6),
    volatility_pct NUMERIC(10, 4),
    avg_trade_size_sol NUMERIC(20, 6),
    whale_buy_volume_sol NUMERIC(20, 6),
    whale_sell_volume_sol NUMERIC(20, 6),
    num_whale_buys INTEGER DEFAULT 0,
    num_whale_sells INTEGER DEFAULT 0,

    -- Ratios
    buy_pressure_ratio NUMERIC(10, 6),
    unique_signer_ratio NUMERIC(10, 6)
);

-- Indexes for coin_metrics (critical for ML training and real-time queries)
CREATE INDEX IF NOT EXISTS idx_coin_metrics_mint_timestamp ON coin_metrics(mint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coin_metrics_timestamp ON coin_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_coin_metrics_phase ON coin_metrics(phase_id_at_time);
CREATE INDEX IF NOT EXISTS idx_coin_metrics_mint ON coin_metrics(mint);

COMMENT ON TABLE coin_metrics IS 'OHLCV and trading metrics per coin per interval. Written by FIND, read by TRAINING and SERVER for ML.';

-- TimescaleDB: Convert to hypertable (1 day chunks)
SELECT create_hypertable('coin_metrics', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);


-- ============================================================================
-- TABLE: coin_transactions (individual trades for graph analysis / pgvector)
-- Written by FIND alongside coin_metrics. Not used by ML Training/Predictions.
-- ============================================================================

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

COMMENT ON TABLE coin_transactions IS 'Individual trade records for graph analysis and pattern detection. Written by FIND, not read by ML.';

-- TimescaleDB: Convert to hypertable (1 day chunks)
SELECT create_hypertable('coin_transactions', 'timestamp',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);


-- ============================================================================
-- TABLE: coin_pattern_embeddings (pgvector similarity search, schema-only)
-- Populated by a separate embedding pipeline (not by FIND streamer).
-- ============================================================================

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
    strategy VARCHAR(50) DEFAULT 'handcrafted_v1',
    config_id BIGINT,
    feature_hash VARCHAR(64),
    metadata JSONB DEFAULT '{}',
    quality_score NUMERIC(5, 4),
    is_labeled BOOLEAN DEFAULT FALSE,
    CONSTRAINT chk_window_order CHECK (window_start < window_end)
);

CREATE INDEX IF NOT EXISTS idx_coin_patterns_embedding
    ON coin_pattern_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_coin_patterns_mint ON coin_pattern_embeddings(mint);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_created ON coin_pattern_embeddings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_label ON coin_pattern_embeddings(label) WHERE label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_patterns_strategy ON coin_pattern_embeddings(strategy);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_phase_label ON coin_pattern_embeddings(phase_id_at_time, label) WHERE label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_patterns_window ON coin_pattern_embeddings(window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_coin_patterns_config ON coin_pattern_embeddings(config_id) WHERE config_id IS NOT NULL;

COMMENT ON TABLE coin_pattern_embeddings IS 'Vector embeddings of coin price patterns for similarity search. Populated by embedding pipeline.';


-- ============================================================================
-- TABLE: embedding_configs (embedding strategy configurations)
-- ============================================================================

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

COMMENT ON TABLE embedding_configs IS 'Configuration for different embedding strategies (handcrafted, PCA, autoencoder).';


-- ============================================================================
-- TABLE: embedding_jobs (background embedding generation jobs)
-- ============================================================================

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

COMMENT ON TABLE embedding_jobs IS 'Tracks background embedding generation jobs with progress and status.';


-- ============================================================================
-- TABLE: pattern_labels (labels for embedding patterns)
-- ============================================================================

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

COMMENT ON TABLE pattern_labels IS 'User/ML/rule-based labels for embedding patterns (pump, rug, organic, etc).';


-- ============================================================================
-- TABLE: similarity_cache (pre-computed similarity pairs for Neo4j sync)
-- ============================================================================

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

COMMENT ON TABLE similarity_cache IS 'Pre-computed cosine similarity pairs for Neo4j SIMILAR_TO relationship sync.';


-- ============================================================================
-- TABLE: exchange_rates (market sentiment / SOL price context)
-- ============================================================================

CREATE TABLE IF NOT EXISTS exchange_rates (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sol_price_usd NUMERIC(20, 6) NOT NULL,
    usd_to_eur_rate NUMERIC(10, 6),
    native_currency_price_usd NUMERIC(20, 6),
    blockchain_id INTEGER DEFAULT 1,
    source VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_created_at ON exchange_rates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_blockchain_id ON exchange_rates(blockchain_id);

COMMENT ON TABLE exchange_rates IS 'SOL price context for ML training - distinguishes real token pumps from general market movements';


-- ############################################################################
-- MODULE: TRAINING
-- ML models, test results, comparisons, and job queue
-- ############################################################################

-- ============================================================================
-- TABLE: ml_models
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_models (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    model_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'TRAINING',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- Training configuration
    target_variable VARCHAR(100) NOT NULL,
    target_operator VARCHAR(10),
    target_value NUMERIC(20, 2),
    train_start TIMESTAMP WITH TIME ZONE NOT NULL,
    train_end TIMESTAMP WITH TIME ZONE NOT NULL,
    test_size NUMERIC(3, 2),
    random_state INT,

    -- Time-based prediction parameters
    future_minutes INTEGER,
    price_change_percent NUMERIC(10, 4),
    target_direction VARCHAR(10),

    -- Features and configuration (JSONB)
    features JSONB NOT NULL,
    phases JSONB,
    params JSONB,
    feature_importance JSONB,

    -- Base performance metrics
    training_accuracy NUMERIC(5, 4),
    training_f1 NUMERIC(5, 4),
    training_precision NUMERIC(5, 4),
    training_recall NUMERIC(5, 4),

    -- Cross-validation metrics
    cv_scores JSONB,
    cv_overfitting_gap NUMERIC(5, 4),

    -- Additional metrics
    roc_auc NUMERIC(5, 4),
    mcc NUMERIC(5, 4),
    fpr NUMERIC(5, 4),
    fnr NUMERIC(5, 4),
    confusion_matrix JSONB,
    simulated_profit_pct NUMERIC(10, 4),

    -- Rug detection & market context
    rug_detection_metrics JSONB,
    market_context_enabled BOOLEAN DEFAULT FALSE,

    -- Flag features control
    use_flag_features BOOLEAN DEFAULT TRUE,

    -- Model storage
    model_file_path TEXT,
    model_binary BYTEA,
    description TEXT,

    CONSTRAINT chk_ml_model_type CHECK (model_type IN ('random_forest', 'xgboost', 'gradient_boosting', 'logistic_regression', 'neural_network')),
    CONSTRAINT chk_ml_status CHECK (status IN ('TRAINING', 'READY', 'FAILED')),
    CONSTRAINT chk_ml_operator CHECK (target_operator IS NULL OR target_operator IN ('>', '<', '>=', '<=', '=')),
    CONSTRAINT chk_ml_target_direction CHECK (target_direction IS NULL OR target_direction IN ('up', 'down')),
    CONSTRAINT chk_ml_future_minutes CHECK (future_minutes IS NULL OR future_minutes > 0),
    CONSTRAINT chk_ml_price_change_percent CHECK (price_change_percent IS NULL OR price_change_percent > 0)
);

CREATE INDEX IF NOT EXISTS idx_models_status ON ml_models(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_models_created ON ml_models(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_models_rug_metrics ON ml_models USING GIN (rug_detection_metrics);

COMMENT ON TABLE ml_models IS 'ML models with training configuration, metrics, rug-detection, and market context';


-- ============================================================================
-- TABLE: ml_test_results
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_test_results (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    model_id BIGINT NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Test period
    test_start TIMESTAMP WITH TIME ZONE NOT NULL,
    test_end TIMESTAMP WITH TIME ZONE NOT NULL,

    -- Base metrics
    accuracy NUMERIC(5, 4),
    f1_score NUMERIC(5, 4),
    precision_score NUMERIC(5, 4),
    recall NUMERIC(5, 4),
    roc_auc NUMERIC(5, 4),

    -- Additional metrics
    mcc NUMERIC(5, 4),
    fpr NUMERIC(5, 4),
    fnr NUMERIC(5, 4),
    simulated_profit_pct NUMERIC(10, 4),

    -- Confusion matrix (individual columns + JSONB)
    tp INT,
    tn INT,
    fp INT,
    fn INT,
    confusion_matrix JSONB,

    -- Samples
    num_samples INT,
    num_positive INT,
    num_negative INT,

    -- Overlap check
    has_overlap BOOLEAN DEFAULT FALSE,
    overlap_note TEXT,

    -- Train vs. test comparison
    train_accuracy NUMERIC(5, 4),
    train_f1 NUMERIC(5, 4),
    train_precision NUMERIC(5, 4),
    train_recall NUMERIC(5, 4),
    accuracy_degradation NUMERIC(5, 4),
    f1_degradation NUMERIC(5, 4),
    is_overfitted BOOLEAN,

    -- Test period info
    test_duration_days NUMERIC(10, 2),

    -- Feature importance
    feature_importance JSONB,

    -- Rug detection metrics
    rug_detection_metrics JSONB,

    CONSTRAINT chk_test_dates CHECK (test_start < test_end),
    CONSTRAINT chk_test_duration CHECK (test_duration_days IS NULL OR test_duration_days >= 0)
);

CREATE INDEX IF NOT EXISTS idx_test_results_model ON ml_test_results(model_id);
CREATE INDEX IF NOT EXISTS idx_test_results_created ON ml_test_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_results_model_created ON ml_test_results(model_id, created_at DESC);

COMMENT ON TABLE ml_test_results IS 'Test results with metrics, feature importance, and train vs. test comparison';


-- ============================================================================
-- TABLE: ml_comparisons
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_comparisons (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- The two models (legacy, kept for backward compat)
    model_a_id BIGINT NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,
    model_b_id BIGINT NOT NULL REFERENCES ml_models(id) ON DELETE CASCADE,

    -- Multi-model comparison (v2: up to 4 models)
    model_ids JSONB,
    test_result_ids JSONB,
    results JSONB,
    test_a_id BIGINT REFERENCES ml_test_results(id) ON DELETE SET NULL,
    test_b_id BIGINT REFERENCES ml_test_results(id) ON DELETE SET NULL,

    -- Test period
    test_start TIMESTAMP WITH TIME ZONE NOT NULL,
    test_end TIMESTAMP WITH TIME ZONE NOT NULL,
    num_samples INT,

    -- Base metrics model A
    a_accuracy NUMERIC(5, 4),
    a_f1 NUMERIC(5, 4),
    a_precision NUMERIC(5, 4),
    a_recall NUMERIC(5, 4),

    -- Base metrics model B
    b_accuracy NUMERIC(5, 4),
    b_f1 NUMERIC(5, 4),
    b_precision NUMERIC(5, 4),
    b_recall NUMERIC(5, 4),

    -- Additional metrics model A
    a_mcc NUMERIC(5, 4),
    a_fpr NUMERIC(5, 4),
    a_fnr NUMERIC(5, 4),
    a_simulated_profit_pct NUMERIC(10, 4),
    a_confusion_matrix JSONB,
    a_train_accuracy NUMERIC(5, 4),
    a_train_f1 NUMERIC(5, 4),
    a_accuracy_degradation NUMERIC(5, 4),
    a_f1_degradation NUMERIC(5, 4),
    a_is_overfitted BOOLEAN,
    a_test_duration_days NUMERIC(10, 2),

    -- Additional metrics model B
    b_mcc NUMERIC(5, 4),
    b_fpr NUMERIC(5, 4),
    b_fnr NUMERIC(5, 4),
    b_simulated_profit_pct NUMERIC(10, 4),
    b_confusion_matrix JSONB,
    b_train_accuracy NUMERIC(5, 4),
    b_train_f1 NUMERIC(5, 4),
    b_accuracy_degradation NUMERIC(5, 4),
    b_f1_degradation NUMERIC(5, 4),
    b_is_overfitted BOOLEAN,
    b_test_duration_days NUMERIC(10, 2),

    -- Winner
    winner_id BIGINT REFERENCES ml_models(id),
    winner_reason TEXT,

    CONSTRAINT chk_different_models CHECK (model_a_id != model_b_id),
    CONSTRAINT chk_compare_dates CHECK (test_start < test_end)
);

CREATE INDEX IF NOT EXISTS idx_comparisons_models ON ml_comparisons(model_a_id, model_b_id);
CREATE INDEX IF NOT EXISTS idx_comparisons_created ON ml_comparisons(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comparisons_winner ON ml_comparisons(winner_id) WHERE winner_id IS NOT NULL;

COMMENT ON TABLE ml_comparisons IS 'Model comparisons (2-4 models) with per-model metrics';


-- ============================================================================
-- TABLE: ml_jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS ml_jobs (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    job_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    priority INT DEFAULT 5,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Progress
    progress NUMERIC(3, 2) DEFAULT 0.0,
    progress_msg TEXT,

    -- Error
    error_msg TEXT,

    -- Worker
    worker_id VARCHAR(100),

    -- TRAIN: Configuration
    train_target_var VARCHAR(100),
    train_operator VARCHAR(10),
    train_value NUMERIC(20, 2),
    train_start TIMESTAMP WITH TIME ZONE,
    train_end TIMESTAMP WITH TIME ZONE,
    train_features JSONB,
    train_phases JSONB,
    train_params JSONB,
    train_model_type VARCHAR(50),

    -- TRAIN: Time-based prediction parameters
    train_future_minutes INTEGER,
    train_price_change_percent NUMERIC(10, 4),
    train_target_direction VARCHAR(10),

    -- TRAIN: Flag features
    use_flag_features BOOLEAN DEFAULT TRUE,

    -- TRAIN: Result
    result_model_id BIGINT REFERENCES ml_models(id) ON DELETE SET NULL,

    -- TEST: Configuration
    test_model_id BIGINT REFERENCES ml_models(id) ON DELETE CASCADE,
    test_start TIMESTAMP WITH TIME ZONE,
    test_end TIMESTAMP WITH TIME ZONE,

    -- TEST: Result
    result_test_id BIGINT REFERENCES ml_test_results(id) ON DELETE SET NULL,

    -- COMPARE: Configuration
    compare_model_a_id BIGINT REFERENCES ml_models(id) ON DELETE CASCADE,
    compare_model_b_id BIGINT REFERENCES ml_models(id) ON DELETE CASCADE,
    compare_model_ids JSONB,
    compare_start TIMESTAMP WITH TIME ZONE,
    compare_end TIMESTAMP WITH TIME ZONE,

    -- COMPARE: Result
    result_comparison_id BIGINT REFERENCES ml_comparisons(id) ON DELETE SET NULL,

    CONSTRAINT chk_job_type CHECK (job_type IN ('TRAIN', 'TEST', 'COMPARE')),
    CONSTRAINT chk_job_status CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    CONSTRAINT chk_job_train_direction CHECK (train_target_direction IS NULL OR train_target_direction IN ('up', 'down')),
    CONSTRAINT chk_job_train_dates CHECK (train_start IS NULL OR train_end IS NULL OR train_start < train_end),
    CONSTRAINT chk_job_test_dates CHECK (test_start IS NULL OR test_end IS NULL OR test_start < test_end),
    CONSTRAINT chk_job_compare_dates CHECK (compare_start IS NULL OR compare_end IS NULL OR compare_start < compare_end),
    CONSTRAINT chk_job_train_future_minutes CHECK (train_future_minutes IS NULL OR train_future_minutes > 0),
    CONSTRAINT chk_job_train_price_change CHECK (train_price_change_percent IS NULL OR train_price_change_percent > 0)
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON ml_jobs(status, priority, created_at) WHERE status IN ('PENDING', 'RUNNING');
CREATE INDEX IF NOT EXISTS idx_jobs_created ON ml_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_type_status ON ml_jobs(job_type, status, created_at DESC);

COMMENT ON TABLE ml_jobs IS 'Job queue for TRAIN/TEST/COMPARE operations with type-specific fields';


-- ============================================================================
-- TABLE: ref_model_types
-- ============================================================================

CREATE TABLE IF NOT EXISTS ref_model_types (
    id INT PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    default_params JSONB
);

COMMENT ON TABLE ref_model_types IS 'Reference table with default parameters per ML model type';


-- ############################################################################
-- MODULE: SERVER
-- Active model management, predictions, alerts, and evaluations
-- ############################################################################

-- ============================================================================
-- TABLE: prediction_active_models
-- (base schema + all migration columns merged)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction_active_models (
    id BIGSERIAL PRIMARY KEY,
    model_id BIGINT NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    model_type VARCHAR(50) NOT NULL,

    -- Model metadata (copy from ml_models for fast access)
    target_variable VARCHAR(100) NOT NULL,
    target_operator VARCHAR(10),
    target_value NUMERIC(20, 2),
    future_minutes INTEGER,
    price_change_percent NUMERIC(10, 4),
    target_direction VARCHAR(10),

    -- Features and configuration (JSONB)
    features JSONB NOT NULL,
    phases JSONB,
    params JSONB,

    -- Model file (locally stored)
    local_model_path TEXT NOT NULL,
    model_file_url TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_prediction_at TIMESTAMP WITH TIME ZONE,
    total_predictions BIGINT DEFAULT 0,

    -- Timestamps
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Custom name (for local renaming)
    custom_name VARCHAR(255),

    -- Alert threshold (migration: add_alert_threshold)
    alert_threshold NUMERIC(5, 4) DEFAULT 0.7,

    -- n8n settings (migrations: add_n8n_settings, migrate_n8n_send_mode_to_array)
    n8n_webhook_url TEXT,
    n8n_send_mode JSONB DEFAULT '["all"]'::jsonb,
    n8n_enabled BOOLEAN DEFAULT TRUE,

    -- Coin ignore settings (migration: add_coin_ignore_settings)
    ignore_bad_seconds INTEGER DEFAULT 0 CHECK (ignore_bad_seconds >= 0 AND ignore_bad_seconds <= 86400),
    ignore_positive_seconds INTEGER DEFAULT 0 CHECK (ignore_positive_seconds >= 0 AND ignore_positive_seconds <= 86400),
    ignore_alert_seconds INTEGER DEFAULT 0 CHECK (ignore_alert_seconds >= 0 AND ignore_alert_seconds <= 86400),

    -- Alert config (migration: add_alert_config)
    coin_filter_mode VARCHAR(20) DEFAULT 'all' CHECK (coin_filter_mode IN ('all', 'whitelist')),
    coin_whitelist JSONB,

    -- Min scan interval (migration: add_min_scan_interval)
    min_scan_interval_seconds INTEGER DEFAULT 20 CHECK (min_scan_interval_seconds >= 0 AND min_scan_interval_seconds <= 86400),

    -- Max log entries per coin (migration: add_max_log_entries_per_coin)
    max_log_entries_per_coin_negative INTEGER DEFAULT 0 CHECK (max_log_entries_per_coin_negative >= 0 AND max_log_entries_per_coin_negative <= 1000),
    max_log_entries_per_coin_positive INTEGER DEFAULT 0 CHECK (max_log_entries_per_coin_positive >= 0 AND max_log_entries_per_coin_positive <= 1000),
    max_log_entries_per_coin_alert INTEGER DEFAULT 0 CHECK (max_log_entries_per_coin_alert >= 0 AND max_log_entries_per_coin_alert <= 1000),

    -- Send ignored to n8n (migration: add_send_ignored_to_n8n)
    send_ignored_to_n8n BOOLEAN DEFAULT false,

    -- Performance metrics (migration: add_performance_metrics)
    training_accuracy NUMERIC(5, 4),
    training_f1 NUMERIC(5, 4),
    training_precision NUMERIC(5, 4),
    training_recall NUMERIC(5, 4),
    roc_auc NUMERIC(5, 4),
    mcc NUMERIC(5, 4),
    confusion_matrix JSONB,
    simulated_profit_pct NUMERIC(8, 4),

    -- Constraints
    CONSTRAINT chk_pam_model_type CHECK (model_type IN ('random_forest', 'xgboost')),
    CONSTRAINT chk_pam_operator CHECK (target_operator IS NULL OR target_operator IN ('>', '<', '>=', '<=', '=')),
    CONSTRAINT chk_pam_direction CHECK (target_direction IS NULL OR target_direction IN ('up', 'down')),

    -- Unique: A model can only be active once
    UNIQUE(model_id)
);

-- Indexes for prediction_active_models
CREATE INDEX IF NOT EXISTS idx_active_models_active ON prediction_active_models(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_active_models_model_id ON prediction_active_models(model_id);
CREATE INDEX IF NOT EXISTS idx_active_models_custom_name ON prediction_active_models(custom_name) WHERE custom_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_active_models_coin_filter ON prediction_active_models(coin_filter_mode);
CREATE INDEX IF NOT EXISTS idx_active_models_ignore_timings ON prediction_active_models(ignore_bad_seconds, ignore_positive_seconds, ignore_alert_seconds);
CREATE INDEX IF NOT EXISTS idx_active_models_min_scan_interval ON prediction_active_models(min_scan_interval_seconds) WHERE min_scan_interval_seconds > 0;
CREATE INDEX IF NOT EXISTS idx_active_models_accuracy ON prediction_active_models(training_accuracy);
CREATE INDEX IF NOT EXISTS idx_active_models_f1 ON prediction_active_models(training_f1);
CREATE INDEX IF NOT EXISTS idx_active_models_profit ON prediction_active_models(simulated_profit_pct);

COMMENT ON TABLE prediction_active_models IS 'Active ML models in the prediction service with alert config, n8n settings, and performance metrics';


-- ============================================================================
-- TABLE: predictions
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions (
    id BIGSERIAL PRIMARY KEY,
    coin_id VARCHAR(255) NOT NULL,
    data_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    model_id BIGINT NOT NULL,
    active_model_id BIGINT REFERENCES prediction_active_models(id) ON DELETE SET NULL,

    -- Prediction
    prediction INTEGER NOT NULL CHECK (prediction IN (0, 1)),
    probability NUMERIC(5, 4) NOT NULL CHECK (probability >= 0.0 AND probability <= 1.0),

    -- Phase at time of prediction
    phase_id_at_time INTEGER,

    -- Features (optional, for debugging)
    features JSONB,

    -- Performance
    prediction_duration_ms INTEGER,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_coin_timestamp ON predictions(coin_id, data_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_model ON predictions(model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_active_model ON predictions(active_model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at DESC);


-- ============================================================================
-- TABLE: model_predictions (new architecture, replaces predictions + alert_evaluations)
-- (with price precision fix applied)
-- ============================================================================

CREATE TABLE IF NOT EXISTS model_predictions (
    id BIGSERIAL,

    -- Basic information
    coin_id VARCHAR(255) NOT NULL,
    model_id BIGINT NOT NULL,
    active_model_id BIGINT,

    -- Prediction result
    prediction INTEGER NOT NULL CHECK (prediction IN (0, 1)),
    probability NUMERIC(5, 4) NOT NULL CHECK (probability >= 0.0 AND probability <= 1.0),

    -- Tag (automatically calculated on save)
    tag VARCHAR(20) NOT NULL CHECK (tag IN ('negativ', 'positiv', 'alert')),

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'inaktiv')),

    -- Timestamps
    prediction_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    evaluation_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    evaluated_at TIMESTAMP WITH TIME ZONE,

    -- Values at prediction time (NUMERIC(20,12) for very small memecoin prices)
    price_close_at_prediction NUMERIC(20, 12),
    price_open_at_prediction NUMERIC(20, 12),
    price_high_at_prediction NUMERIC(20, 12),
    price_low_at_prediction NUMERIC(20, 12),
    market_cap_at_prediction NUMERIC(20, 2),
    volume_at_prediction NUMERIC(20, 2),
    phase_id_at_prediction INTEGER,

    -- Values at evaluation time
    price_close_at_evaluation NUMERIC(20, 12),
    price_open_at_evaluation NUMERIC(20, 12),
    price_high_at_evaluation NUMERIC(20, 12),
    price_low_at_evaluation NUMERIC(20, 12),
    market_cap_at_evaluation NUMERIC(20, 2),
    volume_at_evaluation NUMERIC(20, 2),
    phase_id_at_evaluation INTEGER,

    -- Evaluation result
    actual_price_change_pct NUMERIC(10, 4),
    evaluation_result VARCHAR(20) CHECK (evaluation_result IN ('success', 'failed', 'not_applicable')),
    evaluation_note TEXT,

    -- ATH tracking (migration: add_ath_tracking_model_predictions)
    ath_highest_pct NUMERIC(10, 4),
    ath_lowest_pct NUMERIC(10, 4),
    ath_highest_timestamp TIMESTAMP WITH TIME ZONE,
    ath_lowest_timestamp TIMESTAMP WITH TIME ZONE,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Composite PK for TimescaleDB hypertable (must include time column)
    PRIMARY KEY (prediction_timestamp, id)
);

CREATE INDEX IF NOT EXISTS idx_model_predictions_id ON model_predictions(id);
CREATE INDEX IF NOT EXISTS idx_model_predictions_coin_timestamp ON model_predictions(coin_id, prediction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_model_predictions_model ON model_predictions(model_id, prediction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_model_predictions_active_model ON model_predictions(active_model_id, prediction_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_model_predictions_status ON model_predictions(status) WHERE status = 'aktiv';
CREATE INDEX IF NOT EXISTS idx_model_predictions_tag ON model_predictions(tag);
CREATE INDEX IF NOT EXISTS idx_model_predictions_evaluation_timestamp ON model_predictions(evaluation_timestamp) WHERE status = 'aktiv';
CREATE INDEX IF NOT EXISTS idx_model_predictions_coin_model_tag_status ON model_predictions(coin_id, active_model_id, tag, status) WHERE status = 'aktiv';

COMMENT ON TABLE model_predictions IS 'All predictions with tags (negativ/positiv/alert) and status (aktiv/inaktiv)';

-- TimescaleDB: Convert to hypertable (7 day chunks)
SELECT create_hypertable('model_predictions', 'prediction_timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);


-- ============================================================================
-- TABLE: alert_evaluations
-- (with ATH tracking migration applied)
-- ============================================================================

CREATE TABLE IF NOT EXISTS alert_evaluations (
    id BIGSERIAL,
    prediction_id BIGINT NOT NULL REFERENCES predictions(id) ON DELETE CASCADE,
    coin_id VARCHAR(255) NOT NULL,
    model_id BIGINT NOT NULL,

    -- Alert configuration (at time of alert)
    prediction_type VARCHAR(20) NOT NULL CHECK (prediction_type IN ('time_based', 'classic')),

    -- Time-based prediction fields
    target_variable VARCHAR(100),
    future_minutes INTEGER,
    price_change_percent NUMERIC(10, 4),
    target_direction VARCHAR(10) CHECK (target_direction IN ('up', 'down')),

    -- Classic prediction fields
    target_operator VARCHAR(10) CHECK (target_operator IN ('>', '<', '>=', '<=', '=')),
    target_value NUMERIC(20, 2),

    -- Values at alert time
    alert_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    price_close_at_alert NUMERIC(20, 8) NOT NULL,
    price_open_at_alert NUMERIC(20, 8),
    price_high_at_alert NUMERIC(20, 8),
    price_low_at_alert NUMERIC(20, 8),
    market_cap_close_at_alert NUMERIC(20, 2),
    market_cap_open_at_alert NUMERIC(20, 2),
    volume_sol_at_alert NUMERIC(20, 2),
    volume_usd_at_alert NUMERIC(20, 2),
    buy_volume_sol_at_alert NUMERIC(20, 2),
    sell_volume_sol_at_alert NUMERIC(20, 2),
    num_buys_at_alert INTEGER,
    num_sells_at_alert INTEGER,
    unique_wallets_at_alert INTEGER,
    phase_id_at_alert INTEGER,

    -- Values at evaluation time
    evaluation_timestamp TIMESTAMP WITH TIME ZONE,
    price_close_at_evaluation NUMERIC(20, 8),
    price_open_at_evaluation NUMERIC(20, 8),
    price_high_at_evaluation NUMERIC(20, 8),
    price_low_at_evaluation NUMERIC(20, 8),
    market_cap_close_at_evaluation NUMERIC(20, 2),
    market_cap_open_at_evaluation NUMERIC(20, 2),
    volume_sol_at_evaluation NUMERIC(20, 2),
    volume_usd_at_evaluation NUMERIC(20, 2),
    buy_volume_sol_at_evaluation NUMERIC(20, 2),
    sell_volume_sol_at_evaluation NUMERIC(20, 2),
    num_buys_at_evaluation INTEGER,
    num_sells_at_evaluation INTEGER,
    unique_wallets_at_evaluation INTEGER,
    phase_id_at_evaluation INTEGER,

    -- Calculated values
    actual_price_change_pct NUMERIC(10, 4),
    actual_value_at_evaluation NUMERIC(20, 2),

    -- ATH tracking (migration: add_ath_tracking)
    ath_price_change_pct NUMERIC(10, 4),
    ath_timestamp TIMESTAMP WITH TIME ZONE,
    ath_price_close NUMERIC(20, 8),

    -- Status (extended with 'non_alert' from ATH tracking migration)
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'success', 'failed', 'expired', 'not_applicable', 'non_alert')),
    evaluated_at TIMESTAMP WITH TIME ZONE,
    evaluation_note TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Composite PK for TimescaleDB hypertable (must include time column)
    PRIMARY KEY (alert_timestamp, id)
);

CREATE INDEX IF NOT EXISTS idx_alert_evaluations_id ON alert_evaluations(id);
CREATE INDEX IF NOT EXISTS idx_alert_evaluations_coin_timestamp ON alert_evaluations(coin_id, alert_timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_alert_evaluations_status ON alert_evaluations(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_alert_evaluations_prediction ON alert_evaluations(prediction_id);
CREATE INDEX IF NOT EXISTS idx_alert_evaluations_type ON alert_evaluations(prediction_type);
CREATE INDEX IF NOT EXISTS idx_alert_evaluations_evaluation_timestamp ON alert_evaluations(evaluation_timestamp) WHERE status = 'pending';

COMMENT ON TABLE alert_evaluations IS 'Alert evaluations with full market data at alert and evaluation time, plus ATH tracking';

-- TimescaleDB: Convert to hypertable (7 day chunks)
SELECT create_hypertable('alert_evaluations', 'alert_timestamp',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);


-- ============================================================================
-- TABLE: prediction_webhook_log
-- ============================================================================

CREATE TABLE IF NOT EXISTS prediction_webhook_log (
    id BIGSERIAL PRIMARY KEY,
    coin_id VARCHAR(255) NOT NULL,
    data_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    webhook_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_log_created ON prediction_webhook_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_log_status ON prediction_webhook_log(response_status) WHERE response_status IS NOT NULL;


-- ============================================================================
-- TABLE: coin_scan_cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS coin_scan_cache (
    id BIGSERIAL PRIMARY KEY,
    coin_id VARCHAR(255) NOT NULL,
    active_model_id BIGINT NOT NULL REFERENCES prediction_active_models(id) ON DELETE CASCADE,

    -- Last scan results
    last_scan_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_prediction INTEGER NOT NULL CHECK (last_prediction IN (0, 1)),
    last_probability NUMERIC(5, 4) NOT NULL CHECK (last_probability >= 0.0 AND last_probability <= 1.0),
    was_alert BOOLEAN NOT NULL DEFAULT FALSE,

    -- Ignore management
    ignore_until TIMESTAMP WITH TIME ZONE,
    ignore_reason VARCHAR(20) CHECK (ignore_reason IN ('bad', 'positive', 'alert')),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(coin_id, active_model_id)
);

CREATE INDEX IF NOT EXISTS idx_coin_scan_cache_coin_model ON coin_scan_cache(coin_id, active_model_id);
CREATE INDEX IF NOT EXISTS idx_coin_scan_cache_ignore_until ON coin_scan_cache(ignore_until) WHERE ignore_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coin_scan_cache_last_scan ON coin_scan_cache(last_scan_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_scan_cache_alerts ON coin_scan_cache(was_alert) WHERE was_alert = true;

COMMENT ON TABLE coin_scan_cache IS 'Cache for recently scanned coins and their ignore status';


-- ############################################################################
-- MODULE: BUY
-- Wallet management, positions, trades, and transfers
-- ############################################################################

-- ============================================================================
-- TABLE: wallets
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Identification
    alias VARCHAR(50) UNIQUE NOT NULL,
    address VARCHAR(44) UNIQUE NOT NULL,
    enc_private_key TEXT NOT NULL DEFAULT '',

    -- Configuration & type
    type wallet_type_enum NOT NULL DEFAULT 'TEST',
    tag VARCHAR(50),
    status wallet_status_enum DEFAULT 'ACTIVE',

    -- Security switches
    trading_enabled BOOLEAN DEFAULT TRUE,
    transfer_enabled BOOLEAN DEFAULT TRUE,

    -- Simulation ("Pain Mode")
    virtual_loss_percent DECIMAL(5, 2) DEFAULT 1.00,

    -- Balances
    virtual_sol_balance DECIMAL(20, 9) DEFAULT 10.0,
    real_sol_balance DECIMAL(20, 9) DEFAULT 0.0,

    -- Risk management
    consecutive_losses INT DEFAULT 0,
    max_consecutive_losses INT DEFAULT 3,
    start_balance_day DECIMAL(20, 9) DEFAULT 10.0,
    max_daily_loss_pct DECIMAL(5, 2) DEFAULT 15.00,
    last_reset_date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_wallets_alias ON wallets(alias);
CREATE INDEX IF NOT EXISTS idx_wallets_type ON wallets(type);
CREATE INDEX IF NOT EXISTS idx_wallets_status ON wallets(status);


-- ============================================================================
-- TABLE: positions
-- ============================================================================

CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,

    mint VARCHAR(44) NOT NULL,
    status position_status_enum DEFAULT 'OPEN',

    -- Entry data
    tokens_held DECIMAL(38, 4) NOT NULL DEFAULT 0,
    entry_price DECIMAL(30, 18),
    initial_sol_spent DECIMAL(20, 9),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_positions_wallet ON positions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_positions_mint ON positions(mint);
CREATE INDEX IF NOT EXISTS idx_positions_status ON positions(status);
CREATE INDEX IF NOT EXISTS idx_positions_wallet_mint ON positions(wallet_id, mint, status);


-- ============================================================================
-- TABLE: trade_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    position_id UUID REFERENCES positions(id) ON DELETE SET NULL,

    action trade_action_enum NOT NULL,
    mint VARCHAR(44) NOT NULL,

    -- Financial data
    amount_sol DECIMAL(20, 9),
    amount_tokens DECIMAL(38, 4),
    price_impact_bps INT,

    -- Cost analysis
    jito_tip_lamports BIGINT,
    network_fee_sol DECIMAL(20, 9) DEFAULT 0.000005,

    -- Metadata
    tx_signature VARCHAR(128),
    is_simulation BOOLEAN DEFAULT FALSE,
    status trade_status_enum DEFAULT 'PENDING',
    error_message TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_logs_wallet ON trade_logs(wallet_id);
CREATE INDEX IF NOT EXISTS idx_trade_logs_action ON trade_logs(action);
CREATE INDEX IF NOT EXISTS idx_trade_logs_created ON trade_logs(created_at);


-- ============================================================================
-- TABLE: transfer_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS transfer_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,

    to_address VARCHAR(44) NOT NULL,
    amount_sol DECIMAL(20, 9) NOT NULL,

    tx_signature VARCHAR(128),
    status trade_status_enum DEFAULT 'PENDING',
    is_simulation BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfer_logs_wallet ON transfer_logs(from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_transfer_logs_created ON transfer_logs(created_at);


-- ############################################################################
-- VIEWS
-- ############################################################################

-- ============================================================================
-- VIEW: discovered_coins_graduation (MODULE: FIND)
-- ============================================================================

CREATE OR REPLACE VIEW discovered_coins_graduation AS
SELECT
    token_address,
    name,
    symbol,
    market_cap_sol,
    open_market_cap_sol,
    (open_market_cap_sol - market_cap_sol) AS distance_to_graduation_sol,
    ROUND((market_cap_sol / open_market_cap_sol * 100)::NUMERIC, 2) AS graduation_progress_pct,
    is_graduated,
    discovered_at
FROM discovered_coins
WHERE is_active = TRUE;


-- ============================================================================
-- VIEW: discovered_coins_active (MODULE: FIND)
-- ============================================================================

CREATE OR REPLACE VIEW discovered_coins_active AS
SELECT
    dc.*,
    (dc.open_market_cap_sol - dc.market_cap_sol) AS distance_to_graduation_sol,
    ROUND((dc.market_cap_sol / dc.open_market_cap_sol * 100)::NUMERIC, 2) AS graduation_progress_pct
FROM discovered_coins dc
WHERE dc.is_active = TRUE;


-- ============================================================================
-- VIEW: discovered_coins_near_graduation (MODULE: FIND)
-- ============================================================================

CREATE OR REPLACE VIEW discovered_coins_near_graduation AS
SELECT
    token_address,
    name,
    symbol,
    market_cap_sol,
    open_market_cap_sol,
    (open_market_cap_sol - market_cap_sol) AS distance_to_graduation_sol,
    ROUND((market_cap_sol / open_market_cap_sol * 100)::NUMERIC, 2) AS graduation_progress_pct,
    discovered_at,
    trader_public_key,
    initial_buy_sol
FROM discovered_coins
WHERE is_active = TRUE
  AND is_graduated = FALSE
  AND market_cap_sol > 0
ORDER BY graduation_progress_pct DESC;


-- ============================================================================
-- VIEW: view_wallet_performance (MODULE: BUY)
-- ============================================================================

CREATE OR REPLACE VIEW view_wallet_performance AS
SELECT
    w.alias,
    w.type,
    w.status,
    w.consecutive_losses,
    w.virtual_sol_balance,
    w.real_sol_balance,
    COUNT(t.id) FILTER (WHERE t.status = 'SUCCESS') as trade_count,
    COUNT(t.id) FILTER (WHERE t.action = 'BUY' AND t.status = 'SUCCESS') as buy_count,
    COUNT(t.id) FILTER (WHERE t.action = 'SELL' AND t.status = 'SUCCESS') as sell_count,
    COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN COALESCE(t.jito_tip_lamports, 0) / 1000000000.0 ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN COALESCE(t.network_fee_sol, 0) ELSE 0 END), 0) as net_profit_sol
FROM wallets w
LEFT JOIN trade_logs t ON w.id = t.wallet_id AND t.status = 'SUCCESS'
GROUP BY w.id, w.alias, w.type, w.status, w.consecutive_losses, w.virtual_sol_balance, w.real_sol_balance;


-- ############################################################################
-- FUNCTIONS
-- ############################################################################

-- ============================================================================
-- FUNCTION: notify_coin_metrics_insert (MODULE: SERVER)
-- Trigger function for LISTEN/NOTIFY on coin_metrics inserts
-- ============================================================================

CREATE OR REPLACE FUNCTION notify_coin_metrics_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify(
        'coin_metrics_insert',
        json_build_object(
            'mint', NEW.mint,
            'timestamp', NEW.timestamp,
            'phase_id', NEW.phase_id_at_time
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coin_metrics_insert_trigger ON coin_metrics;
CREATE TRIGGER coin_metrics_insert_trigger
    AFTER INSERT ON coin_metrics
    FOR EACH ROW
    EXECUTE FUNCTION notify_coin_metrics_insert();


-- ============================================================================
-- FUNCTION: reset_daily_balances (MODULE: BUY)
-- Resets start_balance_day for daily drawdown calculations (call via cron/n8n)
-- ============================================================================

CREATE OR REPLACE FUNCTION reset_daily_balances()
RETURNS void AS $$
BEGIN
    UPDATE wallets
    SET
        start_balance_day = CASE
            WHEN type = 'TEST' THEN virtual_sol_balance
            ELSE real_sol_balance
        END,
        last_reset_date = CURRENT_DATE,
        updated_at = NOW()
    WHERE status != 'FROZEN';
END;
$$ LANGUAGE plpgsql;


-- ############################################################################
-- SEED DATA
-- ############################################################################

-- ============================================================================
-- SEED: ref_coin_phases (MODULE: FIND)
-- ============================================================================

INSERT INTO ref_coin_phases (id, name, interval_seconds, min_age_minutes, max_age_minutes) VALUES
(1, 'Newborn', 3, 0, 2),
(2, 'Baby', 5, 2, 8),
(3, 'Toddler', 10, 8, 20),
(4, 'Teen', 30, 20, 90),
(5, 'Young', 60, 90, 240),
(6, 'Adult', 120, 240, 1080),
(7, 'Senior', 300, 1080, 8640),
(8, 'Veteran', 600, 8640, 33120),
(99, 'Finished', 0, 33120, 999999),
(100, 'Graduated', 0, 33120, 999999)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SEED: ref_model_types (MODULE: TRAINING)
-- ============================================================================

INSERT INTO ref_model_types (id, name, description, default_params) VALUES
(1, 'random_forest', 'Random Forest Classifier', '{"n_estimators": 100, "max_depth": 10, "min_samples_split": 2}'::jsonb),
(2, 'xgboost', 'XGBoost Classifier', '{"n_estimators": 100, "max_depth": 6, "learning_rate": 0.1}'::jsonb),
(3, 'gradient_boosting', 'Gradient Boosting Classifier', '{"n_estimators": 100, "max_depth": 3, "learning_rate": 0.1}'::jsonb),
(4, 'logistic_regression', 'Logistic Regression', '{"C": 1.0, "max_iter": 100}'::jsonb),
(5, 'neural_network', 'Neural Network (MLP)', '{"hidden_layers": [100, 50], "activation": "relu", "max_iter": 200}'::jsonb)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- SEED: Test wallets (MODULE: BUY)
-- ============================================================================

INSERT INTO wallets (alias, address, type, virtual_sol_balance, start_balance_day, tag)
VALUES (
    'test_wallet_01',
    'TEST111111111111111111111111111111111111111',
    'TEST',
    10.0,
    10.0,
    'development'
)
ON CONFLICT (alias) DO NOTHING;

INSERT INTO wallets (alias, address, type, virtual_sol_balance, start_balance_day, tag, virtual_loss_percent)
VALUES (
    'test_wallet_heavy',
    'TEST222222222222222222222222222222222222222',
    'TEST',
    10.0,
    10.0,
    'pain_mode_test',
    2.5
)
ON CONFLICT (alias) DO NOTHING;


-- ############################################################################
-- TIMESCALEDB: COMPRESSION POLICIES
-- ############################################################################

-- coin_transactions: Compress chunks older than 1 day
ALTER TABLE coin_transactions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'mint',
    timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('coin_transactions', INTERVAL '1 day', if_not_exists => TRUE);

-- coin_metrics: Compress chunks older than 3 days
ALTER TABLE coin_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'mint',
    timescaledb.compress_orderby = 'timestamp DESC'
);
SELECT add_compression_policy('coin_metrics', INTERVAL '3 days', if_not_exists => TRUE);

-- model_predictions: Compress chunks older than 14 days
ALTER TABLE model_predictions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'coin_id, active_model_id',
    timescaledb.compress_orderby = 'prediction_timestamp DESC'
);
SELECT add_compression_policy('model_predictions', INTERVAL '14 days', if_not_exists => TRUE);

-- alert_evaluations: Compress chunks older than 14 days
ALTER TABLE alert_evaluations SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'coin_id, model_id',
    timescaledb.compress_orderby = 'alert_timestamp DESC'
);
SELECT add_compression_policy('alert_evaluations', INTERVAL '14 days', if_not_exists => TRUE);


-- ############################################################################
-- TIMESCALEDB: RETENTION POLICIES (disabled - uncomment to activate)
-- Caution: Permanently deletes old data!
-- ############################################################################

-- SELECT add_retention_policy('coin_transactions', INTERVAL '30 days', if_not_exists => TRUE);
-- SELECT add_retention_policy('coin_metrics', INTERVAL '90 days', if_not_exists => TRUE);
-- SELECT add_retention_policy('model_predictions', INTERVAL '60 days', if_not_exists => TRUE);
-- SELECT add_retention_policy('alert_evaluations', INTERVAL '60 days', if_not_exists => TRUE);


-- ============================================================================
-- DONE
-- ============================================================================
-- Combined schema includes:
--   FIND:     discovered_coins, coin_streams, ref_coin_phases, coin_metrics,
--             coin_transactions, coin_pattern_embeddings,
--             exchange_rates, 3 graduation views
--   TRAINING: ml_models, ml_test_results, ml_comparisons, ml_jobs, ref_model_types
--   SERVER:   prediction_active_models (with all migrations merged),
--             predictions, model_predictions, alert_evaluations,
--             prediction_webhook_log, coin_scan_cache,
--             notify_coin_metrics_insert trigger
--   BUY:      wallets, positions, trade_logs, transfer_logs,
--             view_wallet_performance, reset_daily_balances()
-- ============================================================================
