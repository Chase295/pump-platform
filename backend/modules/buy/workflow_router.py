"""
Trading Workflows Router - CRUD endpoints for automated buy/sell workflow chains.

All endpoints are prefixed with /api/buy/workflows (set via APIRouter prefix).
"""

import json
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query

from backend.database import fetch, fetchrow, fetchval, execute
from backend.modules.buy.schemas import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowExecutionResponse,
)


router = APIRouter(prefix="/api/buy/workflows", tags=["workflows"])


# =================================================================
# HELPER
# =================================================================

def _row_to_workflow(row: dict) -> dict:
    """Convert a database row to a WorkflowResponse-compatible dict."""
    chain = row["chain"]
    if isinstance(chain, str):
        chain = json.loads(chain)

    return WorkflowResponse(
        id=str(row["id"]),
        wallet_id=str(row["wallet_id"]),
        wallet_alias=row.get("wallet_alias"),
        name=row["name"],
        type=row["type"],
        is_active=row["is_active"],
        chain=chain,
        buy_amount_mode=row.get("buy_amount_mode"),
        buy_amount_value=float(row["buy_amount_value"]) if row.get("buy_amount_value") is not None else None,
        sell_amount_pct=float(row["sell_amount_pct"]) if row.get("sell_amount_pct") is not None else None,
        cooldown_seconds=row["cooldown_seconds"],
        max_open_positions=row["max_open_positions"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _row_to_execution(row: dict) -> dict:
    """Convert a database row to a WorkflowExecutionResponse-compatible dict."""
    trigger_data = row["trigger_data"]
    if isinstance(trigger_data, str):
        trigger_data = json.loads(trigger_data)

    steps_log = row["steps_log"]
    if isinstance(steps_log, str):
        steps_log = json.loads(steps_log)

    return WorkflowExecutionResponse(
        id=str(row["id"]),
        workflow_id=str(row["workflow_id"]),
        workflow_name=row.get("workflow_name"),
        mint=row["mint"],
        trigger_data=trigger_data,
        steps_log=steps_log,
        result=row["result"],
        error_message=row.get("error_message"),
        trade_log_id=str(row["trade_log_id"]) if row.get("trade_log_id") else None,
        created_at=row["created_at"],
    )


# =================================================================
# RECENT EXECUTIONS  (MUST be before /{workflow_id} routes)
# =================================================================

@router.get("/executions/recent", response_model=List[WorkflowExecutionResponse], operation_id="buy_recent_executions")
async def get_recent_executions(
    limit: int = Query(20, ge=1, le=500),
    result: Optional[str] = Query(None, description="Filter by result: EXECUTED, REJECTED, ERROR"),
):
    """Get recent workflow executions across all workflows."""
    query = """
        SELECT we.*, tw.name AS workflow_name
        FROM workflow_executions we
        JOIN trading_workflows tw ON we.workflow_id = tw.id
        WHERE 1=1
    """
    params: list = []

    if result:
        params.append(result)
        query += f" AND we.result = ${len(params)}"

    params.append(limit)
    query += f" ORDER BY we.created_at DESC LIMIT ${len(params)}"

    rows = await fetch(query, *params)
    return [_row_to_execution(r) for r in rows]


# =================================================================
# LIST / CREATE
# =================================================================

@router.get("", response_model=List[WorkflowResponse], operation_id="buy_list_workflows")
async def list_workflows(
    wallet_alias: Optional[str] = Query(None, description="Filter by wallet alias"),
    type: Optional[str] = Query(None, description="Filter by type: BUY or SELL"),
):
    """List all trading workflows with optional filters."""
    query = """
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        WHERE 1=1
    """
    params: list = []

    if wallet_alias:
        params.append(wallet_alias)
        query += f" AND w.alias = ${len(params)}"

    if type:
        params.append(type)
        query += f" AND tw.type = ${len(params)}"

    query += " ORDER BY tw.created_at DESC"

    rows = await fetch(query, *params)
    return [_row_to_workflow(r) for r in rows]


@router.post("", response_model=WorkflowResponse, status_code=201, operation_id="buy_create_workflow")
async def create_workflow(request: WorkflowCreate):
    """Create a new trading workflow."""
    # Resolve wallet alias to ID
    wallet = await fetchrow(
        "SELECT id FROM wallets WHERE alias = $1", request.wallet_alias
    )
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{request.wallet_alias}' not found")

    row = await fetchrow(
        """
        INSERT INTO trading_workflows
            (wallet_id, name, type, chain, buy_amount_mode, buy_amount_value,
             sell_amount_pct, cooldown_seconds, max_open_positions)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
        RETURNING *
        """,
        wallet["id"],
        request.name,
        request.type.value,
        json.dumps(request.chain),
        request.buy_amount_mode.value if request.buy_amount_mode else None,
        request.buy_amount_value,
        request.sell_amount_pct,
        request.cooldown_seconds,
        request.max_open_positions,
    )

    # Re-fetch with wallet alias joined
    full_row = await fetchrow(
        """
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        WHERE tw.id = $1
        """,
        row["id"],
    )
    return _row_to_workflow(full_row)


# =================================================================
# SINGLE WORKFLOW
# =================================================================

@router.get("/{workflow_id}", response_model=WorkflowResponse, operation_id="buy_get_workflow")
async def get_workflow(workflow_id: str):
    """Get a single workflow by ID."""
    row = await fetchrow(
        """
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        WHERE tw.id = $1::uuid
        """,
        workflow_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")

    return _row_to_workflow(row)


@router.patch("/{workflow_id}", response_model=WorkflowResponse, operation_id="buy_update_workflow")
async def update_workflow(workflow_id: str, request: WorkflowUpdate):
    """Update a workflow's configuration."""
    # Build dynamic SET clause
    sets: list[str] = []
    params: list = []
    idx = 1

    if request.name is not None:
        sets.append(f"name = ${idx}")
        params.append(request.name)
        idx += 1

    if request.chain is not None:
        sets.append(f"chain = ${idx}::jsonb")
        params.append(json.dumps(request.chain))
        idx += 1

    if request.buy_amount_mode is not None:
        sets.append(f"buy_amount_mode = ${idx}")
        params.append(request.buy_amount_mode.value)
        idx += 1

    if request.buy_amount_value is not None:
        sets.append(f"buy_amount_value = ${idx}")
        params.append(request.buy_amount_value)
        idx += 1

    if request.sell_amount_pct is not None:
        sets.append(f"sell_amount_pct = ${idx}")
        params.append(request.sell_amount_pct)
        idx += 1

    if request.cooldown_seconds is not None:
        sets.append(f"cooldown_seconds = ${idx}")
        params.append(request.cooldown_seconds)
        idx += 1

    if request.max_open_positions is not None:
        sets.append(f"max_open_positions = ${idx}")
        params.append(request.max_open_positions)
        idx += 1

    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets.append("updated_at = NOW()")
    params.append(workflow_id)

    query = f"""
        UPDATE trading_workflows
        SET {', '.join(sets)}
        WHERE id = ${idx}::uuid
        RETURNING *
    """

    row = await fetchrow(query, *params)
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Re-fetch with wallet alias
    full_row = await fetchrow(
        """
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        WHERE tw.id = $1
        """,
        row["id"],
    )
    return _row_to_workflow(full_row)


@router.delete("/{workflow_id}", operation_id="buy_delete_workflow")
async def delete_workflow(workflow_id: str):
    """Delete a workflow and all its executions."""
    result = await execute(
        "DELETE FROM trading_workflows WHERE id = $1::uuid", workflow_id
    )
    # asyncpg execute returns a status string like 'DELETE 1'
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Workflow not found")

    return {"status": "success", "message": "Workflow deleted"}


# =================================================================
# TOGGLE ACTIVE
# =================================================================

@router.patch("/{workflow_id}/toggle", response_model=WorkflowResponse, operation_id="buy_toggle_workflow")
async def toggle_workflow(
    workflow_id: str,
    active: bool = Query(..., description="Set active state"),
):
    """Toggle a workflow's active state."""
    row = await fetchrow(
        """
        UPDATE trading_workflows
        SET is_active = $1, updated_at = NOW()
        WHERE id = $2::uuid
        RETURNING *
        """,
        active,
        workflow_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Workflow not found")

    full_row = await fetchrow(
        """
        SELECT tw.*, w.alias AS wallet_alias
        FROM trading_workflows tw
        JOIN wallets w ON tw.wallet_id = w.id
        WHERE tw.id = $1
        """,
        row["id"],
    )
    return _row_to_workflow(full_row)


# =================================================================
# WORKFLOW EXECUTIONS
# =================================================================

@router.get("/{workflow_id}/executions", response_model=List[WorkflowExecutionResponse], operation_id="buy_workflow_executions")
async def get_workflow_executions(
    workflow_id: str,
    limit: int = Query(50, ge=1, le=500),
):
    """Get execution log for a specific workflow."""
    # Verify workflow exists
    exists = await fetchval(
        "SELECT 1 FROM trading_workflows WHERE id = $1::uuid", workflow_id
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Workflow not found")

    rows = await fetch(
        """
        SELECT we.*, tw.name AS workflow_name
        FROM workflow_executions we
        JOIN trading_workflows tw ON we.workflow_id = tw.id
        WHERE we.workflow_id = $1::uuid
        ORDER BY we.created_at DESC
        LIMIT $2
        """,
        workflow_id,
        limit,
    )
    return [_row_to_execution(r) for r in rows]
