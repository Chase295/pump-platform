# Pump Platform - CLAUDE.md

## Project Overview
Unified crypto token trading platform consolidating discovery, ML training, predictions, and trading execution into a single service.

## Architecture
- **Backend**: FastAPI (Python 3.11) at `backend/`
  - `backend/main.py` - App entry point, lifespan management
  - `backend/config.py` - Pydantic Settings (env vars)
  - `backend/database.py` - asyncpg connection pool
  - `backend/shared/prometheus.py` - Metrics
  - `backend/modules/find/` - Token discovery (WebSocket streaming from pumpportal.fun)
  - `backend/modules/training/` - ML model training (XGBoost, job queue)
  - `backend/modules/server/` - ML predictions, alerts, n8n webhooks
  - `backend/modules/buy/` - Trading execution, wallet management, positions
  - `backend/modules/embeddings/` - pgvector embedding pipeline, similarity search, auto-labeling, Neo4j SIMILAR_TO sync
  - `backend/modules/graph/` - Neo4j graph sync (16 Node-Types, 29 Rel-Types, 15 Constraints), Cypher query API
- **Frontend**: React + TypeScript + MUI at `frontend/`
  - Pages: Dashboard, Discovery, Training, Predictions, Trading
  - State: Zustand stores, @tanstack/react-query
  - API client: `frontend/src/services/api.ts` (Axios)
- **Database**: PostgreSQL 16 + TimescaleDB + pgvector
  - Schema: `sql/init.sql` (all tables)
  - Migrations: `sql/migrate_to_pgvector.sql`, `sql/migrate_to_timescaledb.sql`, `sql/migrate_embeddings_v2.sql`
  - Connection: asyncpg pool (shared across all modules)
  - Docker image: `timescale/timescaledb-ha:pg16` (includes pgvector)
  - Extensions: timescaledb, pgcrypto, vector

## API Routes
All routes use `/api/{module}/` prefix:
- `/api/find/` - Coin streams, metrics, phases, config
- `/api/training/` - Models, jobs, test results, comparisons, features
- `/api/server/` - Active models, predictions, alerts, alert config, system
- `/api/buy/` - Wallets, positions, trades, transfers, dashboard
- `/api/embeddings/` - Configs, generation, browse, similarity search, labels, analysis, Neo4j sync
- `/api/graph/` - Neo4j health, stats, sync, Cypher queries

## Database Tables
Core tables (all in `sql/init.sql`):
- `discovered_coins` - Raw coin metadata from WebSocket
- `coin_streams` - Active tracking streams with phase + ATH
- `coin_metrics` - Aggregated OHLCV snapshots (TimescaleDB hypertable) - used by ML Training & Predictions
- `coin_transactions` - Individual trade records (TimescaleDB hypertable) - for pattern analysis & graph features
- `coin_pattern_embeddings` - 128-dim vector embeddings for similarity search (pgvector HNSW index)
- `embedding_configs` - Embedding strategy configurations (window size, normalization, phases)
- `embedding_jobs` - Background generation jobs with progress tracking
- `pattern_labels` - Manual/auto labels (pump, rug, flat, etc.) with confidence
- `similarity_cache` - Pre-computed similarity pairs for Neo4j SIMILAR_TO sync
- `ref_coin_phases` - Phase config (interval, age range)
- `ml_models`, `ml_jobs`, `ml_test_results`, `ml_comparisons` - Training module
- `active_models`, `predictions`, `model_predictions`, `alert_evaluations` - Server module
- `wallets`, `positions`, `trade_logs`, `transfer_logs` - Buy module
- `exchange_rates` - SOL/USD rates
- `coin_streams` - Active token tracking (phase, ATH, current status)

## Background Tasks (started in lifespan)
1. **CoinStreamer** - WebSocket connection to pumpportal.fun for new token events, saves to coin_metrics + coin_transactions
2. **JobManager** - Polls job queue for training/test/compare jobs
3. **AlertEvaluator** - Evaluates prediction accuracy, sends n8n webhooks
4. **EmbeddingService** - Generates 128-dim embeddings from coin_metrics + coin_transactions every 60s, with auto-labeling + similarity cache
5. **GraphSyncService** - Syncs PostgreSQL data to Neo4j every 300s (7 sync modules: base, events, phases, wallets, market, enrichment, transactions)
6. **Uptime tracker** - Updates Prometheus gauge every 10s

## Key Patterns
- Raw SQL with asyncpg (no ORM)
- Pydantic models for request/response validation
- Direct Python imports between modules (no HTTP inter-service calls)
- All config via environment variables (see .env.example)
- English code comments, German user-facing docs
- coin_transactions flush is non-fatal (never crashes the metrics pipeline)

## Development
```bash
docker compose up -d          # Start all services
docker compose logs -f backend  # Watch backend logs
```

## MCP Integration (Model Context Protocol)

All API endpoints are automatically exposed as MCP tools for AI assistants (Claude Code, Cursor, etc.).

### How it works
- **Library**: `fastapi-mcp 0.4.0` (auto-generates tools from OpenAPI spec)
- **Transport (primary)**: Streamable HTTP at `/mcp` (POST, recommended for claude.ai)
- **Transport (legacy)**: SSE at `/sse` (GET + POST `/sse/messages/`, for Claude Code local)
- **Nginx proxy**: `frontend/nginx.conf` proxies `/mcp` and `/sse` → `backend:8000` (buffering disabled, 1h timeout)
- **Auth**: `/mcp` and `/sse` are NOT behind the Bearer token middleware (only `/api/*` routes are protected)

### Setup
1. Copy `.mcp.json.example` to `.mcp.json` (or use the existing one in project root)
2. Start services: `docker compose up -d`
3. Restart your AI assistant (Claude Code: new session in project directory)

### Config file location
The `.mcp.json` must be in the directory where you start your AI assistant:
- `pump-project/.mcp.json` — works when starting from project root
- `pump-project/pump-platform/.mcp.json` — works when starting from pump-platform/

### Available tool modules
All `/api/*` routes become MCP tools automatically:
- **Find** (Discovery): coin streams, metrics, phases, config
- **Training**: models, jobs, test results, comparisons, features, data availability
- **Server** (Predictions): active models, predictions, alerts, alert config
- **Buy** (Trading): wallets, positions, trades, transfers, dashboard
- **Embeddings**: configs, generation, similarity search, labels
- **Graph**: Neo4j health, stats, sync, Cypher queries

### Verify MCP is running
```bash
# Test Streamable HTTP transport (used by claude.ai)
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
# Expected: JSON response with server capabilities

# Test SSE transport (used by Claude Code local)
curl -s -m 3 -N http://localhost:3000/sse
# Expected: event: endpoint\ndata: /sse/messages/?session_id=...
```
