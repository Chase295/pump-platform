import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import {
  GridView as PatternIcon,
  CompareArrows as SimilarityIcon,
  Hub as ConfigIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

// Sub-pages
import PatternBrowser from './discovery/PatternBrowser';
import SimilaritySearch from './discovery/SimilaritySearch';
import EmbeddingConfig from './discovery/EmbeddingConfig';
import EmbeddingsInfo from './embeddings/EmbeddingsInfo';

const subNavItems = [
  { path: '/embeddings', label: 'Browse', icon: <PatternIcon />, end: true },
  { path: '/embeddings/similarity', label: 'Similarity', icon: <SimilarityIcon /> },
  { path: '/embeddings/config', label: 'Config', icon: <ConfigIcon /> },
  { path: '/embeddings/info', label: 'Info', icon: <InfoIcon /> },
];

export default function Embeddings() {
  const location = useLocation();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/embeddings') return 0;
    if (path.startsWith('/embeddings/similarity')) return 1;
    if (path.startsWith('/embeddings/config')) return 2;
    if (path.startsWith('/embeddings/info')) return 3;
    return 0;
  };

  return (
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

      <Routes>
        <Route index element={<PatternBrowser />} />
        <Route path="similarity" element={<SimilaritySearch />} />
        <Route path="config" element={<EmbeddingConfig />} />
        <Route path="info" element={<EmbeddingsInfo />} />
      </Routes>
    </Box>
  );
}
