import React from 'react';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Chip,
  Paper,
  Alert,
  LinearProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Timeline as TimelineIcon,
  Storage as StorageIcon,
  SwapHoriz as SwapHorizIcon,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { findApi } from '../../services/api';
import type { FindHealthResponse, FindConfigResponse } from '../../types/find';

const DiscoveryOverview: React.FC = () => {
  const {
    data: health,
    error: healthError,
    isLoading: healthLoading,
  } = useQuery<FindHealthResponse>({
    queryKey: ['find', 'health'],
    queryFn: async () => {
      const res = await findApi.getHealth();
      return res.data;
    },
    refetchInterval: 5000,
  });

  const { data: config } = useQuery<FindConfigResponse>({
    queryKey: ['find', 'config'],
    queryFn: async () => {
      const res = await findApi.getConfig();
      return res.data;
    },
    refetchInterval: 30000,
  });

  const isServiceHealthy = health ? health.status === 'healthy' : false;

  const uptimeFormatted = React.useMemo(() => {
    if (!health?.uptime_seconds) return 'N/A';
    const uptime = health.uptime_seconds;
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }, [health?.uptime_seconds]);

  if (healthLoading && !health) {
    return (
      <Box sx={{ mt: 4, mb: 4 }}>
        <LinearProgress />
        <Typography variant="h6" sx={{ mt: 2, textAlign: 'center' }}>
          Loading service status...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {healthError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {healthError instanceof Error ? healthError.message : 'Failed to fetch health data'}
        </Alert>
      )}

      {/* Service Status Overview */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 }, mb: 3 }}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Service Status
                </Typography>
                <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                  {isServiceHealthy ? 'Healthy' : 'Degraded'}
                </Typography>
              </Box>
              {isServiceHealthy ? (
                <CheckCircleIcon color="success" sx={{ fontSize: { xs: 32, md: 40 } }} />
              ) : (
                <ErrorIcon color="error" sx={{ fontSize: { xs: 32, md: 40 } }} />
              )}
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Uptime
                </Typography>
                <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' } }}>
                  {uptimeFormatted}
                </Typography>
              </Box>
              <TimelineIcon color="primary" sx={{ fontSize: { xs: 32, md: 40 } }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  WebSocket
                </Typography>
                <Chip
                  label={health?.ws_connected ? 'Connected' : 'Disconnected'}
                  color={health?.ws_connected ? 'success' : 'error'}
                  size="small"
                />
              </Box>
              <SwapHorizIcon color="primary" sx={{ fontSize: { xs: 32, md: 40 } }} />
            </Box>
          </CardContent>
        </Card>

        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Box display="flex" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography color="textSecondary" gutterBottom>
                  Database
                </Typography>
                <Chip
                  label={health?.db_connected ? 'Connected' : 'Disconnected'}
                  color={health?.db_connected ? 'success' : 'error'}
                  size="small"
                />
              </Box>
              <StorageIcon color="primary" sx={{ fontSize: { xs: 32, md: 40 } }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Cache & Discovery Stats */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 }, mb: 3 }}>
        <Paper sx={{ p: { xs: 1.5, md: 2 }, flex: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Cache Statistics
          </Typography>
          {health ? (
            <Box>
              <Typography>
                Total Coins: <strong>{health.cache_stats?.total_coins || 0}</strong>
              </Typography>
              <Typography>
                Activated: <strong>{health.cache_stats?.activated_coins || 0}</strong>
              </Typography>
              <Typography>
                Expired: <strong>{health.cache_stats?.expired_coins || 0}</strong>
              </Typography>
              <Typography>
                Oldest Cache: <strong>{health.cache_stats?.oldest_age_seconds || 0}s</strong>
              </Typography>
            </Box>
          ) : (
            <Typography color="textSecondary">
              Loading data...
            </Typography>
          )}
        </Paper>

        <Paper sx={{ p: { xs: 1.5, md: 2 }, flex: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Discovery Statistics
          </Typography>
          {health?.discovery_stats && (
            <Box>
              <Typography>
                Coins Discovered: <strong>{health.discovery_stats.total_coins_discovered}</strong>
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                <Typography sx={{ mr: 1 }}>
                  n8n Status:
                </Typography>
                <Chip
                  label={health.discovery_stats.n8n_available ? 'Available' : 'Unavailable'}
                  color={health.discovery_stats.n8n_available ? 'success' : 'warning'}
                  size="small"
                />
              </Box>
              <Typography sx={{ mt: 1 }}>
                n8n Buffer: <strong>{health.discovery_stats.n8n_buffer_size || 0}</strong> coins waiting
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Tracking Stats */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 2, md: 3 }, mb: 3 }}>
        <Paper sx={{ p: { xs: 1.5, md: 2 }, flex: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Tracking Statistics
          </Typography>
          {health?.tracking_stats && (
            <Box>
              <Typography>
                Active Coins: <strong>{health.tracking_stats.active_coins}</strong>
              </Typography>
              <Typography>
                Total Trades: <strong>{health.tracking_stats.total_trades.toLocaleString()}</strong>
              </Typography>
              <Typography>
                Metrics Saved: <strong>{health.tracking_stats.total_metrics_saved.toLocaleString()}</strong>
              </Typography>
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: { xs: 1.5, md: 2 }, flex: 1 }}>
          <Typography variant="h6" gutterBottom sx={{ fontSize: { xs: '1rem', md: '1.25rem' } }}>
            Service Configuration
          </Typography>
          {config && (
            <Box>
              <Typography variant="body2" color="textSecondary">
                Cache Time: <strong>{config.coin_cache_seconds}s</strong>
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Batch Size: <strong>{config.batch_size}</strong>
              </Typography>
              <Typography variant="body2" color="textSecondary">
                DB Refresh: <strong>{config.db_refresh_interval}s</strong>
              </Typography>
            </Box>
          )}
        </Paper>
      </Box>

      {/* Error Display */}
      {health?.last_error && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>Last Error:</strong> {health.last_error}
          </Typography>
        </Alert>
      )}

      <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
        Last update: {health ? new Date().toLocaleTimeString() : 'N/A'} (auto-refresh every 5s)
      </Typography>
    </Box>
  );
};

export default DiscoveryOverview;
