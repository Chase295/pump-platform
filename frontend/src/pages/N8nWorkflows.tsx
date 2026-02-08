import React, { useState } from 'react';
import { Box, CircularProgress, Tabs, Tab } from '@mui/material';
import {
  AccountTree as WorkflowsIcon,
  MenuBook as GuideIcon,
} from '@mui/icons-material';
import WorkflowsGuide from './workflows/WorkflowsGuide';

const N8N_CREDENTIALS = {
  emailOrLdapLoginId: 'admin@pump.local',
  password: 'PumpAdmin123!',
};

const N8nWorkflows: React.FC = () => {
  const [ready, setReady] = React.useState(false);
  const [tabValue, setTabValue] = useState(0);

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

  return (
    <Box>
      {/* Tab navigation */}
      <Box
        sx={{
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          mb: tabValue === 1 ? 3 : 0,
          bgcolor: 'rgba(255, 255, 255, 0.02)',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <Tabs
          value={tabValue}
          onChange={(_e, v) => setTabValue(v)}
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
          <Tab icon={<WorkflowsIcon />} iconPosition="start" label="Workflows" />
          <Tab icon={<GuideIcon />} iconPosition="start" label="Setup Guide" />
        </Tabs>
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
