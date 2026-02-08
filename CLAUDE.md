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
- **Frontend**: React + TypeScript + MUI at `frontend/`
  - Pages: Dashboard, Discovery, Training, Predictions, Trading
  - State: Zustand stores, @tanstack/react-query
  - API client: `frontend/src/services/api.ts` (Axios)
- **Database**: PostgreSQL 16 + TimescaleDB + pgvector
  - Schema: `sql/init.sql` (all tables)
  - Migrations: `sql/migrate_to_pgvector.sql`, `sql/migrate_to_timescaledb.sql`
  - Connection: asyncpg pool (shared across all modules)
  - Docker image: `timescale/timescaledb-ha:pg16` (includes pgvector)
  - Extensions: timescaledb, pgcrypto, vector

## API Routes
All routes use `/api/{module}/` prefix:
- `/api/find/` - Coin streams, metrics, phases, config
- `/api/training/` - Models, jobs, test results, comparisons, features
- `/api/server/` - Active models, predictions, alerts, alert config, system
- `/api/buy/` - Wallets, positions, trades, transfers, dashboard

## Database Tables
Core tables (all in `sql/init.sql`):
- `discovered_coins` - Raw coin metadata from WebSocket
- `coin_streams` - Active tracking streams with phase + ATH
- `coin_metrics` - Aggregated OHLCV snapshots (TimescaleDB hypertable) - used by ML Training & Predictions
- `coin_transactions` - Individual trade records (TimescaleDB hypertable) - for pattern analysis & graph features
- `coin_pattern_embeddings` - Vector embeddings for similarity search (pgvector, schema-only for now)
- `ref_coin_phases` - Phase config (interval, age range)
- `ml_models`, `ml_jobs`, `ml_test_results`, `ml_comparisons` - Training module
- `active_models`, `predictions`, `model_predictions`, `alert_evaluations` - Server module
- `wallets`, `positions`, `trade_logs`, `transfer_logs` - Buy module
- `exchange_rates` - SOL/USD rates

## Background Tasks (started in lifespan)
1. **CoinStreamer** - WebSocket connection to pumpportal.fun for new token events, saves to coin_metrics + coin_transactions
2. **JobManager** - Polls job queue for training/test/compare jobs
3. **AlertEvaluator** - Evaluates prediction accuracy, sends n8n webhooks
4. **Uptime tracker** - Updates Prometheus gauge every 10s

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

## MCP Integration
All API endpoints auto-exposed as MCP tools via fastapi-mcp.
Config: `.mcp.json` (points to http://localhost:3000/mcp)
