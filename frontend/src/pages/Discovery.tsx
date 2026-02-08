import React, { useState } from 'react';
import {
  Container,
  Typography,
  Box,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Schedule as ScheduleIcon,
  ListAlt as StreamIcon,
  Settings as SettingsIcon,
  Info as InfoIcon,
} from '@mui/icons-material';

// Sub-components
import DiscoveryOverview from './discovery/DiscoveryOverview';
import Phases from './discovery/Phases';
import Streams from './discovery/Streams';
import FindConfig from './discovery/FindConfig';
import DiscoveryInfo from './discovery/DiscoveryInfo';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`discovery-tabpanel-${index}`}
      aria-labelledby={`discovery-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `discovery-tab-${index}`,
    'aria-controls': `discovery-tabpanel-${index}`,
  };
}

export default function Discovery() {
  const [tabValue, setTabValue] = useState(0);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: { xs: 1, sm: 2 }, mb: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ fontSize: { xs: '1.5rem', md: '2.125rem' } }}>
        Discovery (pump-find)
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          aria-label="Discovery module tabs"
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            '& .MuiTab-root': {
              minHeight: { xs: 48, md: 56 },
              textTransform: 'none',
              fontSize: { xs: '0.8rem', md: '0.9rem' },
            },
            '& .Mui-selected': {
              color: '#00d4ff',
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#00d4ff',
            },
          }}
        >
          <Tab icon={<DashboardIcon />} iconPosition="start" label="Overview" {...a11yProps(0)} />
          <Tab icon={<ScheduleIcon />} iconPosition="start" label="Phases" {...a11yProps(1)} />
          <Tab icon={<StreamIcon />} iconPosition="start" label="Streams" {...a11yProps(2)} />
          <Tab icon={<SettingsIcon />} iconPosition="start" label="Config" {...a11yProps(3)} />
          <Tab icon={<InfoIcon />} iconPosition="start" label="Info" {...a11yProps(4)} />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <DiscoveryOverview />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <Phases />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <Streams />
      </TabPanel>
      <TabPanel value={tabValue} index={3}>
        <FindConfig />
      </TabPanel>
      <TabPanel value={tabValue} index={4}>
        <DiscoveryInfo />
      </TabPanel>
    </Container>
  );
}
