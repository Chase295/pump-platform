# Trading UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign Wallets (grid + detail route), Positions (grouped accordion cards), and Logs (tabs + pagination) pages in the trading module.

**Architecture:** Frontend-only for Tasks 1-5, small backend addition for Task 6 (wallet-specific analytics + Jupiter-valued positions). All new components follow existing patterns: MUI Grid v2, CARD_SX styling, dark theme, react-query for data fetching.

**Tech Stack:** React, TypeScript, MUI v6, react-query, recharts, React Router v6, FastAPI (backend)

---

### Task 1: WalletCard Component

**Files:**
- Create: `frontend/src/pages/trading/WalletCard.tsx`

**Step 1: Create WalletCard component**

A card component that displays wallet info in a grid-friendly format. Used by the Wallets grid page.

```tsx
// WalletCard.tsx - Wallet grid card component
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, CardContent, CardActionArea, Typography, Chip, Switch,
  IconButton, LinearProgress, Grid,
} from '@mui/material';
import {
  Edit as EditIcon, Delete as DeleteIcon, Visibility as DetailIcon,
  AccountBalanceWallet as WalletIcon,
} from '@mui/icons-material';
import { useTradingContext } from './TradingContext';
import { fmtEur, fmtSol, STATUS_COLORS, TYPE_COLORS, CARD_SX } from './tradingUtils';
import type { Wallet } from '../../types/buy';

interface WalletCardProps {
  wallet: Wallet;
  solEur: number;
  onToggleTrading: (alias: string, current: boolean) => void;
  onToggleTransfer: (alias: string, current: boolean) => void;
  onEdit: (wallet: Wallet) => void;
  onDelete: (alias: string) => void;
  onAddBalance: (alias: string) => void;
}

export default function WalletCard({
  wallet, solEur, onToggleTrading, onToggleTransfer, onEdit, onDelete, onAddBalance,
}: WalletCardProps) {
  const navigate = useNavigate();
  const ctx = useTradingContext();
  const balance = wallet.type === 'TEST' ? wallet.virtual_sol_balance : wallet.real_sol_balance;
  const lossRatio = wallet.max_consecutive_losses > 0
    ? (wallet.consecutive_losses / wallet.max_consecutive_losses) * 100 : 0;

  return (
    <Card sx={{
      ...CARD_SX,
      height: '100%',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: `0 4px 20px rgba(${ctx.accentColor}, 0.15)`,
      },
    }}>
      {/* Clickable area navigates to detail */}
      <CardActionArea onClick={() => navigate(`${ctx.basePath}/wallets/${wallet.alias}`)}>
        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 1 } }}>
          {/* Header: Alias + Badges */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                p: 0.75, borderRadius: 1.5,
                bgcolor: `rgba(${ctx.accentColor}, 0.15)`,
                color: `rgb(${ctx.accentColor})`, display: 'flex',
              }}>
                <WalletIcon fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                  {wallet.alias}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                  {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Chip label={wallet.status} size="small" sx={{
                bgcolor: STATUS_COLORS[wallet.status]?.bg, color: STATUS_COLORS[wallet.status]?.color, fontWeight: 600, fontSize: '0.65rem',
              }} />
            </Box>
          </Box>

          {/* Balance - prominent */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', lineHeight: 1.2 }}>
              {fmtEur(balance * solEur)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
              {fmtSol(balance)}
            </Typography>
          </Box>

          {/* Mini stats */}
          <Grid container spacing={1} sx={{ mb: 1 }}>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                Losses
              </Typography>
              <Typography variant="body2" sx={{
                fontWeight: 600, fontSize: '0.8rem',
                color: wallet.consecutive_losses >= wallet.max_consecutive_losses ? '#f44336' : '#fff',
              }}>
                {wallet.consecutive_losses}/{wallet.max_consecutive_losses}
              </Typography>
              <LinearProgress variant="determinate" value={Math.min(lossRatio, 100)} sx={{
                mt: 0.5, height: 3, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.1)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: lossRatio >= 100 ? '#f44336' : lossRatio >= 66 ? '#ff9800' : '#4caf50',
                },
              }} />
            </Grid>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                Pain Mode
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                {wallet.virtual_loss_percent}%
              </Typography>
            </Grid>
            <Grid size={4}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                Daily Limit
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                {wallet.max_daily_loss_pct}%
              </Typography>
            </Grid>
          </Grid>
          {wallet.tag && (
            <Chip label={wallet.tag} size="small" sx={{
              bgcolor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', fontSize: '0.65rem', mt: 0.5,
            }} />
          )}
        </CardContent>
      </CardActionArea>

      {/* Non-clickable footer: toggles + actions */}
      <Box sx={{
        px: 2.5, pb: 2, pt: 1,
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mr: 0.5, fontSize: '0.6rem' }}>Trade</Typography>
            <Switch checked={wallet.trading_enabled} onChange={(e) => { e.stopPropagation(); onToggleTrading(wallet.alias, wallet.trading_enabled); }} size="small" />
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', mr: 0.5, fontSize: '0.6rem' }}>Transfer</Typography>
            <Switch checked={wallet.transfer_enabled} onChange={(e) => { e.stopPropagation(); onToggleTransfer(wallet.alias, wallet.transfer_enabled); }} size="small" />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); onEdit(wallet); }} title="Edit">
            <EditIcon sx={{ fontSize: 18 }} />
          </IconButton>
          {wallet.type === 'TEST' && (
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(wallet.alias); }} title="Delete" sx={{ color: '#f44336' }}>
              <DeleteIcon sx={{ fontSize: 18 }} />
            </IconButton>
          )}
        </Box>
      </Box>
    </Card>
  );
}
```

**Step 2: Verify no TS errors**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | head -20`

---

### Task 2: Wallets Grid Page (replace table)

**Files:**
- Modify: `frontend/src/pages/trading/Wallets.tsx` (full rewrite of render section)

**Step 1: Replace table with WalletCard grid**

Keep all existing state, handlers, and dialogs. Replace the table/mobile-cards section (lines 444-602) with a Grid of WalletCards. Remove the mobile card renderer (lines 249-369) since WalletCards are responsive by default.

Key changes:
- Remove `Table*`, `Paper`, `Switch` from MUI imports (no longer needed in main render)
- Remove `renderMobileCard` function
- Remove `isSmall` / `useMediaQuery` / `useTheme` (cards handle their own responsiveness)
- Import `WalletCard` from `./WalletCard`
- Replace the `{isSmall ? ... : <TableContainer>...}` block with:

```tsx
<Grid container spacing={2.5}>
  {wallets.map((wallet) => (
    <Grid key={wallet.id} size={{ xs: 12, sm: 6, lg: 4 }}>
      <WalletCard
        wallet={wallet}
        solEur={solEur}
        onToggleTrading={handleToggleTrading}
        onToggleTransfer={handleToggleTransfer}
        onEdit={handleOpenEdit}
        onDelete={(alias) => setDeleteDialog(alias)}
        onAddBalance={(alias) => setAddBalanceDialog(alias)}
      />
    </Grid>
  ))}
  {wallets.length === 0 && (
    <Grid size={12}>
      <Box sx={{ p: 4, textAlign: 'center', ...CARD_SX, borderRadius: 1 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.4)' }}>No wallets found</Typography>
      </Box>
    </Grid>
  )}
</Grid>
```

**Step 2: Verify build**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | head -20`

---

### Task 3: Backend - Wallet-specific analytics + valued positions endpoints

**Files:**
- Modify: `backend/modules/buy/router.py` - Add 3 new endpoints
- Modify: `frontend/src/services/api.ts` - Add new API methods
- Modify: `frontend/src/types/buy.ts` - Add new types

**Step 1: Add backend endpoints**

Add these endpoints to `router.py` after the existing dashboard endpoints:

1. `GET /api/buy/wallets/{alias}/analytics` - Wallet-specific trade analytics (P&L, win rate, trade count, volume)
2. `GET /api/buy/wallets/{alias}/pnl-history` - Wallet-specific P&L chart data
3. `GET /api/buy/wallets/{alias}/positions-valued` - Open positions enriched with Jupiter current price

For endpoint 1 (analytics), reuse the existing performance query filtered to one wallet:
```python
@router.get("/wallets/{alias}/analytics")
async def get_wallet_analytics(alias: str):
    """Get comprehensive analytics for a single wallet."""
    wallet = await wallet_ops.get_wallet(alias)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")
    wallet_id = wallet['id']

    # Trade stats
    stats = await fetchrow("""
        SELECT
            COUNT(*) FILTER (WHERE action = 'BUY' AND status = 'SUCCESS') AS total_buys,
            COUNT(*) FILTER (WHERE action = 'SELL' AND status = 'SUCCESS') AS total_sells,
            COALESCE(SUM(CASE WHEN action = 'BUY' AND status = 'SUCCESS' THEN amount_sol ELSE 0 END), 0) AS total_buy_volume,
            COALESCE(SUM(CASE WHEN action = 'SELL' AND status = 'SUCCESS' THEN amount_sol ELSE 0 END), 0) AS total_sell_volume,
            COALESCE(SUM(COALESCE(network_fee_sol, 0)), 0) AS total_fees
        FROM trade_logs WHERE wallet_id = $1
    """, wallet_id)

    # Win/loss from closed positions
    pnl = await fetchrow("""
        WITH pos_pnl AS (
            SELECT
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl
            FROM positions p
            LEFT JOIN trade_logs t ON t.position_id = p.id AND t.status = 'SUCCESS'
            WHERE p.wallet_id = $1 AND p.status = 'CLOSED'
            GROUP BY p.id
        )
        SELECT
            COUNT(*) FILTER (WHERE pnl > 0) AS wins,
            COUNT(*) FILTER (WHERE pnl <= 0) AS losses,
            COALESCE(SUM(pnl), 0) AS total_pnl
        FROM pos_pnl
    """, wallet_id)

    wins = pnl['wins'] or 0 if pnl else 0
    losses = pnl['losses'] or 0 if pnl else 0
    total = wins + losses

    return {
        "total_buys": stats['total_buys'] or 0,
        "total_sells": stats['total_sells'] or 0,
        "total_trades": (stats['total_buys'] or 0) + (stats['total_sells'] or 0),
        "total_volume_sol": float(stats['total_buy_volume'] or 0) + float(stats['total_sell_volume'] or 0),
        "total_fees_sol": float(stats['total_fees'] or 0),
        "wins": wins,
        "losses": losses,
        "win_rate": round((wins / total * 100) if total > 0 else 0, 1),
        "total_pnl_sol": float(pnl['total_pnl'] or 0) if pnl else 0,
    }
```

For endpoint 2 (pnl-history), adapt the existing pnl-history query to filter by wallet alias:
```python
@router.get("/wallets/{alias}/pnl-history")
async def get_wallet_pnl_history(
    alias: str,
    period: str = Query("7d", description="24h, 7d, 30d, or all"),
):
    """Get P&L history for a specific wallet."""
    wallet = await wallet_ops.get_wallet(alias)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

    bucket_map = {"24h": ("1 hour", "1h"), "7d": ("4 hours", "4h"), "30d": ("1 day", "1d"), "all": ("1 day", "1d")}
    bucket_interval, bucket_label = bucket_map.get(period, ("1 hour", "1h"))
    period_map = {"24h": "24 hours", "7d": "7 days", "30d": "30 days"}
    time_filter = f"AND t.created_at > NOW() - INTERVAL '{period_map[period]}'" if period in period_map else ""

    rows = await fetch(f"""
        WITH trade_data AS (
            SELECT
                time_bucket('{bucket_interval}', t.created_at) AS bucket,
                COALESCE(SUM(CASE WHEN t.action = 'SELL' THEN t.amount_sol ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.action = 'BUY' THEN t.amount_sol ELSE 0 END), 0) AS pnl_sol,
                COALESCE(SUM(COALESCE(t.network_fee_sol, 0)), 0) AS fees_sol
            FROM trade_logs t
            WHERE t.wallet_id = $1 AND t.status = 'SUCCESS' {time_filter}
            GROUP BY bucket ORDER BY bucket
        )
        SELECT bucket, SUM(pnl_sol) OVER (ORDER BY bucket) AS cumulative_pnl_sol, fees_sol
        FROM trade_data
    """, wallet['id'])

    return {
        "data": [{"bucket": r['bucket'], "cumulative_pnl_sol": float(r['cumulative_pnl_sol'] or 0), "fees_sol": float(r['fees_sol'] or 0)} for r in rows],
        "period": period, "bucket_size": bucket_label,
    }
```

For endpoint 3 (valued positions), get open positions and enrich with Jupiter quotes:
```python
@router.get("/wallets/{alias}/positions-valued")
async def get_wallet_positions_valued(alias: str):
    """Get open positions with current Jupiter valuations."""
    from backend.modules.buy.jupiter_client import JupiterClient

    wallet = await wallet_ops.get_wallet(alias)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"Wallet '{alias}' not found")

    positions = await position_ops.get_open_positions(alias)
    result = []

    for pos in positions:
        current_value_sol = None
        unrealized_pnl_sol = None
        try:
            quote = await JupiterClient.get_sell_quote(
                token_mint=pos['mint'],
                token_amount=pos['tokens_held'],
                slippage_bps=100,
            )
            if quote and quote.get('out_amount'):
                current_value_sol = float(quote['out_amount']) / 1e9
                unrealized_pnl_sol = current_value_sol - float(pos['initial_sol_spent'])
        except Exception:
            pass

        result.append({
            **_position_to_response(pos).model_dump(),
            "current_value_sol": current_value_sol,
            "unrealized_pnl_sol": unrealized_pnl_sol,
        })

    return result
```

**Step 2: Add frontend API methods and types**

Add to `frontend/src/services/api.ts` in the `buyApi` object:
```ts
getWalletAnalytics: (alias: string) => api.get(`/buy/wallets/${alias}/analytics`),
getWalletPnlHistory: (alias: string, period = '7d') =>
  api.get(`/buy/wallets/${alias}/pnl-history`, { params: { period } }),
getWalletPositionsValued: (alias: string) => api.get(`/buy/wallets/${alias}/positions-valued`),
```

Add to `frontend/src/types/buy.ts`:
```ts
export interface WalletAnalytics {
  total_buys: number;
  total_sells: number;
  total_trades: number;
  total_volume_sol: number;
  total_fees_sol: number;
  wins: number;
  losses: number;
  win_rate: number;
  total_pnl_sol: number;
}

export interface ValuedPosition extends Position {
  current_value_sol: number | null;
  unrealized_pnl_sol: number | null;
}
```

**Step 3: Verify backend starts**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform && docker compose up -d backend && sleep 5 && docker compose logs backend --tail 20`

---

### Task 4: WalletDetail Page

**Files:**
- Create: `frontend/src/pages/trading/WalletDetail.tsx`
- Modify: `frontend/src/pages/trading/TradingShell.tsx` - Add route

**Step 1: Create WalletDetail component**

Full detail page for a single wallet with: header, risk settings (edit mode), performance KPIs, P&L chart, valued open positions, trade history.

Uses:
- `useParams()` for alias from URL
- `buyApi.getWallet(alias)` for wallet data
- `buyApi.getWalletAnalytics(alias)` for KPIs
- `buyApi.getWalletPnlHistory(alias, period)` for chart
- `buyApi.getWalletPositionsValued(alias)` for positions with live prices
- `buyApi.getTradeLogs(alias)` for trade history

The component should include:
- Back button that navigates to `${ctx.basePath}/wallets`
- Header section with wallet info, copyable address, status/type badges
- Risk & Settings section with edit mode toggle
- 4 KPI stat cards (Total P&L, Win Rate, Total Trades, Volume)
- P&L area chart with period selector (24h/7d/30d/all)
- Open Positions cards with current value, unrealized P&L (green/red), quick-sell button
- Trade history table with pagination (25 per page)

**Step 2: Add route in TradingShell.tsx**

Add import and route:
```tsx
import WalletDetail from './WalletDetail';
// In Routes:
<Route path="wallets/:alias" element={<WalletDetail />} />
```

The route must be BEFORE the catch-all `wallets` route so it matches first.

**Step 3: Verify build**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | head -20`

---

### Task 5: Positions Page Redesign (Grouped Accordion + Cards)

**Files:**
- Modify: `frontend/src/pages/trading/Positions.tsx` (full rewrite)

**Step 1: Rewrite Positions page**

Replace the flat table with:
1. Keep stat cards at top
2. Keep filters (wallet, status)
3. Group positions by wallet using MUI Accordion
4. Each Accordion header: wallet alias, count of open positions, total investment EUR
5. Inside each Accordion: Grid of position cards (xs:12, sm:6, lg:4)
6. Each card shows: mint (truncated), status badge, invested EUR+SOL, entry price, date, quick-sell button (OPEN only)

Key implementation:
- Group `filteredPositions` by `wallet_id` using `Map`
- For each wallet group, render an Accordion
- Position card is inline (no separate component needed since it's simpler than WalletCard)
- Quick-sell navigates to `${ctx.basePath}/execute` with query params for pre-fill (or just navigate)

**Step 2: Verify build**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | head -20`

---

### Task 6: TradeLogs Page Redesign (Tabs + Pagination)

**Files:**
- Modify: `frontend/src/pages/trading/TradeLogs.tsx` (rewrite)

**Step 1: Rewrite TradeLogs with tabs and pagination**

Replace stacked tables with:
1. Keep stat cards at top
2. Keep filters (wallet, action) - action filter only visible on Trades tab
3. Add MUI Tabs: "Trades" | "Transfers"
4. Each tab shows its own table with pagination
5. Pagination component at bottom: rows per page selector (25/50/100), page navigation, "Showing X-Y of Z" text
6. Use MUI TablePagination component

Key changes:
- Add `activeTab` state (0=trades, 1=transfers)
- Add `page` and `rowsPerPage` state for each tab
- Slice data client-side: `tradeLogs.slice(page * rowsPerPage, (page + 1) * rowsPerPage)`
- Reset page to 0 when filters change
- Remove the "Transfer History" section that's currently bolted below

**Step 2: Verify build**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit 2>&1 | head -20`

---

### Task 7: Final Integration Test

**Step 1: Full build check**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform/frontend && npx tsc --noEmit`

**Step 2: Docker rebuild and visual verification**

Run: `cd /Users/moritzhaslbeck/Desktop/Projekte/pump-project/pump-platform && docker compose up -d --build`

Check:
- Wallets page shows grid of cards
- Clicking a card navigates to wallet detail
- Wallet detail shows all sections
- Positions page shows accordions with cards
- Logs page shows tabs with pagination
