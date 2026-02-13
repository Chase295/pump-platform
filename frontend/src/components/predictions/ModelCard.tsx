/**
 * ModelCard Component
 * Displays an active prediction model in the overview grid.
 * Migrated from pump-server/frontend/src/components/models/ModelCard.tsx
 */
import React, { useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  CircularProgress,
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  ToggleOn as ToggleOnIcon,
  ToggleOff as ToggleOffIcon,
  Speed as SpeedIcon,
  BarChart as BarChartIcon,
  Notifications as NotificationsIcon,
  Settings as SettingsIcon,
  Delete as DeleteIcon,
  List as ListIcon,
  TrendingDown as TrendingDownIcon,
  Psychology as PsychologyIcon,
  ShowChart as ShowChartIcon,
  AttachMoney as AttachMoneyIcon,
  Warning as WarningIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  HighlightOff as HighlightOffIcon,
  HourglassTop as HourglassTopIcon,
} from '@mui/icons-material';
import type { ServerModel, AlertStatistics } from '../../types/server';

type ModelWithStats = ServerModel & {
  alert_stats?: AlertStatistics;
};

interface ModelCardProps {
  model: ModelWithStats;
  onDetailsClick: (modelId: number) => void;
  onAlertConfigClick: (modelId: number) => void;
  onLogsClick: (modelId: number) => void;
  onToggleActive: (modelId: number, isActive: boolean) => void;
  onDelete: (modelId: number, modelName: string) => void;
  isActivating: boolean;
  isDeactivating: boolean;
  isDeleting: boolean;
}

const ModelCard: React.FC<ModelCardProps> = React.memo(
  ({
    model,
    onDetailsClick,
    onAlertConfigClick,
    onLogsClick,
    onToggleActive,
    onDelete,
    isActivating,
    isDeactivating,
    isDeleting,
  }) => {
    const modelName = useMemo(
      () => model.custom_name || model.name || `Model ${model.id}`,
      [model.custom_name, model.name, model.id],
    );

    const stats = useMemo(() => {
      const alertStats = model.alert_stats;
      const totalPredictions = alertStats?.total_alerts || model.total_predictions || 0;
      const alertsAboveThreshold = alertStats?.alerts_above_threshold || 0;
      const avgProbability =
        model.average_probability !== undefined && model.average_probability !== null
          ? model.average_probability
          : 0;

      return {
        avgProbability,
        totalPredictions,
        alertsAboveThreshold,
        alertsSuccess: alertStats?.alerts_success || 0,
        alertsFailed: alertStats?.alerts_failed || 0,
        alertsPending: alertStats?.alerts_pending || 0,
        alertsTotal: alertStats?.total_alerts || 0,
        nonAlertsSuccess: alertStats?.non_alerts_success || 0,
        nonAlertsFailed: alertStats?.non_alerts_failed || 0,
        totalPerformancePct: alertStats?.total_performance_pct || 0,
        alertsProfitPct: alertStats?.alerts_profit_pct || 0,
        alertsLossPct: alertStats?.alerts_loss_pct || 0,
      };
    }, [model.total_predictions, model.average_probability, model.alert_stats]);

    const modelTypeLabel = useMemo(() => {
      const typeLabels: Record<string, string> = {
        random_forest: 'RF',
        xgboost: 'XGB',
        neural_network: 'NN',
        svm: 'SVM',
      };
      return typeLabels[model.model_type] || model.model_type.toUpperCase();
    }, [model.model_type]);

    const handleCardClick = (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).closest('button')) return;
      onDetailsClick(model.id);
    };

    return (
      <Card
        variant="outlined"
        onClick={handleCardClick}
        sx={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: 'pointer',
          background: model.is_active
            ? 'linear-gradient(135deg, rgba(0, 212, 255, 0.05) 0%, rgba(0, 212, 255, 0.02) 100%)'
            : 'rgba(255, 255, 255, 0.02)',
          border: `1px solid ${model.is_active ? 'rgba(0, 212, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`,
          position: 'relative',
          overflow: 'hidden',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: model.is_active
              ? 'linear-gradient(90deg, #00d4ff 0%, #0099cc 100%)'
              : 'transparent',
          },
          '&:hover': {
            transform: 'translateY(-4px)',
            boxShadow: model.is_active
              ? '0 8px 24px rgba(0, 212, 255, 0.2)'
              : '0 8px 24px rgba(0, 0, 0, 0.3)',
          },
        }}
      >
        <CardContent sx={{ flexGrow: 1, p: 2.5 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  background: model.is_active
                    ? 'linear-gradient(135deg, #00d4ff 0%, #0099cc 100%)'
                    : 'rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <PsychologyIcon
                  sx={{ color: model.is_active ? '#fff' : 'rgba(255, 255, 255, 0.6)', fontSize: 28 }}
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    fontSize: '1.15rem',
                    color: model.is_active ? 'primary.main' : 'text.primary',
                    mb: 0.5,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {modelName}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Chip
                    label={modelTypeLabel}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      bgcolor: 'rgba(0, 212, 255, 0.15)',
                      color: 'primary.main',
                      border: '1px solid rgba(0, 212, 255, 0.3)',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                    ID: {model.id}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Chip
              label={model.is_active ? 'Active' : 'Inactive'}
              color={model.is_active ? 'success' : 'default'}
              size="small"
              icon={model.is_active ? <CheckCircleIcon /> : <CancelIcon />}
              sx={{ fontWeight: 600 }}
            />
          </Box>

          {/* Warning if model file missing */}
          {model.model_file_exists === false && (
            <Box
              sx={{
                mb: 2,
                p: 1.5,
                background: 'linear-gradient(135deg, rgba(244, 67, 54, 0.15) 0%, rgba(244, 67, 54, 0.05) 100%)',
                borderRadius: 2,
                border: '1px solid rgba(244, 67, 54, 0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <WarningIcon sx={{ color: 'error.main', fontSize: 20 }} />
              <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                Model file missing - cannot be activated
              </Typography>
            </Box>
          )}

          {/* Base statistics */}
          <Box
            sx={{
              mb: 2,
              p: 2,
              background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.08) 0%, rgba(0, 212, 255, 0.03) 100%)',
              borderRadius: 2,
              border: '1px solid rgba(0, 212, 255, 0.2)',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                mb: 1.5,
                display: 'block',
                fontWeight: 700,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'primary.main',
              }}
            >
              Statistics
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(0, 212, 255, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <SpeedIcon fontSize="small" sx={{ color: 'primary.main' }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {stats.totalPredictions}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 5 }}>
                  Total Predictions
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(0, 212, 255, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <BarChartIcon fontSize="small" sx={{ color: 'primary.main' }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    {(stats.avgProbability * 100).toFixed(0)}%
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 5 }}>
                  Avg Probability
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: 'rgba(255, 193, 7, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <NotificationsIcon fontSize="small" sx={{ color: 'warning.main' }} />
                  </Box>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>
                    {stats.alertsAboveThreshold}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 5 }}>
                  Alerts ({'>='}{((model.alert_threshold || 0.7) * 100).toFixed(0)}%)
                </Typography>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: 1.5,
                      bgcolor: model.n8n_enabled ? 'rgba(76, 175, 80, 0.15)' : 'rgba(158, 158, 158, 0.15)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <SettingsIcon
                      fontSize="small"
                      sx={{ color: model.n8n_enabled ? 'success.main' : 'text.secondary' }}
                    />
                  </Box>
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 700, color: model.n8n_enabled ? 'success.main' : 'text.secondary' }}
                  >
                    {model.n8n_enabled ? 'On' : 'Off'}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', ml: 5 }}>
                  N8N Webhook
                </Typography>
              </Box>
            </Box>
          </Box>

          {/* Alert Evaluation (when stats available) */}
          {model.alert_stats && stats.alertsTotal > 0 && (
            <Box
              sx={{
                mb: 2,
                p: 2,
                background: 'linear-gradient(135deg, rgba(255, 193, 7, 0.08) 0%, rgba(255, 193, 7, 0.03) 100%)',
                borderRadius: 2,
                border: '1px solid rgba(255, 193, 7, 0.2)',
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  mb: 1.5,
                  display: 'block',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: 'warning.main',
                }}
              >
                Alert Evaluation
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                    <NotificationsIcon sx={{ color: 'warning.main', fontSize: 16 }} />
                    <Typography sx={{ fontWeight: 700, color: 'warning.main', fontSize: '1rem' }}>
                      {stats.alertsTotal}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    Total
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                    <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 16 }} />
                    <Typography sx={{ fontWeight: 700, color: 'success.main', fontSize: '1rem' }}>
                      {stats.alertsSuccess}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    Success
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                    <HighlightOffIcon sx={{ color: 'error.main', fontSize: 16 }} />
                    <Typography sx={{ fontWeight: 700, color: 'error.main', fontSize: '1rem' }}>
                      {stats.alertsFailed}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    Failed
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                    <HourglassTopIcon sx={{ color: 'text.secondary', fontSize: 16 }} />
                    <Typography sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '1rem' }}>
                      {stats.alertsPending}
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                    Pending
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}

          {/* Performance sums (when available) */}
          {model.alert_stats &&
            (stats.totalPerformancePct !== 0 || stats.alertsProfitPct !== 0 || stats.alertsLossPct !== 0) && (
              <Box
                sx={{
                  mb: 2,
                  p: 2,
                  background:
                    stats.totalPerformancePct >= 0
                      ? 'linear-gradient(135deg, rgba(76, 175, 80, 0.12) 0%, rgba(76, 175, 80, 0.05) 100%)'
                      : 'linear-gradient(135deg, rgba(244, 67, 54, 0.12) 0%, rgba(244, 67, 54, 0.05) 100%)',
                  borderRadius: 2,
                  border: `1px solid ${stats.totalPerformancePct >= 0 ? 'rgba(76, 175, 80, 0.3)' : 'rgba(244, 67, 54, 0.3)'}`,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    mb: 1.5,
                    display: 'block',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    color: stats.totalPerformancePct >= 0 ? 'success.main' : 'error.main',
                  }}
                >
                  Performance
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                      <ShowChartIcon
                        sx={{
                          color: stats.totalPerformancePct >= 0 ? 'success.main' : 'error.main',
                          fontSize: 18,
                        }}
                      />
                      <Typography
                        sx={{
                          fontWeight: 700,
                          color: stats.totalPerformancePct >= 0 ? 'success.main' : 'error.main',
                          fontSize: '1rem',
                        }}
                      >
                        {stats.totalPerformancePct >= 0 ? '+' : ''}
                        {stats.totalPerformancePct.toFixed(1)}%
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      Total
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                      <AttachMoneyIcon sx={{ color: 'success.main', fontSize: 18 }} />
                      <Typography sx={{ fontWeight: 700, color: 'success.main', fontSize: '1rem' }}>
                        +{stats.alertsProfitPct.toFixed(1)}%
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      Profit
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, mb: 0.5 }}>
                      <TrendingDownIcon sx={{ color: 'error.main', fontSize: 18 }} />
                      <Typography sx={{ fontWeight: 700, color: 'error.main', fontSize: '1rem' }}>
                        {stats.alertsLossPct.toFixed(1)}%
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      Loss
                    </Typography>
                  </Box>
                </Box>
              </Box>
            )}

          {/* Action Buttons */}
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              pt: 1.5,
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', flex: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<InfoIcon />}
                onClick={(e) => { e.stopPropagation(); onDetailsClick(model.id); }}
                sx={{ minWidth: 'auto', borderColor: 'rgba(0, 212, 255, 0.3)', color: 'primary.main' }}
              >
                Details
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon />}
                onClick={(e) => { e.stopPropagation(); onAlertConfigClick(model.id); }}
                sx={{ minWidth: 'auto', borderColor: 'rgba(255, 193, 7, 0.3)', color: 'warning.main' }}
              >
                Alert
              </Button>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ListIcon />}
                onClick={(e) => { e.stopPropagation(); onLogsClick(model.id); }}
                sx={{ minWidth: 'auto', borderColor: 'rgba(33, 150, 243, 0.3)', color: 'info.main' }}
              >
                Logs
              </Button>
              <Button
                variant="contained"
                size="small"
                color={model.is_active ? 'error' : 'success'}
                startIcon={model.is_active ? <ToggleOffIcon /> : <ToggleOnIcon />}
                onClick={(e) => { e.stopPropagation(); onToggleActive(model.id, model.is_active); }}
                disabled={isActivating || isDeactivating}
                sx={{ minWidth: 'auto', fontWeight: 600 }}
              >
                {isActivating || isDeactivating ? (
                  <CircularProgress size={16} color="inherit" />
                ) : model.is_active ? (
                  'Deactivate'
                ) : (
                  'Activate'
                )}
              </Button>
            </Box>
            <Button
              variant="contained"
              size="small"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={(e) => { e.stopPropagation(); onDelete(model.id, modelName); }}
              disabled={isDeleting}
              sx={{ minWidth: 'auto', px: 1.5, fontWeight: 600 }}
            >
              {isDeleting ? <CircularProgress size={16} color="inherit" /> : 'Delete'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    );
  },
);

ModelCard.displayName = 'ModelCard';

export default ModelCard;
