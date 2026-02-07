import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AccountBalanceWallet as WalletsIcon,
  SwapHoriz as TradeIcon,
  Send as TransferIcon,
  Inventory as PositionsIcon,
  History as LogsIcon,
} from '@mui/icons-material';

// Sub-pages
import TradingDashboard from './trading/TradingDashboard';
import Wallets from './trading/Wallets';
import ExecuteTrade from './trading/ExecuteTrade';
import Transfers from './trading/Transfers';
import Positions from './trading/Positions';
import TradeLogs from './trading/TradeLogs';

const subNavItems = [
  { path: '/trading', label: 'Dashboard', icon: <DashboardIcon />, end: true },
  { path: '/trading/wallets', label: 'Wallets', icon: <WalletsIcon /> },
  { path: '/trading/execute', label: 'Trade', icon: <TradeIcon /> },
  { path: '/trading/transfers', label: 'Transfers', icon: <TransferIcon /> },
  { path: '/trading/positions', label: 'Positions', icon: <PositionsIcon /> },
  { path: '/trading/logs', label: 'Logs', icon: <LogsIcon /> },
];

export default function Trading() {
  const location = useLocation();

  // Determine active tab index from current path
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/trading') return 0;
    if (path.startsWith('/trading/wallets')) return 1;
    if (path.startsWith('/trading/execute')) return 2;
    if (path.startsWith('/trading/transfers')) return 3;
    if (path.startsWith('/trading/positions')) return 4;
    if (path.startsWith('/trading/logs')) return 5;
    return 0;
  };

  return (
    <Box>
      {/* Sub-navigation tabs */}
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
              '&.Mui-selected': {
                color: '#00d4ff',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#00d4ff',
            },
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

      {/* Nested routes */}
      <Routes>
        <Route index element={<TradingDashboard />} />
        <Route path="wallets" element={<Wallets />} />
        <Route path="execute" element={<ExecuteTrade />} />
        <Route path="transfers" element={<Transfers />} />
        <Route path="positions" element={<Positions />} />
        <Route path="logs" element={<TradeLogs />} />
      </Routes>
    </Box>
  );
}
