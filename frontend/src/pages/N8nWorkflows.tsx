import React from 'react';
import { Box, CircularProgress } from '@mui/material';

const N8N_CREDENTIALS = {
  emailOrLdapLoginId: 'admin@pump.local',
  password: 'PumpAdmin123!',
};

const N8nWorkflows: React.FC = () => {
  const [ready, setReady] = React.useState(false);

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

  if (!ready) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 64px - 64px)' }}>
        <CircularProgress sx={{ color: '#00d4ff' }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        height: 'calc(100vh - 64px - 64px)',
        mx: -3,
        mt: -4,
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
  );
};

export default N8nWorkflows;
