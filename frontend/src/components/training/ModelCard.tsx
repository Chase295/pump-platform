import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  Tooltip,
  LinearProgress,
  IconButton,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Visibility as DetailsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AutoAwesome as EngineeringIcon,
  Balance as BalanceIcon,
  Timer as TimerIcon,
  Storage as FeaturesIcon,
  Hub as GraphIcon,
  Fingerprint as EmbeddingIcon,
  SwapHoriz as TransactionIcon,
  Flag as FlagIcon,
} from '@mui/icons-material';
import type { ModelResponse } from '../../types/training';
import StatusChip from './StatusChip';

interface ModelCardProps {
  model: ModelResponse;
  onDetails: (modelId: number) => void;
  onDelete: (modelId: number) => void;
  onDownload: (modelId: number) => void;
  onTest?: (modelId: number) => void;
}

const ModelCard: React.FC<ModelCardProps> = ({
  model,
  onDetails,
  onDelete,
  onDownload,
}) => {
  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (start: string, end: string) => {
    try {
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return diffHours > 0 ? `${diffHours}h ${diffMinutes}min` : `${diffMinutes}min`;
    } catch {
      return 'N/A';
    }
  };

  const getTimePrediction = () => {
    if (model.params?._time_based?.enabled || model.params?._time_based?.future_minutes) {
      return {
        enabled: true,
        minutes: model.params._time_based.future_minutes || 5,
        percent: model.params._time_based.min_percent_change || 2,
        direction: model.params._time_based.direction || 'up',
      };
    }
    return null;
  };

  const getF1Color = (f1: number) => {
    if (f1 >= 0.3) return '#4caf50';
    if (f1 >= 0.15) return '#ff9800';
    if (f1 > 0) return '#f44336';
    return '#666';
  };

  const getExtraSourceInfo = () => {
    const p = model.params || {};
    const sources: { label: string; count: number; total: number; color: string; icon: React.ReactNode }[] = [];

    if (p.use_graph_features) {
      const names = p.graph_feature_names as string[] | undefined;
      sources.push({
        label: 'Graph',
        count: names ? names.length : 8,
        total: 8,
        color: '#4caf50',
        icon: <GraphIcon sx={{ fontSize: 14 }} />,
      });
    }
    if (p.use_embedding_features) {
      const names = p.embedding_feature_names as string[] | undefined;
      sources.push({
        label: 'Embed',
        count: names ? names.length : 6,
        total: 6,
        color: '#9c27b0',
        icon: <EmbeddingIcon sx={{ fontSize: 14 }} />,
      });
    }
    if (p.use_transaction_features) {
      const names = p.transaction_feature_names as string[] | undefined;
      sources.push({
        label: 'TX',
        count: names ? names.length : 8,
        total: 8,
        color: '#ff9800',
        icon: <TransactionIcon sx={{ fontSize: 14 }} />,
      });
    }
    return sources;
  };

  const featureCount = model.features?.length || 0;
  const hasEngineering = model.params?.use_engineered_features === true;
  const hasFlags = model.params?.use_flag_features !== false;
  const scaleWeight = model.params?.scale_pos_weight;
  const hasSmote = model.params?.use_smote === true;
  const timePred = getTimePrediction();
  const extraSources = getExtraSourceInfo();
  const earlyStop = model.best_iteration;

  const metricBox = (label: string, value: number | undefined, color: string, format: 'pct' | 'dec') => (
    <Box sx={{ textAlign: 'center', p: 0.75, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1 }}>
      <Typography variant="body1" sx={{ color, fontWeight: 'bold', fontSize: '0.95rem' }}>
        {value != null
          ? format === 'pct'
            ? `${(value * 100).toFixed(1)}%`
            : value.toFixed(3)
          : '-'}
      </Typography>
      <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.65rem' }}>
        {label}
      </Typography>
    </Box>
  );

  return (
    <Card
      sx={{
        border: '1px solid rgba(255, 255, 255, 0.12)',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        color: 'white',
        transition: 'all 0.2s ease-in-out',
        cursor: 'pointer',
        '&:hover': {
          boxShadow: '0 8px 32px rgba(0, 212, 255, 0.2)',
          transform: 'translateY(-2px)',
          borderColor: 'rgba(0, 212, 255, 0.4)',
        },
      }}
      onClick={() => onDetails(model.id)}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        {/* Header */}
        <Box display="flex" alignItems="flex-start" mb={1.5}>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                color: '#00d4ff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.3,
              }}
              title={model.name}
            >
              {model.name}
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.7rem' }}>
              #{model.id} · {formatDate(model.created_at)}
            </Typography>
          </Box>
        </Box>

        {/* Status + Type + Features */}
        <Box display="flex" alignItems="center" gap={0.75} mb={1.5} flexWrap="wrap">
          <StatusChip status={model.status} size="small" />
          <Chip
            label={model.model_type.toUpperCase()}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem', borderColor: 'rgba(255, 255, 255, 0.2)' }}
          />
          <Chip
            icon={<FeaturesIcon sx={{ fontSize: 12 }} />}
            label={`${featureCount}`}
            size="small"
            variant="outlined"
            sx={{ height: 22, fontSize: '0.7rem', borderColor: featureCount > 50 ? '#4caf50' : 'rgba(255, 255, 255, 0.2)' }}
          />
          {earlyStop != null && (
            <Tooltip title={`Early Stop at iteration ${earlyStop}`}>
              <Chip
                label={`ES:${earlyStop}`}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem', borderColor: 'rgba(255, 255, 255, 0.2)' }}
              />
            </Tooltip>
          )}
        </Box>

        {/* Config Badges */}
        {(hasEngineering || hasSmote || scaleWeight || hasFlags || extraSources.length > 0 || (model.phases && model.phases.length > 0)) && (
          <Box display="flex" gap={0.5} mb={1.5} flexWrap="wrap">
            {hasEngineering && (
              <Chip
                icon={<EngineeringIcon sx={{ fontSize: 12 }} />}
                label="Eng"
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(156, 39, 176, 0.25)', borderColor: '#9c27b0', border: '1px solid' }}
              />
            )}
            {hasFlags && (
              <Chip
                icon={<FlagIcon sx={{ fontSize: 12 }} />}
                label="Flags"
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(33, 150, 243, 0.25)', borderColor: '#2196f3', border: '1px solid' }}
              />
            )}
            {hasSmote && (
              <Chip
                label="SMOTE"
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(0, 188, 212, 0.25)', borderColor: '#00bcd4', border: '1px solid' }}
              />
            )}
            {scaleWeight && (
              <Chip
                icon={<BalanceIcon sx={{ fontSize: 12 }} />}
                label={`W:${scaleWeight}`}
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(255, 152, 0, 0.25)', borderColor: '#ff9800', border: '1px solid' }}
              />
            )}
            {model.phases && model.phases.length > 0 && (
              <Chip
                label={`P:${model.phases.join(',')}`}
                size="small"
                sx={{ height: 22, fontSize: '0.65rem', bgcolor: 'rgba(0, 212, 255, 0.25)', borderColor: '#00d4ff', border: '1px solid' }}
              />
            )}
            {extraSources.map((src) => (
              <Tooltip key={src.label} title={`${src.label} Features: ${src.count} of ${src.total}`}>
                <Chip
                  icon={src.icon as React.ReactElement}
                  label={`${src.label} ${src.count}/${src.total}`}
                  size="small"
                  sx={{
                    height: 22,
                    fontSize: '0.65rem',
                    bgcolor: `${src.color}25`,
                    borderColor: src.color,
                    border: '1px solid',
                    '& .MuiChip-icon': { color: src.color },
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        )}

        {/* Time Prediction Info */}
        {timePred && (
          <Box
            sx={{
              mb: 1.5,
              px: 1.5,
              py: 1,
              bgcolor: 'rgba(0, 212, 255, 0.08)',
              borderRadius: 1,
              border: '1px solid rgba(0, 212, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <TimerIcon sx={{ color: '#00d4ff', fontSize: 18 }} />
            {timePred.direction === 'up' ? (
              <TrendingUpIcon sx={{ color: '#4caf50', fontSize: 18 }} />
            ) : (
              <TrendingDownIcon sx={{ color: '#f44336', fontSize: 18 }} />
            )}
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#00d4ff', fontSize: '0.8rem' }}>
              {timePred.percent}% in {timePred.minutes} Min
              <Typography
                component="span"
                sx={{ ml: 0.5, color: timePred.direction === 'up' ? '#4caf50' : '#f44336', fontSize: '0.8rem' }}
              >
                ({timePred.direction === 'up' ? 'PUMP' : 'RUG'})
              </Typography>
            </Typography>
          </Box>
        )}

        {/* Metrics Grid: 3 + 3 */}
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75, mb: 0.75 }}>
            {metricBox('Accuracy', model.training_accuracy, '#4caf50', 'pct')}
            {metricBox('F1', model.training_f1, getF1Color(model.training_f1 || 0), 'pct')}
            {metricBox('Precision', model.training_precision, '#00d4ff', 'pct')}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.75 }}>
            {metricBox('Recall', model.training_recall, '#ff9800', 'pct')}
            {metricBox('ROC-AUC', model.roc_auc, '#2196f3', 'dec')}
            {metricBox('MCC', model.mcc, '#e91e63', 'dec')}
          </Box>

          {/* F1 Progress Bar */}
          <Box sx={{ mt: 1 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min((model.training_f1 || 0) * 100, 100)}
              sx={{
                height: 4,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.08)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: getF1Color(model.training_f1 || 0),
                  borderRadius: 2,
                },
              }}
            />
          </Box>
        </Box>

        {/* Confusion Matrix Mini */}
        {model.tp !== undefined && model.fp !== undefined && (
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, mb: 1.5 }}>
            <Tooltip title="True Positive (korrekt erkannt)">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(76, 175, 80, 0.15)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.65rem', color: '#4caf50', fontWeight: 600 }}>TP {model.tp}</Typography>
              </Box>
            </Tooltip>
            <Tooltip title="False Positive (falscher Alarm)">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(244, 67, 54, 0.15)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.65rem', color: '#f44336', fontWeight: 600 }}>FP {model.fp}</Typography>
              </Box>
            </Tooltip>
            <Tooltip title="False Negative (verpasst)">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(255, 152, 0, 0.15)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.65rem', color: '#ff9800', fontWeight: 600 }}>FN {model.fn}</Typography>
              </Box>
            </Tooltip>
            <Tooltip title="True Negative (korrekt negativ)">
              <Box sx={{ p: 0.5, bgcolor: 'rgba(33, 150, 243, 0.15)', borderRadius: 0.5, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.65rem', color: '#2196f3', fontWeight: 600 }}>TN {model.tn}</Typography>
              </Box>
            </Tooltip>
          </Box>
        )}

        {/* Training Period */}
        <Box sx={{ mb: 1.5, px: 1, py: 0.75, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.7rem' }}>
            Training: <strong>{formatDuration(model.train_start, model.train_end)}</strong>
            {' · '}
            {formatDate(model.train_start)} - {formatDate(model.train_end)}
          </Typography>
        </Box>

        {/* Actions */}
        <Box display="flex" alignItems="center" gap={1} onClick={(e) => e.stopPropagation()}>
          <Button
            size="small"
            variant="contained"
            startIcon={<DetailsIcon />}
            onClick={() => onDetails(model.id)}
            sx={{
              flexGrow: 1,
              bgcolor: '#00d4ff',
              '&:hover': { bgcolor: '#00b8d4' },
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8rem',
            }}
          >
            Details
          </Button>
          <Tooltip title="Download .pkl">
            <span>
              <IconButton
                size="small"
                onClick={() => onDownload(model.id)}
                disabled={model.status !== 'READY'}
                sx={{
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'rgba(255, 255, 255, 0.7)',
                  '&:hover': { borderColor: '#00d4ff', color: '#00d4ff' },
                  '&.Mui-disabled': { borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.2)' },
                }}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={() => onDelete(model.id)}
              sx={{
                border: '1px solid rgba(244, 67, 54, 0.3)',
                color: 'rgba(244, 67, 54, 0.7)',
                '&:hover': { borderColor: '#f44336', color: '#f44336', bgcolor: 'rgba(244, 67, 54, 0.1)' },
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </CardContent>
    </Card>
  );
};

export default ModelCard;
