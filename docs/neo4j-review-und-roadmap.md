# Neo4j Integration - Code-Review & Roadmap

Stand: Februar 2025
Bezieht sich auf: `backend/modules/graph/` + Frontend-Integration

---

## Inhaltsverzeichnis

1. [Aktueller Status (Was bereits existiert)](#1-aktueller-status)
2. [Behobene Bugs (Was kaputt war und warum)](#2-behobene-bugs)
3. [Sicherheits-Fixes (Was angreifbar war)](#3-sicherheits-fixes)
4. [Fehlende Node-Typen (Was Neo4j noch nicht kennt)](#4-fehlende-node-typen)
5. [Fehlende Relationships (Welche Verbindungen fehlen)](#5-fehlende-relationships)
6. [Fehlende Pipelines (Was noch gebaut werden muss)](#6-fehlende-pipelines)
7. [Prioritaeten-Empfehlung (Was zuerst)](#7-prioritaeten-empfehlung)
8. [Wie die 3 Datenbanken zusammenspielen](#8-wie-die-3-datenbanken-zusammenspielen)

---

## 1. Aktueller Status

### Was funktioniert

Die Basis-Integration ist solide aufgebaut (~40% des geplanten Datenmodells):

| Komponente | Status | Datei |
|-----------|--------|-------|
| Neo4j Docker Container | Laeuft | `docker-compose.yml` |
| Async Neo4j Driver (Singleton) | Laeuft | `neo4j_client.py` |
| PostgreSQL -> Neo4j Sync (Hintergrund) | Laeuft | `sync.py` |
| REST API fuer Cypher Queries | Laeuft | `router.py` |
| Frontend: Neo4j Browser (iframe) | Laeuft | `Neo4jGraph.tsx` |
| Frontend: Cypher Explorer | Laeuft | `CypherExplorer.tsx` |
| Frontend: Graph Guide | Laeuft | `GraphGuide.tsx` |
| Nginx: Bolt WebSocket Proxy | Laeuft | `nginx.conf` |

### Implementierte Node-Typen (6 von 15 geplanten)

| Node | Label | Eindeutiger Key | Quelle in PostgreSQL |
|------|-------|-----------------|---------------------|
| Token | `:Token` | `address` (Mint-Adresse) | `discovered_coins.token_address` |
| Creator | `:Creator` | `address` (Wallet des Erstellers) | `discovered_coins.trader_public_key` |
| Wallet | `:Wallet` | `alias` (z.B. "wolf_1") | `wallets.alias` |
| Model | `:Model` | `id` (Integer) | `prediction_active_models.id` |
| Address | `:Address` | `address` (Ziel-Adresse) | `transfer_logs.to_address` |

### Implementierte Relationships (6 von 26+ geplanten)

| Relationship | Von -> Nach | Bedeutung |
|-------------|------------|-----------|
| `CREATED` | Creator -> Token | "Dieser Creator hat diesen Token deployed" |
| `HOLDS` | Wallet -> Token | "Diese Wallet haelt gerade diesen Token" |
| `BOUGHT` | Wallet -> Token | "Diese Wallet hat diesen Token gekauft" |
| `SOLD` | Wallet -> Token | "Diese Wallet hat diesen Token verkauft" |
| `PREDICTED` | Model -> Token | "Dieses ML-Modell hat fuer diesen Token eine Vorhersage gemacht" |
| `TRANSFERRED_TO` | Wallet -> Address | "Diese Wallet hat SOL an diese Adresse geschickt" |

---

## 2. Behobene Bugs

### 2.1 Doppelte Trade-Kanten (KRITISCH)

**Problem:** Bei jedem Sync-Lauf wurden ALLE Trades nochmal als neue Kanten angelegt.

**Wo:** `sync.py`, Methoden `_sync_trades()`, `_sync_predictions()`, `_sync_transfers()`

**Vorher:**
```cypher
-- Das hier erzeugt JEDES MAL eine neue Kante, auch wenn sie schon existiert:
CREATE (w)-[r:BOUGHT]->(t)
```

**Warum ist das schlecht?**
Wenn der Sync 3x laeuft und Wallet "wolf_1" Token "ABC" einmal gekauft hat,
dann gab es DREI `:BOUGHT`-Kanten statt einer. Jede Analyse die `count()`
benutzt, zaehlt 3x statt 1x. Alle Auswertungen waeren falsch.

**Nachher:**
```cypher
-- MERGE mit timestamp als Schluessel: existiert die Kante schon, wird sie nur aktualisiert
MERGE (w)-[r:BOUGHT {timestamp: $timestamp}]->(t)
SET r.amount_sol = $amount_sol, r.amount_tokens = $amount_tokens
```

**Warum `{timestamp: $timestamp}` als Key?**
Weil die gleiche Wallet den gleichen Token mehrfach kaufen kann (verschiedene Trades).
Der Timestamp macht jeden Trade eindeutig. Gleicher Timestamp = gleicher Trade = kein Duplikat.

### 2.2 Untypisierte Transfer-Nodes (MITTEL)

**Problem:** Transfer-Zieladressen wurden als Nodes OHNE Label erstellt.

**Wo:** `sync.py`, Methode `_sync_transfers()`

**Vorher:**
```cypher
-- Node ohne Label (kein :Address, kein :Wallet, nichts)
MERGE (target {address: $to_address})
ON CREATE SET target:Address
```

**Warum ist das schlecht?**
Neo4j erstellt hier einen Node ohne Label. Der `ON CREATE SET target:Address`
sollte das Label nachtraeglich setzen, aber das funktioniert in der Praxis
nicht zuverlaessig - speziell wenn der Node schon existiert (dann wird
`ON CREATE` uebersprungen). Ausserdem sind Nodes ohne Label:
- Nicht durch Constraints geschuetzt
- Langsamer zu suchen (kein Label-Index)
- Unsichtbar in `MATCH (n:Address)` Queries

**Nachher:**
```cypher
-- Node wird direkt mit Label erstellt
MERGE (target:Address {address: $to_address})
```

So hat jeder Transfer-Zielknoten immer das Label `:Address` und ist sauber abfragbar.

### 2.3 Stumme Constraint-Fehler (NIEDRIG)

**Problem:** Wenn ein Constraint nicht erstellt werden konnte, wurde das nur als `debug` geloggt.

**Wo:** `sync.py`, Methode `_ensure_constraints()`

**Vorher:**
```python
except Exception as e:
    logger.debug("Constraint may already exist: %s", e)
```

**Warum ist das schlecht?**
Wenn ein Constraint wirklich fehlschlaegt (z.B. wegen Berechtigungsproblem
oder Neo4j-Bug), siehst du das nie in den Logs. `debug` Level wird
standardmaessig nicht angezeigt.

**Nachher:**
```python
except Exception as e:
    if "already exists" in str(e).lower() or "equivalent" in str(e).lower():
        logger.debug("Constraint already exists: %s", e)  # OK, erwartet
    else:
        logger.warning("Constraint creation failed: %s", e)  # ACHTUNG, echtes Problem!
```

Jetzt: "existiert schon" -> debug (normal), alles andere -> warning (Problem).

---

## 3. Sicherheits-Fixes

### 3.1 APOC-Injection (KRITISCH)

**Problem:** User konnten ueber den Cypher Explorer APOC-Prozeduren ausfuehren.

**Wo:** `router.py`, Funktion `execute_query()`

**Was ist APOC?**
APOC (Awesome Procedures On Cypher) ist eine Neo4j-Erweiterung mit ~450 Prozeduren.
Einige davon koennen SCHREIBEN, LOESCHEN oder das Schema AENDERN - auch wenn die
Query mit `CALL` statt `CREATE` beginnt.

Beispiel fuer einen Angriff:
```cypher
-- Sieht harmlos aus, loescht aber alle Tokens:
CALL apoc.periodic.iterate(
  'MATCH (t:Token) RETURN t',
  'DELETE t',
  {batchSize: 1000}
)
```

**Fix:**
```python
if re.search(r'\bAPOC\b', q_upper):
    raise HTTPException(status_code=400, detail="APOC procedures not allowed")
```

### 3.2 Schema-Informationsleck (MITTEL)

**Problem:** `EXPLAIN` und `PROFILE` zeigen den Query-Plan inkl. Index-Strukturen.

**Wo:** `router.py`

**Warum ist das relevant?**
Ein Angreifer koennte herausfinden welche Indexes existieren, wie viele Nodes es gibt,
und welche Labels/Properties verwendet werden. Das erleichtert gezielte Angriffe.

**Fix:**
```python
if re.search(r'\b(EXPLAIN|PROFILE)\b', q_upper):
    raise HTTPException(status_code=400, detail="EXPLAIN/PROFILE not allowed")
```

### 3.3 Query-Timeout (MITTEL)

**Problem:** Eine teure Query konnte den Server endlos blockieren.

**Wo:** `router.py`

Beispiel:
```cypher
-- Kartesisches Produkt: bei 10.000 Nodes = 100.000.000 Kombinationen
MATCH (a), (b) RETURN count(*)
```

**Fix:**
```python
QUERY_TIMEOUT_SECONDS = 30

records = await asyncio.wait_for(
    run_query(q), timeout=QUERY_TIMEOUT_SECONDS
)
```

Nach 30 Sekunden wird die Query abgebrochen und ein `408 Request Timeout` zurueckgegeben.

### 3.4 Auth Edge-Case (NIEDRIG)

**Problem:** In `neo4j_client.py` konnte eine leere User-Angabe die Auth umgehen.

**Wo:** `neo4j_client.py`, Funktion `init_neo4j()`

**Vorher:**
```python
auth = (user, password) if user and password else None
```

Das Problem: `user=""` UND `password="geheim"` -> `"" and "geheim"` = `""` = falsy -> `None`.
Also wird Auth uebersprungen, obwohl ein Passwort gesetzt ist.

**Nachher:**
```python
auth = (user, password) if (user or password) else None
```

Jetzt: Wenn IRGENDEINS der beiden gesetzt ist, wird Auth aktiviert.
Nur wenn BEIDE leer sind (wie aktuell: `NEO4J_AUTH: none`), wird Auth deaktiviert.

### 3.5 Echte Write-Transactions (NIEDRIG)

**Problem:** `run_write()` benutzte Auto-Commit statt explizite Transaktionen.

**Wo:** `neo4j_client.py`

**Vorher:**
```python
async with driver.session(database=database) as session:
    await session.run(cypher, params or {})
```

**Nachher:**
```python
async with driver.session(database=database) as session:
    async def _work(tx):
        await tx.run(cypher, params or {})
    await session.execute_write(_work)
```

**Warum ist das besser?**
- `session.run()` = Auto-Commit: Query wird sofort committed, kein Rollback bei Fehler
- `session.execute_write()` = Explizite Transaktion: automatisches Retry bei transienten
  Fehlern (z.B. Netzwerk-Timeout), automatisches Rollback bei echten Fehlern
- Neo4j empfiehlt offiziell `execute_write()` fuer alle Schreiboperationen

---

## 4. Fehlende Node-Typen

Von den 15 geplanten Node-Typen fehlen noch 9. Hier ist jeder einzelne erklaert:

### 4.1 Event (Prioritaet: HOCH)

**Was ist das?**
Ein signifikantes Ereignis im Leben eines Tokens. Nicht jeder Datenpunkt,
sondern nur "Ausreisser" die relevant sind.

**Beispiele:**
| Event-Typ | Bedeutung | Erkennungslogik |
|-----------|-----------|-----------------|
| `volume_spike` | Volumen ploetzlich 5x hoeher als Durchschnitt | `current_volume > avg_volume * 5` |
| `whale_entry` | Grosser Kauf (>1 SOL) | `sol_amount >= whale_threshold` |
| `dev_sold` | Creator hat seine Tokens verkauft | `trader_key == creator_key AND action == 'sell'` |
| `price_ath` | Neues Allzeithoch | `price > previous_ath` |
| `liquidity_drop` | Liquiditaet sinkt um >50% in 1min | `current_liquidity < prev_liquidity * 0.5` |
| `holder_dump` | Grosser Holder verkauft alles | Position von >5% Supply auf 0 |

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:HAD_EVENT]->(:Event {type: "whale_entry", severity: "high", timestamp: "..."})
(:Event)-[:FOLLOWED_BY]->(:Event)  -- Zeitliche Verkettung
```

**Warum ist das wichtig?**
Ohne Events sieht Neo4j nur statische Beziehungen (Creator->Token, Wallet->Token).
Mit Events sieht man DYNAMIK: "Zuerst kam ein Whale, dann ist der Dev abgehauen,
dann kam der Crash." DAS sind die Muster, die du erkennen willst.

**Datenquelle:** `coin_metrics` (Volumen, Preis) + `coin_transactions` (einzelne Trades)

### 4.2 Outcome (Prioritaet: HOCH)

**Was ist das?**
Das Ergebnis nach einem Event oder nach einer bestimmten Zeitspanne.

**Beispiele:**
| Outcome-Typ | Bedeutung |
|-------------|-----------|
| `pump` | Preis >2x innerhalb 10min nach Event |
| `rug` | Preis -90% innerhalb 5min nach Event |
| `sideways` | Preis +/-20% fuer >30min |
| `slow_bleed` | Preis sinkt stetig um >50% ueber 1h |

**Geplantes Cypher-Modell:**
```cypher
(:Event)-[:RESULTED_IN]->(:Outcome {type: "rug", price_change: -0.95, duration_sec: 180})
```

**Warum ist das wichtig?**
Outcomes machen Events lernbar. Ohne Outcome weisst du nur "es gab einen Whale Entry".
MIT Outcome weisst du "nach Whale Entry kam 60% der Faelle ein Pump und 30% ein Rug".
Das ist die Basis fuer Pattern-Erkennung.

### 4.3 PhaseSnapshot (Prioritaet: HOCH)

**Was ist das?**
Eine Zusammenfassung aller Metriken eines Tokens waehrend einer bestimmten Phase.

Zur Erinnerung - die Phasen:
| Phase | Name | Alter | Intervall |
|-------|------|-------|-----------|
| 1 | Baby | 0-10min | 5s |
| 2 | Toddler | 10-30min | 10s |
| 3 | Teen | 30min-1h | 30s |
| 4 | Young | 1-6h | 60s |
| 5 | Adult | 6-24h | 300s |
| 6 | Senior | >24h | 300s |

**Beispiel-Daten pro PhaseSnapshot:**
```
Token: "BONK" | Phase: Baby (0-10min)
- max_price: 0.00042
- min_price: 0.00001
- volume_total: 125.5 SOL
- buy_count: 847
- sell_count: 122
- unique_wallets: 315
- whale_trades: 3
- dev_sold: false
- price_change: +4100%
```

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:PHASE_SUMMARY]->(:PhaseSnapshot {
    phase: 1, max_price: 0.00042, volume_total: 125.5, ...
})
(:PhaseSnapshot)-[:NEXT_PHASE]->(:PhaseSnapshot)  -- Zeitliche Reihenfolge
```

**Warum ist das wichtig?**
Damit kannst du Fragen beantworten wie:
- "Zeig mir alle Tokens deren Baby-Phase aehnlich aussah wie Token X"
- "Wie verhalten sich Tokens die in der Baby-Phase >100 SOL Volumen hatten?"
- "Was passiert typischerweise in der Teen-Phase nach einer starken Baby-Phase?"

**Datenquelle:** Aggregation aus `coin_metrics` pro Phase

### 4.4 PriceCheckpoint (Prioritaet: MITTEL)

**Was ist das?**
Der Preis eines Tokens zu festen Zeitpunkten nach Erstellung.

**Zeitpunkte:** 1min, 5min, 10min, 30min, 1h, 6h, 24h

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:PRICE_AT]->(:PriceCheckpoint {
    minutes: 5, price_sol: 0.00023, market_cap_sol: 45.2, volume_since_start: 89.1
})
(:PriceCheckpoint)-[:NEXT_CHECKPOINT]->(:PriceCheckpoint)
```

**Warum ist das wichtig?**
Simpelste Form der Kurs-Analyse: "Was war der Preis nach 5 Minuten?"
Damit kannst du direkt labeln: "Coins die nach 5min >2x Startkurs haben, sind zu 70% Pumps."

**Datenquelle:** Punktuelle Abfrage aus `coin_metrics`

### 4.5 WalletCluster (Prioritaet: MITTEL)

**Was ist das?**
Eine Gruppe von Wallets die zusammengehoeren (gleicher Besitzer, koordiniertes Verhalten).

**Erkennungsmethoden:**
| Methode | Logik |
|---------|-------|
| Funding-Kette | Wallet A -> Wallet B -> Wallet C (Transfers) |
| Timing-Korrelation | Wallets kaufen/verkaufen gleichzeitig den gleichen Token |
| Gemeinsame Quelle | Alle Wallets wurden von der gleichen Adresse funded |

**Geplantes Cypher-Modell:**
```cypher
(:Wallet)-[:BELONGS_TO]->(:WalletCluster {
    id: "cluster_42", size: 5, detected_at: "...", detection_method: "funding_chain"
})
```

**Warum ist das wichtig?**
Scam-Detection. Wenn 5 Wallets koordiniert den gleichen Token kaufen und dann
gleichzeitig verkaufen, ist das ein klassisches Pump-and-Dump Schema.
Einzeln sehen die Wallets harmlos aus - als Cluster erkennst du den Betrug.

### 4.6 SolPrice (Prioritaet: NIEDRIG)

**Was ist das?**
Der SOL/USD Wechselkurs als Kontextinformation.

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:DURING_MARKET]->(:SolPrice {usd: 148.50, timestamp: "..."})
```

**Warum ist das wichtig?**
Marktkontext. Ein Token der bei SOL=$150 entsteht, verhaelt sich anders als bei SOL=$50.
Bullish-Maerkte haben mehr Volumen, mehr Wallets, hoehere Market-Caps.

**Datenquelle:** `exchange_rates` Tabelle

### 4.7 SocialProfile (Prioritaet: NIEDRIG)

**Was ist das?**
Social-Media-Praesenz eines Tokens (Twitter, Telegram, Website).

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:HAS_TWITTER]->(:SocialProfile {url: "...", followers: 5200})
(:Token)-[:HAS_TELEGRAM]->(:SocialProfile {url: "...", members: 1200})
(:Token)-[:HAS_WEBSITE]->(:SocialProfile {url: "...", has_ssl: true})
```

**Warum ist das wichtig?**
Tokens mit echten Social-Media-Profilen sind seltener Scams.
Ausserdem: Wenn 3 verschiedene Tokens den gleichen Twitter-Account verlinken,
ist das verdaechtig.

**Datenquelle:** Muss noch implementiert werden (Scraping von Pump.fun Token-Seiten)

### 4.8 ImageHash (Prioritaet: NIEDRIG)

**Was ist das?**
Ein Fingerprint (pHash) des Token-Bildes.

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:HAS_IMAGE]->(:ImageHash {hash: "abc123...", mime: "image/png"})
```

**Warum ist das wichtig?**
Scammer kopieren oft Token-Bilder. Wenn das gleiche Bild (oder ein sehr aehnliches)
bei 10 verschiedenen Tokens auftaucht, ist das ein starkes Scam-Signal.

**Datenquelle:** Muss noch implementiert werden (Image-Download + pHash Berechnung)

### 4.9 Tokenomics (Prioritaet: NIEDRIG)

**Was ist das?**
Supply-Verteilung eines Tokens (Gesamtangebot, Top-Holder-Anteil, etc.)

**Geplantes Cypher-Modell:**
```cypher
(:Token)-[:HAS_TOKENOMICS]->(:Tokenomics {
    total_supply: 1000000000, top10_pct: 45.2, dev_pct: 8.5, locked_pct: 0
})
```

**Warum ist das wichtig?**
Wenn die Top-10-Holder 80% des Supplies besitzen, ist ein Rug wahrscheinlicher.
Wenn der Dev 0% haelt (hat alles verkauft), ist das ein schlechtes Zeichen.

**Datenquelle:** Muss noch implementiert werden (Solana RPC Calls)

---

## 5. Fehlende Relationships

### Uebersicht: Was existiert vs. was geplant ist

| Relationship | Existiert? | Von -> Nach | Prioritaet |
|-------------|-----------|------------|------------|
| `CREATED` | Ja | Creator -> Token | - |
| `HOLDS` | Ja | Wallet -> Token | - |
| `BOUGHT` | Ja | Wallet -> Token | - |
| `SOLD` | Ja | Wallet -> Token | - |
| `PREDICTED` | Ja | Model -> Token | - |
| `TRANSFERRED_TO` | Ja | Wallet -> Address | - |
| `HAD_EVENT` | **Nein** | Token -> Event | HOCH |
| `FOLLOWED_BY` | **Nein** | Event -> Event | HOCH |
| `RESULTED_IN` | **Nein** | Event -> Outcome | HOCH |
| `PHASE_SUMMARY` | **Nein** | Token -> PhaseSnapshot | HOCH |
| `NEXT_PHASE` | **Nein** | PhaseSnapshot -> PhaseSnapshot | HOCH |
| `PRICE_AT` | **Nein** | Token -> PriceCheckpoint | MITTEL |
| `NEXT_CHECKPOINT` | **Nein** | PriceCheckpoint -> PriceCheckpoint | MITTEL |
| `SIMILAR_TO` | **Nein** | Token -> Token | MITTEL |
| `TRADES_WITH` | **Nein** | Wallet -> Wallet | MITTEL |
| `BELONGS_TO` | **Nein** | Wallet -> WalletCluster | MITTEL |
| `DURING_MARKET` | **Nein** | Token -> SolPrice | NIEDRIG |
| `FOLLOWED_PREDICTION` | **Nein** | Wallet -> Prediction | NIEDRIG |
| `HAS_TWITTER` | **Nein** | Token -> SocialProfile | NIEDRIG |
| `HAS_TELEGRAM` | **Nein** | Token -> SocialProfile | NIEDRIG |
| `HAS_WEBSITE` | **Nein** | Token -> SocialProfile | NIEDRIG |
| `HAS_IMAGE` | **Nein** | Token -> ImageHash | NIEDRIG |
| `HAS_TOKENOMICS` | **Nein** | Token -> Tokenomics | NIEDRIG |
| `IS_DEPLOYER_OF` | **Nein** | Wallet -> Token | NIEDRIG |
| `FUNDED_BY` | **Nein** | Wallet -> Wallet | NIEDRIG |

### Besonders wichtige fehlende Relationships erklaert

**`SIMILAR_TO` (Token -> Token)**
Kommt aus pgvector. Wenn zwei Token-Patterns aehnlich sind (Cosine Similarity > 0.85),
wird eine `SIMILAR_TO`-Kante erstellt. So kannst du im Graph direkt sehen:
"Token ABC sieht aus wie Token XYZ das ein Rug war."

**`TRADES_WITH` (Wallet -> Wallet)**
Abgeleitet aus gemeinsamen Token-Kaeufen. Wenn Wallet A und Wallet B
5+ gleiche Tokens innerhalb von 1 Minute kaufen, handeln sie vermutlich koordiniert.

**`FUNDED_BY` (Wallet -> Wallet)**
Aus `transfer_logs` ableitbar. Zeigt Geldfluss-Ketten: "Wallet A hat Wallet B
funded, Wallet B hat Wallet C funded" -> vermutlich gleicher Besitzer.

---

## 6. Fehlende Pipelines

### 6.1 Event-Detection Pipeline (HOCH)

**Was muss gebaut werden:**
Ein Service der `coin_metrics` und `coin_transactions` liest und signifikante
Events erkennt.

**Grobe Architektur:**
```python
# In sync.py oder als eigener Service
async def _detect_events(self) -> int:
    """Analysiere coin_metrics und erzeuge Event-Nodes."""

    # 1. Neue Metriken seit letztem Check laden
    rows = await fetch("""
        SELECT mint, timestamp, volume_5s, price_sol, ...
        FROM coin_metrics
        WHERE timestamp > $1
        ORDER BY timestamp ASC
    """, since)

    # 2. Fuer jeden Token: aktuelle vs. historische Werte vergleichen
    for row in rows:
        if row["volume_5s"] > avg_volume * 5:
            await create_event(row["mint"], "volume_spike", row["timestamp"])
        if is_whale_trade(row):
            await create_event(row["mint"], "whale_entry", row["timestamp"])
        # ... weitere Erkennungsregeln

    # 3. Events zeitlich verknuepfen
    # FOLLOWED_BY-Kanten zwischen aufeinanderfolgenden Events
```

**Erkennungsregeln (Starterset):**
| Event | Bedingung | Schwellwert |
|-------|-----------|-------------|
| `volume_spike` | Volumen > X * Durchschnitt der letzten 5min | X = 5 |
| `whale_entry` | Einzeltrade >= Schwellwert SOL | 1.0 SOL |
| `dev_sold` | Creator verkauft eigene Tokens | beliebiger Betrag |
| `price_ath` | Neues Allzeithoch erreicht | jedes neue ATH |
| `liquidity_drop` | Liquiditaet sinkt > 50% in 1min | -50% |
| `mass_sell` | > 10 Sells in 30 Sekunden | 10 Sells |

### 6.2 PhaseSnapshot Pipeline (HOCH)

**Was muss gebaut werden:**
Aggregation der coin_metrics pro Token pro Phase.

```python
async def _create_phase_snapshots(self) -> int:
    """Erstelle PhaseSnapshot-Nodes aus aggregierten coin_metrics."""

    rows = await fetch("""
        SELECT
            cm.mint,
            rcp.id as phase_id,
            rcp.label as phase_name,
            MAX(cm.price_sol) as max_price,
            MIN(cm.price_sol) as min_price,
            SUM(cm.volume_5s) as total_volume,
            COUNT(*) as num_snapshots,
            COUNT(DISTINCT cm.unique_wallets_5s) as unique_wallets,
            -- ... weitere Aggregationen
        FROM coin_metrics cm
        JOIN ref_coin_phases rcp ON cm.phase_id = rcp.id
        GROUP BY cm.mint, rcp.id, rcp.label
    """)

    for row in rows:
        await run_write("""
            MATCH (t:Token {address: $mint})
            MERGE (ps:PhaseSnapshot {mint: $mint, phase: $phase_id})
            SET ps += $props
            MERGE (t)-[:PHASE_SUMMARY]->(ps)
        """, params)
```

### 6.3 pgvector Embedding Pipeline (MITTEL)

**Was muss gebaut werden:**
Code der aus `coin_metrics` Feature-Vektoren berechnet und in `coin_pattern_embeddings` schreibt.

**Ablauf:**
1. Alle coin_metrics fuer ein Token + Phase laden (z.B. 120 Zeilen fuer Baby-Phase)
2. Features berechnen: Preis-Normalisierung, Volumen-Ratio, Buy/Sell-Verhaeltnis, etc.
3. Auf 128 Dimensionen bringen (PCA, Autoencoder, oder feste Feature-Auswahl)
4. In `coin_pattern_embeddings` speichern

**Wichtig:** Diese Pipeline ist UNABHAENGIG von Neo4j. Sie schreibt in PostgreSQL (pgvector).
Neo4j kann spaeter die Ergebnisse nutzen um `SIMILAR_TO`-Kanten zu erstellen.

### 6.4 coin_transactions -> Neo4j Sync (NIEDRIG)

**Was fehlt:**
Aktuell werden nur `trade_logs` (aus dem Buy-Modul = eigene Wallet-Trades) synchronisiert.
Die `coin_transactions` (aus dem FIND-Modul = ALLE Trades auf dem Markt) werden NICHT
nach Neo4j synchronisiert.

**Warum ist das relevant?**
`trade_logs` zeigt nur was UNSERE Wallets gemacht haben.
`coin_transactions` zeigt was ALLE Wallets auf dem Markt machen.
Fuer Wallet-Pattern-Erkennung und Cluster-Detection brauchen wir die Markt-Trades.

**Achtung:** `coin_transactions` hat VIEL mehr Daten (~1.4 Mio Zeilen/Tag).
Nicht alles nach Neo4j schreiben! Nur aggregierte Zusammenfassungen oder
signifikante Trades (Whales, grosse Volumen, etc.)

---

## 7. Prioritaeten-Empfehlung

### Phase 1: Event-System (groesster Mehrwert)

| Aufgabe | Aufwand | Dateien |
|---------|---------|---------|
| Event-Detection Regeln definieren | 1-2h | sync.py |
| Event + Outcome Node-Typen implementieren | 2-3h | sync.py |
| HAD_EVENT + FOLLOWED_BY + RESULTED_IN Kanten | 1-2h | sync.py |
| Constraint fuer Event-Nodes | 5min | sync.py |

**Ergebnis:** Du siehst im Graph "Was ist passiert und was kam danach?"

### Phase 2: Phase-Analyse

| Aufgabe | Aufwand | Dateien |
|---------|---------|---------|
| PhaseSnapshot Aggregation | 2-3h | sync.py |
| PriceCheckpoint Berechnung | 1-2h | sync.py |
| PHASE_SUMMARY + PRICE_AT Kanten | 1h | sync.py |

**Ergebnis:** Du kannst Phasen vergleichen und Preis-Trajektorien analysieren.

### Phase 3: Wallet-Intelligence

| Aufgabe | Aufwand | Dateien |
|---------|---------|---------|
| Wallet-Cluster Detection | 3-5h | Neuer Service |
| BELONGS_TO + TRADES_WITH Kanten | 2h | sync.py |
| FUNDED_BY aus transfer_logs | 1h | sync.py |

**Ergebnis:** Scam-Wallet-Netzwerke werden sichtbar.

### Phase 4: Similarity (pgvector -> Neo4j)

| Aufgabe | Aufwand | Dateien |
|---------|---------|---------|
| Embedding Pipeline implementieren | 4-6h | Neuer Service |
| SIMILAR_TO Kanten aus pgvector | 2h | sync.py |

**Ergebnis:** "Zeig mir Tokens die so aussehen wie dieser Rug."

### Phase 5: Enrichment (Nice-to-have)

| Aufgabe | Aufwand |
|---------|---------|
| Social-Profile Scraping | 3-4h |
| Image-Hash Berechnung | 2-3h |
| Tokenomics von Solana RPC | 2-3h |
| SolPrice Kontext | 30min |

---

## 8. Wie die 3 Datenbanken zusammenspielen

### Das grosse Bild

```
+---------------------------+
|       PostgreSQL          |
|  (TimescaleDB + pgvector) |
|                           |
|  coin_metrics      100%   |  <-- ALLE Rohdaten, ML Training
|  coin_transactions 100%   |  <-- ALLE Trades
|  coin_pattern_     100%   |  <-- ALLE Vektoren
|    embeddings             |
|  discovered_coins  100%   |  <-- ALLE Token-Metadaten
|  wallets, positions, etc. |
+---------------------------+
         |
         | Sync (alle 5 Min)
         | Nur Events + Beziehungen
         | ~5% der Daten
         v
+---------------------------+
|        Neo4j              |
|   (Graph Database)        |
|                           |
|  Nodes: Token, Creator,   |  <-- Destillierte Beziehungen
|  Wallet, Event, Outcome,  |  <-- Signifikante Events
|  PhaseSnapshot, Model...  |  <-- Pattern-Erkennung
|                           |
|  Kanten: CREATED, BOUGHT, |  <-- Visuell analysierbar
|  HAD_EVENT, SIMILAR_TO... |  <-- Cluster-Detection
+---------------------------+
```

### Wer macht was?

| Aufgabe | Datenbank | Warum |
|---------|-----------|-------|
| ML Training (XGBoost) | PostgreSQL | Braucht alle Features, schnelle SQL-Abfragen |
| Live-Predictions | PostgreSQL | Latenz < 1ms wichtig, kein Graph-Overhead |
| Aehnliche Coins finden | pgvector (in PostgreSQL) | Vector-Similarity ist dafuer gemacht |
| "Zeig mir alle Rug-Muster" | pgvector | `ORDER BY embedding <=> $pattern LIMIT 10` |
| Creator-Netzwerk analysieren | Neo4j | Graph-Traversal: "Welche Tokens hat dieser Creator noch?" |
| Wallet-Cluster erkennen | Neo4j | Beziehungs-Analyse: "Welche Wallets handeln koordiniert?" |
| Event-Ketten verstehen | Neo4j | Pfad-Analyse: "Was passiert nach einem Whale-Entry?" |
| Visuell explorieren | Neo4j | Einzige DB mit eingebauter Visualisierung |
| Alerting (n8n) | PostgreSQL + Neo4j | PostgreSQL fuer Daten, Neo4j fuer Kontext |

### Datenfluss in einem Satz

> PostgreSQL speichert ALLES (100%). pgvector verdichtet Patterns zu Vektoren.
> Neo4j zeigt nur die BEZIEHUNGEN und EVENTS (~5%). XGBoost lernt aus PostgreSQL.
> Der Mensch schaut in Neo4j und versteht, was die KI warum entschieden hat.

---

## Anhang: Datei-Referenz fuer alle Aenderungen

| Datei | Was wurde geaendert | Commit |
|-------|-------------------|--------|
| `backend/modules/graph/sync.py` | CREATE->MERGE, Label-Fix, Logging | `fix: Neo4j graph module bugs and security issues` |
| `backend/modules/graph/router.py` | APOC-Block, Timeout, EXPLAIN-Block | `fix: Neo4j graph module bugs and security issues` |
| `backend/modules/graph/neo4j_client.py` | Auth-Fix, execute_write() | `fix: Neo4j graph module bugs and security issues` |
