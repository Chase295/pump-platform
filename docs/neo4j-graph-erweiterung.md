# Neo4j Graph-Datenbank Erweiterung - Vollstaendige Implementierungs-Anleitung

Stand: Februar 2026
Bezieht sich auf: `backend/modules/graph/sync.py`, `router.py`, `neo4j_client.py`

---

## Inhaltsverzeichnis

1. [IST-Zustand: Was bereits existiert](#1-ist-zustand)
2. [SOLL-Zustand: Vollstaendiges Datenmodell](#2-soll-zustand)
3. [Phase 1: Event-System (Event + Outcome)](#3-phase-1-event-system)
4. [Phase 2: Phasen-Analyse (PhaseSnapshot + PriceCheckpoint)](#4-phase-2-phasen-analyse)
5. [Phase 3: Wallet-Intelligence (WalletCluster + TRADES_WITH + FUNDED_BY)](#5-phase-3-wallet-intelligence)
6. [Phase 4: Marktkontext (SolPrice)](#6-phase-4-marktkontext)
7. [Phase 5: Enrichment (SocialProfile + ImageHash + Tokenomics)](#7-phase-5-enrichment)
8. [Phase 6: coin_transactions -> Neo4j (Markt-Trades)](#8-phase-6-coin-transactions-sync)
9. [Constraints und Indexes (Gesamtliste)](#9-constraints-und-indexes)
10. [Router-Erweiterung (Stats fuer neue Typen)](#10-router-erweiterung)
11. [Zusammenfassung: Vorher vs. Nachher](#11-zusammenfassung)

---

## 1. IST-Zustand

### Nodes (6 Stueck)

| Node | Label | Key | Quelle |
|------|-------|-----|--------|
| Token | `:Token` | `address` | `discovered_coins.token_address` |
| Creator | `:Creator` | `address` | `discovered_coins.trader_public_key` |
| Wallet | `:Wallet` | `alias` | `wallets.alias` |
| Model | `:Model` | `id` | `prediction_active_models.id` |
| Address | `:Address` | `address` | `transfer_logs.to_address` |

### Relationships (7 Stueck)

| Relationship | Von -> Nach | Key-Property |
|-------------|------------|--------------|
| `CREATED` | Creator -> Token | - |
| `HOLDS` | Wallet -> Token | - |
| `BOUGHT` | Wallet -> Token | `timestamp` |
| `SOLD` | Wallet -> Token | `timestamp` |
| `PREDICTED` | Model -> Token | `timestamp` |
| `TRANSFERRED_TO` | Wallet -> Address | `timestamp` |
| `SIMILAR_TO` | Token -> Token | `embedding_a_id, embedding_b_id` |

### Constraints (4 Stueck)

```cypher
CREATE CONSTRAINT token_address IF NOT EXISTS FOR (t:Token) REQUIRE t.address IS UNIQUE
CREATE CONSTRAINT creator_address IF NOT EXISTS FOR (c:Creator) REQUIRE c.address IS UNIQUE
CREATE CONSTRAINT wallet_alias IF NOT EXISTS FOR (w:Wallet) REQUIRE w.alias IS UNIQUE
CREATE CONSTRAINT model_id IF NOT EXISTS FOR (m:Model) REQUIRE m.id IS UNIQUE
```

---

## 2. SOLL-Zustand

### Alle Nodes (15 Stueck) - 6 existieren, 9 neu

| # | Node | Label | Key | Quelle | Status |
|---|------|-------|-----|--------|--------|
| 1 | Token | `:Token` | `address` | `discovered_coins` | EXISTIERT |
| 2 | Creator | `:Creator` | `address` | `discovered_coins` | EXISTIERT |
| 3 | Wallet | `:Wallet` | `alias` | `wallets` | EXISTIERT |
| 4 | Model | `:Model` | `id` | `prediction_active_models` | EXISTIERT |
| 5 | Address | `:Address` | `address` | `transfer_logs` | EXISTIERT |
| 6 | **Event** | `:Event` | `id` (mint+type+timestamp) | `coin_metrics` + `coin_transactions` | **NEU** |
| 7 | **Outcome** | `:Outcome` | `event_id` | Berechnet nach Event | **NEU** |
| 8 | **PhaseSnapshot** | `:PhaseSnapshot` | `mint + phase_id` | `coin_metrics` aggregiert | **NEU** |
| 9 | **PriceCheckpoint** | `:PriceCheckpoint` | `mint + minutes` | `coin_metrics` punktuell | **NEU** |
| 10 | **WalletCluster** | `:WalletCluster` | `cluster_id` | `coin_transactions` analysiert | **NEU** |
| 11 | **SolPrice** | `:SolPrice` | `timestamp` (gerundet auf Stunde) | `exchange_rates` | **NEU** |
| 12 | **SocialProfile** | `:SocialProfile` | `url` | `discovered_coins.twitter_url` etc. | **NEU** |
| 13 | **ImageHash** | `:ImageHash` | `hash` | `discovered_coins.image_hash` | **NEU** |
| 14 | **Tokenomics** | `:Tokenomics` | `mint` | `discovered_coins` Felder | **NEU** |
| 15 | **MarketTrader** | `:MarketTrader` | `address` | `coin_transactions.trader_public_key` | **NEU** |

### Alle Relationships (26 Stueck) - 7 existieren, 19 neu

| # | Relationship | Von -> Nach | Status |
|---|-------------|------------|--------|
| 1 | `CREATED` | Creator -> Token | EXISTIERT |
| 2 | `HOLDS` | Wallet -> Token | EXISTIERT |
| 3 | `BOUGHT` | Wallet -> Token | EXISTIERT |
| 4 | `SOLD` | Wallet -> Token | EXISTIERT |
| 5 | `PREDICTED` | Model -> Token | EXISTIERT |
| 6 | `TRANSFERRED_TO` | Wallet -> Address | EXISTIERT |
| 7 | `SIMILAR_TO` | Token -> Token | EXISTIERT |
| 8 | **`HAD_EVENT`** | Token -> Event | **NEU** |
| 9 | **`FOLLOWED_BY`** | Event -> Event | **NEU** |
| 10 | **`RESULTED_IN`** | Event -> Outcome | **NEU** |
| 11 | **`PHASE_SUMMARY`** | Token -> PhaseSnapshot | **NEU** |
| 12 | **`NEXT_PHASE`** | PhaseSnapshot -> PhaseSnapshot | **NEU** |
| 13 | **`PRICE_AT`** | Token -> PriceCheckpoint | **NEU** |
| 14 | **`NEXT_CHECKPOINT`** | PriceCheckpoint -> PriceCheckpoint | **NEU** |
| 15 | **`BELONGS_TO`** | MarketTrader -> WalletCluster | **NEU** |
| 16 | **`TRADES_WITH`** | MarketTrader -> MarketTrader | **NEU** |
| 17 | **`FUNDED_BY`** | Wallet -> Wallet | **NEU** |
| 18 | **`DURING_MARKET`** | Token -> SolPrice | **NEU** |
| 19 | **`HAS_TWITTER`** | Token -> SocialProfile | **NEU** |
| 20 | **`HAS_TELEGRAM`** | Token -> SocialProfile | **NEU** |
| 21 | **`HAS_WEBSITE`** | Token -> SocialProfile | **NEU** |
| 22 | **`HAS_IMAGE`** | Token -> ImageHash | **NEU** |
| 23 | **`HAS_TOKENOMICS`** | Token -> Tokenomics | **NEU** |
| 24 | **`MARKET_BOUGHT`** | MarketTrader -> Token | **NEU** |
| 25 | **`MARKET_SOLD`** | MarketTrader -> Token | **NEU** |
| 26 | **`IS_CREATOR`** | MarketTrader -> Token | **NEU** |

---

## 3. Phase 1: Event-System

### 3.1 Zweck

Events sind signifikante Ereignisse im Leben eines Tokens - keine normalen Datenpunkte,
sondern Ausreisser die etwas bedeuten. In Kombination mit Outcomes werden sie lernbar:
"Nach Event X kommt in 70% der Faelle Outcome Y."

### 3.2 Neue Constraints

```cypher
CREATE CONSTRAINT event_id IF NOT EXISTS
  FOR (e:Event) REQUIRE e.id IS UNIQUE

CREATE CONSTRAINT outcome_event_id IF NOT EXISTS
  FOR (o:Outcome) REQUIRE o.event_id IS UNIQUE
```

### 3.3 Event Node - Schema

```cypher
(:Event {
    id: "ABC123_volume_spike_2026-02-11T14:23:00Z",  -- mint + type + timestamp
    type: "volume_spike",                              -- Event-Kategorie
    severity: "high",                                  -- low / medium / high / critical
    mint: "ABC123...",                                 -- Zurueck-Referenz zum Token
    timestamp: "2026-02-11T14:23:00Z",
    -- Event-spezifische Werte:
    value: 125.5,                                      -- z.B. Volumen in SOL
    threshold: 25.0,                                   -- Schwellwert der ueberschritten wurde
    multiplier: 5.0,                                   -- Um wie viel ueberschritten (value/threshold)
    phase_id: 1,                                       -- In welcher Phase war der Token
    price_at_event: 0.00042                            -- Preis zum Zeitpunkt
})
```

### 3.4 Event-Typen und Erkennungsregeln

Die Events werden aus `coin_metrics` und `coin_transactions` erkannt.
Jede Regel hat einen Schwellwert der justierbar sein sollte.

#### Event-Typ: `volume_spike`

**Bedeutung:** Ploetzlicher Volumenanstieg - kann Pump oder Dump ankuendigen.

**Erkennung:**
```sql
-- Aktuelles Volumen vs. Durchschnitt der letzten 5 Eintraege
SELECT
    cm.mint,
    cm.timestamp,
    cm.volume_sol AS current_volume,
    AVG(prev.volume_sol) AS avg_volume,
    cm.volume_sol / NULLIF(AVG(prev.volume_sol), 0) AS multiplier,
    cm.price_close,
    cm.phase_id_at_time
FROM coin_metrics cm
JOIN LATERAL (
    SELECT volume_sol
    FROM coin_metrics prev
    WHERE prev.mint = cm.mint
      AND prev.timestamp < cm.timestamp
    ORDER BY prev.timestamp DESC
    LIMIT 5
) prev ON true
WHERE cm.timestamp > $1  -- Seit letztem Check
GROUP BY cm.mint, cm.timestamp, cm.volume_sol, cm.price_close, cm.phase_id_at_time
HAVING cm.volume_sol > AVG(prev.volume_sol) * 5  -- Schwellwert: 5x Durchschnitt
ORDER BY cm.timestamp ASC
LIMIT 1000
```

**Cypher:**
```cypher
MERGE (e:Event {id: $event_id})
SET e.type = "volume_spike",
    e.severity = CASE
        WHEN $multiplier > 20 THEN "critical"
        WHEN $multiplier > 10 THEN "high"
        WHEN $multiplier > 5  THEN "medium"
        ELSE "low"
    END,
    e.mint = $mint,
    e.timestamp = $timestamp,
    e.value = $current_volume,
    e.threshold = $avg_volume,
    e.multiplier = $multiplier,
    e.phase_id = $phase_id,
    e.price_at_event = $price_close

WITH e
MATCH (t:Token {address: $mint})
MERGE (t)-[:HAD_EVENT]->(e)
```

#### Event-Typ: `whale_entry`

**Bedeutung:** Ein grosser Kauf (>= 1 SOL) - oft Ausloeser fuer Kursbewegung.

**Erkennung:**
```sql
SELECT
    mint,
    timestamp,
    trader_public_key,
    sol_amount,
    price_sol,
    phase_id_at_time
FROM coin_transactions
WHERE is_whale = true
  AND tx_type = 'buy'
  AND timestamp > $1
ORDER BY timestamp ASC
LIMIT 1000
```

**Cypher:**
```cypher
MERGE (e:Event {id: $event_id})
SET e.type = "whale_entry",
    e.severity = CASE
        WHEN $sol_amount > 10  THEN "critical"
        WHEN $sol_amount > 5   THEN "high"
        WHEN $sol_amount > 2   THEN "medium"
        ELSE "low"
    END,
    e.mint = $mint,
    e.timestamp = $timestamp,
    e.value = $sol_amount,
    e.trader = $trader_public_key,
    e.price_at_event = $price_sol,
    e.phase_id = $phase_id

WITH e
MATCH (t:Token {address: $mint})
MERGE (t)-[:HAD_EVENT]->(e)
```

#### Event-Typ: `dev_sold`

**Bedeutung:** Der Creator des Tokens verkauft seine eigenen Token - starkes Warn-Signal.

**Erkennung:**
```sql
SELECT
    ct.mint,
    ct.timestamp,
    ct.trader_public_key,
    ct.sol_amount,
    ct.price_sol,
    ct.phase_id_at_time
FROM coin_transactions ct
JOIN discovered_coins dc ON dc.token_address = ct.mint
WHERE ct.trader_public_key = dc.trader_public_key
  AND ct.tx_type = 'sell'
  AND ct.timestamp > $1
ORDER BY ct.timestamp ASC
LIMIT 1000
```

**Cypher:**
```cypher
MERGE (e:Event {id: $event_id})
SET e.type = "dev_sold",
    e.severity = "critical",  -- Dev-Sell ist immer kritisch
    e.mint = $mint,
    e.timestamp = $timestamp,
    e.value = $sol_amount,
    e.price_at_event = $price_sol,
    e.phase_id = $phase_id

WITH e
MATCH (t:Token {address: $mint})
MERGE (t)-[:HAD_EVENT]->(e)
```

#### Event-Typ: `price_ath`

**Bedeutung:** Token erreicht neues Allzeithoch - wichtiger Referenzpunkt.

**Erkennung:**
```sql
SELECT
    cm.mint,
    cm.timestamp,
    cm.price_close AS new_ath,
    cs.ath_price_sol AS previous_ath,
    cm.phase_id_at_time
FROM coin_metrics cm
JOIN coin_streams cs ON cs.token_address = cm.mint
WHERE cm.price_close > cs.ath_price_sol
  AND cm.timestamp > $1
ORDER BY cm.timestamp ASC
LIMIT 1000
```

**Cypher:**
```cypher
MERGE (e:Event {id: $event_id})
SET e.type = "price_ath",
    e.severity = "medium",
    e.mint = $mint,
    e.timestamp = $timestamp,
    e.value = $new_ath,
    e.threshold = $previous_ath,
    e.multiplier = $new_ath / $previous_ath,
    e.phase_id = $phase_id,
    e.price_at_event = $new_ath

WITH e
MATCH (t:Token {address: $mint})
MERGE (t)-[:HAD_EVENT]->(e)
```

#### Event-Typ: `mass_sell`

**Bedeutung:** Viele Sells in kurzer Zeit - oft Beginn eines Crashs.

**Erkennung:**
```sql
SELECT
    mint,
    timestamp,
    num_sells,
    num_buys,
    sell_volume_sol,
    buy_volume_sol,
    price_close,
    phase_id_at_time
FROM coin_metrics
WHERE num_sells > 10        -- Mehr als 10 Sells in einem Intervall
  AND num_sells > num_buys * 3  -- 3x mehr Sells als Buys
  AND timestamp > $1
ORDER BY timestamp ASC
LIMIT 1000
```

**Cypher:**
```cypher
MERGE (e:Event {id: $event_id})
SET e.type = "mass_sell",
    e.severity = CASE
        WHEN $num_sells > 50 THEN "critical"
        WHEN $num_sells > 30 THEN "high"
        WHEN $num_sells > 10 THEN "medium"
        ELSE "low"
    END,
    e.mint = $mint,
    e.timestamp = $timestamp,
    e.value = $sell_volume_sol,
    e.num_sells = $num_sells,
    e.num_buys = $num_buys,
    e.phase_id = $phase_id,
    e.price_at_event = $price_close

WITH e
MATCH (t:Token {address: $mint})
MERGE (t)-[:HAD_EVENT]->(e)
```

#### Event-Typ: `liquidity_drop`

**Bedeutung:** Liquiditaet sinkt drastisch - Rug-Pull Indikator.

**Erkennung:**
```sql
SELECT
    cm.mint,
    cm.timestamp,
    cm.virtual_sol_reserves AS current_liquidity,
    prev.virtual_sol_reserves AS prev_liquidity,
    (cm.virtual_sol_reserves / NULLIF(prev.virtual_sol_reserves, 0)) AS ratio,
    cm.price_close,
    cm.phase_id_at_time
FROM coin_metrics cm
JOIN LATERAL (
    SELECT virtual_sol_reserves
    FROM coin_metrics prev
    WHERE prev.mint = cm.mint
      AND prev.timestamp < cm.timestamp
    ORDER BY prev.timestamp DESC
    LIMIT 1
) prev ON true
WHERE cm.virtual_sol_reserves < prev.virtual_sol_reserves * 0.5  -- >50% Drop
  AND prev.virtual_sol_reserves > 0
  AND cm.timestamp > $1
ORDER BY cm.timestamp ASC
LIMIT 1000
```

### 3.5 Event-Verkettung: FOLLOWED_BY

Events des gleichen Tokens werden zeitlich verkettet. So entstehen Event-Ketten
die Muster sichtbar machen.

**Logik (nach dem Erstellen aller Events eines Sync-Laufs):**

```cypher
-- Fuer jeden Token: Events zeitlich verbinden
MATCH (t:Token {address: $mint})-[:HAD_EVENT]->(e:Event)
WITH e ORDER BY e.timestamp
WITH collect(e) AS events
UNWIND range(0, size(events)-2) AS i
WITH events[i] AS prev, events[i+1] AS next
MERGE (prev)-[r:FOLLOWED_BY]->(next)
SET r.gap_seconds = duration.between(
    datetime(prev.timestamp), datetime(next.timestamp)
).seconds
```

### 3.6 Outcome Node - Schema

```cypher
(:Outcome {
    event_id: "ABC123_volume_spike_2026-02-11T14:23:00Z",  -- Referenz zum Event
    type: "pump",                     -- pump / rug / sideways / slow_bleed / dump
    price_change_pct: 142.5,          -- Preisaenderung in Prozent
    duration_seconds: 300,            -- Wie lange bis zum Outcome
    max_gain_pct: 210.0,              -- Hoechster Gewinn nach Event
    max_loss_pct: -5.2,               -- Tiefster Verlust nach Event
    volume_after_sol: 450.0,          -- Volumen nach dem Event
    evaluated_at: "2026-02-11T14:28:00Z"
})
```

### 3.7 Outcome-Berechnung

Outcomes werden verzoegert berechnet - z.B. 5 Minuten nach dem Event.
Dann schaut man: Was ist mit dem Preis passiert?

**SQL fuer Outcome-Berechnung:**
```sql
-- Fuer jedes Event ohne Outcome: Preis 5 Minuten spaeter pruefen
-- (Events die aelter als 5 Minuten sind aber noch kein Outcome haben)
SELECT
    e_mint AS mint,
    e_timestamp AS event_timestamp,
    e_price AS event_price,
    cm.price_close AS outcome_price,
    ((cm.price_close - e_price) / NULLIF(e_price, 0)) * 100 AS price_change_pct,
    MAX(cm2.price_close) AS max_price_after,
    MIN(cm2.price_close) AS min_price_after
FROM events_without_outcome  -- Interne Tracking-Tabelle oder Neo4j-Query
JOIN coin_metrics cm
    ON cm.mint = e_mint
    AND cm.timestamp >= e_timestamp + INTERVAL '5 minutes'
JOIN coin_metrics cm2
    ON cm2.mint = e_mint
    AND cm2.timestamp BETWEEN e_timestamp AND e_timestamp + INTERVAL '5 minutes'
GROUP BY e_mint, e_timestamp, e_price, cm.price_close
ORDER BY e_timestamp ASC
LIMIT 500
```

**Outcome-Typ-Bestimmung:**
```python
def classify_outcome(price_change_pct: float, max_gain_pct: float, max_loss_pct: float) -> str:
    if max_gain_pct > 50:
        return "pump"
    if max_loss_pct < -80:
        return "rug"
    if max_loss_pct < -50:
        return "dump"
    if abs(price_change_pct) < 10:
        return "sideways"
    if price_change_pct < -30:
        return "slow_bleed"
    return "mixed"
```

**Cypher:**
```cypher
MATCH (e:Event {id: $event_id})
MERGE (o:Outcome {event_id: $event_id})
SET o.type = $outcome_type,
    o.price_change_pct = $price_change_pct,
    o.duration_seconds = $duration_seconds,
    o.max_gain_pct = $max_gain_pct,
    o.max_loss_pct = $max_loss_pct,
    o.volume_after_sol = $volume_after_sol,
    o.evaluated_at = $evaluated_at
MERGE (e)-[:RESULTED_IN]->(o)
```

### 3.8 Beispiel-Queries nach Implementierung

```cypher
-- "Was passiert typischerweise nach einem Whale-Entry in der Baby-Phase?"
MATCH (t:Token)-[:HAD_EVENT]->(e:Event {type: "whale_entry"})
WHERE e.phase_id = 1
MATCH (e)-[:RESULTED_IN]->(o:Outcome)
RETURN o.type AS outcome, count(*) AS anzahl, avg(o.price_change_pct) AS avg_change
ORDER BY anzahl DESC

-- "Zeig mir Event-Ketten die zu einem Rug gefuehrt haben"
MATCH path = (e1:Event)-[:FOLLOWED_BY*1..5]->(eLast:Event)-[:RESULTED_IN]->(o:Outcome {type: "rug"})
RETURN [n IN nodes(path) | n.type] AS event_chain, count(*) AS frequency
ORDER BY frequency DESC
LIMIT 20

-- "Welche Events kommen innerhalb von 60s nach einem Dev-Sell?"
MATCH (e1:Event {type: "dev_sold"})-[f:FOLLOWED_BY]->(e2:Event)
WHERE f.gap_seconds <= 60
RETURN e2.type AS follow_up_event, count(*) AS anzahl
ORDER BY anzahl DESC
```

---

## 4. Phase 2: Phasen-Analyse

### 4.1 Zweck

Jeder Token durchlaeuft Phasen (Baby -> Survival -> Mature -> Finished).
PhaseSnapshots aggregieren die Metriken PRO Phase und machen Phasen vergleichbar.
PriceCheckpoints geben den Preis zu festen Zeitpunkten (1min, 5min, 10min, etc.).

### 4.2 Neue Constraints

```cypher
CREATE CONSTRAINT phase_snapshot_key IF NOT EXISTS
  FOR (ps:PhaseSnapshot) REQUIRE ps.id IS UNIQUE

CREATE CONSTRAINT price_checkpoint_key IF NOT EXISTS
  FOR (pc:PriceCheckpoint) REQUIRE pc.id IS UNIQUE
```

### 4.3 PhaseSnapshot Node - Schema

```cypher
(:PhaseSnapshot {
    id: "ABC123_1",                    -- mint + phase_id
    mint: "ABC123...",
    phase_id: 1,
    phase_name: "Baby Zone",
    -- Preis-Aggregation:
    price_open: 0.00001,               -- Erster Preis in dieser Phase
    price_close: 0.00042,              -- Letzter Preis in dieser Phase
    price_high: 0.00055,               -- Hoechster Preis
    price_low: 0.000008,               -- Tiefster Preis
    price_change_pct: 4100.0,          -- Preisaenderung gesamt
    -- Volumen:
    volume_total_sol: 125.5,           -- Gesamtvolumen in SOL
    buy_volume_sol: 98.3,
    sell_volume_sol: 27.2,
    -- Trades:
    num_buys: 847,
    num_sells: 122,
    num_trades_total: 969,
    unique_wallets: 315,
    -- Whale-Daten:
    whale_buy_count: 3,
    whale_sell_count: 0,
    whale_volume_sol: 12.5,
    -- Dev-Tracking:
    dev_sold: false,
    dev_sold_amount: 0.0,
    -- Zeitraum:
    started_at: "2026-02-11T14:00:00Z",
    ended_at: "2026-02-11T14:10:00Z",
    duration_seconds: 600,
    num_snapshots: 120                 -- Wie viele coin_metrics Eintraege aggregiert
})
```

### 4.4 SQL: PhaseSnapshot-Aggregation

```sql
SELECT
    cm.mint,
    cm.phase_id_at_time AS phase_id,
    rcp.name AS phase_name,
    -- Preis
    (array_agg(cm.price_open ORDER BY cm.timestamp ASC))[1] AS price_open,
    (array_agg(cm.price_close ORDER BY cm.timestamp DESC))[1] AS price_close,
    MAX(cm.price_high) AS price_high,
    MIN(cm.price_low) AS price_low,
    -- Volumen
    SUM(cm.volume_sol) AS volume_total_sol,
    SUM(cm.buy_volume_sol) AS buy_volume_sol,
    SUM(cm.sell_volume_sol) AS sell_volume_sol,
    -- Trades
    SUM(cm.num_buys) AS num_buys,
    SUM(cm.num_sells) AS num_sells,
    SUM(cm.num_buys + cm.num_sells) AS num_trades_total,
    MAX(cm.unique_wallets) AS unique_wallets_peak,
    -- Whales
    SUM(cm.num_whale_buys) AS whale_buy_count,
    SUM(cm.num_whale_sells) AS whale_sell_count,
    SUM(cm.whale_buy_volume_sol) + SUM(cm.whale_sell_volume_sol) AS whale_volume_sol,
    -- Dev
    MAX(cm.dev_sold_amount) AS dev_sold_amount,
    BOOL_OR(cm.dev_sold_amount > 0) AS dev_sold,
    -- Zeitraum
    MIN(cm.timestamp) AS started_at,
    MAX(cm.timestamp) AS ended_at,
    EXTRACT(EPOCH FROM MAX(cm.timestamp) - MIN(cm.timestamp)) AS duration_seconds,
    COUNT(*) AS num_snapshots
FROM coin_metrics cm
JOIN ref_coin_phases rcp ON rcp.id = cm.phase_id_at_time
WHERE cm.phase_id_at_time IS NOT NULL
GROUP BY cm.mint, cm.phase_id_at_time, rcp.name
HAVING COUNT(*) >= 3  -- Mindestens 3 Snapshots fuer sinnvolle Aggregation
ORDER BY cm.mint, cm.phase_id_at_time
```

### 4.5 Cypher: PhaseSnapshot erstellen

```cypher
MATCH (t:Token {address: $mint})
MERGE (ps:PhaseSnapshot {id: $snapshot_id})
SET ps.mint = $mint,
    ps.phase_id = $phase_id,
    ps.phase_name = $phase_name,
    ps.price_open = $price_open,
    ps.price_close = $price_close,
    ps.price_high = $price_high,
    ps.price_low = $price_low,
    ps.price_change_pct = CASE
        WHEN $price_open > 0 THEN (($price_close - $price_open) / $price_open) * 100
        ELSE 0
    END,
    ps.volume_total_sol = $volume_total_sol,
    ps.buy_volume_sol = $buy_volume_sol,
    ps.sell_volume_sol = $sell_volume_sol,
    ps.num_buys = $num_buys,
    ps.num_sells = $num_sells,
    ps.num_trades_total = $num_trades_total,
    ps.unique_wallets = $unique_wallets_peak,
    ps.whale_buy_count = $whale_buy_count,
    ps.whale_sell_count = $whale_sell_count,
    ps.whale_volume_sol = $whale_volume_sol,
    ps.dev_sold = $dev_sold,
    ps.dev_sold_amount = $dev_sold_amount,
    ps.started_at = $started_at,
    ps.ended_at = $ended_at,
    ps.duration_seconds = $duration_seconds,
    ps.num_snapshots = $num_snapshots
MERGE (t)-[:PHASE_SUMMARY]->(ps)
```

### 4.6 Cypher: NEXT_PHASE Verkettung

```cypher
-- Phasen desselben Tokens zeitlich verbinden
MATCH (t:Token {address: $mint})-[:PHASE_SUMMARY]->(ps:PhaseSnapshot)
WITH ps ORDER BY ps.phase_id
WITH collect(ps) AS phases
UNWIND range(0, size(phases)-2) AS i
WITH phases[i] AS current, phases[i+1] AS next
MERGE (current)-[:NEXT_PHASE]->(next)
```

### 4.7 PriceCheckpoint Node - Schema

```cypher
(:PriceCheckpoint {
    id: "ABC123_5",                    -- mint + minutes
    mint: "ABC123...",
    minutes: 5,                        -- Minuten nach Token-Erstellung
    price_sol: 0.00023,
    market_cap_sol: 45.2,
    volume_since_start_sol: 89.1,
    price_change_from_start_pct: 2200.0,
    num_buys_total: 234,
    num_sells_total: 45,
    unique_wallets_total: 189,
    phase_id: 1,
    recorded_at: "2026-02-11T14:05:00Z"
})
```

### 4.8 SQL: PriceCheckpoint-Berechnung

Die Checkpoints werden fuer feste Zeitpunkte berechnet: **1, 5, 10, 30, 60, 360, 1440 Minuten**.

```sql
-- Fuer jeden Checkpoint-Zeitpunkt den naechstliegenden coin_metrics Eintrag finden
WITH checkpoint_times AS (
    SELECT unnest(ARRAY[1, 5, 10, 30, 60, 360, 1440]) AS minutes_after
),
token_start AS (
    SELECT token_address AS mint, discovered_at
    FROM discovered_coins
    WHERE discovered_at IS NOT NULL
)
SELECT
    ts.mint,
    ct.minutes_after,
    cm.price_close AS price_sol,
    cm.market_cap_close AS market_cap_sol,
    cm.phase_id_at_time AS phase_id,
    cm.timestamp AS recorded_at,
    -- Aggregiert seit Start:
    (SELECT SUM(volume_sol) FROM coin_metrics
     WHERE mint = ts.mint AND timestamp <= cm.timestamp) AS volume_since_start_sol,
    (SELECT SUM(num_buys) FROM coin_metrics
     WHERE mint = ts.mint AND timestamp <= cm.timestamp) AS num_buys_total,
    (SELECT SUM(num_sells) FROM coin_metrics
     WHERE mint = ts.mint AND timestamp <= cm.timestamp) AS num_sells_total
FROM token_start ts
CROSS JOIN checkpoint_times ct
JOIN LATERAL (
    SELECT *
    FROM coin_metrics
    WHERE mint = ts.mint
      AND timestamp >= ts.discovered_at + (ct.minutes_after || ' minutes')::interval
    ORDER BY timestamp ASC
    LIMIT 1
) cm ON true
```

### 4.9 Cypher: PriceCheckpoint erstellen

```cypher
MATCH (t:Token {address: $mint})
MERGE (pc:PriceCheckpoint {id: $checkpoint_id})
SET pc.mint = $mint,
    pc.minutes = $minutes,
    pc.price_sol = $price_sol,
    pc.market_cap_sol = $market_cap_sol,
    pc.volume_since_start_sol = $volume_since_start_sol,
    pc.num_buys_total = $num_buys_total,
    pc.num_sells_total = $num_sells_total,
    pc.phase_id = $phase_id,
    pc.recorded_at = $recorded_at
MERGE (t)-[:PRICE_AT]->(pc)
```

### 4.10 Cypher: NEXT_CHECKPOINT Verkettung

```cypher
MATCH (t:Token {address: $mint})-[:PRICE_AT]->(pc:PriceCheckpoint)
WITH pc ORDER BY pc.minutes
WITH collect(pc) AS checkpoints
UNWIND range(0, size(checkpoints)-2) AS i
WITH checkpoints[i] AS current, checkpoints[i+1] AS next
MERGE (current)-[:NEXT_CHECKPOINT]->(next)
```

### 4.11 Beispiel-Queries nach Implementierung

```cypher
-- "Zeig mir alle Tokens deren Baby-Phase >100 SOL Volumen hatte"
MATCH (t:Token)-[:PHASE_SUMMARY]->(ps:PhaseSnapshot {phase_id: 1})
WHERE ps.volume_total_sol > 100
RETURN t.name, t.symbol, ps.volume_total_sol, ps.price_change_pct
ORDER BY ps.volume_total_sol DESC
LIMIT 20

-- "Was passiert in der Survival-Phase wenn die Baby-Phase stark war?"
MATCH (t:Token)-[:PHASE_SUMMARY]->(baby:PhaseSnapshot {phase_id: 1})
WHERE baby.price_change_pct > 500
MATCH (baby)-[:NEXT_PHASE]->(survival:PhaseSnapshot {phase_id: 2})
RETURN avg(survival.price_change_pct) AS avg_survival_change,
       count(*) AS tokens,
       avg(survival.volume_total_sol) AS avg_survival_volume

-- "Welcher Preis nach 5 Minuten fuer Tokens mit >50 SOL Startvolumen?"
MATCH (t:Token)-[:PRICE_AT]->(pc:PriceCheckpoint {minutes: 5})
MATCH (t:Token)-[:PHASE_SUMMARY]->(ps:PhaseSnapshot {phase_id: 1})
WHERE ps.volume_total_sol > 50
RETURN avg(pc.price_change_from_start_pct) AS avg_price_change,
       percentileCont(pc.price_change_from_start_pct, 0.5) AS median_change
```

---

## 5. Phase 3: Wallet-Intelligence

### 5.1 Zweck

Wallet-Cluster erkennen: Wallets die koordiniert handeln (gleicher Besitzer, Bot-Netzwerke).
Ausserdem: TRADES_WITH zeigt Wallet-Paare die haeufig die gleichen Tokens handeln.
FUNDED_BY zeigt Geldfluss-Ketten aus `transfer_logs`.

### 5.2 MarketTrader Node

MarketTrader-Nodes repraesentieren **Markt-Wallets** aus `coin_transactions`.
Nicht zu verwechseln mit den `:Wallet`-Nodes die UNSERE Wallets sind!

```cypher
(:MarketTrader {
    address: "7xKXt...",              -- Solana Wallet-Adresse
    total_buys: 47,
    total_sells: 12,
    total_volume_sol: 125.5,
    unique_tokens: 23,
    first_seen: "2026-02-10T08:00:00Z",
    last_seen: "2026-02-11T15:30:00Z",
    is_whale: true,
    avg_trade_size_sol: 2.67
})
```

**Constraint:**
```cypher
CREATE CONSTRAINT market_trader_address IF NOT EXISTS
  FOR (mt:MarketTrader) REQUIRE mt.address IS UNIQUE
```

### 5.3 SQL: MarketTrader-Aggregation

```sql
-- Top-Trader aus coin_transactions aggregieren
-- NUR Trader die signifikant sind (>= 5 Trades ODER >= 1 SOL Volumen)
SELECT
    trader_public_key AS address,
    COUNT(*) FILTER (WHERE tx_type = 'buy') AS total_buys,
    COUNT(*) FILTER (WHERE tx_type = 'sell') AS total_sells,
    SUM(sol_amount) AS total_volume_sol,
    COUNT(DISTINCT mint) AS unique_tokens,
    MIN(timestamp) AS first_seen,
    MAX(timestamp) AS last_seen,
    BOOL_OR(is_whale) AS is_whale,
    AVG(sol_amount) AS avg_trade_size_sol
FROM coin_transactions
WHERE timestamp > $1  -- Nur neue Daten
GROUP BY trader_public_key
HAVING COUNT(*) >= 5 OR SUM(sol_amount) >= 1.0
ORDER BY total_volume_sol DESC
LIMIT 5000
```

### 5.4 MARKET_BOUGHT / MARKET_SOLD (MarketTrader -> Token)

```sql
-- Welche Tokens hat jeder MarketTrader gehandelt?
SELECT
    trader_public_key,
    mint,
    tx_type,
    COUNT(*) AS trade_count,
    SUM(sol_amount) AS total_sol,
    MIN(timestamp) AS first_trade,
    MAX(timestamp) AS last_trade
FROM coin_transactions
WHERE timestamp > $1
GROUP BY trader_public_key, mint, tx_type
HAVING COUNT(*) >= 1
```

**Cypher:**
```cypher
MERGE (mt:MarketTrader {address: $trader_address})
SET mt += $trader_props
WITH mt
MATCH (t:Token {address: $mint})
MERGE (mt)-[r:MARKET_BOUGHT {mint: $mint}]->(t)
SET r.trade_count = $trade_count, r.total_sol = $total_sol,
    r.first_trade = $first_trade, r.last_trade = $last_trade
```

### 5.5 WalletCluster Node

```cypher
(:WalletCluster {
    cluster_id: "cluster_42",
    size: 5,                           -- Anzahl Wallets im Cluster
    detection_method: "timing",        -- timing / funding / shared_source
    total_volume_sol: 450.0,
    unique_tokens: 8,
    risk_score: 0.92,                  -- 0-1, wie verdaechtig
    detected_at: "2026-02-11T16:00:00Z"
})
```

**Constraint:**
```cypher
CREATE CONSTRAINT wallet_cluster_id IF NOT EXISTS
  FOR (wc:WalletCluster) REQUIRE wc.cluster_id IS UNIQUE
```

### 5.6 Cluster-Erkennung: Timing-Methode

Wallets die innerhalb von 60 Sekunden den gleichen Token kaufen.

**SQL:**
```sql
-- Paare finden die >= 3 gleiche Tokens innerhalb von 60s kaufen
WITH buy_pairs AS (
    SELECT
        a.trader_public_key AS wallet_a,
        b.trader_public_key AS wallet_b,
        a.mint,
        ABS(EXTRACT(EPOCH FROM a.timestamp - b.timestamp)) AS time_diff_sec
    FROM coin_transactions a
    JOIN coin_transactions b
        ON a.mint = b.mint
        AND a.trader_public_key < b.trader_public_key  -- Keine Duplikate
        AND a.tx_type = 'buy' AND b.tx_type = 'buy'
        AND ABS(EXTRACT(EPOCH FROM a.timestamp - b.timestamp)) <= 60
    WHERE a.timestamp > $1
)
SELECT
    wallet_a,
    wallet_b,
    COUNT(DISTINCT mint) AS shared_tokens,
    AVG(time_diff_sec) AS avg_time_diff
FROM buy_pairs
GROUP BY wallet_a, wallet_b
HAVING COUNT(DISTINCT mint) >= 3
ORDER BY shared_tokens DESC
LIMIT 500
```

### 5.7 TRADES_WITH (MarketTrader -> MarketTrader)

```cypher
MERGE (a:MarketTrader {address: $wallet_a})
MERGE (b:MarketTrader {address: $wallet_b})
MERGE (a)-[r:TRADES_WITH]->(b)
SET r.shared_tokens = $shared_tokens,
    r.avg_time_diff_sec = $avg_time_diff,
    r.detection_method = "timing",
    r.detected_at = datetime()
```

### 5.8 FUNDED_BY (Wallet -> Wallet)

Aus bestehenden `transfer_logs`:

```cypher
-- Wird aus den bestehenden TRANSFERRED_TO-Kanten abgeleitet
MATCH (w:Wallet)-[t:TRANSFERRED_TO]->(a:Address)
WITH a.address AS target_address, w, t
MATCH (w2:Wallet {address: target_address})
MERGE (w2)-[f:FUNDED_BY]->(w)
SET f.amount_sol = t.amount_sol, f.timestamp = t.timestamp
```

### 5.9 IS_CREATOR (MarketTrader -> Token)

Verbindet MarketTrader mit ihren erstellten Tokens:

```cypher
MATCH (c:Creator)
MERGE (mt:MarketTrader {address: c.address})
WITH mt, c
MATCH (c)-[:CREATED]->(t:Token)
MERGE (mt)-[:IS_CREATOR]->(t)
```

### 5.10 Beispiel-Queries

```cypher
-- "Zeig mir verdaechtige Wallet-Cluster"
MATCH (mt:MarketTrader)-[:BELONGS_TO]->(wc:WalletCluster)
WHERE wc.risk_score > 0.8
RETURN wc.cluster_id, wc.size, wc.risk_score,
       collect(mt.address) AS wallets
ORDER BY wc.risk_score DESC

-- "Welche Tokens wurden von koordinierten Wallets gekauft?"
MATCH (a:MarketTrader)-[:TRADES_WITH]->(b:MarketTrader)
WHERE a.address < b.address  -- Deduplizieren
MATCH (a)-[:MARKET_BOUGHT]->(t:Token)<-[:MARKET_BOUGHT]-(b)
RETURN t.name, t.symbol, count(*) AS cluster_buys
ORDER BY cluster_buys DESC

-- "Geldfluss-Kette: Wer hat wen funded?"
MATCH path = (source:Wallet)-[:FUNDED_BY*1..5]->(target:Wallet)
RETURN [n IN nodes(path) | n.alias] AS funding_chain,
       length(path) AS chain_length
ORDER BY chain_length DESC
```

---

## 6. Phase 4: Marktkontext

### 6.1 SolPrice Node

SOL/USD Wechselkurs als Kontextinformation. Tokens verhalten sich anders
bei SOL=$150 vs. SOL=$50.

```cypher
(:SolPrice {
    timestamp: "2026-02-11T14:00:00Z",  -- Auf Stunde gerundet
    usd: 148.50,
    eur: 136.20,
    source: "coingecko"
})
```

**Constraint:**
```cypher
CREATE CONSTRAINT sol_price_timestamp IF NOT EXISTS
  FOR (sp:SolPrice) REQUIRE sp.timestamp IS UNIQUE
```

### 6.2 SQL: SolPrice-Daten

```sql
-- Stuendliche SOL-Preise
SELECT
    date_trunc('hour', created_at) AS hour_timestamp,
    AVG(sol_price_usd) AS usd,
    AVG(sol_price_usd * usd_to_eur_rate) AS eur,
    source
FROM exchange_rates
WHERE created_at > $1
GROUP BY date_trunc('hour', created_at), source
ORDER BY hour_timestamp ASC
```

### 6.3 Cypher: SolPrice und DURING_MARKET

```cypher
-- SolPrice-Node erstellen
MERGE (sp:SolPrice {timestamp: $hour_timestamp})
SET sp.usd = $usd, sp.eur = $eur, sp.source = $source

-- Token mit Marktzustand verknuepfen
MATCH (t:Token)
WHERE t.discovered_at IS NOT NULL
WITH t, datetime(t.discovered_at) AS disc_time
WITH t, datetime({
    year: disc_time.year, month: disc_time.month, day: disc_time.day,
    hour: disc_time.hour
}) AS hour_rounded
MATCH (sp:SolPrice {timestamp: toString(hour_rounded)})
MERGE (t)-[:DURING_MARKET]->(sp)
```

---

## 7. Phase 5: Enrichment

### 7.1 SocialProfile Node

Social-Media-Praesenz eines Tokens. Daten kommen aus `discovered_coins`.

```cypher
(:SocialProfile {
    url: "https://twitter.com/example_token",
    platform: "twitter",                        -- twitter / telegram / website / discord
    normalized_handle: "example_token"           -- Fuer Duplikat-Erkennung
})
```

**Constraint:**
```cypher
CREATE CONSTRAINT social_profile_url IF NOT EXISTS
  FOR (sp:SocialProfile) REQUIRE sp.url IS UNIQUE
```

### 7.2 SQL: Social-Daten aus discovered_coins

```sql
SELECT
    token_address,
    twitter_url,
    telegram_url,
    website_url,
    discord_url,
    has_socials,
    social_count
FROM discovered_coins
WHERE has_socials = true
  AND (twitter_url IS NOT NULL OR telegram_url IS NOT NULL
       OR website_url IS NOT NULL OR discord_url IS NOT NULL)
  AND discovered_at > $1
ORDER BY discovered_at ASC
LIMIT 5000
```

### 7.3 Cypher: SocialProfile erstellen

```cypher
-- Twitter
WITH $twitter_url AS url
WHERE url IS NOT NULL AND url <> ''
MATCH (t:Token {address: $mint})
MERGE (sp:SocialProfile {url: url})
SET sp.platform = "twitter",
    sp.normalized_handle = toLower(last(split(url, '/')))
MERGE (t)-[:HAS_TWITTER]->(sp)

-- Telegram
WITH $telegram_url AS url
WHERE url IS NOT NULL AND url <> ''
MATCH (t:Token {address: $mint})
MERGE (sp:SocialProfile {url: url})
SET sp.platform = "telegram",
    sp.normalized_handle = toLower(last(split(url, '/')))
MERGE (t)-[:HAS_TELEGRAM]->(sp)

-- Website
WITH $website_url AS url
WHERE url IS NOT NULL AND url <> ''
MATCH (t:Token {address: $mint})
MERGE (sp:SocialProfile {url: url})
SET sp.platform = "website"
MERGE (t)-[:HAS_WEBSITE]->(sp)
```

**Warum ist das wichtig?**
Wenn 3 verschiedene Tokens den gleichen Twitter-Account verlinken -> verdaechtig!
```cypher
-- "Welche Twitter-Accounts werden von mehreren Tokens verwendet?"
MATCH (t:Token)-[:HAS_TWITTER]->(sp:SocialProfile)
WITH sp, collect(t) AS tokens
WHERE size(tokens) > 1
RETURN sp.url, sp.normalized_handle, [t IN tokens | t.symbol] AS token_symbols
```

### 7.4 ImageHash Node

Fingerprint des Token-Bildes. Scammer kopieren oft Bilder.

```cypher
(:ImageHash {
    hash: "a1b2c3d4e5f6...",          -- pHash oder SHA256 des Bildes
    first_seen: "2026-02-10T12:00:00Z",
    usage_count: 1                      -- Wird beim Sync hochgezaehlt
})
```

**Constraint:**
```cypher
CREATE CONSTRAINT image_hash_unique IF NOT EXISTS
  FOR (ih:ImageHash) REQUIRE ih.hash IS UNIQUE
```

### 7.5 SQL + Cypher: ImageHash

```sql
SELECT token_address, image_hash
FROM discovered_coins
WHERE image_hash IS NOT NULL
  AND image_hash <> ''
  AND discovered_at > $1
ORDER BY discovered_at ASC
LIMIT 5000
```

```cypher
MATCH (t:Token {address: $mint})
MERGE (ih:ImageHash {hash: $image_hash})
ON CREATE SET ih.first_seen = datetime(), ih.usage_count = 1
ON MATCH SET ih.usage_count = ih.usage_count + 1
MERGE (t)-[:HAS_IMAGE]->(ih)
```

**Scam-Detection Query:**
```cypher
-- "Welche Bilder werden von mehreren Tokens verwendet?"
MATCH (t:Token)-[:HAS_IMAGE]->(ih:ImageHash)
WHERE ih.usage_count > 1
RETURN ih.hash, ih.usage_count,
       collect(t.symbol) AS tokens_mit_gleichem_bild
ORDER BY ih.usage_count DESC
```

### 7.6 Tokenomics Node

Supply-Verteilung eines Tokens. Hoher Top-10-Holder-Anteil = Rug-Risiko.

```cypher
(:Tokenomics {
    mint: "ABC123...",
    total_supply: 1000000000,
    token_decimals: 6,
    top_10_holders_pct: 45.2,
    metadata_is_mutable: false,
    mint_authority_enabled: false,
    initial_buy_tokens: 50000000,
    bonding_curve_pct: 78.5,
    updated_at: "2026-02-11T14:00:00Z"
})
```

**Constraint:**
```cypher
CREATE CONSTRAINT tokenomics_mint IF NOT EXISTS
  FOR (tk:Tokenomics) REQUIRE tk.mint IS UNIQUE
```

### 7.7 SQL + Cypher: Tokenomics

```sql
SELECT
    token_address,
    token_supply,
    token_decimals,
    top_10_holders_pct,
    metadata_is_mutable,
    mint_authority_enabled,
    initial_buy_tokens,
    v_tokens_in_bonding_curve,
    v_sol_in_bonding_curve
FROM discovered_coins
WHERE token_supply IS NOT NULL
  AND discovered_at > $1
ORDER BY discovered_at ASC
LIMIT 5000
```

```cypher
MATCH (t:Token {address: $mint})
MERGE (tk:Tokenomics {mint: $mint})
SET tk.total_supply = $total_supply,
    tk.token_decimals = $token_decimals,
    tk.top_10_holders_pct = $top_10_holders_pct,
    tk.metadata_is_mutable = $metadata_is_mutable,
    tk.mint_authority_enabled = $mint_authority_enabled,
    tk.initial_buy_tokens = $initial_buy_tokens,
    tk.bonding_curve_pct = CASE
        WHEN $total_supply > 0 THEN ($v_tokens_in_bonding_curve / $total_supply) * 100
        ELSE 0
    END,
    tk.updated_at = datetime()
MERGE (t)-[:HAS_TOKENOMICS]->(tk)
```

**Rug-Detection Query:**
```cypher
-- "Tokens mit hohem Rug-Risiko: Mutable + Mint Authority + hohe Top-10"
MATCH (t:Token)-[:HAS_TOKENOMICS]->(tk:Tokenomics)
WHERE tk.metadata_is_mutable = true
   OR tk.mint_authority_enabled = true
   OR tk.top_10_holders_pct > 70
RETURN t.symbol, t.name,
       tk.metadata_is_mutable, tk.mint_authority_enabled,
       tk.top_10_holders_pct
ORDER BY tk.top_10_holders_pct DESC
```

---

## 8. Phase 6: coin_transactions Sync

### 8.1 Zweck

Aktuell werden nur `trade_logs` (eigene Wallet-Trades) nach Neo4j synchronisiert.
`coin_transactions` enthaelt ALLE Markt-Trades (~1.4 Mio/Tag).

**WICHTIG:** Nicht alle Trades synchronisieren! Nur signifikante:
- Whale-Trades (is_whale = true)
- Grosse Trades (>= 0.5 SOL)
- Creator-Trades (trader = token creator)

### 8.2 SQL: Signifikante Markt-Trades

```sql
SELECT
    ct.mint,
    ct.timestamp,
    ct.trader_public_key,
    ct.sol_amount,
    ct.tx_type,
    ct.price_sol,
    ct.is_whale,
    ct.phase_id_at_time,
    -- Flag ob es der Creator ist
    (ct.trader_public_key = dc.trader_public_key) AS is_creator_trade
FROM coin_transactions ct
JOIN discovered_coins dc ON dc.token_address = ct.mint
WHERE ct.timestamp > $1
  AND (ct.is_whale = true OR ct.sol_amount >= 0.5)
ORDER BY ct.timestamp ASC
LIMIT 5000
```

### 8.3 Cypher: MarketTrader + MARKET_BOUGHT/MARKET_SOLD

```cypher
-- MarketTrader-Node erstellen/aktualisieren
MERGE (mt:MarketTrader {address: $trader_public_key})
SET mt.last_seen = $timestamp,
    mt.is_whale = CASE WHEN $is_whale THEN true ELSE mt.is_whale END

WITH mt
MATCH (t:Token {address: $mint})

-- Buy oder Sell Kante
FOREACH (_ IN CASE WHEN $tx_type = 'buy' THEN [1] ELSE [] END |
    MERGE (mt)-[r:MARKET_BOUGHT {timestamp: $timestamp}]->(t)
    SET r.sol_amount = $sol_amount, r.price_sol = $price_sol,
        r.is_whale = $is_whale, r.phase_id = $phase_id
)
FOREACH (_ IN CASE WHEN $tx_type = 'sell' THEN [1] ELSE [] END |
    MERGE (mt)-[r:MARKET_SOLD {timestamp: $timestamp}]->(t)
    SET r.sol_amount = $sol_amount, r.price_sol = $price_sol,
        r.is_whale = $is_whale, r.phase_id = $phase_id
)
```

---

## 9. Constraints und Indexes (Gesamtliste)

### Alle Constraints nach Implementierung (13 Stueck)

```cypher
-- Existierend (4)
CREATE CONSTRAINT token_address IF NOT EXISTS FOR (t:Token) REQUIRE t.address IS UNIQUE
CREATE CONSTRAINT creator_address IF NOT EXISTS FOR (c:Creator) REQUIRE c.address IS UNIQUE
CREATE CONSTRAINT wallet_alias IF NOT EXISTS FOR (w:Wallet) REQUIRE w.alias IS UNIQUE
CREATE CONSTRAINT model_id IF NOT EXISTS FOR (m:Model) REQUIRE m.id IS UNIQUE

-- Neu Phase 1: Event-System (2)
CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.id IS UNIQUE
CREATE CONSTRAINT outcome_event_id IF NOT EXISTS FOR (o:Outcome) REQUIRE o.event_id IS UNIQUE

-- Neu Phase 2: Phasen-Analyse (2)
CREATE CONSTRAINT phase_snapshot_key IF NOT EXISTS FOR (ps:PhaseSnapshot) REQUIRE ps.id IS UNIQUE
CREATE CONSTRAINT price_checkpoint_key IF NOT EXISTS FOR (pc:PriceCheckpoint) REQUIRE pc.id IS UNIQUE

-- Neu Phase 3: Wallet-Intelligence (2)
CREATE CONSTRAINT market_trader_address IF NOT EXISTS FOR (mt:MarketTrader) REQUIRE mt.address IS UNIQUE
CREATE CONSTRAINT wallet_cluster_id IF NOT EXISTS FOR (wc:WalletCluster) REQUIRE wc.cluster_id IS UNIQUE

-- Neu Phase 4: Marktkontext (1)
CREATE CONSTRAINT sol_price_timestamp IF NOT EXISTS FOR (sp:SolPrice) REQUIRE sp.timestamp IS UNIQUE

-- Neu Phase 5: Enrichment (2)
CREATE CONSTRAINT social_profile_url IF NOT EXISTS FOR (sp:SocialProfile) REQUIRE sp.url IS UNIQUE
CREATE CONSTRAINT image_hash_unique IF NOT EXISTS FOR (ih:ImageHash) REQUIRE ih.hash IS UNIQUE
CREATE CONSTRAINT tokenomics_mint IF NOT EXISTS FOR (tk:Tokenomics) REQUIRE tk.mint IS UNIQUE
```

---

## 10. Router-Erweiterung

### Stats-Endpoint erweitern

`router.py` muss die neuen Node- und Relationship-Typen kennen:

```python
# In router.py -> graph_stats()
# Bestehend:
NODE_LABELS = ["Token", "Creator", "Wallet", "Model", "Address"]
REL_TYPES = ["CREATED", "HOLDS", "BOUGHT", "SOLD", "PREDICTED", "TRANSFERRED_TO"]

# Erweitert:
NODE_LABELS = [
    "Token", "Creator", "Wallet", "Model", "Address",
    # Phase 1: Event-System
    "Event", "Outcome",
    # Phase 2: Phasen-Analyse
    "PhaseSnapshot", "PriceCheckpoint",
    # Phase 3: Wallet-Intelligence
    "MarketTrader", "WalletCluster",
    # Phase 4: Marktkontext
    "SolPrice",
    # Phase 5: Enrichment
    "SocialProfile", "ImageHash", "Tokenomics",
]

REL_TYPES = [
    "CREATED", "HOLDS", "BOUGHT", "SOLD", "PREDICTED", "TRANSFERRED_TO", "SIMILAR_TO",
    # Phase 1
    "HAD_EVENT", "FOLLOWED_BY", "RESULTED_IN",
    # Phase 2
    "PHASE_SUMMARY", "NEXT_PHASE", "PRICE_AT", "NEXT_CHECKPOINT",
    # Phase 3
    "BELONGS_TO", "TRADES_WITH", "FUNDED_BY", "MARKET_BOUGHT", "MARKET_SOLD", "IS_CREATOR",
    # Phase 4
    "DURING_MARKET",
    # Phase 5
    "HAS_TWITTER", "HAS_TELEGRAM", "HAS_WEBSITE", "HAS_IMAGE", "HAS_TOKENOMICS",
]
```

### Sync-Status erweitern

`sync.py` -> `last_sync` und `stats` mit neuen Kategorien:

```python
self.last_sync = {
    # Bestehend
    "tokens": None, "wallets": None, "models": None,
    "trades": None, "positions": None, "predictions": None, "transfers": None,
    # Neu
    "events": None, "outcomes": None,
    "phase_snapshots": None, "price_checkpoints": None,
    "market_traders": None, "wallet_clusters": None,
    "sol_prices": None,
    "social_profiles": None, "image_hashes": None, "tokenomics": None,
}

self.stats = {
    "total_syncs": 0,
    "tokens_synced": 0, "wallets_synced": 0, "trades_synced": 0,
    # Neu
    "events_detected": 0, "outcomes_calculated": 0,
    "phase_snapshots_created": 0, "price_checkpoints_created": 0,
    "market_traders_synced": 0, "wallet_clusters_detected": 0,
}
```

---

## 11. Zusammenfassung: Vorher vs. Nachher

### Vorher (IST)

```
6 Node-Typen:   Token, Creator, Wallet, Model, Address (+ implizit SimilarTo)
7 Relationships: CREATED, HOLDS, BOUGHT, SOLD, PREDICTED, TRANSFERRED_TO, SIMILAR_TO
4 Constraints:   token_address, creator_address, wallet_alias, model_id
```

**Was man fragen kann:**
- "Welche Tokens hat Creator X erstellt?"
- "Welche Tokens haelt Wallet Y?"
- "Welches Modell hat Token Z vorhergesagt?"

### Nachher (SOLL)

```
15 Node-Typen:   + Event, Outcome, PhaseSnapshot, PriceCheckpoint,
                   MarketTrader, WalletCluster, SolPrice,
                   SocialProfile, ImageHash, Tokenomics
26 Relationships: + HAD_EVENT, FOLLOWED_BY, RESULTED_IN,
                    PHASE_SUMMARY, NEXT_PHASE, PRICE_AT, NEXT_CHECKPOINT,
                    BELONGS_TO, TRADES_WITH, FUNDED_BY,
                    MARKET_BOUGHT, MARKET_SOLD, IS_CREATOR,
                    DURING_MARKET,
                    HAS_TWITTER, HAS_TELEGRAM, HAS_WEBSITE, HAS_IMAGE, HAS_TOKENOMICS
14 Constraints:   + event_id, outcome_event_id, phase_snapshot_key,
                    price_checkpoint_key, market_trader_address,
                    wallet_cluster_id, sol_price_timestamp,
                    social_profile_url, image_hash_unique, tokenomics_mint
```

**Was man ZUSAETZLICH fragen kann:**
- "Was passiert typischerweise nach einem Whale-Entry?"
- "Zeig mir Event-Ketten die zu Rugs fuehren"
- "Welche Tokens hatten eine aehnliche Baby-Phase wie Token X?"
- "Welche Wallets handeln koordiniert (Cluster)?"
- "Gibt es Tokens die das gleiche Bild verwenden (Scam-Copy)?"
- "Welche Twitter-Accounts werden von mehreren Tokens verlinkt?"
- "Wie verhalten sich Tokens bei hohem SOL-Preis vs. niedrigem?"
- "Tokens mit mutable Metadata + Mint Authority = Rug-Risiko?"
- "Welche Geldfluss-Ketten existieren zwischen unseren Wallets?"

### Implementierungsreihenfolge

| Phase | Aufwand | Mehrwert | Dateien |
|-------|---------|----------|---------|
| **1: Event-System** | 4-6h | SEHR HOCH - Events + Outcomes = lernbare Muster | `sync.py` |
| **2: Phasen-Analyse** | 3-4h | HOCH - Phasenvergleich + Preis-Trajektorien | `sync.py` |
| **3: Wallet-Intelligence** | 4-6h | HOCH - Scam-Detection, Cluster-Erkennung | `sync.py` (+ evtl. neuer Service) |
| **4: Marktkontext** | 1h | MITTEL - SOL-Preis als Kontext | `sync.py` |
| **5: Enrichment** | 2-3h | MITTEL - Social/Image/Tokenomics aus discovered_coins | `sync.py` |
| **6: Market-Trades** | 2-3h | MITTEL - Signifikante Markt-Trades | `sync.py` |

**Gesamt: ~16-23 Stunden Implementierungsaufwand**

---

## Anhang: Cypher Cheat-Sheet fuer Tests

```cypher
-- Alle Node-Typen und Anzahl
MATCH (n) RETURN labels(n) AS type, count(n) AS count ORDER BY count DESC

-- Alle Relationship-Typen und Anzahl
MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY count DESC

-- Alle Constraints anzeigen
SHOW CONSTRAINTS

-- Events fuer einen Token
MATCH (t:Token {symbol: "BONK"})-[:HAD_EVENT]->(e:Event)
RETURN e.type, e.severity, e.timestamp ORDER BY e.timestamp

-- PhaseSnapshots fuer einen Token
MATCH (t:Token {symbol: "BONK"})-[:PHASE_SUMMARY]->(ps:PhaseSnapshot)
RETURN ps.phase_name, ps.price_change_pct, ps.volume_total_sol
ORDER BY ps.phase_id

-- Event-Ketten zu einem Outcome
MATCH path = (e:Event)-[:FOLLOWED_BY*0..5]->(last:Event)-[:RESULTED_IN]->(o:Outcome)
WHERE e.mint = "ABC123..."
RETURN [n IN nodes(path) WHERE n:Event | n.type] AS chain, o.type AS outcome
```
