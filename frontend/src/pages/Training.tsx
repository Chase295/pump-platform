import React from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Box, Tabs, Tab } from '@mui/material';
import {
  ViewList as ModelsIcon,
  Add as CreateIcon,
  Assessment as TestResultsIcon,
  CompareArrows as CompareIcon,
  Work as JobsIcon,
} from '@mui/icons-material';

// Sub-pages
import TrainingOverview from './training/TrainingOverview';
import CreateModel from './training/CreateModel';
import ModelDetails from './training/ModelDetails';
import TestResults from './training/TestResults';
import TestResultDetails from './training/TestResultDetails';
import Comparisons from './training/Comparisons';
import CompareDetails from './training/CompareDetails';
import Jobs from './training/Jobs';

const subNavItems = [
  { path: '/training', label: 'Models', icon: <ModelsIcon />, end: true },
  { path: '/training/new', label: 'Create', icon: <CreateIcon /> },
  { path: '/training/test-results', label: 'Test Results', icon: <TestResultsIcon /> },
  { path: '/training/comparisons', label: 'Comparisons', icon: <CompareIcon /> },
  { path: '/training/jobs', label: 'Jobs', icon: <JobsIcon /> },
];

export default function Training() {
  const location = useLocation();

  // Determine active tab index from current path
  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/training') return 0;
    if (path.startsWith('/training/new')) return 1;
    if (path.startsWith('/training/test-results')) return 2;
    if (path.startsWith('/training/comparisons')) return 3;
    if (path.startsWith('/training/jobs')) return 4;
    // Model details pages - keep Models tab active
    if (path.startsWith('/training/models')) return 0;
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
        <Route index element={<TrainingOverview />} />
        <Route path="new" element={<CreateModel />} />
        <Route path="models/:id" element={<ModelDetails />} />
        <Route path="test-results" element={<TestResults />} />
        <Route path="test-results/:id" element={<TestResultDetails />} />
        <Route path="comparisons" element={<Comparisons />} />
        <Route path="comparisons/:id" element={<CompareDetails />} />
        <Route path="jobs" element={<Jobs />} />
      </Routes>
    </Box>
  );
}
