# Trading Sub-Pages Redesign

## Overview
Modernize all 5 trading sub-pages (Wallets, ExecuteTrade, Transfers, Positions, TradeLogs) with EUR prices, useQuery data fetching, consistent StatCards, and shared utilities. Same quality as the just-completed TradingDashboard redesign.

## Shared Changes
- useState+useEffect -> @tanstack/react-query useQuery with refetchInterval
- EUR prices everywhere (primary) with SOL as secondary
- Shared utility file for common helpers
- Consistent glassmorphism card styling matching TradingDashboard
- Exchange rate from existing GET /api/buy/exchange-rate endpoint

## Shared Utilities File
New file: `frontend/src/pages/trading/tradingUtils.ts`
- `fmtEur(n)` - EUR formatting de-DE locale
- `fmtSol(n)` - SOL with 4 decimals
- `truncateMint(mint)` - first 4 + last 4 chars
- `useExchangeRate()` - shared useQuery hook for exchange rate
- Color constants for status/action chips

## Pages

### 1. Wallets.tsx
- useQuery for wallet list + exchange rate
- Top: 3 StatCards (Total Balance EUR, Active/Total Wallets, Avg Balance EUR)
- Balance in EUR (primary) + SOL everywhere
- Donut PieChart: balance distribution across wallets
- Dialogs stay functionally identical, consistent styling

### 2. ExecuteTrade.tsx
- useQuery for wallets + positions
- EUR conversion shown next to SOL input ("~ X.XX EUR")
- Trade result as formatted card instead of raw JSON
- Position cards show entry price in EUR
- Quick-info bar: available balance EUR, open positions count

### 3. Transfers.tsx
- useQuery for wallets + transfer history + exchange rate
- Balance in EUR in wallet selector
- Transfer amounts in EUR
- Transfer history table with EUR values
- Top: Transfer stats (total transferred EUR, transfer count)

### 4. Positions.tsx
- useQuery for wallets + positions + exchange rate
- Top: 3 StatCards (Open Positions, Invested EUR, Avg Entry Price)
- All SOL values also in EUR
- Small BarChart: investment per wallet

### 5. TradeLogs.tsx
- useQuery for wallets + trades + transfers + exchange rate
- Top: 3 StatCards (Total Trades, Volume EUR, Fees EUR)
- All SOL values in EUR in tables
- Summary bar with daily stats
