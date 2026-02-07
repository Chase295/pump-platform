/**
 * AlertSystem Page
 * Overview of the alert system with real statistics per model.
 * Migrated from pump-server/frontend/src/pages/AlertSystem.tsx
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Typography,
  Box,
  Card,
  CardContent,
  Alert,
  Chip,
  Button,
  LinearProgress,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as SuccessIcon,
  Cancel as FailedIcon,
  HourglassEmpty as WaitIcon,
  TrendingUp as UpIcon,
  TrendingDown as DownIcon,
  OpenInNew as OpenIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

import { serverApi } from '../../services/api';
import type { ServerModel, AlertStatistics } from '../../types/server';

const AlertSystem: React.FC = () => {
  const navigate = useNavigate();

  // All models (including inactive)
  const { data: modelsResponse, isLoading, error } = useQuery({
    queryKey: ['server', 'models', 'all'],
    queryFn: () => serverApi.listActiveModels(true),
  });

  const models: ServerModel[] = modelsResponse?.data?.models || [];

  // Alert statistics per model
  const { data: modelStats } = useQuery({
    queryKey: ['server', 'alert-stats-all', models.map((m) => m.id)],
    queryFn: async () => {
      if (models.length === 0) return {};
      const statsMap: Record<number, AlertStatistics> = {};
      await Promise.all(
        models.map(async (model) => {
          try {
            const res = await serverApi.getAlertStatistics({ model_id: model.id });
            statsMap[model.id] = res.data;
          } catch {
            // ignore
          }
        }),
      );
      return statsMap;
    },
    enabled: models.length > 0,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error">Error loading: {(error as Error).message}</Alert>
    );
  }

  // Aggregated statistics
  const totalPredictions = models.reduce((sum, m) => sum + (m.total_predictions || 0), 0);
  const totalAlerts = models.reduce((sum, m) => sum + (m.positive_predictions || 0), 0);
  const totalSuccess = modelStats
    ? Object.values(modelStats).reduce((sum, s) => sum + (s.alerts_success || 0), 0)
    : 0;
  const totalFailed = modelStats
    ? Object.values(modelStats).reduce((sum, s) => sum + (s.alerts_failed || 0), 0)
    : 0;
  const totalPending = modelStats
    ? Object.values(modelStats).reduce((sum, s) => sum + (s.alerts_pending || 0), 0)
    : 0;
  const overallSuccessRate =
    totalSuccess + totalFailed > 0 ? (totalSuccess / (totalSuccess + totalFailed)) * 100 : 0;
  const totalProfit = modelStats
    ? Object.values(modelStats).reduce((sum, s) => sum + (s.alerts_profit_pct || 0), 0)
    : 0;
  const totalLoss = modelStats
    ? Object.values(modelStats).reduce((sum, s) => sum + (s.alerts_loss_pct || 0), 0)
    : 0;
  const netPerformance = totalProfit + totalLoss;
  const activeModelsCount = models.filter((m) => m.is_active).length;

  const formatPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '2.125rem' }, mb: 0.5 }}
        >
          Alert System
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {activeModelsCount} active model{activeModelsCount !== 1 ? 's' : ''} |{' '}
          {totalPredictions.toLocaleString()} predictions | {totalAlerts.toLocaleString()} alerts
        </Typography>
      </Box>

      {/* Quick Stats */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
          gap: { xs: 1, sm: 2 },
          mb: 3,
        }}
      >
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography color="primary.main" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' } }}>
              {totalAlerts}
            </Typography>
            <Typography variant="caption" color="text.secondary">Total Alerts</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography color="success.main" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' } }}>
              {totalSuccess}
            </Typography>
            <Typography variant="caption" color="text.secondary">Success</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography color="error.main" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' } }}>
              {totalFailed}
            </Typography>
            <Typography variant="caption" color="text.secondary">Failed</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography color="warning.main" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' } }}>
              {totalPending}
            </Typography>
            <Typography variant="caption" color="text.secondary">Pending</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography color="info.main" sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' } }}>
              {overallSuccessRate.toFixed(1)}%
            </Typography>
            <Typography variant="caption" color="text.secondary">Success Rate</Typography>
          </CardContent>
        </Card>
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 2, px: 1 }}>
            <Typography
              sx={{ fontWeight: 700, fontSize: { xs: '1.3rem', sm: '1.75rem' } }}
              color={netPerformance >= 0 ? 'success.main' : 'error.main'}
            >
              {formatPct(netPerformance)}
            </Typography>
            <Typography variant="caption" color="text.secondary">Net Profit</Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Performance Summary */}
      {(totalProfit !== 0 || totalLoss !== 0) && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ py: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5 }}>
              Performance Summary
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <UpIcon sx={{ color: 'success.main', fontSize: 20 }} />
                <Typography variant="body2" color="success.main" fontWeight={600}>
                  Profit: {formatPct(totalProfit)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <DownIcon sx={{ color: 'error.main', fontSize: 20 }} />
                <Typography variant="body2" color="error.main" fontWeight={600}>
                  Loss: {totalLoss.toFixed(1)}%
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={700} color={netPerformance >= 0 ? 'success.main' : 'error.main'}>
                = Net: {formatPct(netPerformance)}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Model Cards */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
        Models ({models.length})
      </Typography>

      {models.length === 0 ? (
        <Alert severity="info">No models available.</Alert>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {models.map((model) => {
            const stats = modelStats?.[model.id];
            const alerts = model.positive_predictions || 0;
            const mSuccess = stats?.alerts_success || 0;
            const mFailed = stats?.alerts_failed || 0;
            const mPending = stats?.alerts_pending || 0;
            const mRate = mSuccess + mFailed > 0 ? (mSuccess / (mSuccess + mFailed)) * 100 : 0;
            const mProfit = stats?.alerts_profit_pct || 0;
            const mLoss = stats?.alerts_loss_pct || 0;
            const mNet = stats?.total_performance_pct || mProfit + mLoss;
            const threshold = (model.alert_threshold || 0.7) * 100;

            return (
              <Card
                key={model.id}
                sx={{
                  border: model.is_active
                    ? '1px solid rgba(0, 212, 255, 0.2)'
                    : '1px solid rgba(255, 255, 255, 0.05)',
                  opacity: model.is_active ? 1 : 0.7,
                }}
              >
                <CardContent sx={{ py: 2, px: 3 }}>
                  {/* Model Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: { xs: 'column', sm: 'row' },
                      justifyContent: 'space-between',
                      alignItems: { xs: 'flex-start', sm: 'center' },
                      gap: 1,
                      mb: 2,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {model.custom_name || model.name}
                      </Typography>
                      <Chip
                        label={model.is_active ? 'Active' : 'Inactive'}
                        color={model.is_active ? 'success' : 'default'}
                        size="small"
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                      <Chip
                        label={`${threshold.toFixed(0)}% Threshold`}
                        variant="outlined"
                        size="small"
                        sx={{ height: 22, fontSize: '0.7rem' }}
                      />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<OpenIcon />}
                        onClick={() => navigate(`/predictions/logs/${model.id}`)}
                        sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                      >
                        Logs
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SettingsIcon />}
                        onClick={() => navigate(`/predictions/alerts/config/${model.id}`)}
                        sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                      >
                        Config
                      </Button>
                    </Box>
                  </Box>

                  {/* Stats Grid */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(6, 1fr)' },
                      gap: { xs: 1, sm: 2 },
                      mb: 2,
                    }}
                  >
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography color="primary" fontWeight={700}>{(model.total_predictions || 0).toLocaleString()}</Typography>
                      <Typography variant="caption" color="text.secondary">Predictions</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography color="warning.main" fontWeight={700}>{alerts}</Typography>
                      <Typography variant="caption" color="text.secondary">Alerts</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography color="info.main" fontWeight={700}>{mRate.toFixed(1)}%</Typography>
                      <Typography variant="caption" color="text.secondary">Success Rate</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3 }}>
                        <SuccessIcon sx={{ fontSize: 14, color: 'success.main' }} />
                        <Typography color="success.main" fontWeight={700}>{mSuccess}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">Success</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3 }}>
                        <FailedIcon sx={{ fontSize: 14, color: 'error.main' }} />
                        <Typography color="error.main" fontWeight={700}>{mFailed}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">Failed</Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.3 }}>
                        <WaitIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                        <Typography color="warning.main" fontWeight={700}>{mPending}</Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">Pending</Typography>
                    </Box>
                  </Box>

                  {/* Success Rate Bar */}
                  {mSuccess + mFailed > 0 && (
                    <Box sx={{ mb: 1.5 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          Success Rate: {mRate.toFixed(1)}%
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {mSuccess} / {mSuccess + mFailed} evaluated
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={mRate}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: 'rgba(255, 255, 255, 0.08)',
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            bgcolor: mRate >= 50 ? 'success.main' : mRate >= 25 ? 'warning.main' : 'error.main',
                          },
                        }}
                      />
                    </Box>
                  )}

                  {/* Performance */}
                  {(mProfit !== 0 || mLoss !== 0) && (
                    <Box
                      sx={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 3,
                        py: 1,
                        px: 1.5,
                        borderRadius: 1,
                        bgcolor: 'rgba(255, 255, 255, 0.03)',
                      }}
                    >
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                          Profit
                        </Typography>
                        <Typography variant="body2" color="success.main" fontWeight={600}>
                          {formatPct(mProfit)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                          Loss
                        </Typography>
                        <Typography variant="body2" color="error.main" fontWeight={600}>
                          {mLoss.toFixed(1)}%
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem', display: 'block' }}>
                          Net
                        </Typography>
                        <Typography variant="body2" fontWeight={700} color={mNet >= 0 ? 'success.main' : 'error.main'}>
                          {formatPct(mNet)}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                  {/* N8N Status */}
                  <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                      label={model.n8n_enabled ? 'n8n active' : 'n8n inactive'}
                      color={model.n8n_enabled ? 'success' : 'default'}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                    <Chip
                      label={`${model.model_type} | ${model.target_direction?.toUpperCase()} | ${model.future_minutes || '?'}min`}
                      size="small"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.65rem' }}
                    />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default AlertSystem;
