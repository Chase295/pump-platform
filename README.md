# Pump Platform

Unified Crypto Trading Platform - konsolidiert Token-Discovery, ML-Training, Vorhersagen und Trading in einen einzigen Service.

## Schnellstart

```bash
# .env erstellen (aus Vorlage kopieren)
cp .env.example .env

# Alle Services starten
docker compose up -d

# Frontend oeffnen
open http://localhost:3000
```

## Architektur

```
pump-platform/
├── backend/                   # FastAPI Backend
│   ├── main.py               # App-Einstiegspunkt
│   ├── config.py             # Konfiguration (Umgebungsvariablen)
│   ├── database.py           # asyncpg Connection Pool
│   ├── requirements.txt      # Python-Abhaengigkeiten
│   ├── Dockerfile
│   ├── shared/               # Gemeinsame Utilities
│   │   └── prometheus.py     # Prometheus-Metriken
│   └── modules/
│       ├── find/             # Token-Discovery (WebSocket-Streaming)
│       ├── training/         # ML-Modell-Training (XGBoost)
│       ├── server/           # Vorhersagen & Alerts
│       └── buy/              # Trading-Ausfuehrung
├── frontend/                  # React + TypeScript + MUI
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── pages/            # Dashboard, Discovery, Training, Predictions, Trading
│       └── services/api.ts   # API-Client
├── sql/
│   ├── init.sql              # Datenbank-Schema (alle Tabellen)
│   ├── migrate_to_pgvector.sql  # Migration: pgvector + coin_transactions
│   └── migrate_to_timescaledb.sql # Migration: TimescaleDB Hypertables
├── docker-compose.yml         # Docker Compose Stack
├── .env.example              # Umgebungsvariablen-Vorlage
└── .mcp.json                 # MCP-Server-Konfiguration
```

## Module

| Modul | Beschreibung | API-Prefix |
|-------|-------------|------------|
| Find | WebSocket-Streaming neuer Tokens, OHLCV-Metriken + Einzel-Trades | `/api/find/` |
| Training | XGBoost-Modell-Training mit Job-Queue | `/api/training/` |
| Server | ML-Vorhersagen, Alert-Evaluierung, n8n-Webhooks | `/api/server/` |
| Buy | Trading-Ausfuehrung, Wallet-Verwaltung, Positionen | `/api/buy/` |

## Datenbank

PostgreSQL 16 + TimescaleDB + pgvector (`timescale/timescaledb-ha:pg16`).

**Wichtige Tabellen:**
- `coin_metrics` - Aggregierte OHLCV-Snapshots pro Phasen-Intervall (Hypertable)
- `coin_transactions` - Einzelne Trades mit Wallet, Betrag, Preis (Hypertable)
- `coin_pattern_embeddings` - Vektor-Embeddings fuer Similarity Search (pgvector, Schema-only)

**Migrations:**
```bash
# pgvector + coin_transactions (fuer bestehende DBs)
docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_to_pgvector.sql

# TimescaleDB Hypertables (fuer bestehende DBs)
docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_to_timescaledb.sql
```

## Konfiguration

Alle Einstellungen ueber Umgebungsvariablen (siehe `.env.example`):

- `DATABASE_URL` - PostgreSQL-Verbindungs-URL
- `API_PORT` - Backend-Port (Standard: 8000)
- `LOG_LEVEL` - Log-Level (Standard: INFO)
- `WS_URL` - WebSocket-URL fuer Token-Discovery
- `N8N_WEBHOOK_URL` - n8n Webhook fuer Alerts

## Entwicklung

```bash
# Services starten
docker compose up -d

# Backend-Logs anzeigen
docker compose logs -f backend

# Nur Backend neu starten
docker compose restart backend

# Alles stoppen
docker compose down
```

## MCP-Integration

Alle API-Endpoints werden automatisch als MCP-Tools bereitgestellt (via fastapi-mcp).
Konfiguration in `.mcp.json`.
