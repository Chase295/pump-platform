import React, { useState, useMemo } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Security as SecurityIcon } from '@mui/icons-material';
import { oauthApi } from '../services/api';

const OAuthAuthorize: React.FC = () => {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);

  const clientId = params.get('client_id') || '';
  const redirectUri = params.get('redirect_uri') || '';
  const state = params.get('state') || '';
  const scope = params.get('scope') || '';
  const codeChallenge = params.get('code_challenge') || '';
  const codeChallengeMethod = params.get('code_challenge_method') || '';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const missingParams = !clientId || !redirectUri;

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }

    setLoading(true);
    try {
      const response = await oauthApi.approve({
        username,
        password,
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope,
        code_challenge: codeChallenge,
        code_challenge_method: codeChallengeMethod,
      });
      window.location.href = response.data.redirect_url;
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } };
      setError(
        axiosError.response?.data?.detail || 'Authorization failed. Please check your credentials.',
      );
      setLoading(false);
    }
  };

  const handleDeny = () => {
    const url = new URL(redirectUri);
    url.searchParams.set('error', 'access_denied');
    if (state) {
      url.searchParams.set('state', state);
    }
    window.location.href = url.toString();
  };

  if (missingParams) {
    return (
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Card
          sx={{
            width: '100%',
            maxWidth: 400,
            mx: 2,
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 3,
          }}
        >
          <CardContent sx={{ p: 4 }}>
            <Alert severity="error">
              Invalid OAuth request. Missing required parameters: client_id and redirect_uri.
            </Alert>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 440,
          mx: 2,
          background: 'rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 3,
        }}
      >
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <SecurityIcon sx={{ fontSize: 40, color: '#00d4ff', mb: 1 }} />
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                color: '#00d4ff',
                mb: 0.5,
              }}
            >
              Pump Platform
            </Typography>
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Authorize Application
            </Typography>
          </Box>

          <Box
            sx={{
              mb: 3,
              p: 2,
              borderRadius: 2,
              background: 'rgba(0, 212, 255, 0.05)',
              border: '1px solid rgba(0, 212, 255, 0.15)',
            }}
          >
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mb: 1 }}>
              Application requesting access:
            </Typography>
            <Typography variant="body1" sx={{ fontWeight: 600, color: '#fff', mb: 1.5 }}>
              {clientId}
            </Typography>
            {scope && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.7)', mr: 1, alignSelf: 'center' }}>
                  Scope:
                </Typography>
                {scope.split(' ').map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    size="small"
                    sx={{
                      backgroundColor: 'rgba(0, 212, 255, 0.15)',
                      color: '#00d4ff',
                      borderColor: 'rgba(0, 212, 255, 0.3)',
                      border: '1px solid',
                    }}
                  />
                ))}
              </Box>
            )}
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleAuthorize}>
            <TextField
              fullWidth
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              sx={{ mb: 2 }}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              sx={{ mb: 3 }}
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                size="large"
                onClick={handleDeny}
                disabled={loading}
                sx={{
                  flex: 1,
                  py: 1.5,
                  fontWeight: 600,
                  borderColor: 'rgba(255, 255, 255, 0.3)',
                  color: 'rgba(255, 255, 255, 0.7)',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  },
                }}
              >
                Deny
              </Button>
              <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SecurityIcon />}
                sx={{
                  flex: 1,
                  py: 1.5,
                  fontWeight: 600,
                  backgroundColor: '#00d4ff',
                  color: '#0f0f23',
                  '&:hover': {
                    backgroundColor: '#00b8d9',
                  },
                }}
              >
                {loading ? 'Authorizing...' : 'Authorize'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default OAuthAuthorize;
