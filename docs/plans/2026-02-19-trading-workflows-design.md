# Trading Workflows - Design Document

## Goal

Add a visual workflow builder to the Trading module that lets users create automated buy and sell strategies executed entirely in the backend (no N8N dependency).

## Architecture Decisions

- **Execution**: Komplett im Backend, kein N8N
- **Buy Chains**: On-demand predictions (Modell wird aktiv aufgerufen, muss nicht dauerhaft aktiv sein)
- **Sell Monitor**: Eigener Background-Service, pollt alle 15s offene Positionen
- **Wallet Scope**: 1 Workflow = 1 Wallet
- **Buy Amount**: Wählbar pro Workflow (fester SOL-Betrag oder % vom Balance)
- **Approach**: Visueller Chain-Builder mit JSON-basierter Ketten-Definition

---

## 1. Datenmodell

### Tabelle: `trading_workflows`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| wallet_id | UUID FK → wallets(id) | Zugeordnetes Wallet |
| name | VARCHAR(100) | z.B. "Aggressive Buy Bot" |
| type | VARCHAR(4) CHECK ('BUY','SELL') | Workflow-Typ |
| is_active | BOOLEAN DEFAULT false | Aktiv/Inaktiv |
| chain | JSONB | Ketten-Definition (Steps) |
| buy_amount_mode | VARCHAR(7) CHECK ('fixed','percent') | Nur BUY: Betragsmodus |
| buy_amount_value | NUMERIC | Nur BUY: 0.05 SOL oder 10% |
| sell_amount_pct | NUMERIC DEFAULT 100 | Nur SELL: Verkaufsprozent |
| created_at | TIMESTAMP DEFAULT NOW() | |
| updated_at | TIMESTAMP DEFAULT NOW() | |

### Tabelle: `workflow_executions`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID PK | |
| workflow_id | UUID FK → trading_workflows(id) | |
| mint | VARCHAR(255) | Betroffener Coin |
| trigger_data | JSONB | Was den Workflow ausgelöst hat |
| steps_log | JSONB | Durchlaufene Steps + Ergebnisse |
| result | VARCHAR(10) CHECK ('EXECUTED','REJECTED','ERROR') | |
| trade_log_id | UUID FK → trade_logs(id) NULL | Falls Trade ausgeführt |
| created_at | TIMESTAMP DEFAULT NOW() | |

### Neues Feld: `positions.peak_price_sol`

NUMERIC, DEFAULT NULL. Wird vom SellPositionMonitor bei jedem Durchlauf aktualisiert wenn aktueller Preis > bisheriger Peak.

### BUY Chain JSON-Struktur

```json
{
  "trigger": {
    "type": "prediction_alert",
    "model_id": 18,
    "min_probability": 0.7
  },
  "conditions": [
    {
      "type": "on_demand_prediction",
      "model_id": 23,
      "operator": "gte",
      "threshold": 0.6
    }
  ]
}
```

### SELL Chain JSON-Struktur

```json
{
  "rules": [
    { "type": "stop_loss", "percent": -5.0, "from": "entry" },
    { "type": "trailing_stop", "percent": -3.0, "from": "peak" },
    { "type": "take_profit", "percent": 20.0 },
    { "type": "timeout", "minutes": 30 }
  ]
}
```

Sell-Regeln sind OR-verknüpft - erste zutreffende Regel löst Verkauf aus.

---

## 2. Backend-Architektur

### 2a. BuyWorkflowEngine (`backend/modules/buy/workflow_engine.py`)

Event-getrieben, hängt sich in PredictionScanner ein:

1. PredictionScanner macht Vorhersage → ruft `BuyWorkflowEngine.on_prediction(coin_id, model_id, probability, prediction_data)` auf
2. Engine sucht aktive BUY-Workflows mit `chain.trigger.model_id == model_id`
3. Pro Workflow:
   - Prüfe Trigger: `probability >= min_probability`
   - Durchlaufe `conditions` sequenziell:
     - `on_demand_prediction`: Lade Modell aus ml_models, berechne Features, predict, prüfe Threshold
   - Alle erfüllt → Execute Buy via `TradingService.execute_buy()`
   - Logge in `workflow_executions`

### 2b. SellPositionMonitor (`backend/modules/buy/position_monitor.py`)

Polling-basiert, alle 15 Sekunden:

1. Lade offene Positionen die zu aktiven SELL-Workflows gehören
2. Pro Position:
   - Hole Preis via Jupiter (`JupiterClient.get_sell_quote()`)
   - Berechne: `change_from_entry_pct`, `change_from_peak_pct`, `minutes_since_open`
   - Update `peak_price_sol` wenn neuer Höchststand
   - Prüfe jede Sell-Regel (OR):
     - `stop_loss`: `change_from_entry_pct <= rule.percent`
     - `trailing_stop`: `change_from_peak_pct <= rule.percent`
     - `take_profit`: `change_from_entry_pct >= rule.percent`
     - `timeout`: `minutes_since_open >= rule.minutes`
   - Erste zutreffende → Sell via `TradingService.execute_sell()`
   - Logge in `workflow_executions`

### 2c. API Endpoints (`backend/modules/buy/workflow_router.py`)

- `GET /api/buy/workflows` - Liste aller Workflows (filter by wallet_alias, type)
- `POST /api/buy/workflows` - Neuen Workflow erstellen
- `GET /api/buy/workflows/{id}` - Einzelnen Workflow laden
- `PATCH /api/buy/workflows/{id}` - Workflow aktualisieren
- `DELETE /api/buy/workflows/{id}` - Workflow löschen
- `PATCH /api/buy/workflows/{id}/toggle` - Aktiv/Inaktiv umschalten
- `GET /api/buy/workflows/{id}/executions` - Ausführungs-Log
- `GET /api/buy/workflow-executions` - Globaler Ausführungs-Log (filter by workflow_id, result)

---

## 3. Frontend-Design

### 3a. Neuer Tab in TradingShell

"Workflows" Tab zwischen "Logs" und "Info" (Index 6, Info wird 7).

### 3b. Übersichtsseite (`/trading/test/workflows`)

**StatCards (3):**
- Aktive Buy-Workflows
- Aktive Sell-Workflows
- Ausführungen heute (Executed / Rejected / Error)

**Workflow-Liste:**
- Tabs: "Buy Workflows" / "Sell Workflows"
- "+ Neuer Workflow" Button pro Tab
- Cards pro Workflow:
  - Name + Wallet-Name + Aktiv-Toggle
  - Kurzinfo-String (z.B. "XGBoost_v42 > 70% → RF_v3 > 60% → Buy 0.05 SOL")
  - Letzte Ausführung + Ergebnis
  - Edit / Delete Buttons

**Execution Log:**
- Tabelle der letzten 20 Ausführungen
- Columns: Time, Workflow, Mint, Result, Details

### 3c. Chain-Builder Dialog

**Fullscreen MUI Dialog** für Erstellen/Bearbeiten.

**BUY-Workflow Builder:**
- Name TextField
- Wallet Dropdown
- Trigger: Modell-Dropdown + Operator + Threshold
- Conditions: Dynamische Liste von on_demand_prediction Steps mit + Button
- Buy Amount: Toggle (Fix/Prozent) + Value

**SELL-Workflow Builder:**
- Name TextField
- Wallet Dropdown
- Rules: Checkboxen mit Parametern
  - Stop-Loss: [-X] % vom Entry
  - Trailing-Stop: [-X] % vom Peak
  - Take-Profit: [+X] %
  - Timeout: [X] Minuten
- Sell Amount: Prozent (default 100%)

---

## 4. Zusätzliche Features (Vorschläge)

- **Cooldown**: Pro BUY-Workflow ein Cooldown in Sekunden (verhindere Spam-Käufe)
- **Max offene Positionen**: Pro Wallet, damit nicht unbegrenzt gekauft wird
- **Execution-Notifications**: Optionaler N8N-Webhook bei jeder Workflow-Ausführung (für Telegram etc.)
- **Workflow-Klonen**: Bestehenden Workflow als Vorlage für neuen nutzen
