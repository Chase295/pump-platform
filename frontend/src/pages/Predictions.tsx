import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import {
  ViewList as ModelsIcon,
  CloudDownload as ImportIcon,
  Notifications as AlertsIcon,
} from '@mui/icons-material';

// Sub-pages
import PredictionsOverview from './predictions/PredictionsOverview';
import ModelImport from './predictions/ModelImport';
import PredictionModelDetails from './predictions/PredictionModelDetails';
import AlertSystem from './predictions/AlertSystem';
import AlertConfig from './predictions/AlertConfig';
import CoinDetails from './predictions/CoinDetails';
import ModelLogs from './predictions/ModelLogs';

const subNavItems = [
  { path: '/predictions', label: 'Models', icon: <ModelsIcon />, end: true },
  { path: '/predictions/import', label: 'Import', icon: <ImportIcon /> },
  { path: '/predictions/alerts', label: 'Alerts', icon: <AlertsIcon /> },
];

export default function Predictions() {
  const location = useLocation();

  // Determine active tab index from current path
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/predictions') return 0;
    if (path.startsWith('/predictions/import')) return 1;
    if (path.startsWith('/predictions/alerts')) return 2;
    // Detail pages - keep Models tab active
    if (path.startsWith('/predictions/models')) return 0;
    if (path.startsWith('/predictions/logs')) return 0;
    if (path.startsWith('/predictions/coin')) return 0;
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
        <Route index element={<PredictionsOverview />} />
        <Route path="import" element={<ModelImport />} />
        <Route path="models/:id" element={<PredictionModelDetails />} />
        <Route path="alerts" element={<AlertSystem />} />
        <Route path="alerts/config/:id" element={<AlertConfig />} />
        <Route path="logs/:id" element={<ModelLogs />} />
        <Route path="coin/:modelId/:coinId" element={<CoinDetails />} />
      </Routes>
    </Box>
  );
}
