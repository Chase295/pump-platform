# Trading Dashboard Redesign - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Modernize the Test Trading Dashboard with EUR prices, time-series charts (P&L, trade activity), win/loss analytics, fee breakdowns, wallet comparison, and a live trade feed.

**Architecture:** 4 new backend endpoints aggregate data server-side using TimescaleDB time_bucket. Frontend rewrites TradingDashboard.tsx with Recharts charts, @tanstack/react-query for data fetching, and MUI Grid v2 responsive layout. EUR conversion uses existing `exchange_rates` table data.

**Tech Stack:** FastAPI + asyncpg (backend), React + TypeScript + Recharts 3.6 + MUI 7 + @tanstack/react-query 5 (frontend)

---

## Task 1: Backend - Add response schemas for new endpoints

**Files:**
- Modify: `backend/modules/buy/schemas.py` (append after line 265)

**Step 1: Add new Pydantic schemas**

Add these schemas at the end of `backend/modules/buy/schemas.py`:

```python
# =================================================================
# DASHBOARD ANALYTICS SCHEMAS
# =================================================================

class ExchangeRateResponse(BaseModel):
    """Current exchange rates."""
    sol_price_usd: float
    usd_to_eur_rate: float
    sol_price_eur: float
    timestamp: datetime


class PnlBucket(BaseModel):
    """Single time bucket for P&L history."""
    bucket: datetime
    cumulative_pnl_sol: float
    fees_sol: float


class PnlHistoryResponse(BaseModel):
    """P&L history over time."""
    data: list[PnlBucket]
    period: str
    bucket_size: str


class TradeActivityBucket(BaseModel):
    """Single time bucket for trade activity."""
    bucket: datetime
    buy_count: int
    sell_count: int


class TradeActivityResponse(BaseModel):
    """Trade activity over time."""
    data: list[TradeActivityBucket]
    period: str
    bucket_size: str


class TradeAnalyticsResponse(BaseModel):
    """Win/loss analytics and fee breakdown."""
    winning_trades: int
    losing_trades: int
    win_rate: float
    avg_win_sol: float
    avg_loss_sol: float
    profit_factor: float
    total_network_fees_sol: float
    total_jito_tips_sol: float
    total_fees_sol: float
    gross_pnl_sol: float
    net_pnl_sol: float
    best_trade_sol: float
    worst_trade_sol: float
    best_trade_mint: Optional[str] = None
    worst_trade_mint: Optional[str] = None
```

**Step 2: Verify no syntax errors**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform && python -c "from backend.modules.buy.schemas import ExchangeRateResponse, PnlHistoryResponse, TradeActivityResponse, TradeAnalyticsResponse; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/modules/buy/schemas.py
git commit -m "feat(buy): add Pydantic schemas for dashboard analytics endpoints"
```

---

## Task 2: Backend - Add exchange-rate endpoint

**Files:**
- Modify: `backend/modules/buy/router.py` (add import at line 36, add endpoint after line 428)

**Step 1: Update imports in router.py**

Add `ExchangeRateResponse` to the imports from schemas (line 36-49):

```python
from backend.modules.buy.schemas import (
    BuyRequest,
    SellRequest,
    SellAllRequest,
    TransferRequest,
    WalletCreate,
    WalletUpdate,
    WalletResponse,
    TradeResponse,
    TransferResponse,
    PositionResponse,
    TradeLogResponse,
    DashboardStats,
    WalletPerformanceResponse,
    ExchangeRateResponse,
    PnlHistoryResponse,
    PnlBucket,
    TradeActivityResponse,
    TradeActivityBucket,
    TradeAnalyticsResponse,
)
```

Also add `from datetime import date, datetime, timedelta` at line 30 (replace `from datetime import date`).

**Step 2: Add exchange-rate endpoint**

Insert after the dashboard/performance endpoint (after line 428), before the HELPER FUNCTIONS section:

```python
@router.get("/exchange-rate", response_model=ExchangeRateResponse)
async def get_exchange_rate():
    """Get current SOL/EUR exchange rate from exchange_rates table."""
    row = await fetchrow(
        """
        SELECT sol_price_usd, usd_to_eur_rate, created_at
        FROM exchange_rates
        ORDER BY created_at DESC
        LIMIT 1
        """
    )

    if not row:
        raise HTTPException(status_code=404, detail="No exchange rate data available")

    sol_usd = float(row['sol_price_usd'] or 0)
    usd_eur = float(row['usd_to_eur_rate'] or 0)

    return ExchangeRateResponse(
        sol_price_usd=sol_usd,
        usd_to_eur_rate=usd_eur,
        sol_price_eur=round(sol_usd * usd_eur, 6) if usd_eur else 0,
        timestamp=row['created_at']
    )
```

**Step 3: Test via curl**

Run: `curl -s http://localhost:3000/api/buy/exchange-rate | python3 -m json.tool`
Expected: JSON with sol_price_usd, usd_to_eur_rate, sol_price_eur, timestamp

**Step 4: Commit**

```bash
git add backend/modules/buy/router.py
git commit -m "feat(buy): add GET /exchange-rate endpoint"
```

---

## Task 3: Backend - Add P&L history endpoint

**Files:**
- Modify: `backend/modules/buy/router.py` (add after exchange-rate endpoint)

**Step 1: Add pnl-history endpoint**

```python
@router.get("/dashboard/pnl-history", response_model=PnlHistoryResponse)
async def get_pnl_history(
    wallet_type: Optional[str] = Query(None, description="TEST or REAL"),
    period: str = Query("24h", description="24h, 7d, 30d, or all"),
):
    """Get cumulative P&L history bucketed over time."""
    # Determine time range and bucket size
    bucket_map = {"24h": ("1 hour", "1h"), "7d": ("4 hours", "4h"), "30d": ("1 day", "1d"), "all": ("1 day", "1d")}
    bucket_interval, bucket_label = bucket_map.get(period, ("1 hour", "1h"))

    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    wallet_filter = ""
    params: list = []
    if wallet_type:
        wallet_filter = f"AND w.type = ${len(params) + 1}"
        params.append(wallet_type)

    rows = await fetch(f"""
        WITH trade_data AS (
            SELECT
                time_bucket('{bucket_interval}', t.created_at) AS bucket,
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl_sol,
                COALESCE(SUM(COALESCE(t.jito_tip_lamports, 0) / 1000000000.0), 0) +
                COALESCE(SUM(COALESCE(t.network_fee_sol, 0)), 0) AS fees_sol
            FROM trade_logs t
            JOIN wallets w ON t.wallet_id = w.id
            WHERE t.status = 'SUCCESS'
            {time_filter}
            {wallet_filter}
            GROUP BY bucket
            ORDER BY bucket
        )
        SELECT
            bucket,
            SUM(pnl_sol) OVER (ORDER BY bucket) AS cumulative_pnl_sol,
            fees_sol
        FROM trade_data
    """, *params)

    return PnlHistoryResponse(
        data=[
            PnlBucket(
                bucket=r['bucket'],
                cumulative_pnl_sol=float(r['cumulative_pnl_sol'] or 0),
                fees_sol=float(r['fees_sol'] or 0),
            )
            for r in rows
        ],
        period=period,
        bucket_size=bucket_label,
    )
```

**Step 2: Test via curl**

Run: `curl -s "http://localhost:3000/api/buy/dashboard/pnl-history?wallet_type=TEST&period=24h" | python3 -m json.tool`
Expected: JSON with data array of {bucket, cumulative_pnl_sol, fees_sol}

**Step 3: Commit**

```bash
git add backend/modules/buy/router.py
git commit -m "feat(buy): add GET /dashboard/pnl-history endpoint with TimescaleDB time_bucket"
```

---

## Task 4: Backend - Add trade-activity endpoint

**Files:**
- Modify: `backend/modules/buy/router.py` (add after pnl-history endpoint)

**Step 1: Add trade-activity endpoint**

```python
@router.get("/dashboard/trade-activity", response_model=TradeActivityResponse)
async def get_trade_activity(
    wallet_type: Optional[str] = Query(None, description="TEST or REAL"),
    period: str = Query("24h", description="24h, 7d, 30d, or all"),
):
    """Get trade counts (BUY/SELL) bucketed over time."""
    bucket_map = {"24h": ("1 hour", "1h"), "7d": ("4 hours", "4h"), "30d": ("1 day", "1d"), "all": ("1 day", "1d")}
    bucket_interval, bucket_label = bucket_map.get(period, ("1 hour", "1h"))

    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    wallet_filter = ""
    params: list = []
    if wallet_type:
        wallet_filter = f"AND w.type = ${len(params) + 1}"
        params.append(wallet_type)

    rows = await fetch(f"""
        SELECT
            time_bucket('{bucket_interval}', t.created_at) AS bucket,
            COUNT(*) FILTER (WHERE t.action = 'BUY') AS buy_count,
            COUNT(*) FILTER (WHERE t.action = 'SELL') AS sell_count
        FROM trade_logs t
        JOIN wallets w ON t.wallet_id = w.id
        WHERE t.status = 'SUCCESS'
        {time_filter}
        {wallet_filter}
        GROUP BY bucket
        ORDER BY bucket
    """, *params)

    return TradeActivityResponse(
        data=[
            TradeActivityBucket(
                bucket=r['bucket'],
                buy_count=r['buy_count'] or 0,
                sell_count=r['sell_count'] or 0,
            )
            for r in rows
        ],
        period=period,
        bucket_size=bucket_label,
    )
```

**Step 2: Test via curl**

Run: `curl -s "http://localhost:3000/api/buy/dashboard/trade-activity?wallet_type=TEST&period=24h" | python3 -m json.tool`
Expected: JSON with data array of {bucket, buy_count, sell_count}

**Step 3: Commit**

```bash
git add backend/modules/buy/router.py
git commit -m "feat(buy): add GET /dashboard/trade-activity endpoint"
```

---

## Task 5: Backend - Add trade-analytics endpoint

**Files:**
- Modify: `backend/modules/buy/router.py` (add after trade-activity endpoint)

**Step 1: Add trade-analytics endpoint**

Win/loss is determined per closed position: compare total SOL received from SELLs vs total SOL spent on BUYs for each position.

```python
@router.get("/dashboard/trade-analytics", response_model=TradeAnalyticsResponse)
async def get_trade_analytics(
    wallet_type: Optional[str] = Query(None, description="TEST or REAL"),
    period: str = Query("24h", description="24h, 7d, 30d, or all"),
):
    """Get win/loss analytics and fee breakdown."""
    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND p.closed_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""
    fee_time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    wallet_filter = ""
    fee_wallet_filter = ""
    params: list = []
    if wallet_type:
        wallet_filter = f"AND w.type = ${len(params) + 1}"
        fee_wallet_filter = f"AND w2.type = ${len(params) + 1}"
        params.append(wallet_type)

    # Win/loss per closed position
    positions_row = await fetchrow(f"""
        WITH position_pnl AS (
            SELECT
                p.id,
                p.mint,
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl_sol
            FROM positions p
            JOIN wallets w ON p.wallet_id = w.id
            LEFT JOIN trade_logs t ON t.position_id = p.id AND t.status = 'SUCCESS'
            WHERE p.status = 'CLOSED'
            {time_filter}
            {wallet_filter}
            GROUP BY p.id, p.mint
        )
        SELECT
            COUNT(*) FILTER (WHERE pnl_sol > 0) AS winning_trades,
            COUNT(*) FILTER (WHERE pnl_sol <= 0) AS losing_trades,
            COALESCE(AVG(pnl_sol) FILTER (WHERE pnl_sol > 0), 0) AS avg_win_sol,
            COALESCE(AVG(pnl_sol) FILTER (WHERE pnl_sol <= 0), 0) AS avg_loss_sol,
            COALESCE(SUM(pnl_sol) FILTER (WHERE pnl_sol > 0), 0) AS gross_wins,
            ABS(COALESCE(SUM(pnl_sol) FILTER (WHERE pnl_sol <= 0), 0)) AS gross_losses,
            COALESCE(SUM(pnl_sol), 0) AS gross_pnl_sol,
            (SELECT pnl_sol FROM position_pnl ORDER BY pnl_sol DESC LIMIT 1) AS best_trade_sol,
            (SELECT mint FROM position_pnl ORDER BY pnl_sol DESC LIMIT 1) AS best_trade_mint,
            (SELECT pnl_sol FROM position_pnl ORDER BY pnl_sol ASC LIMIT 1) AS worst_trade_sol,
            (SELECT mint FROM position_pnl ORDER BY pnl_sol ASC LIMIT 1) AS worst_trade_mint
        FROM position_pnl
    """, *params)

    # Fee breakdown (independent of positions - uses all trades in period)
    fees_row = await fetchrow(f"""
        SELECT
            COALESCE(SUM(COALESCE(t.network_fee_sol, 0)), 0) AS total_network_fees_sol,
            COALESCE(SUM(COALESCE(t.jito_tip_lamports, 0) / 1000000000.0), 0) AS total_jito_tips_sol
        FROM trade_logs t
        JOIN wallets w2 ON t.wallet_id = w2.id
        WHERE t.status = 'SUCCESS'
        {fee_time_filter}
        {fee_wallet_filter}
    """, *params)

    winning = positions_row['winning_trades'] or 0 if positions_row else 0
    losing = positions_row['losing_trades'] or 0 if positions_row else 0
    total = winning + losing
    gross_wins = float(positions_row['gross_wins'] or 0) if positions_row else 0
    gross_losses = float(positions_row['gross_losses'] or 0) if positions_row else 0
    network_fees = float(fees_row['total_network_fees_sol'] or 0) if fees_row else 0
    jito_tips = float(fees_row['total_jito_tips_sol'] or 0) if fees_row else 0
    total_fees = network_fees + jito_tips
    gross_pnl = float(positions_row['gross_pnl_sol'] or 0) if positions_row else 0

    return TradeAnalyticsResponse(
        winning_trades=winning,
        losing_trades=losing,
        win_rate=round((winning / total * 100) if total > 0 else 0, 1),
        avg_win_sol=float(positions_row['avg_win_sol'] or 0) if positions_row else 0,
        avg_loss_sol=float(positions_row['avg_loss_sol'] or 0) if positions_row else 0,
        profit_factor=round(gross_wins / gross_losses, 2) if gross_losses > 0 else 0,
        total_network_fees_sol=network_fees,
        total_jito_tips_sol=jito_tips,
        total_fees_sol=total_fees,
        gross_pnl_sol=gross_pnl,
        net_pnl_sol=gross_pnl - total_fees,
        best_trade_sol=float(positions_row['best_trade_sol'] or 0) if positions_row else 0,
        worst_trade_sol=float(positions_row['worst_trade_sol'] or 0) if positions_row else 0,
        best_trade_mint=positions_row['best_trade_mint'] if positions_row else None,
        worst_trade_mint=positions_row['worst_trade_mint'] if positions_row else None,
    )
```

**Step 2: Test via curl**

Run: `curl -s "http://localhost:3000/api/buy/dashboard/trade-analytics?wallet_type=TEST&period=24h" | python3 -m json.tool`
Expected: JSON with winning_trades, losing_trades, win_rate, fee breakdown, etc.

**Step 3: Commit**

```bash
git add backend/modules/buy/router.py
git commit -m "feat(buy): add GET /dashboard/trade-analytics endpoint with win/loss and fee breakdown"
```

---

## Task 6: Frontend - Add TypeScript types and API methods

**Files:**
- Modify: `frontend/src/types/buy.ts` (append after line 172)
- Modify: `frontend/src/services/api.ts` (add to buyApi object, lines 200-242)

**Step 1: Add new types to `frontend/src/types/buy.ts`**

Append after line 172:

```typescript
// ============================================================
// Dashboard Analytics
// ============================================================
export interface ExchangeRate {
  sol_price_usd: number;
  usd_to_eur_rate: number;
  sol_price_eur: number;
  timestamp: string;
}

export interface PnlBucket {
  bucket: string;
  cumulative_pnl_sol: number;
  fees_sol: number;
}

export interface PnlHistoryResponse {
  data: PnlBucket[];
  period: string;
  bucket_size: string;
}

export interface TradeActivityBucket {
  bucket: string;
  buy_count: number;
  sell_count: number;
}

export interface TradeActivityResponse {
  data: TradeActivityBucket[];
  period: string;
  bucket_size: string;
}

export interface TradeAnalytics {
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  avg_win_sol: number;
  avg_loss_sol: number;
  profit_factor: number;
  total_network_fees_sol: number;
  total_jito_tips_sol: number;
  total_fees_sol: number;
  gross_pnl_sol: number;
  net_pnl_sol: number;
  best_trade_sol: number;
  worst_trade_sol: number;
  best_trade_mint: string | null;
  worst_trade_mint: string | null;
}
```

**Step 2: Add API methods to `frontend/src/services/api.ts`**

Add these methods inside the `buyApi` object (before the closing `};` at line 242):

```typescript
  // Dashboard analytics
  getExchangeRate: () => api.get('/buy/exchange-rate'),
  getPnlHistory: (walletType?: string, period = '24h') =>
    api.get('/buy/dashboard/pnl-history', { params: { wallet_type: walletType, period } }),
  getTradeActivity: (walletType?: string, period = '24h') =>
    api.get('/buy/dashboard/trade-activity', { params: { wallet_type: walletType, period } }),
  getTradeAnalytics: (walletType?: string, period = '24h') =>
    api.get('/buy/dashboard/trade-analytics', { params: { wallet_type: walletType, period } }),
```

**Step 3: Verify TypeScript compiles**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: No new errors

**Step 4: Commit**

```bash
git add frontend/src/types/buy.ts frontend/src/services/api.ts
git commit -m "feat(frontend): add TypeScript types and API methods for dashboard analytics"
```

---

## Task 7: Frontend - Rewrite TradingDashboard.tsx

**Files:**
- Rewrite: `frontend/src/pages/trading/TradingDashboard.tsx`

This is the main task. The entire file gets replaced. It should import from Recharts, @tanstack/react-query, and use the new API methods.

**Step 1: Write the new TradingDashboard.tsx**

Complete rewrite of `frontend/src/pages/trading/TradingDashboard.tsx` with the following sections:

```typescript
import { useState } from 'react';
import {
  Box, Grid, Card, CardContent, Typography, CircularProgress,
  Chip, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, ToggleButton, ToggleButtonGroup, Alert,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShowChart as ChartIcon,
  Receipt as ReceiptIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { buyApi } from '../../services/api';
import { useTradingContext } from './TradingContext';
import type {
  Wallet, WalletPerformance, ExchangeRate, PnlHistoryResponse,
  TradeActivityResponse, TradeAnalytics, TradeLog,
} from '../../types/buy';
```

**Key implementation details for the rewrite:**

1. **State:** `period` state ('24h' | '7d' | '30d' | 'all')

2. **Queries (useQuery):**
   - `exchangeRate` - refetchInterval: 60000
   - `wallets` - refetchInterval: 10000
   - `performance` - refetchInterval: 10000
   - `pnlHistory` - refetchInterval: 10000, depends on period
   - `tradeActivity` - refetchInterval: 10000, depends on period
   - `tradeAnalytics` - refetchInterval: 10000, depends on period
   - `recentTrades` - refetchInterval: 10000

3. **Helper functions:**
   - `solToEur(sol: number)` - multiply by exchangeRate.sol_price_eur
   - `fmtEur(n: number)` - format as EUR with 2 decimals
   - `fmtSol(n: number)` - format with 4 decimals + " SOL"
   - `fmtPct(n: number)` - format as percentage
   - `truncateMint(mint: string)` - first 4 + last 4 chars
   - `formatBucket(bucket: string)` - format timestamp for chart X-axis

4. **Layout sections (in order):**
   - Header with period toggle (ToggleButtonGroup)
   - 6 KPI StatCards in Grid (xs:6, sm:4, md:2)
   - P&L AreaChart (md:8) + Trade Activity BarChart (md:4)
   - Win/Loss Analysis card with PieChart (md:6) + Fee Breakdown card (md:6)
   - Wallet Performance Table (md:12)
   - Wallet Comparison BarChart (md:6) + Live Trade Feed (md:6)

5. **StatCard component** (inline, same pattern as current):
   - title, mainValue, subValue, icon, color (rgb triplet)

6. **Chart styling:**
   - Dark tooltip: `bgcolor: 'rgba(15, 15, 35, 0.95)'`
   - Grid: `stroke: 'rgba(255,255,255,0.08)'`
   - P&L Area: green gradient above 0, show brutto (dashed line) + netto (solid)
   - Trade bars: green (#4caf50) for BUY, red (#f44336) for SELL, stacked
   - Win/Loss donut: green for wins, red for losses, inner label with win_rate %

7. **Live trade feed:**
   - Uses existing `buyApi.getTradeLogs(undefined, undefined, 10)`
   - Each entry: timestamp | BUY/SELL chip | truncated mint | amount in EUR
   - Compact list with monospace values

8. **Loading state:** Show CircularProgress centered when all primary queries are loading

9. **Empty state:** Show helpful message when no trade data exists yet

**Step 2: Verify it renders**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

Open browser at `http://localhost:3000/test-trading` and verify the dashboard loads.

**Step 3: Commit**

```bash
git add frontend/src/pages/trading/TradingDashboard.tsx
git commit -m "feat(trading): rewrite dashboard with EUR prices, charts, analytics, and live feed"
```

---

## Task 8: Visual polish and responsive testing

**Files:**
- Modify: `frontend/src/pages/trading/TradingDashboard.tsx` (tweaks only)

**Step 1: Test responsive behavior**

- Test at desktop width (1200px+): All 6 stat cards in one row, charts side-by-side
- Test at tablet width (600-959px): Stat cards 3 per row, charts stack
- Test at mobile width (<600px): Stat cards 2 per row, everything stacks

**Step 2: Check edge cases**

- No trades yet (empty state)
- Only BUY trades (no SELLs = no win/loss data)
- Missing exchange rate (SOL-only fallback)
- Single wallet vs multiple wallets

**Step 3: Fix any visual issues found**

Adjust spacing, font sizes, chart dimensions as needed.

**Step 4: Final commit**

```bash
git add frontend/src/pages/trading/TradingDashboard.tsx
git commit -m "fix(trading): responsive polish and edge case handling for dashboard"
```

---

## Summary of all files touched

| File | Action | Task |
|------|--------|------|
| `backend/modules/buy/schemas.py` | Modify (append schemas) | 1 |
| `backend/modules/buy/router.py` | Modify (add 4 endpoints + imports) | 2, 3, 4, 5 |
| `frontend/src/types/buy.ts` | Modify (append types) | 6 |
| `frontend/src/services/api.ts` | Modify (add 4 API methods) | 6 |
| `frontend/src/pages/trading/TradingDashboard.tsx` | Rewrite | 7, 8 |

## Endpoint overview

| Method | Path | Purpose | Task |
|--------|------|---------|------|
| GET | `/api/buy/exchange-rate` | Current SOL/EUR rate | 2 |
| GET | `/api/buy/dashboard/pnl-history` | Cumulative P&L time-series | 3 |
| GET | `/api/buy/dashboard/trade-activity` | BUY/SELL counts over time | 4 |
| GET | `/api/buy/dashboard/trade-analytics` | Win/loss + fee breakdown | 5 |
