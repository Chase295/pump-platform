import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AccountBalanceWallet as WalletsIcon,
  SwapHoriz as TradeIcon,
  Send as TransferIcon,
  Inventory as PositionsIcon,
  History as LogsIcon,
  AutoFixHigh as WorkflowIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { TradingContext } from './TradingContext';
import type { WalletType } from '../../types/buy';

import TradingDashboard from './TradingDashboard';
import Wallets from './Wallets';
import WalletDetail from './WalletDetail';
import ExecuteTrade from './ExecuteTrade';
import Transfers from './Transfers';
import Positions from './Positions';
import TradeLogs from './TradeLogs';
import TradingInfo from './TradingInfo';
import Workflows from './Workflows';
import CoinTradeDetail from './CoinTradeDetail';

interface TradingShellProps {
  walletType: WalletType;
  basePath: string;
  accentColor: string;
  label: string;
}

export default function TradingShell({ walletType, basePath, accentColor, label }: TradingShellProps) {
  const location = useLocation();

  const subNavItems = [
    { path: basePath, label: 'Dashboard', icon: <DashboardIcon />, end: true },
    { path: `${basePath}/wallets`, label: 'Wallets', icon: <WalletsIcon /> },
    { path: `${basePath}/execute`, label: 'Trade', icon: <TradeIcon /> },
    { path: `${basePath}/transfers`, label: 'Transfers', icon: <TransferIcon /> },
    { path: `${basePath}/positions`, label: 'Positions', icon: <PositionsIcon /> },
    { path: `${basePath}/logs`, label: 'Logs', icon: <LogsIcon /> },
    { path: `${basePath}/workflows`, label: 'Workflows', icon: <WorkflowIcon /> },
    { path: `${basePath}/info`, label: 'Info', icon: <InfoIcon /> },
  ];

  const getActiveTab = (): number | false => {
    const path = location.pathname;
    if (path.startsWith(`${basePath}/coin/`)) return false;
    if (path === basePath) return 0;
    if (path.startsWith(`${basePath}/wallets`)) return 1;
    if (path.startsWith(`${basePath}/execute`)) return 2;
    if (path.startsWith(`${basePath}/transfers`)) return 3;
    if (path.startsWith(`${basePath}/positions`)) return 4;
    if (path.startsWith(`${basePath}/logs`)) return 5;
    if (path.startsWith(`${basePath}/workflows`)) return 6;
    if (path.startsWith(`${basePath}/info`)) return 7;
    return 0;
  };

  const indicatorColor = `rgb(${accentColor})`;

  return (
    <TradingContext.Provider value={{ walletType, basePath, accentColor, label }}>
      <Box>
        <Box
          sx={{
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            mb: 3,
            bgcolor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: '8px 8px 0 0',
          }}
        >
          <Tabs
            value={getActiveTab()}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              '& .MuiTab-root': {
                color: 'rgba(255, 255, 255, 0.6)',
                textTransform: 'none',
                fontWeight: 500,
                minHeight: 48,
                '&.Mui-selected': { color: indicatorColor },
              },
              '& .MuiTabs-indicator': { backgroundColor: indicatorColor },
            }}
          >
            {subNavItems.map((item) => (
              <Tab
                key={item.path}
                component={NavLink}
                to={item.path}
                end={item.end}
                icon={item.icon}
                iconPosition="start"
                label={item.label}
              />
            ))}
          </Tabs>
        </Box>

        <Routes>
          <Route index element={<TradingDashboard />} />
          <Route path="coin/:mint" element={<CoinTradeDetail />} />
          <Route path="wallets/:alias" element={<WalletDetail />} />
          <Route path="wallets" element={<Wallets />} />
          <Route path="execute" element={<ExecuteTrade />} />
          <Route path="transfers" element={<Transfers />} />
          <Route path="positions" element={<Positions />} />
          <Route path="logs" element={<TradeLogs />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="info" element={<TradingInfo />} />
        </Routes>
      </Box>
    </TradingContext.Provider>
  );
}
