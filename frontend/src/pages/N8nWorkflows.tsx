import React, { useState } from 'react';
import { Box, CircularProgress, Tabs, Tab } from '@mui/material';
import {
  AccountTree as WorkflowsIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import WorkflowsGuide from './workflows/WorkflowsGuide';
import FullscreenToggle from '../components/shared/FullscreenToggle';
import useFullscreenStore from '../stores/useFullscreenStore';

const N8N_CREDENTIALS = {
  emailOrLdapLoginId: 'admin@pump.local',
  password: 'PumpAdmin123!',
};

const N8nWorkflows: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [tabValue, setTabValue] = useState(0);
  const isFullscreen = useFullscreenStore((s) => s.isFullscreen);

  React.useEffect(() => {
    // Auto-login to n8n before loading iframe
    fetch('/n8n/rest/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(N8N_CREDENTIALS),
      credentials: 'include',
    })
      .then(() => setReady(true))
      .catch(() => setReady(true)); // show iframe anyway on error
  }, []);

  if (isFullscreen && tabValue === 0 && ready) {
    return (
      <Box sx={{ width: '100%', height: '100vh' }}>
        <iframe
          src="/n8n/"
          title="n8n Workflows"
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </Box>
    );
  }

  return (
    <Box>
      {/* Tab navigation */}
      <Box
        sx={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          mb: tabValue === 1 ? 3 : 0,
          bgcolor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px 8px 0 0',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(_e, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            flex: 1,
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
          <Tab icon={<WorkflowsIcon />} iconPosition="start" label="Workflows" />
          <Tab icon={<InfoIcon />} iconPosition="start" label="Info" />
        </Tabs>
        {tabValue === 0 && <FullscreenToggle title="n8n Workflows" />}
      </Box>

      {/* Tab 0: n8n iframe */}
      {tabValue === 0 && (
        !ready ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 64px - 112px)' }}>
            <CircularProgress sx={{ color: '#00d4ff' }} />
          </Box>
        ) : (
          <Box
            sx={{
              width: '100%',
              height: 'calc(100vh - 64px - 112px)',
              mx: -3,
              mt: 0,
              mb: -4,
            }}
          >
            <iframe
              src="/n8n/"
              title="n8n Workflows"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
              }}
            />
          </Box>
        )
      )}

      {/* Tab 1: Setup Guide */}
      {tabValue === 1 && (
        <Box sx={{ pt: 1 }}>
          <WorkflowsGuide />
        </Box>
      )}
    </Box>
  );
};

export default N8nWorkflows;
