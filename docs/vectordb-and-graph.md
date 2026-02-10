# VectorDB (pgvector) & Graph Database (Neo4j) - Vollstaendige Dokumentation

## Inhaltsverzeichnis

1. [Architektur-Uebersicht](#1-architektur-uebersicht)
2. [pgvector - Schema & Tabellen](#2-pgvector---schema--tabellen)
3. [Datenfluss: Was wird importiert, exportiert, genutzt?](#3-datenfluss-was-wird-importiert-exportiert-genutzt)
4. [Neo4j Graph Database](#4-neo4j-graph-database)
5. [Frontend-Komponenten](#5-frontend-komponenten)
6. [Backend-Module](#6-backend-module)
7. [API-Endpunkte](#7-api-endpunkte)
8. [Konfiguration](#8-konfiguration)
9. [Debugging-Guide](#9-debugging-guide)
10. [Datei-Referenz (wo suchen bei Bugs)](#10-datei-referenz-wo-suchen-bei-bugs)

---

## 1. Architektur-Uebersicht

Das System verwendet **drei Datenbanken** mit unterschiedlichen Aufgaben:

```
                   +-----------------------+
                   |   PostgreSQL 16       |
                   |   (TimescaleDB +      |
                   |    pgvector)          |
                   +----------+------------+
                              |
              +---------------+----------------+
              |               |                |
        coin_metrics    coin_transactions    coin_pattern_embeddings
        (Zeitreihen)    (Einzeltrades)       (128-dim Vektoren)
        OHLCV, ML       Pattern-Analyse      Aehnlichkeitssuche
              |               |                |
              +-------+-------+                | Embedding Pipeline
              |       |                        | (AKTIV seit Feb 2026)
        ML Training   FIND Streamer            |
        Predictions   WebSocket                |
                              |
                   +----------v------------+
                   |   Neo4j 5 Community   |
                   |   (Graph Database)    |
                   +----------+------------+
                              |
                   Beziehungsanalyse:
                   Creator -> Token
                   Wallet -> BOUGHT/SOLD -> Token
                   Model -> PREDICTED -> Token
```

### Datenbanktypen und ihre Rollen

| Datenbank | Technologie | Aufgabe |
|-----------|------------|---------|
| **Zeitreihen** | TimescaleDB (auf PostgreSQL) | OHLCV-Metriken, ML-Features, Kompression |
| **Vektoren** | pgvector (PostgreSQL Extension) | Coin-Pattern-Embeddings, Aehnlichkeitssuche |
| **Graph** | Neo4j 5 Community | Beziehungen: Creator-Token, Wallet-Trades, Rug-Detection |

Alle drei laufen als Docker-Container. PostgreSQL + TimescaleDB + pgvector teilen sich einen Container (`timescale/timescaledb-ha:pg16`).

---

## 2. pgvector - Schema & Tabellen

### 2.1 Extensions (sql/init.sql:33)

```sql
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector fuer Similarity Search
CREATE EXTENSION IF NOT EXISTS timescaledb;  -- Hypertables fuer Zeitreihen
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- UUID-Generierung
```

### 2.2 coin_transactions (Rohdaten fuer Embeddings)

**Datei:** `sql/init.sql:286-309`
**Befuellt von:** FIND Streamer (`backend/modules/find/metrics.py:197-223`)

Diese Tabelle speichert **jeden einzelnen Trade** und dient als Rohdatenquelle fuer die spaetere Embedding-Generierung.

```sql
CREATE TABLE IF NOT EXISTS coin_transactions (
    mint              VARCHAR(64)  NOT NULL,        -- Token-Adresse
    timestamp         TIMESTAMPTZ  NOT NULL,        -- Zeitpunkt
    trader_public_key VARCHAR(44)  NOT NULL,        -- Solana Wallet
    sol_amount        NUMERIC(20,9) NOT NULL,       -- SOL-Betrag
    tx_type           VARCHAR(4)   NOT NULL,        -- 'buy' oder 'sell'
    price_sol         NUMERIC(30,18) NOT NULL,      -- Preis in SOL
    is_whale          BOOLEAN      NOT NULL DEFAULT FALSE, -- Whale-Flag
    phase_id_at_time  INTEGER                       -- Coin-Phase (1-6)
);
```

**Indexes:**
| Index | Spalten | Zweck |
|-------|---------|-------|
| `idx_coin_tx_mint_timestamp` | mint, timestamp DESC | Trades pro Token abrufen |
| `idx_coin_tx_trader` | trader_public_key, timestamp DESC | Wallet-History |
| `idx_coin_tx_timestamp` | timestamp DESC | Zeitbasierte Abfragen |
| `idx_coin_tx_whale` | is_whale (partial WHERE TRUE) | Whale-Trades filtern |
| `idx_coin_tx_type` | tx_type | Buy/Sell filtern |

**TimescaleDB-Konfiguration:**
- Hypertable mit **1-Tag-Chunks**
- Kompression nach 1 Tag (segmentiert nach `mint`, sortiert nach `timestamp DESC`)
- Optionale Retention Policy: 30 Tage (auskommentiert)

**Datenvolumen:**
- Jeder WebSocket-Trade erzeugt eine Zeile
- Bei ~1000 Trades/Minute: ~1.4 Mio Zeilen/Tag
- Kompression reduziert Speicher um ~90%

### 2.3 coin_pattern_embeddings (Vektor-Tabelle)

**Datei:** `sql/init.sql`
**Status:** AKTIV - wird automatisch vom EmbeddingService befuellt (alle 60s)

```sql
CREATE TABLE IF NOT EXISTS coin_pattern_embeddings (
    id              BIGSERIAL    PRIMARY KEY,
    mint            VARCHAR(64)  NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    window_start    TIMESTAMPTZ  NOT NULL,
    window_end      TIMESTAMPTZ  NOT NULL,
    embedding       vector(128)  NOT NULL,          -- 128-dim Vektor (Handcrafted v1)
    phase_id_at_time INTEGER,
    num_snapshots   INTEGER      NOT NULL DEFAULT 0,
    label           VARCHAR(50),                    -- Auto-Label: pump, rug, flat, etc.
    strategy        VARCHAR(50)  DEFAULT 'handcrafted_v1',  -- Embedding-Strategie
    config_id       BIGINT,                         -- FK zu embedding_configs
    feature_hash    VARCHAR(64),                    -- Reproduzierbarkeits-Hash
    metadata        JSONB,                          -- Flexible Zusatzinfos
    quality_score   NUMERIC(5,4),                   -- Embedding-Qualitaet (0-1)
    is_labeled      BOOLEAN      DEFAULT FALSE,
    CONSTRAINT chk_window_order CHECK (window_start < window_end)
);
```

**HNSW-Index (Approximate Nearest Neighbor):**
```sql
CREATE INDEX idx_coin_patterns_embedding
    ON coin_pattern_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| Algorithmus | HNSW | Hierarchical Navigable Small World |
| Distanzmetrik | `vector_cosine_ops` | Cosine Similarity (0 = identisch, 2 = gegensaetzlich) |
| m | 16 | Kanten pro Knoten im Graph (mehr = genauer, langsamer) |
| ef_construction | 64 | Suchbreite beim Index-Aufbau |
| Dimensionen | 128 | Feste Vektorgroesse |

**Similarity-Abfrage (implementiert in `similarity.py`):**
```sql
SET LOCAL hnsw.ef_search = 100;
SELECT mint, label, 1 - (embedding <=> $1::vector) AS cosine_similarity
FROM coin_pattern_embeddings
WHERE phase_id_at_time = 2
ORDER BY embedding <=> $1::vector
LIMIT 10;
```

### 2.4 Neue Embedding-Tabellen (seit Feb 2026)

**Migration:** `sql/migrate_embeddings_v2.sql`

| Tabelle | Zweck |
|---------|-------|
| `embedding_configs` | Strategiekonfiguration: Name, Window-Size, Normalisierung, Phasenfilter |
| `embedding_jobs` | Hintergrund-Jobs (GENERATE/BACKFILL) mit Fortschritt |
| `pattern_labels` | Labels mit Confidence + Source (manual/auto/propagated) |
| `similarity_cache` | Vorberechnete Aehnlichkeitspaare fuer Neo4j SIMILAR_TO Sync |

### 2.4 Migration fuer bestehende Datenbanken

**Datei:** `sql/migrate_to_pgvector.sql`

```bash
# Fuer Datenbanken die VOR pgvector-Integration erstellt wurden:
docker exec -i pump-platform-db psql -U pump -d pump_platform < sql/migrate_to_pgvector.sql
```

Sicher mehrfach ausfuehrbar (alle Statements nutzen `IF NOT EXISTS`).

---

## 3. Datenfluss: Was wird importiert, exportiert, genutzt?

### 3.1 Daten-Pipeline (aktuell aktiv)

```
pumpportal.fun WebSocket
        |
        v
  FIND Streamer (backend/modules/find/)
        |
        +---> coin_metrics (OHLCV, aggregiert pro Phase-Intervall)
        |       |
        |       +--> ML Training (XGBoost Features)
        |       +--> ML Predictions (Live-Vorhersagen)
        |
        +---> coin_transactions (jeder einzelne Trade)
        |       |
        |       +--> Embedding Pipeline --> coin_pattern_embeddings (AKTIV)
        |       +--> Neo4j Graph Sync (ueber discovered_coins, nicht direkt)
        |
        +---> discovered_coins (Token-Metadaten)
                |
                +--> Neo4j: Token + Creator Nodes
```

### 3.2 Daten in coin_transactions (Input)

**Quelle:** `backend/modules/find/metrics.py:111-119`

Jeder WebSocket-Trade wird als Tuple gesammelt:

```python
buf["trades"].append((
    mint,                          # Token-Adresse
    trader_key,                    # Wallet-Adresse des Traders
    sol,                           # SOL-Betrag
    "buy" if is_buy else "sell",   # Trade-Typ
    price,                         # Preis in SOL
    sol >= whale_threshold,        # Whale-Flag (Standard: >= 1.0 SOL)
))
```

**Flush:** `backend/modules/find/metrics.py:197-223`

```python
async def flush_transactions_batch(trades_data, status):
    """Non-fatal! Fehler hier blockieren NIEMALS die Metrik-Pipeline."""
    sql = """
        INSERT INTO coin_transactions (
            mint, timestamp, trader_public_key, sol_amount,
            tx_type, price_sol, is_whale, phase_id_at_time
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    """
```

**Wichtig:** `flush_transactions_batch` ist **non-fatal**. Fehler werden geloggt aber ignoriert - die Haupt-Metrik-Pipeline (`coin_metrics`) laeuft immer weiter.

### 3.3 Daten in coin_pattern_embeddings (AKTIV)

**Status: Vollstaendig implementiert und aktiv seit Feb 2026**
**Backend-Modul:** `backend/modules/embeddings/`

**Ablauf (alle 60 Sekunden automatisch):**
1. `EmbeddingService` laedt aktive Configs aus `embedding_configs`
2. Pro Config: Zeitfenster seit letztem Lauf generieren (inkrementell)
3. Aktive Mints per Fenster aus `coin_metrics` ermitteln
4. 128 Features aus `coin_metrics` + `coin_transactions` extrahieren
5. Normalisierung (MinMax/ZScore/Robust) anwenden
6. Batch-Insert in `coin_pattern_embeddings`
7. Auto-Labeling basierend auf Post-Window-Preisentwicklung
8. Similarity-Cache aktualisieren + optional Neo4j SIMILAR_TO sync

**128 Features in 8 Gruppen (implementiert in `features.py`):**

| Gruppe | Features | Herkunft |
|--------|----------|----------|
| A: Preis-Dynamik | 20 (Return, Volatilitaet, Drawdown, Hurst) | coin_metrics |
| B: Volumen-Dynamik | 16 (Trends, Buy/Sell-Ratio, Whale-Anteil) | coin_metrics |
| C: Markt-Struktur | 12 (Market-Cap, Bonding-Curve, Dev-Sold) | coin_metrics |
| D: Partizipation | 12 (Unique Wallets, Konzentration) | coin_metrics |
| E: Temporale Patterns | 14 (Bursts, Streaks, Timing-Entropy) | coin_transactions |
| F: Wallet-Verhalten | 14 (Whale-Trader, Gini, Top-Dominanz) | coin_transactions |
| G: Price-Impact | 12 (VWAP, Sell-Pressure, Buy-Exhaustion) | coin_transactions |
| H: Kontext + Interaktion | 28 (Smart-Money, FOMO, Wash-Trade) | Berechnet |

**Auto-Labels:**
| Label | Bedingung (Post-Window) |
|-------|------------------------|
| `pump` | Max Gain >50% in naechsten 10 Snapshots |
| `rug` | Max Loss <-80% |
| `organic_growth` | Gain >10%, Loss >-20% |
| `flat` | Gain <5%, Loss <5% |
| `dump` | Loss <-50% |
| `mixed` | Alles andere |

### 3.4 Daten in Neo4j (Graph Export)

**Quelle:** `backend/modules/graph/sync.py`
**Richtung:** PostgreSQL --> Neo4j (Einweg-Sync, alle 300s)

| Prioritaet | PostgreSQL-Tabelle | Neo4j Node/Relationship | Sync-Methode |
|-----------|-------------------|------------------------|-------------|
| P0 | `discovered_coins` | `:Token`, `:Creator`, `-[:CREATED]->` | Inkrementell nach `discovered_at` |
| P1 | `wallets` | `:Wallet` | Vollsync (alle Wallets) |
| P1 | `positions` | `-[:HOLDS]->` | Inkrementell nach `created_at` |
| P1 | `trade_logs` | `-[:BOUGHT]->`, `-[:SOLD]->` | Inkrementell nach `created_at` |
| P2 | `prediction_active_models` | `:Model` | Vollsync |
| P2 | `model_predictions` | `-[:PREDICTED]->` | Nur Alerts, inkrementell |
| P3 | `transfer_logs` | `-[:TRANSFERRED_TO]->` | Inkrementell nach `created_at` |

**Neo4j Graph-Modell:**
```
(:Creator {address}) -[:CREATED {initial_buy_sol, timestamp}]-> (:Token {address, name, symbol})
(:Wallet  {alias})   -[:BOUGHT  {amount_sol, amount_tokens}]-> (:Token)
(:Wallet  {alias})   -[:SOLD    {amount_sol, amount_tokens}]-> (:Token)
(:Wallet  {alias})   -[:HOLDS   {tokens_held, entry_price}]->  (:Token)
(:Model   {id,name}) -[:PREDICTED {probability, tag}]->        (:Token)
(:Wallet  {alias})   -[:TRANSFERRED_TO {amount_sol}]->         (:Address {address})
```

---

## 4. Neo4j Graph Database

### 4.1 Container-Konfiguration

**docker-compose.yml:**
```yaml
neo4j:
  image: neo4j:5-community
  environment:
    NEO4J_AUTH: none                                    # Keine Authentifizierung
    NEO4J_server_bolt_listen__address: 0.0.0.0:7687     # Bolt-Port
    NEO4J_server_bolt_advertised__address: localhost:3000 # Advertised fuer Browser
    NEO4J_server_bolt_tls__level: DISABLED              # Kein TLS (nginx terminiert)
  expose:
    - "7474"  # HTTP API (Browser UI)
    - "7687"  # Bolt Protocol (Queries)
```

### 4.2 Neo4j Browser (via iframe)

Der Neo4j Browser laeuft als JavaScript-App im User-Browser und verbindet sich per WebSocket:

```
Chrome (Neo4j Browser JS)
  --> bolt[+s]://hostname:port/  (WebSocket)
  --> Externer Reverse Proxy (SSL Termination, falls HTTPS)
  --> Nginx Frontend (port 80)
      --> WebSocket Upgrade erkannt (map $is_websocket)
      --> @bolt Location: proxy_pass http://neo4j:7687
  --> Neo4j Bolt Server
```

**Dynamische URL-Generierung (frontend/src/pages/Neo4jGraph.tsx):**
```typescript
const isSecure = window.location.protocol === 'https:';
const boltScheme = isSecure ? 'bolt+s' : 'bolt';
const boltHost = window.location.hostname;
const boltPort = window.location.port || (isSecure ? '443' : '80');
const boltUrl = `${boltScheme}://${boltHost}:${boltPort}`;
```

Funktioniert mit jedem Hostname/Port/Protokoll automatisch.

### 4.3 Uniqueness Constraints (automatisch bei erstem Sync)

```cypher
CREATE CONSTRAINT token_address IF NOT EXISTS FOR (t:Token) REQUIRE t.address IS UNIQUE
CREATE CONSTRAINT creator_address IF NOT EXISTS FOR (c:Creator) REQUIRE c.address IS UNIQUE
CREATE CONSTRAINT wallet_alias IF NOT EXISTS FOR (w:Wallet) REQUIRE w.alias IS UNIQUE
CREATE CONSTRAINT model_id IF NOT EXISTS FOR (m:Model) REQUIRE m.id IS UNIQUE
```

---

## 5. Frontend-Komponenten

### 5.1 Graph-Seite

| Datei | Komponente | Funktion |
|-------|-----------|----------|
| `frontend/src/pages/Neo4jGraph.tsx` | `Neo4jGraph` | Tab-Container mit 3 Tabs |
| `frontend/src/pages/graph/CypherExplorer.tsx` | `CypherExplorer` | Interaktiver Cypher-Query-Editor |
| `frontend/src/pages/graph/GraphGuide.tsx` | `GraphGuide` | Dokumentation mit 5 Kapiteln |

**Navigation:** Sidebar -> "Graph" (`/graph` Route in App.tsx)

### 5.2 Neo4j Browser Tab (Tab 0)

- iframe zu `/neo4j/browser/` mit dynamischen URL-Parametern
- Parameter: `dbms`, `preselectAuthType=NO_AUTH`, `discoveryURL=/neo4j/`
- Nginx proxied `/neo4j/` -> `neo4j:7474/`
- Bolt WebSocket am Root `/` -> `neo4j:7687`

### 5.3 Cypher Explorer Tab (Tab 1)

- REST-basierter Cypher-Query-Client (kein direktes Bolt)
- 6 Preset-Queries (Rug-Check, Wallet Trades, Alert->Trade, etc.)
- Sendet Queries an `/api/graph/query?q=...`
- Blockiert Schreiboperationen (CREATE, MERGE, DELETE, etc.)
- Ergebnisse als Tabelle + JSON-Export

### 5.4 Guide Tab (Tab 2)

5 aufklappbare Kapitel:
1. Graph Data Model (Nodes + Relationships)
2. Cypher Explorer Bedienung
3. Nuetzliche Cypher Queries
4. API Endpoints & Config
5. Troubleshooting

---

## 6. Backend-Module

### 6.1 Graph-Modul

| Datei | Zweck |
|-------|-------|
| `backend/modules/graph/__init__.py` | Modul-Init |
| `backend/modules/graph/neo4j_client.py` | Async Neo4j Driver (Singleton) |
| `backend/modules/graph/router.py` | FastAPI Router (`/api/graph/`) |
| `backend/modules/graph/sync.py` | PostgreSQL -> Neo4j Sync Service |

### 6.2 neo4j_client.py - Driver-Management

```python
# Initialisierung (in main.py Lifespan)
await init_neo4j(uri, user, password)

# Lesen
results = await run_query("MATCH (t:Token) RETURN t LIMIT 10")

# Schreiben
await run_write("MERGE (t:Token {address: $mint})", {"mint": "abc123"})

# Health Check
is_healthy = await check_health()

# Shutdown
await close_neo4j()
```

### 6.3 sync.py - Graph Sync Service

**Lifecycle:**
1. `main.py` startet `_init_neo4j_with_retry()` als asyncio Task (12 Versuche, 10s Delay)
2. Nach erfolgreicher Verbindung: `start_graph_sync(interval_seconds=300)`
3. Erster Sync: Constraints erstellen + Vollsync aller Daten
4. Folgende Syncs: Inkrementell (nur neue Daten seit letztem Sync)
5. Shutdown: `stop_graph_sync()` + `close_neo4j()`

**Batch-Verarbeitung:**
- Max 5000 Entities pro Sync-Runde pro Typ
- Fehler sind non-fatal (Sync laeuft weiter)
- Statistiken via `get_graph_sync().get_status()`

### 6.4 Embeddings-Modul (Embedding Pipeline)

| Datei | Zweck |
|-------|-------|
| `backend/modules/embeddings/__init__.py` | Public API: router, service start/stop |
| `backend/modules/embeddings/features.py` | 128-Feature-Extraktion aus coin_metrics + coin_transactions |
| `backend/modules/embeddings/generator.py` | Embedding-Strategien (Handcrafted v1) + Normalizer-Registry |
| `backend/modules/embeddings/service.py` | Background EmbeddingService (60s Intervall) |
| `backend/modules/embeddings/similarity.py` | pgvector HNSW Similarity Search + Neo4j SIMILAR_TO Sync |
| `backend/modules/embeddings/db_queries.py` | SQL CRUD fuer Embeddings, Configs, Jobs, Labels |
| `backend/modules/embeddings/router.py` | FastAPI Router (`/api/embeddings/`) - 25+ Endpoints |
| `backend/modules/embeddings/schemas.py` | Pydantic Request/Response Models |

### 6.5 FIND-Modul (coin_transactions Quelle)

| Datei | Funktion |
|-------|----------|
| `backend/modules/find/metrics.py:111-119` | Trade-Daten sammeln in `buf["trades"]` |
| `backend/modules/find/metrics.py:197-223` | `flush_transactions_batch()` - In DB schreiben |
| `backend/modules/find/phases.py:351` | Trades vor Phase-Reset einsammeln |

---

## 7. API-Endpunkte

### 7.1 Graph API (`/api/graph/`)

| Methode | Pfad | Funktion | Datei |
|---------|------|----------|-------|
| GET | `/api/graph/health` | Neo4j Verbindungsstatus | router.py |
| GET | `/api/graph/stats` | Node/Relationship-Zaehler | router.py |
| GET | `/api/graph/sync/status` | Sync-Timestamps + Statistiken | router.py |
| POST | `/api/graph/sync/trigger` | Manuellen Sync ausloesen | router.py |
| GET | `/api/graph/query?q=...&limit=100` | Read-only Cypher ausfuehren | router.py |

### 7.2 Embeddings API (`/api/embeddings/`)

| Methode | Pfad | Funktion |
|---------|------|----------|
| GET | `/api/embeddings/health` | Service-Status, aktive Configs, Stats |
| GET | `/api/embeddings/stats` | Gesamt-Embeddings, Strategie-Breakdown, Storage |
| GET/POST | `/api/embeddings/configs` | Configs listen/erstellen |
| GET/PATCH/DELETE | `/api/embeddings/configs/{id}` | Config Details/aendern/loeschen |
| POST | `/api/embeddings/generate` | Manuelle Generation fuer Zeitraum |
| GET | `/api/embeddings/jobs` | Jobs listen |
| GET | `/api/embeddings/browse` | Paginierte Embedding-Liste mit Filtern |
| POST | `/api/embeddings/search/similar` | Suche per Embedding-Vektor oder Mint |
| GET | `/api/embeddings/search/by-mint/{mint}` | Aehnliche Patterns zu einem Coin |
| GET | `/api/embeddings/search/by-label/{label}` | Alle Patterns eines Labels |
| POST/GET | `/api/embeddings/labels` | Label hinzufuegen/listen |
| POST | `/api/embeddings/labels/propagate` | Labels auf aehnliche Patterns uebertragen |
| GET | `/api/embeddings/analysis/distribution` | Label-Verteilung |
| GET | `/api/embeddings/analysis/clusters` | K-Means Cluster-Analyse |
| GET | `/api/embeddings/analysis/outliers` | Ausreisser-Patterns |
| POST | `/api/embeddings/neo4j/sync` | Manuellen SIMILAR_TO Sync ausloesen |
| GET | `/api/embeddings/neo4j/status` | Sync-Status |

### 7.3 Nginx Proxy-Pfade

| Pfad | Ziel | Zweck |
|------|------|-------|
| `/neo4j/` | `neo4j:7474/` | Browser UI + Discovery Endpoint |
| `/` (WebSocket) | `neo4j:7687` | Bolt Protocol (via @bolt Location) |
| `/api/graph/` | `backend:8000` | REST API (via /api/ Location) |

---

## 8. Konfiguration

### 8.1 Umgebungsvariablen (.env)

```bash
# PostgreSQL (inkl. pgvector + TimescaleDB)
DB_NAME=pump_platform
DB_USER=pump
DB_PASSWORD=changeme

# Neo4j (backend/config.py)
NEO4J_URI=bolt://neo4j:7687          # Docker-interner Hostname
NEO4J_USER=                           # Leer = keine Auth (NEO4J_AUTH: none)
NEO4J_PASSWORD=
NEO4J_SYNC_INTERVAL_SECONDS=300       # Sync alle 5 Minuten
NEO4J_SYNC_ENABLED=true               # Sync an/aus
```

### 8.2 Docker-Compose Ports

| Service | Intern | Extern | Zweck |
|---------|--------|--------|-------|
| db (PostgreSQL) | 5432 | 5433 | Direkter DB-Zugriff |
| neo4j HTTP | 7474 | - (nur expose) | Browser UI via nginx |
| neo4j Bolt | 7687 | - (nur expose) | Bolt via nginx WebSocket |
| frontend (nginx) | 80 | 3000 | Alles (SPA, API, Neo4j, Bolt) |

---

## 9. Debugging-Guide

### 9.1 pgvector / coin_transactions Probleme

**Tabelle leer?**
```bash
# Pruefen ob Daten ankommen
docker exec pump-platform-db psql -U pump -d pump_platform \
  -c "SELECT count(*) FROM coin_transactions;"

# Letzte Trades anzeigen
docker exec pump-platform-db psql -U pump -d pump_platform \
  -c "SELECT mint, tx_type, sol_amount, timestamp FROM coin_transactions ORDER BY timestamp DESC LIMIT 10;"
```

**Flush schlaegt fehl?**
```bash
# Backend-Logs pruefen (non-fatal Warnungen)
docker compose logs -f backend 2>&1 | grep "coin_transactions"
```

**pgvector Extension fehlt?**
```bash
# Extension-Status pruefen
docker exec pump-platform-db psql -U pump -d pump_platform \
  -c "SELECT * FROM pg_extension WHERE extname = 'vector';"

# Manuell aktivieren
docker exec pump-platform-db psql -U pump -d pump_platform \
  -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**HNSW-Index pruefen:**
```bash
docker exec pump-platform-db psql -U pump -d pump_platform \
  -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'coin_pattern_embeddings';"
```

**Embedding-Tabelle testen (manuell):**
```sql
-- Test-Embedding einfuegen (128 Dimensionen)
INSERT INTO coin_pattern_embeddings (mint, window_start, window_end, embedding, num_snapshots, label)
VALUES ('test_mint', NOW() - INTERVAL '1 hour', NOW(),
        array_fill(0.1, ARRAY[128])::vector, 60, 'test');

-- Similarity Search testen
SELECT mint, label, 1 - (embedding <=> (SELECT embedding FROM coin_pattern_embeddings WHERE mint = 'test_mint' LIMIT 1)) AS similarity
FROM coin_pattern_embeddings
ORDER BY embedding <=> (SELECT embedding FROM coin_pattern_embeddings WHERE mint = 'test_mint' LIMIT 1)
LIMIT 5;

-- Aufraeumen
DELETE FROM coin_pattern_embeddings WHERE mint = 'test_mint';
```

### 9.2 Neo4j Probleme

**Verbindung testen:**
```bash
# Health-Check via API
curl http://localhost:3000/api/graph/health

# Neo4j Container-Status
docker compose exec neo4j wget -qO- http://localhost:7474/

# Bolt-Verbindung testen (via nginx WebSocket Proxy)
curl -s -i -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Sec-WebSocket-Version: 13" http://localhost:3000/
# Erwartet: HTTP/1.1 101 Switching Protocols
```

**Sync-Status pruefen:**
```bash
curl -s http://localhost:3000/api/graph/sync/status | python3 -m json.tool
```

**Manuellen Sync ausloesen:**
```bash
curl -X POST http://localhost:3000/api/graph/sync/trigger
```

**Neo4j Daten pruefen (via Cypher Explorer oder curl):**
```bash
# Node-Zaehler
curl -s "http://localhost:3000/api/graph/query?q=MATCH%20(n)%20RETURN%20labels(n)%20as%20type,%20count(n)%20as%20count"

# Token-Nodes
curl -s "http://localhost:3000/api/graph/query?q=MATCH%20(t:Token)%20RETURN%20t.address,%20t.name%20LIMIT%205"
```

### 9.3 Neo4j Browser (iframe) Probleme

**WebSocket-Fehler (`readyState: 3`)?**
1. nginx WebSocket-Proxy pruefen: `curl -H "Upgrade: websocket" http://localhost:3000/`
2. Muss `101 Switching Protocols` zurueckgeben
3. Falls `200` (HTML): `map $is_websocket` in nginx.conf pruefen

**`bolt+s://` statt `bolt://` (ERR_SSL_PROTOCOL_ERROR)?**
- Problem: Neo4j Browser auf HTTPS erzwingt verschluesselte Verbindung
- Loesung: `bolt+s://` ist korrekt bei HTTPS - der externe Reverse Proxy muss WebSocket-Upgrades weiterleiten
- `Neo4jGraph.tsx` erkennt automatisch HTTP/HTTPS und waehlt `bolt://` oder `bolt+s://`

**Port 7687 statt korrektem Port?**
- Problem: Bolt-Default-Port ist 7687, nicht 443/80
- Loesung: `Neo4jGraph.tsx` setzt den Port explizit aus `window.location.port`

**Discovery schlaegt fehl (Browser zeigt nur `bolt+s://`)?**
- Problem: Neo4j Browser findet Discovery-Endpoint nicht
- Loesung: `discoveryURL=/neo4j/` Parameter in iframe-URL
- Pruefen: `curl http://localhost:3000/neo4j/` muss JSON mit `bolt_direct` zurueckgeben

### 9.4 Backend-Logs lesen

```bash
# Alle Graph-relevanten Logs
docker compose logs -f backend 2>&1 | grep -i "neo4j\|graph\|sync"

# Nur Fehler
docker compose logs -f backend 2>&1 | grep -i "neo4j\|graph" | grep -i "error\|fail\|warn"

# Transaction-Flush Logs
docker compose logs -f backend 2>&1 | grep "coin_transactions"
```

---

## 10. Datei-Referenz (wo suchen bei Bugs)

### Schnell-Referenz: "Wo muss ich suchen?"

| Problem | Datei(en) |
|---------|-----------|
| **pgvector Extension fehlt** | `sql/init.sql:33`, `sql/migrate_to_pgvector.sql:17` |
| **coin_transactions leer** | `backend/modules/find/metrics.py:197-223` (flush), `backend/modules/find/phases.py:351` (collect) |
| **coin_transactions Schema** | `sql/init.sql:286-309` |
| **Embedding-Tabelle Schema** | `sql/init.sql` (coin_pattern_embeddings) |
| **Embedding-Pipeline** | `backend/modules/embeddings/` (8 Dateien) |
| **Feature-Extraktion (128 Features)** | `backend/modules/embeddings/features.py` |
| **Similarity Search** | `backend/modules/embeddings/similarity.py` |
| **Embedding Service (Background)** | `backend/modules/embeddings/service.py` |
| **Embedding API Endpoints** | `backend/modules/embeddings/router.py` |
| **Embedding Configs/Jobs/Labels Schema** | `sql/migrate_embeddings_v2.sql` |
| **HNSW-Index Config** | `sql/init.sql` (idx_coin_patterns_embedding) |
| **Neo4j Verbindung** | `backend/modules/graph/neo4j_client.py` |
| **Neo4j Sync Logic** | `backend/modules/graph/sync.py` |
| **Neo4j API Endpoints** | `backend/modules/graph/router.py` |
| **Neo4j Lifecycle (Start/Stop)** | `backend/main.py:128-168` |
| **Neo4j Config** | `backend/config.py:77-81`, `docker-compose.yml` (neo4j service) |
| **Neo4j Browser iframe** | `frontend/src/pages/Neo4jGraph.tsx` |
| **Bolt WebSocket Proxy** | `frontend/nginx.conf` (map, @bolt, location /) |
| **Cypher Explorer UI** | `frontend/src/pages/graph/CypherExplorer.tsx` |
| **Graph Guide** | `frontend/src/pages/graph/GraphGuide.tsx` |
| **Navigation (Sidebar)** | `frontend/src/App.tsx` (navItems + Route) |
| **DB Credentials** | `.env` (DB_NAME, DB_USER, DB_PASSWORD) |
| **Docker-Netzwerk** | `docker-compose.yml` (pump-network) |
| **Migration (bestehende DB)** | `sql/migrate_to_pgvector.sql` |

### Vollstaendige Dateiliste

```
sql/
  init.sql                              # Haupt-Schema (alle Tabellen inkl. Embedding-Tabellen)
  migrate_to_pgvector.sql               # Migration fuer bestehende DBs
  migrate_embeddings_v2.sql             # Migration: embedding_configs, jobs, labels, similarity_cache

backend/
  config.py                             # NEO4J_*, EMBEDDING_* Settings
  main.py                               # Lifespan: alle Services starten/stoppen
  database.py                           # asyncpg Pool (shared, alle Module)
  shared/
    prometheus.py                       # Prometheus Metriken (inkl. embeddings_*)
  modules/
    find/
      metrics.py                        # coin_transactions flush
      phases.py                         # Trade-Collection vor Reset
    embeddings/
      __init__.py                       # Public API
      features.py                       # 128-Feature-Extraktion (8 Gruppen)
      generator.py                      # Handcrafted v1 + Normalizer-Registry
      service.py                        # Background EmbeddingService (60s)
      similarity.py                     # pgvector HNSW Search + Neo4j Sync
      db_queries.py                     # SQL CRUD
      router.py                         # /api/embeddings/* (25+ Endpoints)
      schemas.py                        # Pydantic Models
    graph/
      __init__.py                       # Modul-Init
      neo4j_client.py                   # Async Neo4j Driver Singleton
      router.py                         # /api/graph/* Endpoints
      sync.py                           # PostgreSQL -> Neo4j Sync Service

frontend/
  nginx.conf                            # WebSocket Proxy (map, @bolt)
  src/
    services/
      api.ts                            # API Client (inkl. embeddingsApi)
    types/
      embeddings.ts                     # TypeScript Interfaces
    pages/
      Discovery.tsx                     # 8 Tabs (inkl. Similarity, Patterns, Embeddings)
      discovery/
        SimilaritySearch.tsx            # Mint-basierte Aehnlichkeitssuche
        PatternBrowser.tsx              # Embedding-Browser mit Labels
        EmbeddingConfig.tsx             # Config-Management + Jobs
      Neo4jGraph.tsx                    # Tab-Container (Browser, Explorer, Guide)
      graph/
        CypherExplorer.tsx              # Interaktiver Cypher-Client
        GraphGuide.tsx                  # Dokumentation (5 Kapitel)
```
