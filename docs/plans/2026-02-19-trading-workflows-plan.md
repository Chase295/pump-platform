# Trading Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated buy/sell workflow chains to the Trading module - visual chain builder UI + backend execution engine + sell position monitor.

**Architecture:** Two new DB tables (trading_workflows, workflow_executions) + new column (positions.peak_price_sol). Event-driven BuyWorkflowEngine hooks into PredictionScanner. Polling SellPositionMonitor checks open positions every 15s. New "Workflows" tab in TradingShell with chain-builder dialog.

**Tech Stack:** FastAPI, asyncpg, React+MUI+TypeScript, recharts, @tanstack/react-query

**Design doc:** `docs/plans/2026-02-19-trading-workflows-design.md`

---

### Task 1: Database Schema + Migration

**Files:**
- Modify: `sql/init.sql`
- Create: `sql/migrate_workflows.sql`

**Step 1: Add tables to init.sql**

Open `sql/init.sql`. After the `exchange_rates` table (near the end, before any `CREATE INDEX` blocks for the buy module), add:

```sql
-- ============================================================
-- Trading Workflows
-- ============================================================
CREATE TABLE IF NOT EXISTS trading_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(4) NOT NULL CHECK (type IN ('BUY', 'SELL')),
    is_active BOOLEAN DEFAULT FALSE,
    chain JSONB NOT NULL DEFAULT '{}',
    buy_amount_mode VARCHAR(7) CHECK (buy_amount_mode IN ('fixed', 'percent')),
    buy_amount_value NUMERIC(20, 9),
    sell_amount_pct NUMERIC(5, 2) DEFAULT 100.0,
    cooldown_seconds INTEGER DEFAULT 60,
    max_open_positions INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_wallet ON trading_workflows(wallet_id);
CREATE INDEX IF NOT EXISTS idx_workflows_type_active ON trading_workflows(type, is_active);

CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES trading_workflows(id) ON DELETE CASCADE,
    mint VARCHAR(255) NOT NULL,
    trigger_data JSONB DEFAULT '{}',
    steps_log JSONB DEFAULT '[]',
    result VARCHAR(10) NOT NULL CHECK (result IN ('EXECUTED', 'REJECTED', 'ERROR')),
    trade_log_id UUID REFERENCES trade_logs(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_created ON workflow_executions(created_at DESC);
```

**Step 2: Add peak_price_sol to positions table**

In `sql/init.sql`, find the `positions` table definition and add after `initial_sol_spent`:

```sql
    peak_price_sol DECIMAL(30, 18),
```

**Step 3: Create migration file**

Create `sql/migrate_workflows.sql`:

```sql
-- Migration: Trading Workflows
-- Run this against an existing database to add workflow tables

-- Add peak_price_sol to positions
ALTER TABLE positions ADD COLUMN IF NOT EXISTS peak_price_sol DECIMAL(30, 18);

-- Create workflow tables
CREATE TABLE IF NOT EXISTS trading_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(4) NOT NULL CHECK (type IN ('BUY', 'SELL')),
    is_active BOOLEAN DEFAULT FALSE,
    chain JSONB NOT NULL DEFAULT '{}',
    buy_amount_mode VARCHAR(7) CHECK (buy_amount_mode IN ('fixed', 'percent')),
    buy_amount_value NUMERIC(20, 9),
    sell_amount_pct NUMERIC(5, 2) DEFAULT 100.0,
    cooldown_seconds INTEGER DEFAULT 60,
    max_open_positions INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflows_wallet ON trading_workflows(wallet_id);
CREATE INDEX IF NOT EXISTS idx_workflows_type_active ON trading_workflows(type, is_active);

CREATE TABLE IF NOT EXISTS workflow_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES trading_workflows(id) ON DELETE CASCADE,
    mint VARCHAR(255) NOT NULL,
    trigger_data JSONB DEFAULT '{}',
    steps_log JSONB DEFAULT '[]',
    result VARCHAR(10) NOT NULL CHECK (result IN ('EXECUTED', 'REJECTED', 'ERROR')),
    trade_log_id UUID REFERENCES trade_logs(id) ON DELETE SET NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wf_exec_workflow ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_wf_exec_created ON workflow_executions(created_at DESC);
```

**Step 4: Run migration**

```bash
docker compose exec db psql -U pump_platform -d pump_platform -f /docker-entrypoint-initdb.d/migrate_workflows.sql
```

Note: The migration file needs to be mounted in docker-compose.yml. Add to the db volumes: `./sql/migrate_workflows.sql:/docker-entrypoint-initdb.d/migrate_workflows.sql`. Alternatively, run manually:

```bash
cat sql/migrate_workflows.sql | docker compose exec -T db psql -U pump_platform -d pump_platform
```

**Step 5: Verify tables exist**

```bash
echo "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'trading_workflows' OR table_name LIKE 'workflow_executions' OR table_name = 'positions';" | docker compose exec -T db psql -U pump_platform -d pump_platform
echo "\d positions" | docker compose exec -T db psql -U pump_platform -d pump_platform | grep peak
```

---

### Task 2: Backend Workflow CRUD (Schemas + Router)

**Files:**
- Modify: `backend/modules/buy/schemas.py` (add workflow schemas)
- Create: `backend/modules/buy/workflow_router.py` (CRUD endpoints)
- Modify: `backend/main.py` (include new router)
- Modify: `frontend/src/services/api.ts` (add workflow API methods)
- Modify: `frontend/src/types/buy.ts` (add workflow types)

**Step 1: Add Pydantic schemas to `backend/modules/buy/schemas.py`**

At the end of the file, add:

```python
# =================================================================
# WORKFLOW SCHEMAS
# =================================================================

class WorkflowType(str, Enum):
    BUY = "BUY"
    SELL = "SELL"

class BuyAmountMode(str, Enum):
    FIXED = "fixed"
    PERCENT = "percent"

class WorkflowExecutionResult(str, Enum):
    EXECUTED = "EXECUTED"
    REJECTED = "REJECTED"
    ERROR = "ERROR"

class WorkflowCreate(BaseModel):
    """Request to create a trading workflow."""
    wallet_alias: str = Field(..., description="Wallet alias")
    name: str = Field(..., min_length=1, max_length=100, description="Workflow name")
    type: WorkflowType = Field(..., description="BUY or SELL")
    chain: dict = Field(..., description="Chain definition (trigger + conditions or rules)")
    buy_amount_mode: Optional[BuyAmountMode] = Field(None, description="fixed or percent (BUY only)")
    buy_amount_value: Optional[float] = Field(None, gt=0, description="Amount value (BUY only)")
    sell_amount_pct: Optional[float] = Field(100.0, ge=1, le=100, description="Sell percentage (SELL only)")
    cooldown_seconds: int = Field(60, ge=0, description="Cooldown between executions")
    max_open_positions: int = Field(5, ge=1, le=100, description="Max open positions per wallet")

class WorkflowUpdate(BaseModel):
    """Request to update a trading workflow."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    chain: Optional[dict] = None
    buy_amount_mode: Optional[BuyAmountMode] = None
    buy_amount_value: Optional[float] = Field(None, gt=0)
    sell_amount_pct: Optional[float] = Field(None, ge=1, le=100)
    cooldown_seconds: Optional[int] = Field(None, ge=0)
    max_open_positions: Optional[int] = Field(None, ge=1, le=100)

class WorkflowResponse(BaseModel):
    """Response for a trading workflow."""
    id: str
    wallet_id: str
    wallet_alias: Optional[str] = None
    name: str
    type: str
    is_active: bool
    chain: dict
    buy_amount_mode: Optional[str] = None
    buy_amount_value: Optional[float] = None
    sell_amount_pct: Optional[float] = None
    cooldown_seconds: int
    max_open_positions: int
    created_at: datetime
    updated_at: datetime

class WorkflowExecutionResponse(BaseModel):
    """Response for a workflow execution log entry."""
    id: str
    workflow_id: str
    workflow_name: Optional[str] = None
    mint: str
    trigger_data: dict
    steps_log: list
    result: str
    error_message: Optional[str] = None
    trade_log_id: Optional[str] = None
    created_at: datetime
```

**Step 2: Create workflow router**

Create `backend/modules/buy/workflow_router.py`:

```python
"""
Workflow Router - CRUD endpoints for trading workflows.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from backend.database import fetch, fetchrow, fetchval, execute
from backend.modules.buy.schemas import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowExecutionResponse,
)

router = APIRouter(prefix="/api/buy/workflows", tags=["workflows"])


@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(
    wallet_alias: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
):
    """List all trading workflows, optionally filtered."""
    conditions = []
    params = []
    idx = 1

    if wallet_alias:
        conditions.append(f"w.alias = ${idx}")
        params.append(wallet_alias)
        idx += 1

    if type:
        conditions.append(f"tw.type = ${idx}")
        params.append(type.upper())
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    rows = await fetch(f"""
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        {where}
        ORDER BY tw.created_at DESC
    """, *params)

    return [dict(r) for r in rows]


@router.post("", response_model=WorkflowResponse, status_code=201)
async def create_workflow(req: WorkflowCreate):
    """Create a new trading workflow."""
    wallet = await fetchrow(
        "SELECT id, alias FROM wallets WHERE alias = $1", req.wallet_alias
    )
    if not wallet:
        raise HTTPException(404, f"Wallet '{req.wallet_alias}' not found")

    if req.type == "BUY" and (not req.buy_amount_mode or not req.buy_amount_value):
        raise HTTPException(400, "BUY workflows require buy_amount_mode and buy_amount_value")

    row = await fetchrow("""
        INSERT INTO trading_workflows (
            wallet_id, name, type, chain,
            buy_amount_mode, buy_amount_value, sell_amount_pct,
            cooldown_seconds, max_open_positions
        ) VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
        RETURNING *
    """,
        wallet['id'], req.name, req.type.value,
        __import__('json').dumps(req.chain),
        req.buy_amount_mode.value if req.buy_amount_mode else None,
        req.buy_amount_value, req.sell_amount_pct,
        req.cooldown_seconds, req.max_open_positions,
    )

    result = dict(row)
    result['wallet_alias'] = wallet['alias']
    return result


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(workflow_id: UUID):
    """Get a single workflow by ID."""
    row = await fetchrow("""
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        WHERE tw.id = $1
    """, workflow_id)
    if not row:
        raise HTTPException(404, "Workflow not found")
    return dict(row)


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(workflow_id: UUID, req: WorkflowUpdate):
    """Update a trading workflow."""
    existing = await fetchrow("SELECT id FROM trading_workflows WHERE id = $1", workflow_id)
    if not existing:
        raise HTTPException(404, "Workflow not found")

    updates = []
    params = []
    idx = 1

    if req.name is not None:
        updates.append(f"name = ${idx}")
        params.append(req.name)
        idx += 1
    if req.chain is not None:
        updates.append(f"chain = ${idx}::jsonb")
        params.append(__import__('json').dumps(req.chain))
        idx += 1
    if req.buy_amount_mode is not None:
        updates.append(f"buy_amount_mode = ${idx}")
        params.append(req.buy_amount_mode.value)
        idx += 1
    if req.buy_amount_value is not None:
        updates.append(f"buy_amount_value = ${idx}")
        params.append(req.buy_amount_value)
        idx += 1
    if req.sell_amount_pct is not None:
        updates.append(f"sell_amount_pct = ${idx}")
        params.append(req.sell_amount_pct)
        idx += 1
    if req.cooldown_seconds is not None:
        updates.append(f"cooldown_seconds = ${idx}")
        params.append(req.cooldown_seconds)
        idx += 1
    if req.max_open_positions is not None:
        updates.append(f"max_open_positions = ${idx}")
        params.append(req.max_open_positions)
        idx += 1

    if not updates:
        raise HTTPException(400, "No fields to update")

    updates.append(f"updated_at = NOW()")
    params.append(workflow_id)

    row = await fetchrow(f"""
        UPDATE trading_workflows
        SET {', '.join(updates)}
        WHERE id = ${idx}
        RETURNING *
    """, *params)

    wallet = await fetchrow("SELECT alias FROM wallets WHERE id = $1", row['wallet_id'])
    result = dict(row)
    result['wallet_alias'] = wallet['alias'] if wallet else None
    return result


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: UUID):
    """Delete a trading workflow."""
    result = await execute("DELETE FROM trading_workflows WHERE id = $1", workflow_id)
    if result == "DELETE 0":
        raise HTTPException(404, "Workflow not found")
    return {"status": "deleted"}


@router.patch("/{workflow_id}/toggle")
async def toggle_workflow(workflow_id: UUID, active: bool = Query(...)):
    """Toggle workflow active state."""
    row = await fetchrow("""
        UPDATE trading_workflows
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, is_active
    """, active, workflow_id)
    if not row:
        raise HTTPException(404, "Workflow not found")
    return dict(row)


@router.get("/{workflow_id}/executions", response_model=List[WorkflowExecutionResponse])
async def get_workflow_executions(
    workflow_id: UUID,
    limit: int = Query(50, ge=1, le=500),
):
    """Get execution log for a workflow."""
    rows = await fetch("""
        SELECT we.*, tw.name AS workflow_name
        FROM workflow_executions we
        JOIN trading_workflows tw ON we.workflow_id = tw.id
        WHERE we.workflow_id = $1
        ORDER BY we.created_at DESC
        LIMIT $2
    """, workflow_id, limit)
    return [dict(r) for r in rows]


@router.get("/executions/recent", response_model=List[WorkflowExecutionResponse])
async def get_recent_executions(
    limit: int = Query(20, ge=1, le=100),
    result: Optional[str] = Query(None),
):
    """Get recent workflow executions across all workflows."""
    conditions = []
    params = []
    idx = 1

    if result:
        conditions.append(f"we.result = ${idx}")
        params.append(result.upper())
        idx += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)

    rows = await fetch(f"""
        SELECT we.*, tw.name AS workflow_name
        FROM workflow_executions we
        JOIN trading_workflows tw ON we.workflow_id = tw.id
        {where}
        ORDER BY we.created_at DESC
        LIMIT ${idx}
    """, *params)
    return [dict(r) for r in rows]
```

**Step 3: Register router in main.py**

In `backend/main.py`, add after `from backend.modules.buy.router import router as buy_router` (line 25):

```python
from backend.modules.buy.workflow_router import router as workflow_router
```

And after `app.include_router(buy_router)` (line 222):

```python
app.include_router(workflow_router)  # /api/buy/workflows/...
```

**Step 4: Add frontend TypeScript types**

In `frontend/src/types/buy.ts`, add at the end:

```typescript
// ============================================================
// Trading Workflows
// ============================================================
export type WorkflowType = 'BUY' | 'SELL';
export type BuyAmountMode = 'fixed' | 'percent';
export type WorkflowExecutionResult = 'EXECUTED' | 'REJECTED' | 'ERROR';

export interface BuyChainTrigger {
  type: 'prediction_alert';
  model_id: number;
  min_probability: number;
}

export interface BuyChainCondition {
  type: 'on_demand_prediction';
  model_id: number;
  operator: 'gte' | 'lte' | 'gt' | 'lt';
  threshold: number;
}

export interface BuyChain {
  trigger: BuyChainTrigger;
  conditions: BuyChainCondition[];
}

export interface SellRule {
  type: 'stop_loss' | 'trailing_stop' | 'take_profit' | 'timeout';
  percent?: number;
  from?: 'entry' | 'peak';
  minutes?: number;
}

export interface SellChain {
  rules: SellRule[];
}

export interface TradingWorkflow {
  id: string;
  wallet_id: string;
  wallet_alias?: string;
  name: string;
  type: WorkflowType;
  is_active: boolean;
  chain: BuyChain | SellChain;
  buy_amount_mode?: BuyAmountMode;
  buy_amount_value?: number;
  sell_amount_pct?: number;
  cooldown_seconds: number;
  max_open_positions: number;
  created_at: string;
  updated_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  workflow_name?: string;
  mint: string;
  trigger_data: Record<string, unknown>;
  steps_log: Array<Record<string, unknown>>;
  result: WorkflowExecutionResult;
  error_message?: string;
  trade_log_id?: string;
  created_at: string;
}

export interface WorkflowCreateRequest {
  wallet_alias: string;
  name: string;
  type: WorkflowType;
  chain: BuyChain | SellChain;
  buy_amount_mode?: BuyAmountMode;
  buy_amount_value?: number;
  sell_amount_pct?: number;
  cooldown_seconds?: number;
  max_open_positions?: number;
}
```

**Step 5: Add frontend API methods**

In `frontend/src/services/api.ts`, add to the `buyApi` object (after the Logs section):

```typescript
  // Workflows
  getWorkflows: (walletAlias?: string, type?: string) =>
    api.get('/buy/workflows', { params: { wallet_alias: walletAlias, type } }),
  createWorkflow: (data: Record<string, unknown>) => api.post('/buy/workflows', data),
  getWorkflow: (id: string) => api.get(`/buy/workflows/${id}`),
  updateWorkflow: (id: string, data: Record<string, unknown>) =>
    api.patch(`/buy/workflows/${id}`, data),
  deleteWorkflow: (id: string) => api.delete(`/buy/workflows/${id}`),
  toggleWorkflow: (id: string, active: boolean) =>
    api.patch(`/buy/workflows/${id}/toggle`, null, { params: { active } }),
  getWorkflowExecutions: (id: string, limit = 50) =>
    api.get(`/buy/workflows/${id}/executions`, { params: { limit } }),
  getRecentExecutions: (limit = 20, result?: string) =>
    api.get('/buy/workflows/executions/recent', { params: { limit, result } }),
```

**Step 6: Verify TypeScript compiles**

```bash
cd pump-platform/frontend && npx tsc --noEmit
```

**Step 7: Verify backend starts**

```bash
docker compose up -d --build backend && docker compose logs -f --tail=20 backend
```

---

### Task 3: BuyWorkflowEngine (Backend Service)

**Files:**
- Create: `backend/modules/buy/workflow_engine.py`
- Modify: `backend/modules/server/scanner.py` (hook into _save_and_notify)
- Modify: `backend/main.py` (start service)

**Step 1: Create the BuyWorkflowEngine**

Create `backend/modules/buy/workflow_engine.py`:

```python
"""
BuyWorkflowEngine - Event-driven buy workflow execution.

Hooks into PredictionScanner. When a prediction is made, checks all
active BUY workflows that reference that model as trigger.
"""

import json
import logging
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from backend.database import fetch, fetchrow, fetchval, get_pool
from backend.modules.buy.trading import TradingService
from backend.modules.server.predictor import predict_coin

logger = logging.getLogger(__name__)

_engine: Optional['BuyWorkflowEngine'] = None


class BuyWorkflowEngine:
    """Evaluates BUY workflows when predictions arrive."""

    def __init__(self):
        self._last_execution: Dict[str, datetime] = {}  # workflow_id -> last exec time

    async def on_prediction(
        self,
        coin_id: str,
        model_id: int,
        active_model_id: int,
        probability: float,
        prediction: int,
        tag: str,
        timestamp: datetime,
    ):
        """Called by PredictionScanner after saving a prediction."""
        try:
            pool = get_pool()

            # Find active BUY workflows whose trigger references this model
            workflows = await fetch("""
                SELECT tw.*, w.alias AS wallet_alias, w.trading_enabled,
                       w.virtual_sol_balance, w.real_sol_balance, w.type AS wallet_type
                FROM trading_workflows tw
                JOIN wallets w ON tw.wallet_id = w.id
                WHERE tw.type = 'BUY'
                  AND tw.is_active = TRUE
                  AND w.trading_enabled = TRUE
            """)

            for wf in workflows:
                try:
                    await self._evaluate_buy_workflow(
                        pool, wf, coin_id, model_id, active_model_id,
                        probability, prediction, tag, timestamp,
                    )
                except Exception as e:
                    logger.error(
                        f"Error evaluating BUY workflow {wf['id']}: {e}",
                        exc_info=True,
                    )
        except Exception as e:
            logger.error(f"BuyWorkflowEngine.on_prediction error: {e}", exc_info=True)

    async def _evaluate_buy_workflow(
        self,
        pool,
        wf,
        coin_id: str,
        model_id: int,
        active_model_id: int,
        probability: float,
        prediction: int,
        tag: str,
        timestamp: datetime,
    ):
        """Evaluate a single BUY workflow against an incoming prediction."""
        workflow_id = str(wf['id'])
        chain = wf['chain'] if isinstance(wf['chain'], dict) else json.loads(wf['chain'])
        trigger = chain.get('trigger', {})
        conditions = chain.get('conditions', [])

        # Check trigger model matches
        trigger_model_id = trigger.get('model_id')
        if trigger_model_id != model_id and trigger_model_id != active_model_id:
            return  # Not for this workflow

        # Check trigger probability threshold
        min_prob = trigger.get('min_probability', 0.5)
        if probability < min_prob:
            return  # Below threshold, skip silently (too noisy to log)

        # Cooldown check
        last_exec = self._last_execution.get(workflow_id)
        cooldown = wf.get('cooldown_seconds', 60)
        if last_exec and (datetime.utcnow() - last_exec).total_seconds() < cooldown:
            return  # In cooldown

        # Max open positions check
        max_positions = wf.get('max_open_positions', 5)
        open_count = await fetchval("""
            SELECT COUNT(*) FROM positions
            WHERE wallet_id = $1 AND status = 'OPEN'
        """, wf['wallet_id'])
        if open_count >= max_positions:
            await self._log_execution(
                workflow_id, coin_id,
                {'model_id': model_id, 'probability': float(probability), 'tag': tag},
                [{'step': 'max_positions_check', 'result': 'rejected',
                  'open': open_count, 'max': max_positions}],
                'REJECTED',
            )
            return

        # Check if we already have a position in this coin for this wallet
        existing = await fetchval("""
            SELECT COUNT(*) FROM positions
            WHERE wallet_id = $1 AND mint = $2 AND status = 'OPEN'
        """, wf['wallet_id'], coin_id)
        if existing > 0:
            return  # Already holding this coin

        steps_log = [{
            'step': 'trigger',
            'model_id': model_id,
            'probability': float(probability),
            'min_probability': min_prob,
            'result': 'passed',
        }]

        # Evaluate conditions sequentially
        all_passed = True
        for i, cond in enumerate(conditions):
            cond_result = await self._evaluate_condition(pool, cond, coin_id, timestamp)
            steps_log.append({
                'step': f'condition_{i+1}',
                'type': cond.get('type'),
                'model_id': cond.get('model_id'),
                **cond_result,
            })
            if cond_result.get('result') != 'passed':
                all_passed = False
                break

        trigger_data = {
            'model_id': model_id,
            'active_model_id': active_model_id,
            'probability': float(probability),
            'prediction': prediction,
            'tag': tag,
        }

        if not all_passed:
            await self._log_execution(
                workflow_id, coin_id, trigger_data, steps_log, 'REJECTED',
            )
            return

        # All conditions passed - execute buy
        try:
            amount_sol = self._calculate_buy_amount(wf)
            result = await TradingService.execute_buy(
                wallet_alias=wf['wallet_alias'],
                mint=coin_id,
                amount_sol=amount_sol,
            )

            # Find the trade_log_id
            trade_log = await fetchrow("""
                SELECT id FROM trade_logs
                WHERE wallet_id = $1 AND mint = $2
                ORDER BY created_at DESC LIMIT 1
            """, wf['wallet_id'], coin_id)

            steps_log.append({
                'step': 'execute_buy',
                'amount_sol': amount_sol,
                'result': 'success',
                'trade_result': result,
            })

            self._last_execution[workflow_id] = datetime.utcnow()

            await self._log_execution(
                workflow_id, coin_id, trigger_data, steps_log, 'EXECUTED',
                trade_log_id=str(trade_log['id']) if trade_log else None,
            )

            logger.info(
                f"BUY workflow '{wf['name']}' executed: "
                f"coin={coin_id[:8]}... amount={amount_sol} SOL"
            )

        except Exception as e:
            steps_log.append({
                'step': 'execute_buy',
                'result': 'error',
                'error': str(e),
            })
            await self._log_execution(
                workflow_id, coin_id, trigger_data, steps_log, 'ERROR',
                error_message=str(e),
            )
            logger.error(f"BUY workflow '{wf['name']}' failed: {e}")

    async def _evaluate_condition(
        self, pool, condition: dict, coin_id: str, timestamp: datetime,
    ) -> dict:
        """Evaluate a single condition (on_demand_prediction)."""
        cond_type = condition.get('type')

        if cond_type == 'on_demand_prediction':
            model_id = condition.get('model_id')
            operator = condition.get('operator', 'gte')
            threshold = condition.get('threshold', 0.5)

            # Load model config from ml_models (not active_models)
            model_config = await fetchrow("""
                SELECT m.id AS model_id, m.name, m.model_data,
                       m.target_variable, m.target_direction,
                       m.future_minutes, m.price_change_percent,
                       m.features, m.feature_engineering
                FROM ml_models m
                WHERE m.id = $1
            """, model_id)

            if not model_config:
                return {'result': 'error', 'error': f'Model {model_id} not found'}

            try:
                pred_result = await predict_coin(
                    coin_id=coin_id,
                    timestamp=timestamp,
                    model_config=dict(model_config),
                    pool=pool,
                )
                prob = pred_result.get('probability', 0)

                passed = self._compare(prob, operator, threshold)
                return {
                    'result': 'passed' if passed else 'failed',
                    'probability': float(prob),
                    'operator': operator,
                    'threshold': threshold,
                }
            except Exception as e:
                return {'result': 'error', 'error': str(e)}

        return {'result': 'error', 'error': f'Unknown condition type: {cond_type}'}

    @staticmethod
    def _compare(value: float, operator: str, threshold: float) -> bool:
        """Compare value against threshold with operator."""
        if operator == 'gte':
            return value >= threshold
        elif operator == 'gt':
            return value > threshold
        elif operator == 'lte':
            return value <= threshold
        elif operator == 'lt':
            return value < threshold
        return False

    def _calculate_buy_amount(self, wf) -> float:
        """Calculate buy amount based on workflow config."""
        mode = wf.get('buy_amount_mode', 'fixed')
        value = float(wf.get('buy_amount_value', 0.05))

        if mode == 'percent':
            wallet_type = wf.get('wallet_type', 'TEST')
            if wallet_type == 'TEST':
                balance = float(wf.get('virtual_sol_balance', 0))
            else:
                balance = float(wf.get('real_sol_balance', 0))
            return round(balance * (value / 100), 6)
        else:
            return value

    async def _log_execution(
        self,
        workflow_id: str,
        mint: str,
        trigger_data: dict,
        steps_log: list,
        result: str,
        trade_log_id: Optional[str] = None,
        error_message: Optional[str] = None,
    ):
        """Log a workflow execution to the database."""
        try:
            await fetchrow("""
                INSERT INTO workflow_executions (
                    workflow_id, mint, trigger_data, steps_log,
                    result, trade_log_id, error_message
                ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
                RETURNING id
            """,
                workflow_id if isinstance(workflow_id, type(None)) is False else workflow_id,
                mint,
                json.dumps(trigger_data),
                json.dumps(steps_log),
                result,
                trade_log_id,
                error_message,
            )
        except Exception as e:
            logger.error(f"Failed to log workflow execution: {e}")


async def start_buy_workflow_engine():
    """Start the buy workflow engine (singleton)."""
    global _engine
    if _engine is None:
        _engine = BuyWorkflowEngine()
        logger.info("BuyWorkflowEngine started")
    return _engine


def get_buy_workflow_engine() -> Optional[BuyWorkflowEngine]:
    """Get the running engine instance."""
    return _engine
```

**Step 2: Hook into PredictionScanner**

In `backend/modules/server/scanner.py`, add import at top (after other imports):

```python
from backend.modules.buy.workflow_engine import get_buy_workflow_engine
```

In the `_save_and_notify` method, after the n8n webhook call (line 409: `await self._send_n8n(...)` ), add:

```python
        # Trigger BUY workflow engine
        engine = get_buy_workflow_engine()
        if engine:
            asyncio.create_task(engine.on_prediction(
                coin_id=coin_id,
                model_id=result.get('model_id'),
                active_model_id=active_model_id,
                probability=probability,
                prediction=prediction,
                tag=tag,
                timestamp=timestamp,
            ))
```

Also add `import asyncio` at the top of scanner.py if not already there.

**Step 3: Start engine in main.py lifespan**

In `backend/main.py`, add import:

```python
from backend.modules.buy.workflow_engine import start_buy_workflow_engine
```

After `await start_prediction_scanner()` (line 140), add:

```python
    # 5c. Start buy workflow engine
    await start_buy_workflow_engine()
    logger.info("Buy workflow engine started")
```

**Step 4: Rebuild and verify**

```bash
docker compose up -d --build backend && sleep 5 && docker compose logs --tail=30 backend | grep -i workflow
```

---

### Task 4: SellPositionMonitor (Backend Service)

**Files:**
- Create: `backend/modules/buy/position_monitor.py`
- Modify: `backend/main.py` (start service)

**Step 1: Create the SellPositionMonitor**

Create `backend/modules/buy/position_monitor.py`:

```python
"""
SellPositionMonitor - Polls open positions and executes sell rules.

Runs every 15 seconds, checks positions against active SELL workflows.
"""

import json
import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from backend.database import fetch, fetchrow, fetchval, execute, get_pool
from backend.modules.buy.trading import TradingService
from backend.modules.buy.jupiter_client import JupiterClient

logger = logging.getLogger(__name__)

_monitor: Optional['SellPositionMonitor'] = None


class SellPositionMonitor:
    """Background service that monitors positions against SELL workflow rules."""

    def __init__(self, interval_seconds: int = 15):
        self.interval = interval_seconds
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._jupiter = JupiterClient()

    async def start(self):
        """Start the monitor loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())

    async def stop(self):
        """Stop the monitor loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _loop(self):
        """Main polling loop."""
        while self._running:
            try:
                await self._check_positions()
            except Exception as e:
                logger.error(f"SellPositionMonitor error: {e}", exc_info=True)
            await asyncio.sleep(self.interval)

    async def _check_positions(self):
        """Check all positions that have active SELL workflows."""
        # Get all active SELL workflows with their positions
        rows = await fetch("""
            SELECT
                tw.id AS workflow_id, tw.name AS workflow_name,
                tw.chain, tw.sell_amount_pct, tw.wallet_id,
                p.id AS position_id, p.mint, p.tokens_held,
                p.entry_price, p.initial_sol_spent, p.peak_price_sol,
                p.created_at AS position_created_at,
                w.alias AS wallet_alias
            FROM trading_workflows tw
            JOIN wallets w ON tw.wallet_id = w.id
            JOIN positions p ON p.wallet_id = tw.wallet_id AND p.status = 'OPEN'
            WHERE tw.type = 'SELL'
              AND tw.is_active = TRUE
              AND w.trading_enabled = TRUE
        """)

        if not rows:
            return

        for row in rows:
            try:
                await self._evaluate_position(row)
            except Exception as e:
                logger.error(
                    f"Error evaluating position {row['position_id']}: {e}",
                    exc_info=True,
                )

    async def _evaluate_position(self, row):
        """Evaluate a single position against its SELL workflow rules."""
        chain = row['chain'] if isinstance(row['chain'], dict) else json.loads(row['chain'])
        rules = chain.get('rules', [])

        if not rules:
            return

        mint = row['mint']
        tokens_held = float(row['tokens_held'])
        entry_price = float(row['entry_price']) if row['entry_price'] else 0
        initial_sol = float(row['initial_sol_spent']) if row['initial_sol_spent'] else 0
        peak_price = float(row['peak_price_sol']) if row['peak_price_sol'] else entry_price

        # Get current price via Jupiter
        try:
            token_amount_raw = int(tokens_held * (10 ** 6))  # Assume 6 decimals
            if token_amount_raw <= 0:
                return
            quote = await self._jupiter.get_sell_quote(mint, token_amount_raw)
            current_value_sol = quote.out_amount / 1e9  # lamports to SOL
            current_price = current_value_sol / tokens_held if tokens_held > 0 else 0
        except Exception as e:
            logger.debug(f"Jupiter quote failed for {mint[:8]}...: {e}")
            return  # Skip if price unavailable

        # Update peak price
        if current_price > peak_price:
            peak_price = current_price
            await execute("""
                UPDATE positions SET peak_price_sol = $1 WHERE id = $2
            """, peak_price, row['position_id'])

        # Calculate metrics
        change_from_entry_pct = ((current_price - entry_price) / entry_price * 100) if entry_price > 0 else 0
        change_from_peak_pct = ((current_price - peak_price) / peak_price * 100) if peak_price > 0 else 0
        minutes_since_open = (datetime.now(timezone.utc) - row['position_created_at']).total_seconds() / 60

        # Check each rule (OR logic - first match triggers sell)
        triggered_rule = None
        for rule in rules:
            rule_type = rule.get('type')

            if rule_type == 'stop_loss':
                threshold = rule.get('percent', -5.0)
                if change_from_entry_pct <= threshold:
                    triggered_rule = rule
                    break

            elif rule_type == 'trailing_stop':
                threshold = rule.get('percent', -3.0)
                if change_from_peak_pct <= threshold:
                    triggered_rule = rule
                    break

            elif rule_type == 'take_profit':
                threshold = rule.get('percent', 20.0)
                if change_from_entry_pct >= threshold:
                    triggered_rule = rule
                    break

            elif rule_type == 'timeout':
                minutes = rule.get('minutes', 30)
                if minutes_since_open >= minutes:
                    triggered_rule = rule
                    break

        if not triggered_rule:
            return  # No rule triggered

        # Execute sell
        workflow_id = str(row['workflow_id'])
        sell_pct = float(row['sell_amount_pct']) if row['sell_amount_pct'] else 100.0

        trigger_data = {
            'rule': triggered_rule,
            'current_price': current_price,
            'entry_price': entry_price,
            'peak_price': peak_price,
            'change_from_entry_pct': round(change_from_entry_pct, 2),
            'change_from_peak_pct': round(change_from_peak_pct, 2),
            'minutes_since_open': round(minutes_since_open, 1),
        }

        try:
            result = await TradingService.execute_sell(
                wallet_alias=row['wallet_alias'],
                mint=mint,
                amount_pct=sell_pct,
            )

            trade_log = await fetchrow("""
                SELECT id FROM trade_logs
                WHERE wallet_id = $1 AND mint = $2 AND action = 'SELL'
                ORDER BY created_at DESC LIMIT 1
            """, row['wallet_id'], mint)

            steps_log = [{
                'step': 'rule_triggered',
                'rule_type': triggered_rule['type'],
                'sell_pct': sell_pct,
                'result': 'executed',
            }]

            await self._log_execution(
                workflow_id, mint, trigger_data, steps_log, 'EXECUTED',
                trade_log_id=str(trade_log['id']) if trade_log else None,
            )

            logger.info(
                f"SELL workflow '{row['workflow_name']}' triggered: "
                f"rule={triggered_rule['type']} coin={mint[:8]}... "
                f"change={change_from_entry_pct:.1f}%"
            )

        except Exception as e:
            steps_log = [{
                'step': 'rule_triggered',
                'rule_type': triggered_rule['type'],
                'result': 'error',
                'error': str(e),
            }]
            await self._log_execution(
                workflow_id, mint, trigger_data, steps_log, 'ERROR',
                error_message=str(e),
            )
            logger.error(f"SELL workflow failed: {e}")

    async def _log_execution(
        self, workflow_id, mint, trigger_data, steps_log, result,
        trade_log_id=None, error_message=None,
    ):
        """Log execution to database."""
        try:
            await fetchrow("""
                INSERT INTO workflow_executions (
                    workflow_id, mint, trigger_data, steps_log,
                    result, trade_log_id, error_message
                ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
                RETURNING id
            """,
                workflow_id, mint,
                json.dumps(trigger_data), json.dumps(steps_log),
                result, trade_log_id, error_message,
            )
        except Exception as e:
            logger.error(f"Failed to log sell execution: {e}")


async def start_position_monitor(interval_seconds: int = 15):
    """Start the position monitor as background task."""
    global _monitor
    if _monitor is None:
        _monitor = SellPositionMonitor(interval_seconds=interval_seconds)
        await _monitor.start()
        logger.info(f"SellPositionMonitor started (interval={interval_seconds}s)")
    return _monitor
```

**Step 2: Start in main.py lifespan**

In `backend/main.py`, add import:

```python
from backend.modules.buy.position_monitor import start_position_monitor
```

After the buy workflow engine start line, add:

```python
    # 5d. Start sell position monitor
    await start_position_monitor(interval_seconds=15)
    logger.info("Sell position monitor started")
```

**Step 3: Rebuild and verify**

```bash
docker compose up -d --build backend && sleep 5 && docker compose logs --tail=30 backend | grep -iE "monitor|workflow"
```

---

### Task 5: Frontend - Workflows Overview Page

**Files:**
- Create: `frontend/src/pages/trading/Workflows.tsx`
- Modify: `frontend/src/pages/trading/TradingShell.tsx` (add tab + route)

**Step 1: Create Workflows page**

Create `frontend/src/pages/trading/Workflows.tsx` with:

- 3 StatCards: Active Buy Workflows, Active Sell Workflows, Executions Today
- Tabs: "Buy Workflows" / "Sell Workflows"
- WorkflowCard for each workflow showing: name, wallet, active toggle, chain summary text, last execution, edit/delete buttons
- "+ New Workflow" button per tab (opens chain builder dialog - Task 6)
- Recent Executions table at bottom (last 20)
- All data via `useQuery` from `buyApi.getWorkflows()` and `buyApi.getRecentExecutions()`
- Use `CARD_SX`, `ctx.accentColor`, MUI Grid, same styling as other trading pages
- Generate human-readable chain summary like: "XGBoost_v42 > 70% → RF_v3 > 60% → Buy 0.05 SOL"

For the chain summary, add a helper function:

```typescript
function summarizeBuyChain(chain: BuyChain, amountMode?: string, amountValue?: number): string {
  const parts: string[] = [];
  parts.push(`Model #${chain.trigger.model_id} ≥ ${(chain.trigger.min_probability * 100).toFixed(0)}%`);
  for (const c of chain.conditions) {
    const op = c.operator === 'gte' ? '≥' : c.operator === 'lte' ? '≤' : c.operator === 'gt' ? '>' : '<';
    parts.push(`Model #${c.model_id} ${op} ${(c.threshold * 100).toFixed(0)}%`);
  }
  const amount = amountMode === 'percent' ? `${amountValue}%` : `${amountValue} SOL`;
  parts.push(`Buy ${amount}`);
  return parts.join(' → ');
}

function summarizeSellChain(chain: SellChain): string {
  return chain.rules
    .map((r) => {
      if (r.type === 'stop_loss') return `SL ${r.percent}%`;
      if (r.type === 'trailing_stop') return `TS ${r.percent}%`;
      if (r.type === 'take_profit') return `TP +${r.percent}%`;
      if (r.type === 'timeout') return `${r.minutes}min`;
      return r.type;
    })
    .join(' | ');
}
```

**Step 2: Add to TradingShell**

In `frontend/src/pages/trading/TradingShell.tsx`:

Add import:
```typescript
import Workflows from './Workflows';
```

Add icon import (add `AutoFixHigh` to the MUI icons import):
```typescript
AutoFixHigh as WorkflowIcon,
```

In `subNavItems` array, insert before the Info item:
```typescript
{ path: `${basePath}/workflows`, label: 'Workflows', icon: <WorkflowIcon /> },
```

In `getActiveTab()`, add before the info check:
```typescript
if (path.startsWith(`${basePath}/workflows`)) return 6;
```

Update the info return to `return 7`.

In `<Routes>`, add before the info route:
```typescript
<Route path="workflows" element={<Workflows />} />
```

**Step 3: Verify TypeScript**

```bash
cd pump-platform/frontend && npx tsc --noEmit
```

---

### Task 6: Frontend - Chain Builder Dialog

**Files:**
- Create: `frontend/src/pages/trading/WorkflowDialog.tsx`
- Modify: `frontend/src/pages/trading/Workflows.tsx` (wire dialog)

**Step 1: Create WorkflowDialog component**

Create `frontend/src/pages/trading/WorkflowDialog.tsx` as a fullscreen MUI `Dialog`:

**Header:** Name TextField + Wallet Dropdown + Type selector (BUY/SELL toggle, disabled in edit mode)

**BUY mode body:**
- Trigger section: Model dropdown (fetched from `GET /api/server/models/available` or `GET /api/training/models`) + operator dropdown (>=, >, <=, <) + threshold input (0-100%)
- Conditions section: Dynamic list of on_demand_prediction steps. Each step has: model dropdown + operator + threshold. "+" button to add another step. "x" button to remove a step.
- Buy Amount section: Toggle (Fixed SOL / Percent of Balance) + value input
- Settings: Cooldown (seconds), Max Open Positions

**SELL mode body:**
- Rules section with checkboxes + value inputs:
  - Stop-Loss: `[-X]` % vom Entry (checkbox + number input)
  - Trailing-Stop: `[-X]` % vom Peak (checkbox + number input)
  - Take-Profit: `[+X]` % (checkbox + number input)
  - Timeout: `[X]` Minuten (checkbox + number input)
- Settings: Sell Amount % (default 100)

**Footer:** Save button + Cancel button

**Data flow:**
- On save, construct the chain JSON from form state
- For CREATE: call `buyApi.createWorkflow(data)`
- For EDIT: call `buyApi.updateWorkflow(id, data)`
- Invalidate queries after save

For fetching available models (for the model dropdowns), use:
```typescript
const { data: models = [] } = useQuery({
  queryKey: ['training', 'models'],
  queryFn: async () => (await api.get('/training/models')).data,
});
```

Each model has `id`, `name`, and performance metrics you can show in the dropdown.

**Step 2: Wire into Workflows.tsx**

In `Workflows.tsx`:
- Add state: `dialogOpen`, `editingWorkflow` (null for create, workflow object for edit)
- "+ New Workflow" button sets `dialogOpen=true, editingWorkflow=null`
- Edit button on WorkflowCard sets `dialogOpen=true, editingWorkflow=workflow`
- Delete button shows confirm dialog then calls `buyApi.deleteWorkflow(id)`
- Pass `walletType` from context to only show relevant wallets

**Step 3: Verify TypeScript**

```bash
cd pump-platform/frontend && npx tsc --noEmit
```

---

### Task 7: Final Integration Test

**Step 1: Full TypeScript build check**

```bash
cd pump-platform/frontend && npx tsc --noEmit
```

Expected: Zero errors.

**Step 2: Docker rebuild**

```bash
cd pump-platform && docker compose up -d --build
```

**Step 3: Verify backend services started**

```bash
docker compose logs --tail=50 backend | grep -iE "workflow|monitor|ready"
```

Expected: "BuyWorkflowEngine started", "SellPositionMonitor started", "Pump Platform ready"

**Step 4: Run migration**

```bash
cat sql/migrate_workflows.sql | docker compose exec -T db psql -U pump_platform -d pump_platform
```

**Step 5: Verify API endpoints work**

```bash
# List workflows (should return empty array)
curl -s http://localhost:3000/api/buy/workflows | python3 -m json.tool

# Create a test BUY workflow
curl -s -X POST http://localhost:3000/api/buy/workflows \
  -H "Content-Type: application/json" \
  -d '{"wallet_alias":"test_wallet","name":"Test Buy Bot","type":"BUY","chain":{"trigger":{"type":"prediction_alert","model_id":1,"min_probability":0.7},"conditions":[]},"buy_amount_mode":"fixed","buy_amount_value":0.05}'
```

**Step 6: Visual check**

Open http://localhost:3000/trading/test/workflows in browser and verify:
- Tab appears in navigation
- Page loads with stat cards
- "New Workflow" buttons work
- Chain builder dialog opens and functions correctly
